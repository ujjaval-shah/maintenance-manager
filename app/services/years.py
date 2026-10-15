from app.db import row, rows, transaction
from app.money import ValidationError, to_paise, to_rupees
from app.services.complexes import get_complex


def fy_label(start_year):
    return f"{start_year}-{(start_year + 1) % 100:02d}"


def _with_rate(fy):
    if fy:
        fy["rate"] = to_rupees(fy["rate_paise_per_sqft"])
    return fy


def list_years(complex_id):
    with transaction() as conn:
        result = rows(conn.execute(
            """SELECT f.*,
                      (SELECT COUNT(*) FROM shop s WHERE s.fy_id = f.id) AS shop_count,
                      (SELECT COUNT(*) FROM collection c WHERE c.fy_id = f.id) AS collection_count
               FROM financial_year f WHERE f.complex_id = ? ORDER BY f.start_date DESC""",
            (complex_id,)))
    return [_with_rate(f) for f in result]


def get_year(fy_id):
    with transaction() as conn:
        fy = row(conn.execute(
            """SELECT f.*, c.name AS complex_name, c.address AS complex_address,
                      c.gst_number AS complex_gst
               FROM financial_year f JOIN complex c ON c.id = f.complex_id WHERE f.id = ?""",
            (fy_id,)))
    if not fy:
        raise ValidationError("Financial year not found.")
    return _with_rate(fy)


def _parse_rate(value):
    if value in (None, ""):
        raise ValidationError("Maintenance rate (₹ per sq ft) is required.")
    rate = to_paise(value, "Maintenance rate")
    if rate <= 0:
        raise ValidationError("Maintenance rate must be greater than zero.")
    return rate


def create_year(complex_id, data):
    get_complex(complex_id)
    try:
        start_year = int(data.get("start_year"))
    except (TypeError, ValueError):
        raise ValidationError("Start year is required (e.g. 2026 for FY 2026-27).")
    if not 1990 <= start_year <= 2200:
        raise ValidationError("Start year looks invalid.")
    rate = _parse_rate(data.get("rate"))
    label = fy_label(start_year)
    copy_from = data.get("copy_shops_from") or None

    with transaction() as conn:
        if conn.execute("SELECT 1 FROM financial_year WHERE complex_id = ? AND label = ?",
                        (complex_id, label)).fetchone():
            raise ValidationError(f"FY {label} already exists for this complex.")
        cur = conn.execute(
            """INSERT INTO financial_year (complex_id, label, start_date, end_date, rate_paise_per_sqft)
               VALUES (?, ?, ?, ?, ?)""",
            (complex_id, label, f"{start_year}-04-01", f"{start_year + 1}-03-31", rate))
        fy_id = cur.lastrowid
        if copy_from:
            src = conn.execute("SELECT complex_id FROM financial_year WHERE id = ?",
                               (copy_from,)).fetchone()
            if not src or src[0] != int(complex_id):
                raise ValidationError("Financial year to copy shops from was not found.")
            conn.execute(
                """INSERT INTO shop (fy_id, shop_number, owner_name, owner_phone, owner_gst, area_sqft)
                   SELECT ?, shop_number, owner_name, owner_phone, owner_gst, area_sqft
                   FROM shop WHERE fy_id = ?""",
                (fy_id, copy_from))
    return get_year(fy_id)


def update_year(fy_id, data):
    get_year(fy_id)
    rate = _parse_rate(data.get("rate"))
    with transaction() as conn:
        conn.execute("UPDATE financial_year SET rate_paise_per_sqft = ? WHERE id = ?", (rate, fy_id))
    return get_year(fy_id)


def delete_year(fy_id):
    get_year(fy_id)
    if _count(fy_id):
        raise ValidationError(
            "This financial year has shops or collection records. Delete them first.")
    with transaction() as conn:
        conn.execute("DELETE FROM financial_year WHERE id = ?", (fy_id,))


def _count(fy_id):
    with transaction() as conn:
        return conn.execute(
            """SELECT (SELECT COUNT(*) FROM shop WHERE fy_id = ?)
                    + (SELECT COUNT(*) FROM collection WHERE fy_id = ?)""",
            (fy_id, fy_id)).fetchone()[0]
