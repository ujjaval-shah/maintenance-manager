"""JS bridge exposed to the webview as window.pywebview.api.

Every method returns {"ok": True, "data": ...} or {"ok": False, "error": ...}.
Saves that need user confirmation return {"ok": False, "needs_confirm": True, "warnings": [...]}.
"""
import logging
import sqlite3
from functools import wraps

from app.money import ValidationError
from app.services import collections, complexes, reports, shops, years

log = logging.getLogger(__name__)


def _endpoint(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return {"ok": True, "data": fn(*args, **kwargs)}
        except collections.NeedsConfirmation as e:
            return {"ok": False, "needs_confirm": True, "warnings": e.warnings}
        except ValidationError as e:
            return {"ok": False, "error": str(e)}
        except sqlite3.IntegrityError as e:
            log.warning("Integrity error in %s: %s", fn.__name__, e)
            return {"ok": False, "error": f"Database rule violated: {e}"}
        except Exception as e:  # keep the UI alive on unexpected errors
            log.exception("Error in %s", fn.__name__)
            return {"ok": False, "error": f"Unexpected error: {e}"}
    return wrapper


class Api:
    # Complexes
    @_endpoint
    def list_complexes(self):
        return complexes.list_complexes()

    @_endpoint
    def get_complex(self, complex_id):
        return complexes.get_complex(complex_id)

    @_endpoint
    def create_complex(self, data):
        return complexes.create_complex(data)

    @_endpoint
    def update_complex(self, complex_id, data):
        return complexes.update_complex(complex_id, data)

    @_endpoint
    def delete_complex(self, complex_id):
        return complexes.delete_complex(complex_id)

    # Financial years
    @_endpoint
    def list_years(self, complex_id):
        return years.list_years(complex_id)

    @_endpoint
    def get_year(self, fy_id):
        return years.get_year(fy_id)

    @_endpoint
    def create_year(self, complex_id, data):
        return years.create_year(complex_id, data)

    @_endpoint
    def update_year(self, fy_id, data):
        return years.update_year(fy_id, data)

    @_endpoint
    def delete_year(self, fy_id):
        return years.delete_year(fy_id)

    # Shops
    @_endpoint
    def list_shops(self, fy_id):
        return shops.list_shops(fy_id)

    @_endpoint
    def create_shop(self, fy_id, data):
        return shops.create_shop(fy_id, data)

    @_endpoint
    def update_shop(self, shop_id, data):
        return shops.update_shop(shop_id, data)

    @_endpoint
    def delete_shop(self, shop_id):
        return shops.delete_shop(shop_id)

    # Collections
    @_endpoint
    def list_collections(self, fy_id):
        return collections.list_collections(fy_id)

    @_endpoint
    def get_collection(self, collection_id):
        return collections.get_collection(collection_id)

    @_endpoint
    def preview_collection(self, fy_id, data, exclude_id=None):
        return collections.preview_collection(fy_id, data, exclude_id)

    @_endpoint
    def create_collection(self, fy_id, data, confirm=False):
        return collections.create_collection(fy_id, data, confirm)

    @_endpoint
    def update_collection(self, collection_id, data, confirm=False):
        return collections.update_collection(collection_id, data, confirm)

    @_endpoint
    def delete_collection(self, collection_id):
        return collections.delete_collection(collection_id)

    @_endpoint
    def get_receipt(self, collection_id):
        return collections.get_receipt(collection_id)

    # Reports
    @_endpoint
    def cash_report(self, fy_id, start, end):
        return reports.mode_report(fy_id, "CASH", start, end)

    @_endpoint
    def cheque_report(self, fy_id, start, end):
        return reports.mode_report(fy_id, "CHEQUE", start, end)

    @_endpoint
    def pending_report(self, fy_id):
        return reports.pending_report(fy_id)
