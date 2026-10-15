"""Seed the database with sample data for trying out every screen and report.

Usage:  python seed.py --reset      (deletes data/maintenance.db first)

Records are dated relative to today so that the cash/cheque reports show rows
for their default range (today .. today). All data goes through the service
layer so receipt numbering and validation behave exactly as in the app.
"""
import argparse
from datetime import date, timedelta

from app import db
from app.services import collections, complexes, shops, years

TODAY = date.today()
CUR_START = TODAY.year if TODAY.month >= 4 else TODAY.year - 1
FY_START = date(CUR_START, 4, 1)

# shop_number, owner, phone, owner GST, area
SUNRISE_SHOPS = [
    ("G-1", "Ramesh Patel", "9825011001", "24AAAPP1234A1Z5", 220),
    ("G-2", "Ramesh Patel", "9825011001", "24AAAPP1234A1Z5", 180),
    ("G-3", "Anil Joshi", "9825011003", None, 250),
    ("G-4", "Farida Khan", "9825011004", None, 200),
    ("G-5", "Sunita Shah", "9825011005", "24BBBPS5678B1Z2", 300),
    ("G-6", "Vikram Rao", "9825011006", None, 150),
    ("G-7", "Pooja Agarwal", "9825011007", None, 175),
    ("G-8", "Harish Trivedi", "9825011008", None, 210),
    ("G-9", "Neha Kapoor", "9825011009", "24CCCPK9012C1Z8", 190),
    ("G-10", "Imran Sheikh", "9825011010", None, 260),
    ("F-1", "Kiran Desai", "9825022001", None, 400),
    ("F-2", "Kiran Desai", "9825022001", None, 350),
    ("F-3", "Rajesh Gupta", "9825022003", "24DDDPG3456D1Z1", 320),
    ("F-4", "Meena Iyer", "9825022004", None, 280),
    ("F-5", "Sunita Shah", "9825011005", "24BBBPS5678B1Z2", 300),
    ("F-6", "Sunita Shah", "9825011005", "24BBBPS5678B1Z2", 300),
    ("F-7", "Deepak Chauhan", "9825022007", None, 225),
    ("F-8", "Lata Mehta", "9825022008", None, 240),
    ("F-9", "Suresh Pillai", "9825022009", None, 260),
    ("F-10", "Asha Verma", "9825022010", None, 230),
    ("S-1", "Mehta Traders", "9825033001", "24EEEFM7890E1Z4", 500),
    ("S-2", "Mehta Traders", "9825033001", "24EEEFM7890E1Z4", 450),
    ("S-3", "Mehta Traders", "9825033001", "24EEEFM7890E1Z4", 450),
    ("S-4", "Nitin Bhatt", "9825033004", None, 380),
    ("S-5", "Geeta Solanki", "9825033005", None, 360),
    ("S-6", "Prakash Jain", "9825033006", "24FFFPJ2345F1Z6", 420),
    ("S-7", "Kavita Nair", "9825033007", None, 300),
    ("S-8", "Manoj Thakkar", "9825033008", None, 310),
    ("S-9", "Rekha Dave", "9825033009", None, 290),
    ("S-10", "Ajay Parmar", "9825033010", None, 330),
]

# main shop, sub shops, days before today, mode, cheque no, amount override (None = calculated)
SUNRISE_COLLECTIONS = [
    ("G-1", ["G-2"], 170, "CASH", None, None),          # same owner, 2 shops
    ("G-3", [], 160, "CHEQUE", "112233", None),
    ("F-1", ["F-2"], 140, "CHEQUE", "445566", None),    # same owner, 2 shops
    ("S-1", ["S-2", "S-3"], 120, "CHEQUE", "778899", None),  # 3 shops of a firm
    ("G-6", [], 100, "CASH", None, None),
    ("F-3", [], 90, "CASH", None, 900),                  # paid less than calculated (960)
    ("F-7", [], 75, "CHEQUE", "300125", None),
    ("S-4", [], 60, "CASH", None, None),
    ("G-8", [], 45, "CASH", None, None),
    ("S-6", [], 30, "CHEQUE", "300777", None),
    ("F-9", [], 14, "CASH", None, None),
    ("S-8", [], 7, "CASH", None, None),
    ("G-5", ["F-5", "F-6"], 0, "CASH", None, None),     # today, 3 shops
    ("F-10", [], 0, "CASH", None, None),                # today
    ("G-9", [], 0, "CASH", None, 600),                  # today, rounded-up payment (calc 570)
    ("S-9", [], 0, "CHEQUE", "512340", None),           # today
    ("S-10", [], 0, "CHEQUE", "512341", None),          # today
    ("G-2", [], 0, "CASH", None, None),                 # today, duplicate: G-2 already in 1st receipt
]
# Pending after this: G-4, G-7, G-10, F-4, F-8, S-5, S-7  (G-2/F-5/F-6/S-2/S-3/F-2 are sub shops -> not pending)


