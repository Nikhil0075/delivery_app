"""Generate mock marketplace data from the extracted Four Friends register.

Produces data/shops.json, data/catalogs.json, data/seed.json and
data/state-config.json. Deterministic (seeded) so re-runs are stable.

Run after extract_pdf.py:  python scripts/generate_shops.py
"""

import json
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
rng = random.Random(20260701)

SHOPS = [
    {
        "id": "four-friends",
        "name": "Four Friends Beverages",
        "area": "District Center, Chandrasekharpur",
        "address": "District Center, Chandrasekharpur, Bhubaneswar 751016",
        "licenceNo": "OD-EXC-BBSR-16358",
        "lat": 20.3237, "lng": 85.8195,
        "serviceRadiusKm": 7, "rating": 4.5,
    },
    {
        "id": "patia-wine-store",
        "name": "Patia Wine Store",
        "area": "Patia",
        "address": "KIIT Road, Patia, Bhubaneswar 751024",
        "licenceNo": "OD-EXC-BBSR-17204",
        "lat": 20.3520, "lng": 85.8235,
        "serviceRadiusKm": 5, "rating": 4.2,
    },
    {
        "id": "saheed-nagar-liquors",
        "name": "Saheed Nagar Liquors",
        "area": "Saheed Nagar",
        "address": "Janpath, Saheed Nagar, Bhubaneswar 751007",
        "licenceNo": "OD-EXC-BBSR-15990",
        "lat": 20.2900, "lng": 85.8420,
        "serviceRadiusKm": 4, "rating": 4.0,
    },
    {
        "id": "khandagiri-beverages",
        "name": "Khandagiri Beverages",
        "area": "Khandagiri",
        "address": "NH-16, Khandagiri Square, Bhubaneswar 751030",
        "licenceNo": "OD-EXC-BBSR-16871",
        "lat": 20.2540, "lng": 85.7789,
        "serviceRadiusKm": 6, "rating": 3.9,
    },
    {
        "id": "old-town-wine-shop",
        "name": "Old Town Wine Shop",
        "area": "Old Town",
        "address": "Near Lingaraj Temple Road, Old Town, Bhubaneswar 751002",
        "licenceNo": "OD-EXC-BBSR-15511",
        "lat": 20.2380, "lng": 85.8340,
        "serviceRadiusKm": 3, "rating": 4.1,
    },
]

CUSTOMERS = [
    {
        "id": "cust-ravi", "name": "Ravi Mohapatra", "mobile": "9876500011",
        "ageVerified": True,
        "addresses": [
            {"id": "addr-ravi-1", "label": "Home",
             "line1": "Plot 42, Sailashree Vihar", "area": "Chandrasekharpur",
             "lat": 20.3305, "lng": 85.8102},
            {"id": "addr-ravi-2", "label": "Office",
             "line1": "DLF Cybercity, Tower B", "area": "Patia",
             "lat": 20.3489, "lng": 85.8260},
        ],
    },
    {
        "id": "cust-anita", "name": "Anita Sahoo", "mobile": "9876500022",
        "ageVerified": True,
        "addresses": [
            {"id": "addr-anita-1", "label": "Home",
             "line1": "B-12, Maitri Vihar", "area": "Saheed Nagar",
             "lat": 20.2932, "lng": 85.8388},
        ],
    },
    {
        "id": "cust-vikram", "name": "Vikram Das", "mobile": "9876500033",
        "ageVerified": True,
        "addresses": [
            {"id": "addr-vikram-1", "label": "Home",
             "line1": "Qtr 7, Baramunda Housing Board", "area": "Baramunda",
             "lat": 20.2705, "lng": 85.7920},
        ],
    },
]

RIDERS = [
    {"id": "rider-suresh", "name": "Suresh Behera", "mobile": "9988700001",
     "vehicleNo": "OD-02-AB-1234"},
    {"id": "rider-prakash", "name": "Prakash Nayak", "mobile": "9988700002",
     "vehicleNo": "OD-02-CD-5678"},
    {"id": "rider-md", "name": "Md. Salim", "mobile": "9988700003",
     "vehicleNo": "OD-02-EF-9012"},
    {"id": "rider-jitu", "name": "Jitu Pradhan", "mobile": "9988700004",
     "vehicleNo": "OD-02-GH-3456"},
]

STATE_CONFIG = {
    "state": "Odisha",
    "city": "Bhubaneswar",
    "legalAge": 18,
    "deliveryWindow": {"open": "10:00", "close": "22:30"},
    "dryDay": False,
    # demo default: keep the hosted prototype orderable at any hour;
    # turn off in Admin -> Compliance to see the excise-window enforcement
    "windowOverride": True,
    "commissionPct": 12,
    "deliveryFee": 40,
    "convenienceFee": 15,
}


def round_price(p: float) -> float:
    # liquor MRPs are multiples of 10 in the register
    return max(10, round(p / 10) * 10)


