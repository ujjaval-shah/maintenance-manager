import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"
DEFAULT_DB_PATH = ROOT / "data" / "maintenance.db"

_db_path = Path(os.environ.get("MAINT_DB", DEFAULT_DB_PATH))


def set_db_path(path):
    """Point the app at a different database file (used by tests and seeding)."""
    global _db_path
    _db_path = Path(path)


def get_db_path():
    return _db_path


def connect():
    _db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def transaction():
    """Yield a connection; commit on success, roll back on error."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema():
    with transaction() as conn:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def rows(cursor):
    return [dict(r) for r in cursor.fetchall()]


def row(cursor):
    r = cursor.fetchone()
    return dict(r) if r else None
