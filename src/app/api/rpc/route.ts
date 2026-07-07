import { NextRequest, NextResponse } from "next/server";
import { catalogEntries, createOrder, kpis, orderingAllowed, shopSettlement, transitionOrder } from "@/lib/logic";
import { ensureFresh, getDb, persistDb, resetDb } from "@/lib/store";

export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requestBody(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return {};
  return req.json();
}

export async function GET(req: NextRequest) {
  return dispatch(req);
}

export async function POST(req: NextRequest) {
  return dispatch(req);
}

export async function PATCH(req: NextRequest) {
  return dispatch(req);
}

async function dispatch(req: NextRequest) {
  const rawPath = req.nextUrl.searchParams.get("path");
  if (!rawPath?.startsWith("/api/")) return error("path must start with /api/", 400);

  const target = new URL(rawPath, req.url);
  const parts = target.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const method = req.method;

  if (method === "GET" && parts.length === 1 && parts[0] === "bootstrap") {
    await ensureFresh();
    const db = getDb();
    return NextResponse.json({
      shops: db.shops,
      customers: db.customers,
      riders: db.riders,
      stateConfig: db.stateConfig,
      ordering: orderingAllowed(db.stateConfig),
    });
  }

  if (parts[0] === "orders") {
    if (method === "GET" && parts.length === 1) {
      await ensureFresh();
      const db = getDb();
      const customerId = target.searchParams.get("customerId");
      const shopId = target.searchParams.get("shopId");
      const riderId = target.searchParams.get("riderId");
      let orders = db.orders;
      if (customerId) orders = orders.filter((o) => o.customerId === customerId);
      if (shopId) orders = orders.filter((o) => o.shopId === shopId);
      if (riderId) {
        orders = orders.filter(
          (o) => o.riderId === riderId || (o.status === "READY_FOR_PICKUP" && !o.riderId),
        );
      }
      orders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return NextResponse.json({ orders });
    }

    if (method === "POST" && parts.length === 1) {
      await ensureFresh(0);
      const { order, error: createError } = createOrder(await requestBody(req));
      if (createError) return error(createError);
      await persistDb();
      return NextResponse.json({ order }, { status: 201 });
    }

    if (method === "GET" && parts.length === 2) {
      await ensureFresh();
      const order = getDb().orders.find((o) => o.id === parts[1]);
      if (!order) return error("Not found", 404);
      return NextResponse.json({ order });
    }

    if (method === "POST" && parts.length === 3 && parts[2] === "transition") {
      await ensureFresh(0);
      const { order, error: transitionError } = transitionOrder(parts[1], await requestBody(req));
      if (transitionError) return error(transitionError);
      await persistDb();
      return NextResponse.json({ order });
    }
  }

  if (method === "GET" && parts.length === 3 && parts[0] === "shops" && parts[2] === "catalog") {
    await ensureFresh();
    const db = getDb();
    const shopId = parts[1];
    if (!db.shops.some((s) => s.id === shopId)) return error("Unknown shop", 404);

    const search = (target.searchParams.get("search") ?? "").trim().toUpperCase();
    const category = target.searchParams.get("category");
    const sort = target.searchParams.get("sort") ?? "top";
    const inStockOnly = target.searchParams.get("inStock") !== "0";

    let entries = catalogEntries(db, shopId);
    if (inStockOnly) entries = entries.filter((e) => e.stock > 0);
    if (category) entries = entries.filter((e) => e.category === category);
    if (search) entries = entries.filter((e) => e.name.toUpperCase().includes(search));

    if (sort === "top") entries.sort((a, b) => b.soldQty - a.soldQty);
    else if (sort === "price_asc") entries.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") entries.sort((a, b) => b.price - a.price);
    else entries.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ entries: entries.slice(0, 200), total: entries.length });
  }

  if (method === "PATCH" && parts.length === 1 && parts[0] === "inventory") {
    const { shopId, productId, price, stock, isVisible } = await requestBody(req);
    await ensureFresh(0);
    const item = (getDb().catalogs[shopId] ?? []).find((c) => c.productId === productId);
    if (!item) return error("Item not found", 404);
    if (typeof price === "number" && price > 0) item.price = price;
    if (typeof stock === "number" && stock >= 0) item.stock = Math.floor(stock);
    if (typeof isVisible === "boolean") item.isVisible = isVisible;
    await persistDb();
    return NextResponse.json({ item });
  }

  if (parts[0] === "admin") {
    if (method === "GET" && parts.length === 2 && parts[1] === "kpis") {
      await ensureFresh();
      return NextResponse.json(kpis(getDb()));
    }

    if (method === "POST" && parts.length === 2 && parts[1] === "reset") {
      await resetDb();
      return NextResponse.json({ ok: true });
    }

    if (method === "PATCH" && parts.length === 2 && parts[1] === "config") {
      const body = await requestBody(req);
      await ensureFresh(0);
      const db = getDb();
      if (typeof body.dryDay === "boolean") db.stateConfig.dryDay = body.dryDay;
      if (typeof body.windowOverride === "boolean") db.stateConfig.windowOverride = body.windowOverride;
      await persistDb();
      return NextResponse.json({ stateConfig: db.stateConfig });
    }

    if (method === "PATCH" && parts.length === 3 && parts[1] === "shops") {
      const { status } = await requestBody(req);
      await ensureFresh(0);
      const shop = getDb().shops.find((s) => s.id === parts[2]);
      if (!shop) return error("Unknown shop", 404);
      if (status !== "ACTIVE" && status !== "PAUSED") return error("Bad status");
      shop.status = status;
      await persistDb();
      return NextResponse.json({ shop });
    }
  }

  if (method === "GET" && parts.length === 1 && parts[0] === "settlements") {
    const shopId = target.searchParams.get("shopId");
    if (!shopId) return error("shopId required");
    await ensureFresh();
    return NextResponse.json(shopSettlement(getDb(), shopId));
  }

  return error("Route not implemented in RPC dispatcher", 404);
}