def build_catalogs(products, inventory):
    inv = {i["productId"]: i for i in inventory}
    catalogs = {}

    # Four Friends: the real register, verbatim. Rows with rate 0.00 had no
    # sales that day and no known price — keep them but hidden.
    catalogs["four-friends"] = [
        {
            "productId": p["id"],
            "price": inv[p["id"]]["rate"] if inv[p["id"]]["rate"] > 0 else p["mrp"],
            "stock": inv[p["id"]]["openingQty"],
            "soldQty": inv[p["id"]]["soldQty"],
            "isVisible": inv[p["id"]]["rate"] > 0 or p["mrp"] > 0,
        }
        for p in products
    ]

    # Fictional shops: 60-80% subsets, 0-5% price jitter, scaled stock.
    for shop in SHOPS[1:]:
        take = rng.uniform(0.60, 0.80)
        items = []
        for p in products:
            if rng.random() > take:
                continue
            base = inv[p["id"]]
            rate = base["rate"] if base["rate"] > 0 else p["mrp"]
            if rate <= 0:
                continue
            price = round_price(rate * rng.uniform(1.0, 1.05))
            stock = int(base["openingQty"] * rng.uniform(0.3, 0.7))
            sold = int(base["soldQty"] * rng.uniform(0.2, 0.6))
            items.append({
                "productId": p["id"],
                "price": price,
                "stock": stock,
                "soldQty": sold,
                "isVisible": True,
            })
        catalogs[shop["id"]] = items
    return catalogs


def build_orders(products, catalogs):
    """~12 historical orders over the past 3 days, mostly delivered."""
    pmap = {p["id"]: p for p in products}
    now = datetime(2026, 7, 7, 9, 30)
    orders = []
    scenarios = (
        [("DELIVERED", None)] * 9
        + [("REJECTED", "OUT_OF_STOCK"), ("CANCELLED", "CUSTOMER_CANCELLED"),
           ("VERIFICATION_FAILED", "AGE_CHECK_FAILED")]
    )
    n = 0
    for status, reason in scenarios:
        n += 1
        cust = rng.choice(CUSTOMERS)
        shop = rng.choice(SHOPS)
        cat = [c for c in catalogs[shop["id"]] if c["soldQty"] > 0]
        picks = rng.sample(cat, k=min(rng.randint(1, 3), len(cat)))
        items = []
        for c in picks:
            qty = rng.randint(1, 4)
            items.append({
                "productId": c["productId"],
                "name": pmap[c["productId"]]["name"],
                "qty": qty,
                "unitPrice": c["price"],
                "lineTotal": qty * c["price"],
            })
        subtotal = sum(i["lineTotal"] for i in items)
        created = now - timedelta(hours=rng.uniform(4, 70))
        rider = rng.choice(RIDERS)["id"] if status in ("DELIVERED", "VERIFICATION_FAILED") else None
        events = [{"type": "PLACED", "at": created.isoformat() + "+05:30"}]
        t = created

        def ev(kind, minutes, note=None):
            nonlocal t
            t = t + timedelta(minutes=minutes)
            e = {"type": kind, "at": t.isoformat() + "+05:30"}
            if note:
                e["note"] = note
            events.append(e)

        if status == "REJECTED":
            ev("REJECTED", 2, reason)
        elif status == "CANCELLED":
            ev("CANCELLED", 1, reason)
        else:
            ev("ACCEPTED", 2)
            ev("READY_FOR_PICKUP", 8)
            ev("PICKED_UP", 6)
            if status == "DELIVERED":
                ev("DELIVERED", rng.randint(12, 30))
            else:
                ev("VERIFICATION_FAILED", 15, reason)

        orders.append({
            "id": f"seed-{n:03d}",
            "code": f"OD-{10100 + n}",
            "customerId": cust["id"],
            "shopId": shop["id"],
            "addressId": cust["addresses"][0]["id"],
            "items": items,
            "subtotal": subtotal,
            "deliveryFee": STATE_CONFIG["deliveryFee"],
            "convenienceFee": STATE_CONFIG["convenienceFee"],
            "total": subtotal + STATE_CONFIG["deliveryFee"] + STATE_CONFIG["convenienceFee"],
            "status": status,
            "otp": f"{rng.randint(0, 9999):04d}",
            "riderId": rider,
            "packing": {"picked": status != "REJECTED", "packed": status != "REJECTED",
                        "sealed": status != "REJECTED"},
            "substitution": None,
            "createdAt": created.isoformat() + "+05:30",
            "events": events,
        })
    orders.sort(key=lambda o: o["createdAt"])
    return orders


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    products = json.loads((DATA / "products.json").read_text(encoding="utf-8"))
    inventory = json.loads((DATA / "four-friends-inventory.json").read_text(encoding="utf-8"))

    shops = [{**s, "hours": {"open": "10:00", "close": "22:30"}, "status": "ACTIVE"}
             for s in SHOPS]
    catalogs = build_catalogs(products, inventory)
    orders = build_orders(products, catalogs)

    (DATA / "shops.json").write_text(json.dumps(shops, indent=1), encoding="utf-8")
    (DATA / "catalogs.json").write_text(json.dumps(catalogs, indent=1), encoding="utf-8")
    (DATA / "state-config.json").write_text(json.dumps(STATE_CONFIG, indent=1), encoding="utf-8")
    (DATA / "seed.json").write_text(json.dumps({
        "customers": CUSTOMERS, "riders": RIDERS, "orders": orders,
    }, indent=1), encoding="utf-8")

    for sid, items in catalogs.items():
        print(f"{sid:22s} {len(items):4d} SKUs, "
              f"{sum(1 for i in items if i['stock'] > 0):4d} in stock")
    print(f"seed orders: {len(orders)}")


if __name__ == "__main__":
    main()
