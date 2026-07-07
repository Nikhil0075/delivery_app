import productsSeed from "../../data/products.json";
import shopsSeed from "../../data/shops.json";
import catalogsSeed from "../../data/catalogs.json";
import stateConfigSeed from "../../data/state-config.json";
import seed from "../../data/seed.json";
import type {
  CatalogEntry, CatalogItem, Customer, Db, Order, OrderEvent, OrderStatus, Product, Rider, Shop, StateConfig,
} from "./types";

const STORAGE_KEY = "delivery-app-demo-db-v2";
let counter = 0;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freshDb(): Db {
  return {
    products: clone(productsSeed) as Product[],
    shops: clone(shopsSeed) as Shop[],
    catalogs: clone(catalogsSeed) as Record<string, CatalogItem[]>,
    customers: clone(seed.customers) as Customer[],
    riders: clone(seed.riders) as Rider[],
    orders: clone(seed.orders) as Order[],
    stateConfig: clone(stateConfigSeed) as StateConfig,
  };
}

function db(): Db {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw) as Db;
  const next = freshDb();
  save(next);
  return next;
}

function save(next: Db): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function nowIso(): string {
  return new Date().toISOString();
}

function nowIST(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function orderingAllowed(config: StateConfig, shopId?: string) {
  const state = db();
  const shop = shopId ? state.shops.find((s) => s.id === shopId) : undefined;
  if (config.dryDay) {
    return { ok: false as const, reason: "Dry day declared by the Excise Department. Ordering is suspended." };
  }
  if (!config.windowOverride) {
    const t = nowIST();
    const { open, close } = config.deliveryWindow;
    if (t < open || t > close) {
      return { ok: false as const, reason: `Orders are accepted only between ${open} and ${close} (Odisha excise hours).` };
    }
  }
  if (shop && shop.status !== "ACTIVE") {
    return { ok: false as const, reason: "This shop is currently paused." };
  }
  return { ok: true as const };
}

function entries(state: Db, shopId: string): CatalogEntry[] {
  const products = new Map(state.products.map((p) => [p.id, p]));
  return (state.catalogs[shopId] ?? []).flatMap((item) => {
    const product = products.get(item.productId);
    return product && item.isVisible
      ? [{ ...product, price: item.price, stock: item.stock, soldQty: item.soldQty }]
      : [];
  });
}

function adjustStock(state: Db, shopId: string, productId: string, delta: number): void {
  const item = (state.catalogs[shopId] ?? []).find((c) => c.productId === productId);
  if (item) item.stock = Math.max(0, item.stock + delta);
}

function event(type: string, note?: string): OrderEvent {
  return note ? { type, at: nowIso(), note } : { type, at: nowIso() };
}

function pushEvent(order: Order, type: string, note?: string): void {
  order.events.push(event(type, note));
}

function releaseStock(state: Db, order: Order): void {
  for (const item of order.items) adjustStock(state, order.shopId, item.productId, item.qty);
}

function recalc(order: Order): void {
  for (const item of order.items) item.lineTotal = item.qty * item.unitPrice;
  order.subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
  order.total = order.subtotal + order.deliveryFee + order.convenienceFee;
}

function createOrder(body: {
  customerId: string;
  shopId: string;
  addressId: string;
  items: { productId: string; qty: number }[];
}): Order {
  const state = db();
  const shop = state.shops.find((s) => s.id === body.shopId);
  if (!shop) throw new Error("Unknown shop");
  const customer = state.customers.find((c) => c.id === body.customerId);
  if (!customer) throw new Error("Unknown customer");
  if (!customer.ageVerified) throw new Error("Customer is not age-verified");
  const gate = orderingAllowed(state.stateConfig, shop.id);
  if (!gate.ok) throw new Error(gate.reason);
  if (!body.items.length) throw new Error("Cart is empty");

  const catalog = state.catalogs[body.shopId] ?? [];
  const products = new Map(state.products.map((p) => [p.id, p]));
  const items = body.items.map((line) => {
    const cat = catalog.find((c) => c.productId === line.productId && c.isVisible);
    const product = products.get(line.productId);
    if (!cat || !product) throw new Error(`Item not sold here: ${line.productId}`);
    if (line.qty < 1) throw new Error("Invalid quantity");
    if (cat.stock < line.qty) throw new Error(`Only ${cat.stock} left of ${product.name}`);
    return {
      productId: product.id,
      name: product.name,
      qty: line.qty,
      unitPrice: cat.price,
      lineTotal: cat.price * line.qty,
    };
  });

  for (const item of items) adjustStock(state, body.shopId, item.productId, -item.qty);
  counter += 1;
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const order: Order = {
    id: `ord-${Date.now()}-${counter}`,
    code: `OD-${10200 + state.orders.length + counter}`,
    customerId: body.customerId,
    shopId: body.shopId,
    addressId: body.addressId,
    items,
    subtotal,
    deliveryFee: state.stateConfig.deliveryFee,
    convenienceFee: state.stateConfig.convenienceFee,
    total: subtotal + state.stateConfig.deliveryFee + state.stateConfig.convenienceFee,
    status: "PLACED",
    otp: String(Math.floor(Math.random() * 10000)).padStart(4, "0"),
    riderId: null,
    packing: { picked: false, packed: false, sealed: false },
    substitution: null,
    createdAt: nowIso(),
    events: [event("PLACED"), event("PAYMENT_CAPTURED", "Mock prepaid payment")],
  };
  state.orders.push(order);
  save(state);
  return order;
}

function transition(orderId: string, body: Record<string, unknown>): Order {
  const state = db();
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) throw new Error("Order not found");
  const expect = (...statuses: OrderStatus[]) => {
    if (!statuses.includes(order.status)) throw new Error(`Not allowed while order is ${order.status}`);
  };

  switch (body.action) {
    case "accept":
      expect("PLACED");
      order.status = "ACCEPTED";
      pushEvent(order, "ACCEPTED");
      break;
    case "reject":
      expect("PLACED");
      order.status = "REJECTED";
      releaseStock(state, order);
      pushEvent(order, "REJECTED", String(body.reason ?? ""));
      pushEvent(order, "REFUND_INITIATED", "Full mock refund");
      break;
    case "propose_substitution": {
      expect("PLACED", "ACCEPTED");
      const itemIndex = Number(body.itemIndex);
      const item = order.items[itemIndex];
      if (!item) throw new Error("Bad item index");
      const productId = String(body.productId);
      const cat = (state.catalogs[order.shopId] ?? []).find((c) => c.productId === productId && c.isVisible);
      const product = state.products.find((p) => p.id === productId);
      if (!cat || !product) throw new Error("Substitute not in shop catalog");
      if (cat.stock < item.qty) throw new Error("Substitute has insufficient stock");
      order.substitution = { itemIndex, productId, name: product.name, unitPrice: cat.price };
      order.status = "SUBSTITUTION_PENDING";
      pushEvent(order, "SUBSTITUTION_PROPOSED", `${item.name} -> ${product.name}`);
      break;
    }
    case "approve_substitution": {
      expect("SUBSTITUTION_PENDING");
      const sub = order.substitution;
      if (!sub) throw new Error("No proposal on order");
      const item = order.items[sub.itemIndex];
      adjustStock(state, order.shopId, item.productId, item.qty);
      adjustStock(state, order.shopId, sub.productId, -item.qty);
      order.items[sub.itemIndex] = {
        productId: sub.productId,
        name: sub.name,
        qty: item.qty,
        unitPrice: sub.unitPrice,
        lineTotal: sub.unitPrice * item.qty,
        substitutedFrom: item.name,
      };
      recalc(order);
      order.substitution = null;
      order.status = "ACCEPTED";
      pushEvent(order, "SUBSTITUTION_APPROVED", "Price delta auto-adjusted (mock refund/charge)");
      break;
    }
    case "decline_substitution": {
      expect("SUBSTITUTION_PENDING");
      const sub = order.substitution;
      if (!sub) throw new Error("No proposal on order");
      const item = order.items[sub.itemIndex];
      adjustStock(state, order.shopId, item.productId, item.qty);
      order.items.splice(sub.itemIndex, 1);
      order.substitution = null;
      if (order.items.length === 0) {
        order.status = "CANCELLED";
        pushEvent(order, "CANCELLED", "No items left after declined substitution");
        pushEvent(order, "REFUND_INITIATED", "Full mock refund");
      } else {
        recalc(order);
        order.status = "ACCEPTED";
        pushEvent(order, "SUBSTITUTION_DECLINED", "Item removed, delta refunded (mock)");
      }
      break;
    }
    case "set_packing":
      expect("ACCEPTED");
      if (typeof body.picked === "boolean") order.packing.picked = body.picked;
      if (typeof body.packed === "boolean") order.packing.packed = body.packed;
      if (typeof body.sealed === "boolean") order.packing.sealed = body.sealed;
      break;
    case "mark_ready":
      expect("ACCEPTED");
      if (!order.packing.picked || !order.packing.packed || !order.packing.sealed) {
        throw new Error("Complete the picking checklist (picked, packed, sealed) first");
      }
      order.status = "READY_FOR_PICKUP";
      pushEvent(order, "READY_FOR_PICKUP", "Sealed package confirmed by shop");
      break;
    case "claim":
      expect("READY_FOR_PICKUP");
      if (order.riderId) throw new Error("Already claimed by another rider");
      order.riderId = String(body.riderId);
      pushEvent(order, "RIDER_ASSIGNED", order.riderId);
      break;
    case "pickup":
      expect("READY_FOR_PICKUP");
      if (!order.riderId) throw new Error("Claim the task first");
      order.status = "PICKED_UP";
      pushEvent(order, "PICKED_UP", "Rider confirmed sealed package");
      break;
    case "deliver":
      expect("PICKED_UP");
      if (String(body.otp ?? "") !== order.otp) throw new Error("Incorrect handoff OTP");
      order.status = "DELIVERED";
      pushEvent(order, "DELIVERED", "OTP verified, age re-check OK");
      break;
    case "verification_failed":
      expect("PICKED_UP");
      order.status = "VERIFICATION_FAILED";
      releaseStock(state, order);
      pushEvent(order, "VERIFICATION_FAILED", String(body.reason ?? ""));
      pushEvent(order, "RETURN_TO_SHOP", "Sealed package returned per policy");
      break;
    case "cancel":
      expect("PLACED");
      order.status = "CANCELLED";
      releaseStock(state, order);
      pushEvent(order, "CANCELLED", "Cancelled by customer");
      pushEvent(order, "REFUND_INITIATED", "Full mock refund");
      break;
    default:
      throw new Error("Unknown action");
  }

  save(state);
  return order;
}

