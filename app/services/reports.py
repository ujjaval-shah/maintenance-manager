from datetime import date

from app.db import rows, transaction
from app.money import ValidationError, calc_paise, to_rupees
from app.services.shops import sort_shops
from app.services.years import get_year


def _range(start, end):
    try:
        s = date.fromisoformat(start).isoformat()
        e = date.fromisoformat(end).isoformat()
    except (TypeError, ValueError):
        raise ValidationError("Start and end dates are required.")
    if s > e:
        raise ValidationError("Start date must be on or before end date.")
    return s, e


def _header(fy):
    return {"complex_name": fy["complex_name"], "complex_address": fy["complex_address"],
            "complex_gst": fy["complex_gst"], "fy_label": fy["label"], "rate": fy["rate"]}


def mode_report(fy_id, mode, start, end):
    """Collections paid by CASH or CHEQUE in [start, end], with a total."""
    mode = mode.upper()
    if mode not in ("CASH", "CHEQUE"):
        raise ValidationError("Unknown payment mode.")
    fy = get_year(fy_id)
    s, e = _range(start, end)
    with transaction() as conn:
        result = rows(conn.execute(
            """SELECT c.id, c.payment_date, c.receipt_no, s.shop_number AS main_shop_number,
                      c.cheque_number, c.amount_paise
               FROM collection c JOIN shop s ON s.id = c.main_shop_id
               WHERE c.fy_id = ? AND c.mode = ? AND c.payment_date BETWEEN ? AND ?
               ORDER BY c.payment_date, c.receipt_seq""", (fy_id, mode, s, e)))
    total = sum(r["amount_paise"] for r in result)
    for r in result:
        r["amount"] = to_rupees(r["amount_paise"])
    return {**_header(fy), "mode": mode, "start": s, "end": e, "rows": result,
            "count": len(result), "total_paise": total, "total": to_rupees(total)}


def pending_report(fy_id):
    """Shops in the FY not covered by any collection (as main or sub shop)."""
    fy = get_year(fy_id)
    with transaction() as conn:
        result = rows(conn.execute(
            """SELECT s.id, s.shop_number, s.owner_name, s.owner_phone, s.area_sqft
               FROM shop s
               WHERE s.fy_id = ? AND s.id NOT IN (
                   SELECT cs.shop_id FROM collection_shop cs
                   JOIN collection c ON c.id = cs.collection_id WHERE c.fy_id = ?)""",
            (fy_id, fy_id)))
    total = 0
    for r in result:
        due = calc_paise(r["area_sqft"], fy["rate_paise_per_sqft"])
        r["due"] = to_rupees(due)
        total += due
    return {**_header(fy), "rows": sort_shops(result), "count": len(result),
            "total_area": sum(r["area_sqft"] for r in result),
            "total_paise": total, "total": to_rupees(total)}
