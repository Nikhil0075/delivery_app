# BBSR Liquor Delivery — Local Prototype

A locally-runnable prototype of a **multi-shop liquor delivery marketplace** for
Bhubaneswar, built per the accompanying deep-research report. All data is mock:
the catalog, prices, stock, and "top movers" ranking are extracted from a real
one-day counter sales register (`SALE FIGURE.pdf`, Four Friends Beverages,
01-Jul-2026 — 706 SKUs, 44,595 units, ₹1.30 crore GMV).

## Run

```bash
npm install
npm run dev        # http://localhost:3000
```

No database server — state lives in `data/db.json` (created on first run from
the generated seed files, survives restarts). Reset it anytime from
**Admin → Compliance → Reset demo data**.

## The four personas

| Route | Persona | What you can do |
|---|---|---|
| `/` | Customer | Age gate → pick a nearby shop → browse top movers / search / categories → single-shop cart → mock-prepaid checkout → live tracking, OTP display, substitution approval, cancel |
| `/shop` | Shop owner | Accept / reject / suggest substitute, picking-packing-sealed checklist, mark ready, inventory price/stock editing, settlement report (12% commission) |
| `/rider` | Rider | Claim ready orders, confirm sealed pickup, deliver with customer OTP + age re-check, refuse handoff, earnings |
| `/admin` | Admin | KPI dashboard (live orders + register analytics), full order explorer with audit event log, pause/resume shops, **dry-day shutdown**, delivery-window override, demo reset |

## Demo walkthrough (end-to-end order)

1. **Customer** (`/`): confirm 18+, pick *Four Friends Beverages*, add a couple
   of fast movers, open the cart, place the order.
2. **Shop** (`/shop`): the order appears under *Needs action* — Accept, tick
   picked/packed/sealed, *Mark ready for pickup*. (Or try *Suggest substitute*
   and approve it back on the customer tab.)
3. **Rider** (`/rider`): Claim the pickup, confirm sealed package, then ask the
   "customer" for the OTP shown on their order screen and complete delivery.
   A wrong OTP is rejected; *Verification failed* returns the order.
4. **Admin** (`/admin`): watch KPIs, GMV, and the audit log update; toggle
   **Dry day** and see checkout blocked instantly on the customer side.

## Mock-data pipeline

```bash
python scripts/extract_pdf.py     # parses SALE FIGURE.pdf (pure stdlib)
python scripts/generate_shops.py  # builds shops/catalogs/seed from it
```

- `extract_pdf.py` decompresses the PDF content streams and reconstructs the
  register rows; it verifies totals against the report figures (706 SKUs,
  332 with sales, 44,595 units, ₹1,30,49,470 GMV) and infers category + pack
  size per SKU.
- `generate_shops.py` keeps Four Friends verbatim and derives 4 fictional
  Bhubaneswar shops (60–80% catalog subsets, 0–5% price jitter, scaled stock),
  plus mock customers, riders, and historical orders.
- Output lands in `data/*.json`; delete `data/db.json` to pick up regenerated
  seeds.

## Compliance mocks (report §Regulation)

Single-shop cart, prepaid-only, 18+ age gate with delivery-time re-check,
ordering window 10:00–22:30 IST (Odisha off-premises hours), dry-day kill
switch, sealed-package confirmation at pickup and handoff, and an append-only
per-order event log. These are demo-grade stand-ins for the state-aware
compliance engine described in the report — not legal controls.
