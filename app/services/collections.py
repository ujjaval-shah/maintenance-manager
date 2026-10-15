from datetime import date

from app.db import row, rows, transaction
from app.money import ValidationError, amount_in_words, calc_paise, to_paise, to_rupees
from app.services.shops import sort_shops
from app.services.years import get_year

MODES = ("CASH", "CHEQUE")


class NeedsConfirmation(Exception):
    """Raised when a save has warnings the user has not yet confirmed."""

    def __init__(self, warnings):
        super().__init__("; ".join(warnings))
        self.warnings = warnings


def _shop_ids(main_shop_id, sub_shop_ids):
    if not main_shop_id:
        raise ValidationError("Main shop is required.")
    main = int(main_shop_id)
    subs = []
    for s in sub_shop_ids or []:
        s = int(s)
        if s != main and s not in subs:
            subs.append(s)
    return main, subs


def _load_shops(conn, fy_id, ids):
    placeholders = ",".join("?" * len(ids))
    found = {r["id"]: dict(r) for r in conn.execute(
        f"SELECT * FROM shop WHERE fy_id = ? AND id IN ({placeholders})", (fy_id, *ids))}
    missing = [i for i in ids if i not in found]
    if missing:
        raise ValidationError("One or more selected shops do not belong to this financial year.")
    return [found[i] for i in ids]


def _parse_date(value):
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        raise ValidationError("Date of payment is invalid.")


def preview_collection(fy_id, data, exclude_id=None):
    """Compute the calculated amount and warnings for a (draft) collection."""
    fy = get_year(fy_id)
    main, subs = _shop_ids(data.get("main_shop_id"), data.get("sub_shop_ids"))
    with transaction() as conn:
        shops = _load_shops(conn, fy_id, [main, *subs])
        placeholders = ",".join("?" * len(shops))
        existing = rows(conn.execute(
            f"""SELECT s.shop_number, c.receipt_no FROM collection_shop cs
                JOIN collection c ON c.id = cs.collection_id
                JOIN shop s ON s.id = cs.shop_id
                WHERE c.fy_id = ? AND cs.shop_id IN ({placeholders}) AND c.id IS NOT ?
                ORDER BY c.receipt_seq""",
            (fy_id, *[s["id"] for s in shops], exclude_id)))

    total_area = sum(s["area_sqft"] for s in shops)
    calculated = calc_paise(total_area, fy["rate_paise_per_sqft"])
    warnings = []
    for e in existing:
        warnings.append(f"Shop {e['shop_number']} is already covered by receipt {e['receipt_no']}.")

    amount_raw = data.get("amount")
    amount = None
    if amount_raw not in (None, ""):
        amount = to_paise(amount_raw)
        if amount != calculated:
            warnings.append(f"Amount ₹{to_rupees(amount)} differs from the calculated "
                            f"maintenance ₹{to_rupees(calculated)}.")
    if data.get("payment_date"):
        d = _parse_date(data["payment_date"])
        if not fy["start_date"] <= d <= fy["end_date"]:
            warnings.append(f"Date of payment {d} is outside FY {fy['label']} "
                            f"({fy['start_date']} to {fy['end_date']}).")

    main_shop = shops[0]
    return {
        "owner_name": main_shop["owner_name"],
        "owner_phone": main_shop["owner_phone"],
        "owner_gst": main_shop["owner_gst"],
        "shops": [{"id": s["id"], "shop_number": s["shop_number"], "area_sqft": s["area_sqft"]}
                  for s in shops],
        "total_area": total_area,
        "rate": fy["rate"],
        "calculated": to_rupees(calculated),
        "calculated_paise": calculated,
        "amount_paise": amount,
        "warnings": warnings,
    }


def _validate(data):
    if not data.get("payment_date"):
        raise ValidationError("Date of payment is required.")
    payment_date = _parse_date(data["payment_date"])
    if data.get("amount") in (None, ""):
        raise ValidationError("Amount paid is required.")
    amount = to_paise(data["amount"], "Amount paid")
    if amount <= 0:
        raise ValidationError("Amount paid must be greater than zero.")
    mode = (data.get("mode") or "").upper()
    if mode not in MODES:
        raise ValidationError("Mode of payment must be Cash or Cheque.")
    cheque = (data.get("cheque_number") or "").strip()
    if mode == "CHEQUE" and not cheque:
        raise ValidationError("Cheque number is required for cheque payments.")
    return payment_date, amount, mode, cheque if mode == "CHEQUE" else None