def add_shops(fy_id, data):
    return {n: shops.create_shop(fy_id, {"shop_number": n, "owner_name": o, "owner_phone": p,
                                         "owner_gst": g, "area_sqft": a})["id"]
            for n, o, p, g, a in data}


def add_collections(fy_id, ids, data):
    for main, subs, days_ago, mode, cheque, amount in data:
        day = max(TODAY - timedelta(days=days_ago), FY_START)
        payload = {"main_shop_id": ids[main], "sub_shop_ids": [ids[s] for s in subs],
                   "payment_date": day.isoformat(), "mode": mode, "cheque_number": cheque}
        if amount is None:
            amount = collections.preview_collection(fy_id, payload)["calculated"]
        collections.create_collection(fy_id, {**payload, "amount": amount}, confirm=True)


def seed():
    sunrise = complexes.create_complex({
        "name": "Sunrise Business Centre",
        "address": "Plot 14, Ring Road, Navrangpura, Ahmedabad, Gujarat 380009",
        "gst_number": "24AABCS1234K1Z9"})

    # Previous FY: a few shops and records, to check reports are scoped by FY.
    prev = years.create_year(sunrise["id"], {"start_year": CUR_START - 1, "rate": "2.50"})
    prev_ids = add_shops(prev["id"], SUNRISE_SHOPS[:8])
    prev_day = (FY_START - timedelta(days=30)).isoformat()
    for n in ("G-1", "G-3", "G-5"):
        payload = {"main_shop_id": prev_ids[n], "sub_shop_ids": [], "payment_date": prev_day,
                   "mode": "CASH"}
        calc = collections.preview_collection(prev["id"], payload)["calculated"]
        collections.create_collection(prev["id"], {**payload, "amount": calc}, confirm=True)

    cur = years.create_year(sunrise["id"], {"start_year": CUR_START, "rate": "3.00"})
    ids = add_shops(cur["id"], SUNRISE_SHOPS)
    add_collections(cur["id"], ids, SUNRISE_COLLECTIONS)

    green = complexes.create_complex({
        "name": "Green Plaza",
        "address": "Opp. City Mall, SV Road, Andheri West, Mumbai, Maharashtra 400058",
        "gst_number": "27AAFCG5678L1Z3"})
    gfy = years.create_year(green["id"], {"start_year": CUR_START, "rate": "4.25"})
    gids = add_shops(gfy["id"], [
        ("A-101", "Sanjay Kulkarni", "9820044001", None, 350),
        ("A-102", "Rohit Malhotra", "9820044002", None, 300),
        ("A-103", "Rohit Malhotra", "9820044002", None, 300),
        ("B-201", "Priya Menon", "9820044004", "27GGGPM1111G1Z2", 450),
        ("B-202", "Arjun Sawant", "9820044005", None, 275),
    ])
    add_collections(gfy["id"], gids, [
        ("A-102", ["A-103"], 0, "CASH", None, None),
        ("B-201", [], 20, "CHEQUE", "889900", None),
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--reset", action="store_true", help="delete the existing database first")
    args = parser.parse_args()
    path = db.get_db_path()
    if path.exists():
        if not args.reset:
            raise SystemExit(f"{path} already exists. Run with --reset to recreate it.")
        path.unlink()
    db.init_schema()
    seed()
    print(f"Seeded {path} (current FY {CUR_START}-{(CUR_START + 1) % 100:02d}, today {TODAY}).")


if __name__ == "__main__":
    main()
