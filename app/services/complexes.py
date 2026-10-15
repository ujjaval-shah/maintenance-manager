from app.db import row, rows, transaction
from app.money import ValidationError


def _clean(data):
    name = (data.get("name") or "").strip()
    address = (data.get("address") or "").strip()
    gst = (data.get("gst_number") or "").strip().upper()
    if not name:
        raise ValidationError("Complex name is required.")
    if not address:
        raise ValidationError("Address is required.")
    return name, address, gst or None


def list_complexes():
    with transaction() as conn:
        return rows(conn.execute(
            """SELECT c.*, (SELECT COUNT(*) FROM financial_year f WHERE f.complex_id = c.id) AS fy_count
               FROM complex c ORDER BY c.name COLLATE NOCASE"""))


def get_complex(complex_id):
    with transaction() as conn:
        c = row(conn.execute("SELECT * FROM complex WHERE id = ?", (complex_id,)))
    if not c:
        raise ValidationError("Business complex not found.")
    return c


def create_complex(data):
    name, address, gst = _clean(data)
    with transaction() as conn:
        if conn.execute("SELECT 1 FROM complex WHERE name = ? COLLATE NOCASE", (name,)).fetchone():
            raise ValidationError(f"A complex named '{name}' already exists.")
        cur = conn.execute("INSERT INTO complex (name, address, gst_number) VALUES (?, ?, ?)",
                           (name, address, gst))
        new_id = cur.lastrowid
    return get_complex(new_id)


def update_complex(complex_id, data):
    name, address, gst = _clean(data)
    get_complex(complex_id)
    with transaction() as conn:
        if conn.execute("SELECT 1 FROM complex WHERE name = ? COLLATE NOCASE AND id <> ?",
                        (name, complex_id)).fetchone():
            raise ValidationError(f"A complex named '{name}' already exists.")
        conn.execute("UPDATE complex SET name = ?, address = ?, gst_number = ? WHERE id = ?",
                     (name, address, gst, complex_id))
    return get_complex(complex_id)


def delete_complex(complex_id):
    get_complex(complex_id)
    with transaction() as conn:
        n = conn.execute("SELECT COUNT(*) FROM financial_year WHERE complex_id = ?",
                         (complex_id,)).fetchone()[0]
        if n:
            raise ValidationError(
                f"This complex has {n} financial year(s). Delete them first.")
        conn.execute("DELETE FROM complex WHERE id = ?", (complex_id,))