def _write_shops(conn, collection_id, main, subs):
    conn.execute("DELETE FROM collection_shop WHERE collection_id = ?", (collection_id,))
    conn.execute("INSERT INTO collection_shop (collection_id, shop_id, is_main) VALUES (?, ?, 1)",
                 (collection_id, main))
    conn.executemany("INSERT INTO collection_shop (collection_id, shop_id, is_main) VALUES (?, ?, 0)",
                     [(collection_id, s) for s in subs])


def create_collection(fy_id, data, confirm=False):
    payment_date, amount, mode, cheque = _validate(data)
    preview = preview_collection(fy_id, data)
    if preview["warnings"] and not confirm:
        raise NeedsConfirmation(preview["warnings"])
    main, subs = _shop_ids(data.get("main_shop_id"), data.get("sub_shop_ids"))
    with transaction() as conn:
        conn.execute("UPDATE financial_year SET receipt_seq = receipt_seq + 1 WHERE id = ?", (fy_id,))
        seq, label = conn.execute("SELECT receipt_seq, label FROM financial_year WHERE id = ?",
                                  (fy_id,)).fetchone()
        cur = conn.execute(
            """INSERT INTO collection (fy_id, receipt_seq, receipt_no, main_shop_id, payment_date,
                                       amount_paise, calculated_paise, mode, cheque_number)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (fy_id, seq, f"{label}/{seq:04d}", main, payment_date, amount,
             preview["calculated_paise"], mode, cheque))
        new_id = cur.lastrowid
        _write_shops(conn, new_id, main, subs)
    return get_collection(new_id)


def update_collection(collection_id, data, confirm=False):
    existing = get_collection(collection_id)
    fy_id = existing["fy_id"]
    payment_date, amount, mode, cheque = _validate(data)
    preview = preview_collection(fy_id, data, exclude_id=collection_id)
    if preview["warnings"] and not confirm:
        raise NeedsConfirmation(preview["warnings"])
    main, subs = _shop_ids(data.get("main_shop_id"), data.get("sub_shop_ids"))
    with transaction() as conn:
        conn.execute(
            """UPDATE collection SET main_shop_id = ?, payment_date = ?, amount_paise = ?,
                      calculated_paise = ?, mode = ?, cheque_number = ? WHERE id = ?""",
            (main, payment_date, amount, preview["calculated_paise"], mode, cheque, collection_id))
        _write_shops(conn, collection_id, main, subs)
    return get_collection(collection_id)


def delete_collection(collection_id):
    get_collection(collection_id)
    with transaction() as conn:
        conn.execute("DELETE FROM collection WHERE id = ?", (collection_id,))


_SELECT = """
    SELECT c.*, s.shop_number AS main_shop_number, s.owner_name, s.owner_phone, s.owner_gst,
           (SELECT COUNT(*) FROM collection_shop cs WHERE cs.collection_id = c.id) AS shop_count,
           (SELECT GROUP_CONCAT(s2.shop_number, ', ') FROM collection_shop cs2
              JOIN shop s2 ON s2.id = cs2.shop_id
             WHERE cs2.collection_id = c.id AND cs2.is_main = 0) AS sub_shop_numbers
    FROM collection c JOIN shop s ON s.id = c.main_shop_id
"""


def _decorate(c):
    c["amount"] = to_rupees(c["amount_paise"])
    c["calculated"] = to_rupees(c["calculated_paise"])
    c["amount_mismatch"] = c["amount_paise"] != c["calculated_paise"]
    return c


def list_collections(fy_id):
    with transaction() as conn:
        result = rows(conn.execute(_SELECT + " WHERE c.fy_id = ? ORDER BY c.receipt_seq DESC",
                                   (fy_id,)))
    return [_decorate(c) for c in result]


def get_collection(collection_id):
    with transaction() as conn:
        c = row(conn.execute(_SELECT + " WHERE c.id = ?", (collection_id,)))
        if not c:
            raise ValidationError("Maintenance record not found.")
        shops = rows(conn.execute(
            """SELECT s.id, s.shop_number, s.area_sqft, cs.is_main FROM collection_shop cs
               JOIN shop s ON s.id = cs.shop_id WHERE cs.collection_id = ?""", (collection_id,)))
    main = [s for s in shops if s["is_main"]]
    c["shops"] = main + sort_shops([s for s in shops if not s["is_main"]])
    c["sub_shop_ids"] = [s["id"] for s in shops if not s["is_main"]]
    c["total_area"] = sum(s["area_sqft"] for s in shops)
    return _decorate(c)


def get_receipt(collection_id):
    c = get_collection(collection_id)
    fy = get_year(c["fy_id"])
    c["complex"] = {"name": fy["complex_name"], "address": fy["complex_address"],
                    "gst_number": fy["complex_gst"]}
    c["fy_label"] = fy["label"]
    c["rate"] = fy["rate"]
    c["amount_words"] = amount_in_words(c["amount_paise"])
    return c
