"""
Customer 360 test data generator.

Produces fictional "bronze" (raw, source-shaped) tables for the four Customer 360 sources:

  Sales     - ERP (wholesale accounts) + Shopify (direct-to-consumer): customers, products,
              orders, order lines
  Returns   - RMAs at order-line level with reason codes
  Marketing - Klaviyo: profiles, campaigns, flows, metrics, events (API-shaped)
  Service   - Zendesk: organizations, users, tickets, ticket metrics (API-shaped)

The data is deterministic (fixed seed) and has patterns built in so the dashboard has something
to find: growing, stable, declining and churned customers, single-product-line buyers, high
returners, ticket spikes ahead of churn, and fading Klaviyo engagement.

Stdlib only. Output: CSV (UTF-8, header row) per table under ./output/bronze/, plus the ground
truth personas under ./output/_truth/ (for validating scores - never load into the dashboard).

Usage:
    python generate_testdata.py [--seed 42] [--dtc 3000] [--wholesale 60] [--out ./output]
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

# ----------------------------------------------------------------------------------------------
# Calendar
# ----------------------------------------------------------------------------------------------
START = date(2024, 10, 1)
END = date(2026, 9, 28)               # "today" for the dataset
MONTHS = [date(START.year + (START.month - 1 + i) // 12, (START.month - 1 + i) % 12 + 1, 1) for i in range(24)]


def month_end(d: date) -> date:
    nxt = date(d.year + d.month // 12, d.month % 12 + 1, 1)
    return min(nxt - timedelta(days=1), END)


def ts(d: date | datetime, rng: random.Random | None = None) -> str:
    """ISO-8601 UTC timestamp; random time of day when given a date."""
    if isinstance(d, datetime):
        return d.strftime("%Y-%m-%dT%H:%M:%SZ")
    h, m, s = (rng.randint(7, 22), rng.randint(0, 59), rng.randint(0, 59)) if rng else (12, 0, 0)
    return datetime(d.year, d.month, d.day, h, m, s).strftime("%Y-%m-%dT%H:%M:%SZ")


# ----------------------------------------------------------------------------------------------
# Reference data (fictional)
# ----------------------------------------------------------------------------------------------
PRODUCT_LINES = [
    # name, code, popularity (share of customers who buy it), categories, typical retail price
    ("Fasteners", "FS", 0.92, ["Screws", "Bolts", "Anchors", "Nuts & Washers"], 12),
    ("Hand Tools", "HT", 0.66, ["Wrenches", "Pliers", "Screwdrivers", "Hammers"], 35),
    ("Power Tools", "PT", 0.58, ["Drills", "Saws", "Sanders", "Impact Drivers"], 180),
    ("Widgets", "WG", 0.44, ["Standard Widget", "Heavy-Duty Widget", "Micro Widget"], 25),
    ("Smart Widgets", "SW", 0.38, ["Connected Widget", "Widget Hub", "Sensor Widget"], 90),
    ("Plumbing", "PL", 0.27, ["Valves", "Fittings", "Pipe"], 30),
    ("Electrical", "EL", 0.22, ["Switches", "Outlets", "Wire"], 20),
    ("Storage & Organization", "SO", 0.14, ["Tool Chests", "Bins", "Shelving"], 150),
    ("Safety Gear", "SG", 0.11, ["Gloves", "Eye Protection", "Hearing Protection"], 18),
]
MATERIALS = {"Fasteners": ["Zinc-Plated Steel", "Stainless Steel", "Brass"], "Hand Tools": ["Chrome Vanadium", "Forged Steel"],
             "Power Tools": ["18V Cordless", "Corded"], "Widgets": ["Aluminum", "Steel", "Nylon"],
             "Smart Widgets": ["Polymer", "Aluminum"], "Plumbing": ["Brass", "PVC", "Copper"], "Electrical": ["Polycarbonate", "Copper"],
             "Storage & Organization": ["Steel", "Polypropylene"], "Safety Gear": ["Nitrile", "Polycarbonate", "Foam"]}
PACK_SIZES = {"Fasteners": ["50-pack", "100-pack", "500-bulk"], "Widgets": ["Single", "4-pack", "12-pack"],
              "Plumbing": ["Single", "5-pack"], "Electrical": ["Single", "10-pack"], "Safety Gear": ["Single", "12-pack"]}

RETAILER_WORDS_A = ["Bergstrom", "Harlow", "Marisol", "Castellan", "Whitfield", "Ondine", "Pemberton", "Aurelia",
                    "Kessler", "Brightwater", "Solano", "Thornbury", "Velloso", "Northgate", "Larkspur", "Delacroix",
                    "Hollis", "Seabrook", "Ashford", "Meridian", "Carrow", "Lindqvist", "Palisade", "Rosen",
                    "Tidewater", "Emberly", "Garrison", "Halden", "Iverson", "Juniper", "Kingsley", "Lowell",
                    "Monarch", "Newhall", "Oakmont", "Prescott", "Quimby", "Radcliffe", "Sterling Row", "Truman",
                    "Umber", "Vantage", "Westbrook", "Yardley", "Zephyr", "Alder", "Beacon", "Cypress", "Dunmore",
                    "Everly", "Fairhaven", "Glenrose", "Hartwell", "Ivywood", "Jasper", "Keswick", "Linden",
                    "Mayfair", "Norwood", "Orchard"]
RETAILER_SUFFIX = ["Hardware", "Supply Co.", "Building Supply", "Industrial", "Tool & Supply", "Lumber & Hardware",
                   "Contractors Supply", "Distribution"]
FIRST = ["Olivia", "Emma", "Ava", "Sophia", "Isabella", "Mia", "Charlotte", "Amelia", "Harper", "Evelyn", "Abigail",
         "Ella", "Grace", "Chloe", "Nora", "Lily", "Zoe", "Hannah", "Aria", "Layla", "James", "Michael", "Daniel",
         "David", "Andrew", "Ryan", "Nathan", "Priya", "Aisha", "Mei", "Sofia", "Lucia", "Camila", "Yara", "Noor",
         "Jordan", "Taylor", "Morgan", "Casey", "Riley"]
LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
        "Hernandez", "Lopez", "Wilson", "Anderson", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White",
        "Harris", "Clark", "Lewis", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Nguyen", "Patel", "Kim",
        "Chen", "Shah", "Rossi", "Cohen", "Murphy", "Rivera", "Brooks"]
REGIONS = {
    "Northeast": [("New York", "NY"), ("Boston", "MA"), ("Greenwich", "CT"), ("Philadelphia", "PA"), ("Short Hills", "NJ")],
    "Southeast": [("Miami", "FL"), ("Atlanta", "GA"), ("Charlotte", "NC"), ("Naples", "FL"), ("Nashville", "TN")],
    "Central": [("Chicago", "IL"), ("Dallas", "TX"), ("Houston", "TX"), ("Minneapolis", "MN"), ("St. Louis", "MO")],
    "West": [("Los Angeles", "CA"), ("San Francisco", "CA"), ("Scottsdale", "AZ"), ("Seattle", "WA"), ("Denver", "CO")],
}
ACCOUNT_MANAGERS = ["J. Ramirez", "K. Osei", "M. Chen", "S. Albright"]

RETURN_REASONS = [
    ("WRONG_SPEC", "Wrong size / spec", 0.30),
    ("NOT_NEEDED", "No longer needed", 0.20),
    ("DEFECT", "Defective / does not work", 0.16),
    ("DAMAGED", "Damaged in transit", 0.09),
    ("WRONG_ITEM", "Wrong item shipped", 0.06),
    ("OVERSTOCK", "Overstock return (wholesale)", 0.09),
    ("OTHER", "Other", 0.08),
]

PERSONAS_WHOLESALE = [("growing", 0.18), ("stable", 0.38), ("declining", 0.2), ("churned", 0.07),
                      ("single_line", 0.1), ("high_returner", 0.07)]
PERSONAS_DTC = [("growing", 0.12), ("stable", 0.33), ("declining", 0.15), ("churned", 0.15),
                ("single_line", 0.12), ("high_returner", 0.05), ("new", 0.08)]

# Seasonality multipliers by calendar month
SEASON_DTC = {1: 0.7, 2: 0.8, 3: 1.1, 4: 1.35, 5: 1.4, 6: 1.3, 7: 1.1, 8: 1.0, 9: 0.9, 10: 0.85, 11: 1.35, 12: 1.3}  # spring DIY, Father's Day, Black Friday
SEASON_WHOLESALE = {1: 1.0, 2: 1.3, 3: 1.4, 4: 1.2, 5: 1.0, 6: 0.9, 7: 0.8, 8: 0.9, 9: 1.1, 10: 1.2, 11: 0.9, 12: 0.6}  # stocking ahead of spring

ZD_SUBJECTS_WHOLESALE = [
    ("Order shipment delayed", "incident"), ("Short shipment / missing cartons", "incident"), ("Invoice discrepancy", "problem"),
    ("Bulk pricing request", "question"), ("Backorder ETA", "question"), ("Damaged pallet received", "incident"),
    ("Warranty claim batch", "problem"), ("Spec sheet / compliance docs", "question"), ("Co-op marketing funds", "question"),
    ("EDI order error", "problem"),
]
ZD_SUBJECTS_DTC = [
    ("Where is my order?", "question"), ("Smart Widget will not connect to app", "problem"), ("Missing parts in box", "incident"),
    ("Warranty claim", "problem"), ("Item arrived damaged", "incident"), ("How do I install this?", "question"),
    ("Return label request", "question"), ("Promo code not working", "problem"), ("Compatibility question", "question"),
]
ZD_GROUPS = {"Wholesale": "Wholesale Support", "DTC": "Client Services", "Prospect": "Client Services"}
ZD_AGENTS = [(9000001 + i, n) for i, n in enumerate(["Dana Park", "Luis Ortega", "Rachel Moss", "Tom Becker", "Ana Silva", "Sam Wu"])]

KLAVIYO_METRICS = [
    # id, name, integration
    ("RcvEml", "Received Email", "Klaviyo"), ("OpnEml", "Opened Email", "Klaviyo"),
    ("ClkEml", "Clicked Email", "Klaviyo"), ("BncEml", "Bounced Email", "Klaviyo"),
    ("UnsEml", "Unsubscribed from Email Marketing", "Klaviyo"), ("RcvSms", "Received SMS", "Klaviyo"),
    ("ClkSms", "Clicked SMS", "Klaviyo"), ("PlcOrd", "Placed Order", "Shopify"),
    ("VwProd", "Viewed Product", "Klaviyo"), ("ActSit", "Active on Site", "Klaviyo"),
]


# ----------------------------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------------------------
def weighted(rng: random.Random, pairs):
    r, acc = rng.random() * sum(w for _, w in pairs), 0.0
    for v, w in pairs:
        acc += w
        if r <= acc:
            return v
    return pairs[-1][0]


def poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= L:
            return k
        k += 1


ULID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def ulid(rng: random.Random, prefix: str = "01J") -> str:
    return prefix + "".join(rng.choice(ULID_CHARS) for _ in range(26 - len(prefix)))


def rand_date(rng: random.Random, a: date, b: date) -> date:
    if b <= a:
        return a
    return a + timedelta(days=rng.randint(0, (b - a).days))


def trend(persona: str, m: int, start_m: int, churn_m: int) -> float:
    """Spend multiplier for month index m (0..23)."""
    if m < start_m:
        return 0.0
    if persona == "growing":
        return 0.8 + 0.6 * m / 23
    if persona == "declining":
        return 1.0 if m < 10 else max(0.3, 1.0 - 0.65 * (m - 10) / 13)
    if persona == "churned":
        return 1.0 if m < churn_m else 0.0
    return 1.0


# ----------------------------------------------------------------------------------------------
# Entities
# ----------------------------------------------------------------------------------------------
@dataclass
class Product:
    sku: str
    style_number: str
    name: str
    collection: str
    category: str
    metal: str
    stone: str | None
    retail_price: float
    wholesale_price: float
    launch_date: date


@dataclass
class Customer:
    key: str                  # our internal key (ground truth only)
    channel: str              # Wholesale | DTC
    persona: str
    region: str
    city: str
    state: str
    since: date
    start_m: int
    churn_m: int
    base: float               # wholesale: $ per month; DTC: orders per year
    collections: list[int]
    return_mult: float
    ticket_rate: float        # tickets per month at baseline
    engagement: float         # Klaviyo open propensity 0..1
    erp_number: str | None = None
    shopify_id: int | None = None
    name: str = ""
    first: str = ""
    last: str = ""
    email: str = ""
    doors: int | None = None
    manager: str | None = None
    contacts: list[dict] = field(default_factory=list)
    klaviyo_ids: list[str] = field(default_factory=list)
    zendesk_org_id: int | None = None
    zendesk_user_ids: list[int] = field(default_factory=list)
    orders: list[dict] = field(default_factory=list)


def build_products(rng: random.Random) -> list[Product]:
    out, n = [], 1000
    for li, (line, code, _pop, cats, base) in enumerate(PRODUCT_LINES):
        for k in range(rng.randint(9, 15)):
            cat = cats[k % len(cats)]
            material = rng.choice(MATERIALS[line])
            pack = rng.choice(PACK_SIZES.get(line, ["Single"]))
            size = rng.choice(["#8 x 1-1/4 in", "1/4-20 x 2 in", "3/8 in", "M6", "1/2 in", "Standard", "Compact", "XL"])
            retail = round(base * rng.uniform(0.6, 2.4) * (4 if "bulk" in pack else 1)) - 0.01
            n += 1
            out.append(Product(
                sku=f"{code}-{n:05d}", style_number=f"{code}{rng.randint(100, 999)}-{rng.randint(10, 99)}",
                name=f"{material} {cat} {size}" + ("" if pack == "Single" else f" ({pack})"),
                collection=line, category=cat, metal=material, stone=pack, retail_price=float(retail),
                wholesale_price=round(retail * 0.55, 2),
                launch_date=rand_date(rng, date(2015, 1, 1), date(2026, 3, 1)) if li else date(2010, 1, 1)))
    return out


def pick_collections(rng: random.Random, persona: str, channel: str) -> list[int]:
    owned = [0]
    if persona == "single_line":
        return owned if rng.random() < 0.6 else owned + [1 + int(rng.random() * 2)]
    scale = 1.05 if channel == "Wholesale" else 0.55
    for i, (_, _, pop, _, _) in enumerate(PRODUCT_LINES[1:], start=1):
        if rng.random() < pop * scale:
            owned.append(i)
    return owned


def build_customers(rng: random.Random, n_wh: int, n_dtc: int, n_prospects: int = 800) -> list[Customer]:
    customers: list[Customer] = []
    used_names: set[str] = set()
    for i in range(n_wh):
        persona = weighted(rng, PERSONAS_WHOLESALE)
        region = rng.choice(list(REGIONS))
        city, state = rng.choice(REGIONS[region])
        while True:
            nm = f"{rng.choice(RETAILER_WORDS_A)} {rng.choice(RETAILER_SUFFIX)}"
            if nm not in used_names:
                used_names.add(nm)
                break
        c = Customer(
            key=f"W{i + 1:04d}", channel="Wholesale", persona=persona, region=region, city=city, state=state,
            since=rand_date(rng, date(2006, 1, 1), date(2023, 6, 1)), start_m=0,
            churn_m=rng.randint(12, 17), base=rng.lognormvariate(math.log(14000), 0.7),
            collections=pick_collections(rng, persona, "Wholesale"),
            return_mult={"high_returner": 2.8, "declining": 1.5}.get(persona, 1.0),
            ticket_rate={"declining": 0.35, "churned": 0.3, "high_returner": 0.3}.get(persona, 0.15),
            engagement={"declining": 0.35, "churned": 0.3, "growing": 0.6}.get(persona, 0.45),
            erp_number=f"C{20000 + i * 7 + rng.randint(0, 6):05d}", name=nm,
            doors=1 + int(rng.random() ** 2 * 6), manager=rng.choice(ACCOUNT_MANAGERS))
        domain = nm.lower().replace("&", "and").replace(".", "").replace(" ", "") + ".example.com"
        for role in (["Buyer", "Accounts Payable"] + (["Store Manager"] if rng.random() < 0.5 else [])):
            f, l = rng.choice(FIRST), rng.choice(LAST)
            c.contacts.append({"first": f, "last": l, "role": role, "email": f"{f[0].lower()}{l.lower()}@{domain}"})
        customers.append(c)

    for i in range(n_dtc):
        persona = weighted(rng, PERSONAS_DTC)
        region = rng.choice(list(REGIONS))
        city, state = rng.choice(REGIONS[region])
        f, l = rng.choice(FIRST), rng.choice(LAST)
        start_m = rng.randint(6, 20) if persona == "new" else 0
        vip = rng.random() < 0.06
        c = Customer(
            key=f"D{i + 1:05d}", channel="DTC", persona=persona, region=region, city=city, state=state,
            since=(MONTHS[start_m] if persona == "new" else rand_date(rng, date(2017, 1, 1), date(2024, 9, 1))),
            start_m=start_m, churn_m=rng.randint(6, 16),
            base=(rng.uniform(4, 9) if vip else rng.lognormvariate(math.log(1.6), 0.5)),
            collections=pick_collections(rng, persona, "DTC"),
            return_mult={"high_returner": 3.0, "declining": 1.4}.get(persona, 1.0),
            ticket_rate={"declining": 0.06, "churned": 0.05, "high_returner": 0.08}.get(persona, 0.02),
            engagement={"declining": 0.2, "churned": 0.15, "growing": 0.45, "new": 0.5}.get(persona, 0.3),
            shopify_id=7400000000000 + rng.randint(10 ** 8, 10 ** 9), first=f, last=l,
            email=f"{f.lower()}.{l.lower()}{rng.randint(1, 999)}@example.com")
        c.name = f"{f} {l}"
        customers.append(c)

    # Marketing-only prospects: Klaviyo subscribers (and the odd pre-purchase Zendesk question) with no purchase
    for i in range(n_prospects):
        region = rng.choice(list(REGIONS))
        city, state = rng.choice(REGIONS[region])
        f, l = rng.choice(FIRST), rng.choice(LAST)
        since = rand_date(rng, date(2023, 1, 1), END - timedelta(days=30))
        start_m = min(23, max(0, (since.year - START.year) * 12 + since.month - START.month))
        c = Customer(
            key=f"P{i + 1:05d}", channel="Prospect", persona="prospect", region=region, city=city, state=state,
            since=since, start_m=start_m, churn_m=99, base=0.0, collections=[rng.randrange(len(PRODUCT_LINES))],
            return_mult=1.0, ticket_rate=0.01, engagement=rng.uniform(0.1, 0.4), first=f, last=l,
            email=f"{f.lower()}.{l.lower()}{rng.randint(1000, 9999)}@example.com")
        c.name = f"{f} {l}"
        customers.append(c)
    return customers


# Ground truth for identity resolution: (source_system, source_id, true customer key)
IDENTITY_TRUTH: list[dict] = []


def truth(source: str, source_id, c: "Customer"):
    IDENTITY_TRUTH.append({"source_system": source, "source_id": str(source_id), "true_customer_key": c.key})


def case_variant(rng: random.Random, email: str) -> str:
    """Real systems store the same email with different casing/whitespace."""
    r = rng.random()
    if r < 0.08:
        return email[0].upper() + email[1:]
    if r < 0.11:
        return " " + email.upper()
    return email


# ----------------------------------------------------------------------------------------------
# Generators per source
# ----------------------------------------------------------------------------------------------
def gen_sales_and_returns(rng, customers, products):
    by_coll: dict[int, list[Product]] = {}
    for p in products:
        by_coll.setdefault([c[0] for c in PRODUCT_LINES].index(p.collection), []).append(p)
    orders, lines, returns = [], [], []
    so_n, sh_n, rma_n = 500000, 100000, 80000

    for c in customers:
        wholesale = c.channel == "Wholesale"
        for m, mstart in enumerate(MONTHS):
            t = trend(c.persona, m, c.start_m, c.churn_m)
            if t == 0:
                continue
            # growing customers adopt a new collection along the way (upsell realised)
            if c.persona == "growing" and m in (8, 16) and rng.random() < 0.6:
                missing = [i for i in range(len(PRODUCT_LINES)) if i not in c.collections]
                if missing:
                    c.collections.append(max(missing, key=lambda i: PRODUCT_LINES[i][2] + rng.random() * 0.2))
            season = (SEASON_WHOLESALE if wholesale else SEASON_DTC)[mstart.month]
            n_orders = poisson(rng, (1.3 if wholesale else c.base / 12) * season * t)
            for _ in range(n_orders):
                od = rand_date(rng, mstart, month_end(mstart))
                if od > END:
                    continue
                n_lines = rng.randint(4, 18) if wholesale else weighted(rng, [(1, 0.45), (2, 0.3), (3, 0.15), (4, 0.1)])
                if wholesale:
                    so_n += 1
                    oid, source, ref = f"SO-{so_n}", "ERP", c.erp_number
                else:
                    sh_n += 1
                    oid, source, ref = f"#{sh_n}", "Shopify", str(c.shopify_id)
                promo = (not wholesale) and rng.random() < 0.22
                subtotal = 0.0
                order_lines = []
                target = c.base * season * t / 1.3 if wholesale else None
                for ln in range(1, n_lines + 1):
                    coll = rng.choice(c.collections) if rng.random() < 0.8 else c.collections[0]
                    p = rng.choice(by_coll[coll])
                    qty = rng.randint(4, 48) if wholesale else rng.randint(1, 3)
                    unit = p.wholesale_price if wholesale else p.retail_price
                    disc = round(unit * qty * (rng.choice([0.1, 0.15, 0.2]) if promo else 0), 2)
                    net = round(unit * qty - disc, 2)
                    order_lines.append([oid, ln, p.sku, qty, unit, disc, net])
                    subtotal += net
                    if target and subtotal > target:
                        break
                tax = 0.0 if wholesale else round(subtotal * 0.07, 2)
                status = "Shipped" if od < END - timedelta(days=3) else "Open"
                orders.append({
                    "order_id": oid, "source_system": source, "customer_ref": ref, "channel": c.channel,
                    "order_date": od.isoformat(), "order_status": status, "currency": "USD",
                    "subtotal": round(subtotal, 2), "discount_code": ("SAVE" + str(rng.randint(10, 25))) if promo else "",
                    "tax": tax, "shipping": 0.0, "total": round(subtotal + tax, 2), "ship_city": c.city, "ship_state": c.state,
                    "sales_rep": c.manager or "",
                })
                c.orders.append({"id": oid, "date": od, "total": round(subtotal + tax, 2),
                                 "collections": {l[2][:2] for l in order_lines}})
                for l in order_lines:
                    lines.append(dict(zip(["order_id", "line_number", "sku", "quantity", "unit_price", "line_discount", "net_amount"], l)))
                    # returns
                    base_rate = (0.07 if wholesale else 0.075) * c.return_mult
                    if c.persona == "declining" and m >= 9:
                        base_rate *= 1.3
                    if rng.random() < base_rate:
                        rd = od + timedelta(days=rng.randint(5, 60 if wholesale else 35))
                        if rd > END:
                            continue
                        reasons = []
                        for rc, rlabel, rw in RETURN_REASONS:
                            if rc == "OVERSTOCK" and not wholesale:
                                continue
                            if rc == "DEFECT" and c.persona in ("declining", "high_returner"):
                                rw *= 2.2
                            reasons.append(((rc, rlabel), rw))
                        code, reason = weighted(rng, reasons)
                        rqty = rng.randint(max(1, l[3] // 4), l[3])
                        rma_n += 1
                        returns.append({
                            "rma_id": f"RMA-{rma_n}", "order_id": oid, "line_number": l[1], "sku": l[2],
                            "customer_ref": ref, "source_system": source, "return_date": rd.isoformat(),
                            "quantity": rqty, "reason_code": code, "reason": reason,
                            "refund_amount": round(l[6] / l[3] * rqty, 2),
                            "item_condition": weighted(rng, [("Resaleable", 0.7), ("Damaged", 0.2), ("Repair", 0.1)]),
                            "status": "Closed" if rd < END - timedelta(days=14) else rng.choice(["Received", "Authorized"]),
                        })
    return orders, lines, returns


def gen_zendesk(rng, customers):
    orgs, users, tickets, metrics = [], [], [], []
    org_id, user_id, ticket_id = 360000000000, 380000000000, 48000
    for aid, aname in ZD_AGENTS:
        users.append({"id": aid, "name": aname, "email": f"{aname.split()[0].lower()}@support.example.com", "role": "agent",
                      "organization_id": "", "external_id": "", "created_at": "2019-03-01T12:00:00Z", "tags": "", "phone": ""})
    for c in customers:
        wholesale = c.channel == "Wholesale"
        # every wholesale account gets an org; only DTC customers who ever file a ticket get a user
        if wholesale:
            org_id += rng.randint(1, 50)
            c.zendesk_org_id = org_id
            orgs.append({"id": org_id, "name": c.name, "external_id": c.erp_number, "domain_names": c.contacts[0]["email"].split("@")[1],
                         "tags": " ".join(["wholesale", c.region.lower(), "key_account" if c.base > 25000 else "standard"]),
                         "group_name": ZD_GROUPS["Wholesale"], "created_at": ts(max(c.since, date(2018, 1, 1)), rng)})
            truth("Zendesk Organization", org_id, c)
            for ct in c.contacts:
                user_id += rng.randint(1, 50)
                c.zendesk_user_ids.append(user_id)
                truth("Zendesk User", user_id, c)
                users.append({"id": user_id, "name": f"{ct['first']} {ct['last']}", "email": case_variant(rng, ct["email"]), "role": "end-user",
                              "organization_id": org_id, "external_id": "", "created_at": ts(max(c.since, date(2018, 1, 1)), rng),
                              "tags": ct["role"].lower().replace(" ", "_"), "phone": ""})

        for m, mstart in enumerate(MONTHS):
            active = trend(c.persona, m, c.start_m, c.churn_m) > 0 or (c.persona == "churned" and m <= c.churn_m + 1)
            if not active:
                continue
            rate = c.ticket_rate
            if c.persona in ("declining", "churned"):
                pivot = 10 if c.persona == "declining" else c.churn_m
                if pivot - 4 <= m <= pivot + 2:
                    rate *= 2.6        # service problems cluster just before the decline
            for _ in range(poisson(rng, rate)):
                created = rand_date(rng, mstart, month_end(mstart))
                if created > END:
                    continue
                if not wholesale and not c.zendesk_user_ids:
                    user_id += rng.randint(1, 50)
                    c.zendesk_user_ids.append(user_id)
                    r = rng.random()
                    email, ext = case_variant(rng, c.email), (str(c.shopify_id) if c.shopify_id else "")
                    if r < 0.03:       # wrote in from a different personal address, no link -> unresolvable
                        email, ext = f"{c.first.lower()}{c.last.lower()}{rng.randint(10, 99)}@example.net", ""
                    elif r < 0.15:     # guest ticket by email only -> resolvable by email
                        ext = ""
                    users.append({"id": user_id, "name": c.name, "email": email, "role": "end-user", "organization_id": "",
                                  "external_id": ext, "created_at": ts(created, rng),
                                  "tags": c.channel.lower(), "phone": ""})
                    truth("Zendesk User", user_id, c)
                subject, ttype = rng.choice(ZD_SUBJECTS_WHOLESALE if wholesale else ZD_SUBJECTS_DTC)
                troubled = c.persona in ("declining", "churned", "high_returner")
                priority = weighted(rng, [("low", 0.2), ("normal", 0.55), ("high", 0.2 + (0.15 if troubled else 0)), ("urgent", 0.05)])
                age = (END - created).days
                if age < 10:
                    status = weighted(rng, [("new", 0.2), ("open", 0.45), ("pending", 0.25), ("hold", 0.1)])
                elif age < 30:
                    status = weighted(rng, [("open", 0.15 + (0.15 if troubled else 0)), ("pending", 0.15), ("solved", 0.7)])
                else:
                    status = "closed" if age > 60 else "solved"
                ticket_id += rng.randint(1, 9)
                first_reply = int(rng.lognormvariate(math.log(180 if not troubled else 420), 0.8))
                resolution = int(rng.lognormvariate(math.log(60 * 24 * (1.5 if not troubled else 4)), 0.7))
                created_dt = datetime.combine(created, datetime.min.time()) + timedelta(minutes=rng.randint(420, 1260))
                solved_at = created_dt + timedelta(minutes=resolution) if status in ("solved", "closed") else None
                if solved_at and solved_at.date() > END:
                    solved_at, status = None, "open"
                csat = "unoffered"
                if status in ("solved", "closed"):
                    csat = weighted(rng, [("good", 0.62 - (0.25 if troubled else 0)), ("bad", 0.08 + (0.22 if troubled else 0)), ("offered", 0.3)])
                order_ref = rng.choice(c.orders)["id"] if c.orders and rng.random() < 0.6 else ""
                requester = rng.choice(c.zendesk_user_ids)
                assignee = rng.choice(ZD_AGENTS)[0]
                tickets.append({
                    "id": ticket_id, "created_at": ts(created_dt), "updated_at": ts(solved_at or min(created_dt + timedelta(hours=rng.randint(1, 72)), datetime.combine(END, datetime.min.time()))),
                    "subject": subject, "description": f"{subject}. Customer reference {order_ref or 'n/a'}.",
                    "status": status, "priority": priority, "type": ttype,
                    "via_channel": weighted(rng, [("email", 0.55), ("web", 0.2), ("chat", 0.15), ("voice", 0.1)]),
                    "requester_id": requester, "submitter_id": requester, "assignee_id": assignee,
                    "organization_id": c.zendesk_org_id or "", "group_name": ZD_GROUPS[c.channel],
                    "tags": " ".join(t for t in [c.channel.lower(), "order_issue" if order_ref else "", "pro" if c.base > 4 and not wholesale else ""] if t),
                    "custom_field_order_number": order_ref, "satisfaction_rating": csat,
                })
                metrics.append({
                    "ticket_id": ticket_id, "created_at": ts(created_dt), "solved_at": ts(solved_at) if solved_at else "",
                    "reply_time_in_minutes": first_reply, "full_resolution_time_in_minutes": resolution if solved_at else "",
                    "replies": rng.randint(1, 3) + (2 if troubled else 0), "reopens": 1 if troubled and rng.random() < 0.25 else 0,
                    "assignee_stations": rng.randint(1, 2),
                })
    return orgs, users, tickets, metrics


def gen_klaviyo(rng, customers, products):
    profiles, campaigns, flows, events = [], [], [], []
    # --- profiles
    for c in customers:
        if c.channel == "Wholesale":
            for ct in c.contacts:
                if ct["role"] == "Accounts Payable":
                    continue
                pid = ulid(rng)
                c.klaviyo_ids.append(pid)
                truth("Klaviyo", pid, c)
                profiles.append({
                    "id": pid, "email": case_variant(rng, ct["email"]), "phone_number": "",
                    "external_id": c.erp_number if rng.random() > 0.2 else "",   # 20% of buyer profiles never linked to the ERP
                    "first_name": ct["first"], "last_name": ct["last"], "organization": c.name, "title": ct["role"],
                    "location_city": c.city, "location_region": c.state, "location_country": "United States",
                    "created": ts(max(c.since, date(2020, 1, 1)), rng), "updated": ts(END, rng),
                    "email_consent": "SUBSCRIBED", "sms_consent": "NEVER_SUBSCRIBED",
                    "properties": json.dumps({"account_number": c.erp_number, "segment": "Wholesale", "account_manager": c.manager}),
                })
        else:
            pid = ulid(rng)
            c.klaviyo_ids.append(pid)
            truth("Klaviyo", pid, c)
            sms = rng.random() < 0.3
            linked = c.shopify_id is not None and rng.random() > 0.07      # signed up by form before buying: no Shopify link
            profiles.append({
                "id": pid, "email": case_variant(rng, c.email), "phone_number": f"+1{rng.randint(2012000000, 9899999999)}" if sms else "",
                "external_id": str(c.shopify_id) if linked else "", "first_name": c.first, "last_name": c.last, "organization": "", "title": "",
                "location_city": c.city, "location_region": c.state, "location_country": "United States",
                "created": ts(c.since, rng), "updated": ts(END, rng),
                "email_consent": "SUBSCRIBED" if rng.random() < 0.82 else "NEVER_SUBSCRIBED",
                "sms_consent": "SUBSCRIBED" if sms else "NEVER_SUBSCRIBED",
                "properties": json.dumps({"shopify_customer_id": c.shopify_id if linked else None, "pro_member": c.base > 4,
                                          "favorite_product_line": PRODUCT_LINES[c.collections[0]][0]}),
            })
    prof_by_id = {p["id"]: p for p in profiles}

    # --- campaigns
    themes_dtc = ["New Arrivals", "Spring Project Season", "Smart Widget Setup Tips", "Father's Day Tool Deals",
                  "Black Friday Tool Deals", "Holiday Gift Guide for DIYers", "Pro Tips: The Fastener Guide",
                  "Summer Deck Projects", "Back to Basics: Hand Tools", "Widget 2.0 Launch", "Garage Storage Makeover",
                  "Safety First", "Last Chance: Spring Sale", "Restocked: Best Sellers"]
    themes_b2b = ["Q4 Stocking Program", "Spring Line Launch", "Reorder: Best Sellers", "Co-op Program Update",
                  "Contractor Pricing Update", "New Widget Line Training", "Trade Show Appointments"]
    cid = 0
    d = START
    while d <= END:
        if d.weekday() == 1:                                   # Tuesdays: DTC email
            cid += 1
            campaigns.append({"id": ulid(rng, "01H"), "name": f"{d:%Y-%m-%d} {rng.choice(themes_dtc)}", "channel": "email",
                              "audience": "Engaged 180d + Customers", "status": "Sent", "send_time": ts(datetime(d.year, d.month, d.day, 14, 0)),
                              "subject": rng.choice(themes_dtc), "segment": "DTC"})
        if d.weekday() == 4 and d.day <= 14:                   # 2 Fridays/month: SMS
            campaigns.append({"id": ulid(rng, "01H"), "name": f"{d:%Y-%m-%d} SMS {rng.choice(themes_dtc)}", "channel": "sms",
                              "audience": "SMS Subscribers", "status": "Sent", "send_time": ts(datetime(d.year, d.month, d.day, 17, 0)),
                              "subject": "", "segment": "DTC"})
        if d.weekday() == 2 and d.day in range(1, 8) or d.weekday() == 2 and d.day in range(15, 22):   # B2B twice a month
            campaigns.append({"id": ulid(rng, "01H"), "name": f"{d:%Y-%m-%d} B2B {rng.choice(themes_b2b)}", "channel": "email",
                              "audience": "Wholesale Buyers", "status": "Sent", "send_time": ts(datetime(d.year, d.month, d.day, 15, 0)),
                              "subject": rng.choice(themes_b2b), "segment": "Wholesale"})
        d += timedelta(days=1)

    flow_defs = [("Welcome Series", "Added to List"), ("Post-Purchase Thank You", "Placed Order"),
                 ("Browse Abandonment", "Viewed Product"), ("Winback 180d", "Date Property"),
                 ("Wholesale Reorder Reminder", "Date Property")]
    for name, trig in flow_defs:
        flows.append({"id": "".join(rng.choice(ULID_CHARS) for _ in range(6)), "name": name, "status": "live",
                      "trigger_type": trig, "created": "2023-02-01T12:00:00Z"})
    flow_id = {f["name"]: f["id"] for f in flows}

    def ev(profile_id, metric, when: datetime, campaign="", flow="", value="", props=None):
        events.append({"id": ulid(rng, "4"), "profile_id": profile_id, "metric_id": metric, "datetime": ts(when),
                       "campaign_id": campaign, "flow_id": flow, "value": value, "properties": json.dumps(props or {})})

    def month_idx(d: date) -> int:
        return (d.year - START.year) * 12 + d.month - START.month

    # --- campaign sends / engagement
    unsubscribed: set[str] = set()
    for camp in campaigns:
        sent = datetime.strptime(camp["send_time"], "%Y-%m-%dT%H:%M:%SZ")
        m = month_idx(sent.date())
        for c in customers:
            if (camp["segment"] == "Wholesale") != (c.channel == "Wholesale"):
                continue
            if m < c.start_m:
                continue
            for pid in c.klaviyo_ids:
                prof = prof_by_id[pid]
                if pid in unsubscribed:
                    continue
                if camp["channel"] == "sms":
                    if prof["sms_consent"] != "SUBSCRIBED":
                        continue
                elif prof["email_consent"] != "SUBSCRIBED":
                    continue
                # fading engagement for declining / churned customers
                eng = c.engagement
                if c.persona == "declining" and m >= 8:
                    eng *= max(0.15, 1 - (m - 8) * 0.08)
                if c.persona == "churned" and m >= c.churn_m - 2:
                    eng *= 0.2
                if c.channel == "DTC" and camp["channel"] == "email" and rng.random() > 0.55 + eng:
                    continue                                   # not in the engaged audience this week
                if camp["channel"] == "sms":
                    ev(pid, "RcvSms", sent, camp["id"])
                    if rng.random() < eng * 0.25:
                        ev(pid, "ClkSms", sent + timedelta(minutes=rng.randint(1, 240)), camp["id"])
                    continue
                if rng.random() < 0.004:
                    ev(pid, "BncEml", sent, camp["id"])
                    continue
                ev(pid, "RcvEml", sent, camp["id"])
                if rng.random() < eng:
                    ot = sent + timedelta(minutes=int(rng.expovariate(1 / 600)))
                    if ot.date() <= END:
                        ev(pid, "OpnEml", ot, camp["id"], props={"Subject": camp["subject"], "Client Type": rng.choice(["Mobile", "Desktop", "Webmail"])})
                        if rng.random() < 0.16:
                            ev(pid, "ClkEml", ot + timedelta(minutes=rng.randint(0, 30)), camp["id"], props={"URL": "https://shop.example.com/new-arrivals"})
                unsub_p = 0.0015 * (3 if c.persona in ("declining", "churned") else 1)
                if rng.random() < unsub_p:
                    ev(pid, "UnsEml", sent + timedelta(hours=rng.randint(1, 48)), camp["id"])
                    unsubscribed.add(pid)

    # --- orders mirrored from Shopify, post-purchase flow, browse behaviour
    sku_by_coll = {}
    for p in products:
        sku_by_coll.setdefault(p.collection, []).append(p)
    for c in customers:
        if c.channel not in ("DTC", "Prospect") or not c.klaviyo_ids:
            continue
        pid = c.klaviyo_ids[0]
        for o in c.orders:
            when = datetime.combine(o["date"], datetime.min.time()) + timedelta(hours=rng.randint(8, 22))
            ev(pid, "PlcOrd", when, value=o["total"], props={"$event_id": o["id"], "Source": "Shopify"})
            if pid not in unsubscribed:
                ev(pid, "RcvEml", when + timedelta(hours=2), flow=flow_id["Post-Purchase Thank You"])
        # browsing: growing customers browse collections they don't own yet (upsell signal)
        for m in range(c.start_m, 24):
            eng = c.engagement * (0.3 if c.persona in ("churned",) and m > c.churn_m else 1)
            for _ in range(poisson(rng, eng * 2.2)):
                day = rand_date(rng, MONTHS[m], month_end(MONTHS[m]))
                if c.persona == "growing" and rng.random() < 0.5:
                    missing = [PRODUCT_LINES[i][0] for i in range(len(PRODUCT_LINES)) if i not in c.collections] or [PRODUCT_LINES[0][0]]
                    coll = rng.choice(missing)
                else:
                    coll = PRODUCT_LINES[rng.choice(c.collections)][0]
                p = rng.choice(sku_by_coll[coll])
                ev(pid, "VwProd", datetime.combine(day, datetime.min.time()) + timedelta(hours=rng.randint(8, 23)),
                   props={"ProductID": p.sku, "ProductName": p.name, "ProductLine": p.collection, "Price": p.retail_price})
        # winback flow for lapsed customers
        if c.orders:
            last = max(o["date"] for o in c.orders)
            if (END - last).days > 180 and pid not in unsubscribed:
                ev(pid, "RcvEml", datetime.combine(last + timedelta(days=180), datetime.min.time()) + timedelta(hours=10),
                   flow=flow_id["Winback 180d"])
    # wholesale reorder reminders
    for c in customers:
        if c.channel == "Wholesale" and c.orders:
            for o in c.orders[::3]:
                d2 = o["date"] + timedelta(days=45)
                if d2 <= END:
                    for pid in c.klaviyo_ids:
                        ev(pid, "RcvEml", datetime.combine(d2, datetime.min.time()) + timedelta(hours=9), flow=flow_id["Wholesale Reorder Reminder"])

    metrics = [{"id": i, "name": n, "integration": s} for i, n, s in KLAVIYO_METRICS]
    events.sort(key=lambda e: e["datetime"])
    return profiles, campaigns, flows, metrics, events


# ----------------------------------------------------------------------------------------------
# Output
# ----------------------------------------------------------------------------------------------
def write_csv(path: Path, rows: list[dict], columns: list[str] | None = None):
    path.parent.mkdir(parents=True, exist_ok=True)
    columns = columns or (list(rows[0].keys()) if rows else [])
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--wholesale", type=int, default=60)
    ap.add_argument("--dtc", type=int, default=3000)
    ap.add_argument("--prospects", type=int, default=800, help="Klaviyo subscribers who never purchased")
    ap.add_argument("--out", type=Path, default=Path(__file__).parent / "output")
    a = ap.parse_args()

    rng = random.Random(a.seed)
    products = build_products(rng)
    customers = build_customers(rng, a.wholesale, a.dtc, a.prospects)
    orders, lines, returns = gen_sales_and_returns(rng, customers, products)
    zd_orgs, zd_users, zd_tickets, zd_metrics = gen_zendesk(rng, customers)
    kl_profiles, kl_campaigns, kl_flows, kl_metrics, kl_events = gen_klaviyo(rng, customers, products)

    b = a.out / "bronze"
    counts = {}
    # Sales (ERP + Shopify)
    counts["erp_customers"] = write_csv(b / "sales" / "erp_customers.csv", [{
        "customer_number": c.erp_number, "account_name": c.name, "channel": "Wholesale", "region": c.region,
        "city": c.city, "state": c.state, "account_manager": c.manager, "customer_since": c.since.isoformat(),
        "location_count": c.doors, "payment_terms": "Net 60" if c.base > 20000 else "Net 30",
        "account_status": "Inactive" if c.persona == "churned" else "Active",
        "primary_contact_email": c.contacts[0]["email"]} for c in customers if c.channel == "Wholesale"])
    for c in customers:
        if c.erp_number:
            truth("ERP", c.erp_number, c)
        if c.shopify_id:
            truth("Shopify", c.shopify_id, c)
    counts["shopify_customers"] = write_csv(b / "sales" / "shopify_customers.csv", [{
        "id": c.shopify_id, "email": c.email, "first_name": c.first, "last_name": c.last,
        "created_at": ts(c.since, rng), "city": c.city, "province_code": c.state, "country_code": "US",
        "accepts_marketing": True, "tags": "Pro" if c.base > 4 else "",
        "orders_count": len(c.orders), "total_spent": round(sum(o["total"] for o in c.orders), 2)} for c in customers if c.channel == "DTC"])
    counts["products"] = write_csv(b / "sales" / "products.csv", [{
        "sku": p.sku, "model_number": p.style_number, "product_name": p.name, "product_line": p.collection,
        "category": p.category, "material": p.metal, "pack_size": p.stone or "", "retail_price": p.retail_price,
        "wholesale_price": p.wholesale_price, "launch_date": p.launch_date.isoformat()} for p in products])
    counts["sales_orders"] = write_csv(b / "sales" / "sales_orders.csv", orders)
    counts["sales_order_lines"] = write_csv(b / "sales" / "sales_order_lines.csv", lines)
    # Returns
    counts["returns"] = write_csv(b / "returns" / "returns.csv", returns)
    # Klaviyo
    counts["klaviyo_profiles"] = write_csv(b / "klaviyo" / "profiles.csv", kl_profiles)
    counts["klaviyo_campaigns"] = write_csv(b / "klaviyo" / "campaigns.csv", kl_campaigns)
    counts["klaviyo_flows"] = write_csv(b / "klaviyo" / "flows.csv", kl_flows)
    counts["klaviyo_metrics"] = write_csv(b / "klaviyo" / "metrics.csv", kl_metrics)
    counts["klaviyo_events"] = write_csv(b / "klaviyo" / "events.csv", kl_events)
    # Zendesk
    counts["zendesk_organizations"] = write_csv(b / "zendesk" / "organizations.csv", zd_orgs)
    counts["zendesk_users"] = write_csv(b / "zendesk" / "users.csv", zd_users)
    counts["zendesk_tickets"] = write_csv(b / "zendesk" / "tickets.csv", zd_tickets)
    counts["zendesk_ticket_metrics"] = write_csv(b / "zendesk" / "ticket_metrics.csv", zd_metrics)
    # Ground truth (validation only)
    write_csv(a.out / "_truth" / "identity_truth.csv", IDENTITY_TRUTH)
    write_csv(a.out / "_truth" / "customer_personas.csv", [{
        "customer_key": c.key, "channel": c.channel, "erp_customer_number": c.erp_number or "", "shopify_customer_id": c.shopify_id or "",
        "name": c.name, "persona": c.persona,
        "product_lines_at_end": "|".join(PRODUCT_LINES[i][0] for i in sorted(c.collections))} for c in customers])

    width = max(len(k) for k in counts)
    print(f"Generated test data (seed {a.seed}) -> {a.out}")
    for k, v in counts.items():
        print(f"  {k:<{width}}  {v:>9,}")


if __name__ == "__main__":
    main()
