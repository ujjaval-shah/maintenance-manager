import tempfile
import unittest
from pathlib import Path

from app import db
from app.money import ValidationError, amount_in_words
from app.services import collections, complexes, reports, shops, years
from app.services.collections import NeedsConfirmation


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db.set_db_path(Path(self.tmp.name) / "test.db")
        db.init_schema()
        c = complexes.create_complex({"name": "Test Plaza", "address": "1 Road", "gst_number": "x"})
        self.fy = years.create_year(c["id"], {"start_year": 2026, "rate": "3"})
        fid = self.fy["id"]
        self.a = shops.create_shop(fid, {"shop_number": "G-1", "owner_name": "A", "area_sqft": 100})
        self.b = shops.create_shop(fid, {"shop_number": "G-2", "owner_name": "A", "area_sqft": 50})
        self.c = shops.create_shop(fid, {"shop_number": "G-10", "owner_name": "C", "area_sqft": 200})
        self.d = shops.create_shop(fid, {"shop_number": "G-3", "owner_name": "D", "area_sqft": 80})

    def tearDown(self):
        self.tmp.cleanup()

    def _pay(self, main, subs=(), amount=None, mode="CASH", day="2026-10-15", cheque=None,
             confirm=False):
        if amount is None:
            p = collections.preview_collection(self.fy["id"], {"main_shop_id": main,
                                                              "sub_shop_ids": list(subs)})
            amount = p["calculated"]
        return collections.create_collection(self.fy["id"], {
            "main_shop_id": main, "sub_shop_ids": list(subs), "amount": amount,
            "payment_date": day, "mode": mode, "cheque_number": cheque}, confirm=confirm)

    def test_fy_label_and_rate_required(self):
        self.assertEqual(self.fy["label"], "2026-27")
        with self.assertRaises(ValidationError):
            years.create_year(self.fy["complex_id"], {"start_year": 2027, "rate": ""})

    def test_calculated_amount_uses_all_shops(self):
        p = collections.preview_collection(self.fy["id"], {"main_shop_id": self.a["id"],
                                                          "sub_shop_ids": [self.b["id"]]})
        self.assertEqual(p["calculated"], "450.00")
        self.assertEqual(p["owner_name"], "A")

    def test_receipt_sequence(self):
        r1 = self._pay(self.a["id"])
        r2 = self._pay(self.c["id"])
        collections.delete_collection(r2["id"])
        r3 = self._pay(self.d["id"])
        self.assertEqual([r1["receipt_no"], r3["receipt_no"]], ["2026-27/0001", "2026-27/0003"])

    def test_amount_mismatch_needs_confirm(self):
        with self.assertRaises(NeedsConfirmation):
            self._pay(self.a["id"], amount="100")
        r = self._pay(self.a["id"], amount="100", confirm=True)
        self.assertTrue(r["amount_mismatch"])

    def test_duplicate_shop_warns(self):
        self._pay(self.a["id"], [self.b["id"]])
        with self.assertRaises(NeedsConfirmation) as ctx:
            self._pay(self.b["id"])
        self.assertIn("G-2", ctx.exception.warnings[0])
        self._pay(self.b["id"], confirm=True)

    def test_cheque_requires_number(self):
        with self.assertRaises(ValidationError):
            self._pay(self.a["id"], mode="CHEQUE")

    def test_shop_number_immutable_and_delete_blocked(self):
        with self.assertRaises(ValidationError):
            shops.update_shop(self.a["id"], {"shop_number": "Z-9", "owner_name": "A", "area_sqft": 1})
        self._pay(self.c["id"], [self.b["id"]])
        with self.assertRaises(ValidationError):
            shops.delete_shop(self.b["id"])  # sub shop
        shops.delete_shop(self.d["id"])  # unused shop is fine

    def test_reports(self):
        self._pay(self.a["id"], [self.b["id"]])                                # 450 cash, today
        self._pay(self.c["id"], mode="CHEQUE", cheque="123456")               # 600 cheque
        self._pay(self.d["id"], day="2026-05-01")                              # 240 cash, earlier
        cash = reports.mode_report(self.fy["id"], "CASH", "2026-10-15", "2026-10-15")
        self.assertEqual((cash["count"], cash["total"]), (1, "450.00"))
        cash_all = reports.mode_report(self.fy["id"], "CASH", "2026-04-01", "2026-10-15")
        self.assertEqual(cash_all["total"], "690.00")
        cheque = reports.mode_report(self.fy["id"], "CHEQUE", "2026-10-15", "2026-10-15")
        self.assertEqual(cheque["rows"][0]["cheque_number"], "123456")

    def test_pending_excludes_sub_shops(self):
        self._pay(self.a["id"], [self.b["id"]])
        pending = reports.pending_report(self.fy["id"])
        self.assertEqual([r["shop_number"] for r in pending["rows"]], ["G-3", "G-10"])
        self.assertEqual(pending["total"], "840.00")

    def test_copy_shops_to_new_year(self):
        fy2 = years.create_year(self.fy["complex_id"], {"start_year": 2027, "rate": "3.5",
                                                        "copy_shops_from": self.fy["id"]})
        self.assertEqual(len(shops.list_shops(fy2["id"])), 4)

    def test_amount_in_words(self):
        self.assertEqual(amount_in_words(12345650),
                         "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six "
                         "and Fifty Paise Only")


if __name__ == "__main__":
    unittest.main()
