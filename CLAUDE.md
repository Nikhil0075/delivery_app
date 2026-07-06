# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A locally-runnable **prototype** of a multi-shop liquor delivery marketplace (Bhubaneswar, Odisha) with four persona UIs sharing one mock backend. Everything is mock: payments always succeed, the handoff OTP lives on the order object, and compliance controls are demo-grade. Built per a research report; the catalog/stock/top-seller data is extracted from a real one-day sales register PDF.

## Commands

```bash
npm run dev      # http://localhost:3000
npm run build    # also the type-check; no test suite exists
npm run lint
```

Regenerating mock data (only needed if the generators change; output is committed in `data/`):

```bash
python scripts/extract_pdf.py      # parses "C:\Users\ROG\Downloads\SALE FIGURE.pdf" (stdlib only)
python scripts/generate_shops.py   # shops/catalogs/seed derived from the extraction
```

`extract_pdf.py` self-validates against the register's grand total (706 SKUs, 332 with sales, 44,595 units, ₹1,30,49,470 GMV) — if those numbers drift after a parser change, the parser is wrong.

## Architecture

**No database.** `src/lib/store.ts` holds a singleton in-memory `Db` (stashed on `globalThis` to survive dev HMR), hydrated from the generated `data/*.json` seeds on first access; every mutation rewrites `data/db.json` (gitignored). To reset live state: delete `data/db.json` or use Admin → Compliance → Reset demo data.

**All domain logic is in `src/lib/logic.ts`** — API routes under `src/app/api/` are thin wrappers around it:
- `createOrder` validates compliance + stock, reserves stock, generates the OTP.
- `transitionOrder(orderId, action)` is the single order state machine: `PLACED → ACCEPTED → READY_FOR_PICKUP → PICKED_UP → DELIVERED`, with branches `REJECTED`, `CANCELLED`, `SUBSTITUTION_PENDING`, `VERIFICATION_FAILED`. Stock is released on reject/cancel/verification-failure; every transition appends to the order's append-only `events` log. Add new order behaviors as new actions here, not in routes.
- `orderingAllowed` is the compliance gate (dry-day flag, 10:00–22:30 IST window with `windowOverride` demo escape, shop paused) — enforced at checkout, surfaced as banners in UIs.
- `shopSettlement` / `kpis` compute aggregates on the fly (12% commission from `stateConfig`); nothing is stored.

**Four persona pages**, each a single self-contained client component that polls every ~3s via `usePoll` (no websockets): `/` customer (age gate → shop pick → cart → tracking), `/shop` owner panel, `/rider`, `/admin`. Shared fetch helper, formatting, and status maps live in `src/lib/client.ts`; shared presentational bits in `src/components/ui.tsx`; types shared across server/client in `src/lib/types.ts`.

**Catalog model:** `Product` (identity, from the register) is separate from per-shop `CatalogItem` (price/stock/visibility). `soldQty` on catalog items is the register's one-day sales figure and powers the default "top movers" sort — don't zero it when editing inventory.

Next.js 16 specifics used throughout: route-handler `ctx.params` is a `Promise` (must be awaited), and GET handlers declare `export const dynamic = "force-dynamic"` to avoid static caching of mutable state.
