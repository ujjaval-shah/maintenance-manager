import re

from app.db import row, rows, transaction
from app.money import ValidationError, calc_paise, to_rupees
from app.services.years import get_year


def natural_key(text):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", text or "")]


def sort_shops(items, key="shop_number"):
    return sorted(items, key=lambda s: natural_key(s[key]))


def _clean(data):
    owner = (data.get("owner_name") or "").strip()
    phone = (data.get("owner_phone") or "").strip()
    gst = (data.get("owner_gst") or "").strip().upper()
    if not owner:
        raise ValidationError("Owner name is required.")
    if phone and not re.fullmatch(r"[0-9+\- ]{6,15}", phone):
        raise ValidationError("Owner phone number looks invalid.")
    try:
        area = float(data.get("area_sqft"))
    except (TypeError, ValueError):
        raise ValidationError("Area (sq ft) is required and must be a number.")
    if area <= 0:
        raise ValidationError("Area must be greater than zero.")
    return owner, phone or None, gst or None, area


def list_shops(fy_id):
    fy = get_year(fy_id)
    with transaction() as conn:
        result = rows(conn.execute(
            """SELECT s.*,
                      (SELECT GROUP_CONCAT(c.receipt_no, ', ')
                         FROM collection_shop cs JOIN collection c ON c.id = cs.collection_id
                        WHERE cs.shop_id = s.id) AS receipts
               FROM shop s WHERE s.fy_id = ?""", (fy_id,)))
    for s in result:
        s["due"] = to_rupees(calc_paise(s["area_sqft"], fy["rate_paise_per_sqft"]))
    return sort_shops(result)


def get_shop(shop_id):
    with transaction() as conn:
        s = row(conn.execute("SELECT * FROM shop WHERE id = ?", (shop_id,)))
    if not s:
        raise ValidationError("Shop not found.")
    return s


def create_shop(fy_id, data):
    get_year(fy_id)
    number = (data.get("shop_number") or "").strip().upper()
    if not number:
        raise ValidationError("Shop number is required.")
    owner, phone, gst, area = _clean(data)
    with transaction() as conn:
        if conn.execute("SELECT 1 FROM shop WHERE fy_id = ? AND shop_number = ?",
                        (fy_id, number)).fetchone():
            raise ValidationError(f"Shop number {number} already exists in this financial year.")
        cur = conn.execute(
            """INSERT INTO shop (fy_id, shop_number, owner_name, owner_phone, owner_gst, area_sqft)
               VALUES (?, ?, ?, ?, ?, ?)""", (fy_id, number, owner, phone, gst, area))
        new_id = cur.lastrowid
    return get_shop(new_id)


def update_shop(shop_id, data):
    shop = get_shop(shop_id)
    number = data.get("shop_number")
    if number is not None and number.strip().upper() != shop["shop_number"]:
        raise ValidationError("Shop number cannot be changed.")
    owner, phone, gst, area = _clean(data)
    with transaction() as conn:
        conn.execute(
            """UPDATE shop SET owner_name = ?, owner_phone = ?, owner_gst = ?, area_sqft = ?
               WHERE id = ?""", (owner, phone, gst, area, shop_id))
    return get_shop(shop_id)


def delete_shop(shop_id):
    shop = get_shop(shop_id)
    with transaction() as conn:
        receipts = [r[0] for r in conn.execute(
            """SELECT c.receipt_no FROM collection_shop cs JOIN collection c ON c.id = cs.collection_id
               WHERE cs.shop_id = ? ORDER BY c.receipt_seq""", (shop_id,))]
        if receipts:
            raise ValidationError(
                f"Shop {shop['shop_number']} cannot be deleted: it is part of maintenance "
                f"record(s) {', '.join(receipts)}.")
        conn.execute("DELETE FROM shop WHERE id = ?", (shop_id,))