function settlement(state: Db, shopId: string) {
  const pct = state.stateConfig.commissionPct / 100;
  const rows = state.orders
    .filter((o) => o.shopId === shopId && o.status === "DELIVERED")
    .map((o) => ({
      orderId: o.id,
      code: o.code,
      date: o.createdAt.slice(0, 10),
      gross: o.subtotal,
      commission: Math.round(o.subtotal * pct),
      net: o.subtotal - Math.round(o.subtotal * pct),
    }));
  return {
    rows,
    gross: rows.reduce((sum, row) => sum + row.gross, 0),
    commission: rows.reduce((sum, row) => sum + row.commission, 0),
    net: rows.reduce((sum, row) => sum + row.net, 0),
  };
}

function metrics(state: Db) {
  const delivered = state.orders.filter((o) => o.status === "DELIVERED");
  const gmv = delivered.reduce((sum, order) => sum + order.subtotal, 0);
  const decided = state.orders.filter((o) =>
    ["ACCEPTED", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED", "REJECTED",
      "SUBSTITUTION_PENDING", "VERIFICATION_FAILED"].includes(o.status));
  const accepted = decided.filter((o) => o.status !== "REJECTED");
  const fourFriends = entries(state, "four-friends");
  const topSkus = [...fourFriends]
    .sort((a, b) => b.soldQty * b.price - a.soldQty * a.price)
    .slice(0, 10)
    .map((e) => ({ name: e.name, gmv: e.soldQty * e.price, units: e.soldQty }));
  const byCategory = new Map<string, number>();
  for (const e of fourFriends) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.soldQty * e.price);
  return {
    totalOrders: state.orders.length,
    liveOrders: state.orders.filter((o) =>
      ["PLACED", "ACCEPTED", "SUBSTITUTION_PENDING", "READY_FOR_PICKUP", "PICKED_UP"].includes(o.status)).length,
    deliveredOrders: delivered.length,
    gmv,
    aov: delivered.length ? Math.round(gmv / delivered.length) : 0,
    acceptanceRate: decided.length ? Math.round((accepted.length / decided.length) * 100) : 100,
    platformRevenue: delivered.reduce(
      (sum, order) => sum + Math.round(order.subtotal * (state.stateConfig.commissionPct / 100)) + order.convenienceFee,
      0,
    ),
    registerTopSkus: topSkus,
    registerCategoryGmv: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function localDemoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const url = new URL(path, window.location.origin);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  const state = db();

  if (method === "GET" && parts[0] === "bootstrap") {
    return {
      shops: state.shops,
      customers: state.customers,
      riders: state.riders,
      stateConfig: state.stateConfig,
      ordering: orderingAllowed(state.stateConfig),
    } as T;
  }

  if (parts[0] === "orders") {
    if (method === "POST" && parts.length === 1) return { order: createOrder(body) } as T;
    if (method === "GET" && parts.length === 2) {
      const order = state.orders.find((o) => o.id === parts[1]);
      if (!order) throw new Error("Not found");
      return { order } as T;
    }
    if (method === "POST" && parts.length === 3 && parts[2] === "transition") {
      return { order: transition(parts[1], body) } as T;
    }
    let orders = state.orders;
    const customerId = url.searchParams.get("customerId");
    const shopId = url.searchParams.get("shopId");
    const riderId = url.searchParams.get("riderId");
    if (customerId) orders = orders.filter((o) => o.customerId === customerId);
    if (shopId) orders = orders.filter((o) => o.shopId === shopId);
    if (riderId) {
      orders = orders.filter((o) => o.riderId === riderId || (o.status === "READY_FOR_PICKUP" && !o.riderId));
    }
    return { orders: [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
  }

  if (method === "GET" && parts[0] === "shops" && parts[2] === "catalog") {
    let list = entries(state, parts[1]);
    if (url.searchParams.get("inStock") !== "0") list = list.filter((e) => e.stock > 0);
    const category = url.searchParams.get("category");
    const search = (url.searchParams.get("search") ?? "").trim().toUpperCase();
    const sort = url.searchParams.get("sort") ?? "top";
    if (category) list = list.filter((e) => e.category === category);
    if (search) list = list.filter((e) => e.name.toUpperCase().includes(search));
    if (sort === "top") list.sort((a, b) => b.soldQty - a.soldQty);
    else if (sort === "price_asc") list.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return { entries: list.slice(0, 200), total: list.length } as T;
  }

  if (method === "PATCH" && parts[0] === "inventory") {
    const item = (state.catalogs[body.shopId] ?? []).find((c) => c.productId === body.productId);
    if (!item) throw new Error("Item not found");
    if (typeof body.price === "number" && body.price > 0) item.price = body.price;
    if (typeof body.stock === "number" && body.stock >= 0) item.stock = Math.floor(body.stock);
    if (typeof body.isVisible === "boolean") item.isVisible = body.isVisible;
    save(state);
    return { item } as T;
  }

  if (parts[0] === "admin") {
    if (method === "GET" && parts[1] === "kpis") return metrics(state) as T;
    if (method === "POST" && parts[1] === "reset") {
      const next = freshDb();
      save(next);
      return { ok: true } as T;
    }
    if (method === "PATCH" && parts[1] === "config") {
      if (typeof body.dryDay === "boolean") state.stateConfig.dryDay = body.dryDay;
      if (typeof body.windowOverride === "boolean") state.stateConfig.windowOverride = body.windowOverride;
      save(state);
      return { stateConfig: state.stateConfig } as T;
    }
    if (method === "PATCH" && parts[1] === "shops") {
      const shop = state.shops.find((s) => s.id === parts[2]);
      if (!shop) throw new Error("Unknown shop");
      if (body.status !== "ACTIVE" && body.status !== "PAUSED") throw new Error("Bad status");
      shop.status = body.status;
      save(state);
      return { shop } as T;
    }
  }

  if (method === "GET" && parts[0] === "settlements") {
    const shopId = url.searchParams.get("shopId");
    if (!shopId) throw new Error("shopId required");
    return settlement(state, shopId) as T;
  }

  throw new Error(`Unsupported local demo route: ${method} ${path}`);
}
