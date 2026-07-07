import { getDb, saveDb } from "./store";
import type {
  CatalogEntry, Db, Order, OrderEvent, OrderStatus, Shop, StateConfig,
} from "./types";

// ---------- geo & time ----------

export function distanceKm(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function nowIST(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------- compliance ----------

export type ComplianceCheck = { ok: true } | { ok: false; reason: string };

export function orderingAllowed(config: StateConfig, shop?: Shop): ComplianceCheck {
  if (config.dryDay) {
    return { ok: false, reason: "Dry day declared by the Excise Department. Ordering is suspended." };
  }
  if (!config.windowOverride) {
    const t = nowIST();
    const { open, close } = config.deliveryWindow;
    if (t < open || t > close) {
      return {
        ok: false,
        reason: `Orders are accepted only between ${open} and ${close} (Odisha excise hours).`,
      };
    }
  }
  if (shop && shop.status !== "ACTIVE") {
    return { ok: false, reason: "This shop is currently paused." };
  }
  return { ok: true };
}

// ---------- catalog ----------

export function catalogEntries(db: Db, shopId: string): CatalogEntry[] {
  const items = db.catalogs[shopId] ?? [];
  const products = new Map(db.products.map((p) => [p.id, p]));
  const out: CatalogEntry[] = [];
  for (const it of items) {
    const p = products.get(it.productId);
    if (!p || !it.isVisible) continue;
    out.push({ ...p, price: it.price, stock: it.stock, soldQty: it.soldQty });
  }
  return out;
}

// ---------- orders ----------

let counter = 0;

function nextOrderIds(db: Db): { id: string; code: string } {
  counter += 1;
  const n = 10200 + db.orders.length + counter;
  return { id: `ord-${Date.now()}-${counter}`, code: `OD-${n}` };
}

function pushEvent(order: Order, type: string, note?: string): void {
  const e: OrderEvent = { type, at: nowIso() };
  if (note) e.note = note;
  order.events.push(e);
}

function adjustStock(db: Db, shopId: string, productId: string, delta: number): void {
  const item = (db.catalogs[shopId] ?? []).find((c) => c.productId === productId);
  if (item) item.stock = Math.max(0, item.stock + delta);
}

export function createOrder(input: {
  customerId: string;
  shopId: string;
  addressId: string;
  items: { productId: string; qty: number }[];
}): { order?: Order; error?: string } {
  const db = getDb();
  const shop = db.shops.find((s) => s.id === input.shopId);
  if (!shop) return { error: "Unknown shop" };
  const customer = db.customers.find((c) => c.id === input.customerId);
  if (!customer) return { error: "Unknown customer" };
  if (!customer.ageVerified) return { error: "Customer is not age-verified" };

  const gate = orderingAllowed(db.stateConfig, shop);
  if (!gate.ok) return { error: gate.reason };

  if (!input.items.length) return { error: "Cart is empty" };

  const catalog = db.catalogs[input.shopId] ?? [];
  const products = new Map(db.products.map((p) => [p.id, p]));
  const items = [];
  for (const line of input.items) {
    const cat = catalog.find((c) => c.productId === line.productId && c.isVisible);
    const product = products.get(line.productId);
    if (!cat || !product) return { error: `Item not sold here: ${line.productId}` };
    if (line.qty < 1) return { error: "Invalid quantity" };
    if (cat.stock < line.qty) {
      return { error: `Only ${cat.stock} left of ${product.name}` };
    }
    items.push({
      productId: product.id,
      name: product.name,
      qty: line.qty,
      unitPrice: cat.price,
      lineTotal: cat.price * line.qty,
    });
  }

  // reserve stock
  for (const it of items) adjustStock(db, input.shopId, it.productId, -it.qty);

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const { id, code } = nextOrderIds(db);
  const order: Order = {
    id,
    code,
    customerId: input.customerId,
    shopId: input.shopId,
    addressId: input.addressId,
    items,
    subtotal,
    deliveryFee: db.stateConfig.deliveryFee,
    convenienceFee: db.stateConfig.convenienceFee,
    total: subtotal + db.stateConfig.deliveryFee + db.stateConfig.convenienceFee,
    status: "PLACED",
    otp: String(Math.floor(Math.random() * 10000)).padStart(4, "0"),
    riderId: null,
    packing: { picked: false, packed: false, sealed: false },
    substitution: null,
    createdAt: nowIso(),
    events: [
      { type: "PLACED", at: nowIso() },
      { type: "PAYMENT_CAPTURED", at: nowIso(), note: "Mock prepaid payment" },
    ],
  };
  db.orders.push(order);
  saveDb();
  return { order };
}

function releaseStock(db: Db, order: Order): void {
  for (const it of order.items) adjustStock(db, order.shopId, it.productId, it.qty);
}

export type TransitionAction =
  | { action: "accept" }
  | { action: "reject"; reason: string }
  | { action: "propose_substitution"; itemIndex: number; productId: string }
  | { action: "approve_substitution" }
  | { action: "decline_substitution" }
  | { action: "set_packing"; picked?: boolean; packed?: boolean; sealed?: boolean }
  | { action: "mark_ready" }
  | { action: "claim"; riderId: string }
  | { action: "pickup" }
  | { action: "deliver"; otp: string }
  | { action: "verification_failed"; reason: string }
  | { action: "cancel" };

export function transitionOrder(
  orderId: string,
  act: TransitionAction,
): { order?: Order; error?: string } {
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return { error: "Order not found" };

  const fail = (msg: string) => ({ error: msg });
  const expect = (...statuses: OrderStatus[]) =>
    statuses.includes(order.status)
      ? null
      : `Not allowed while order is ${order.status}`;

  switch (act.action) {
    case "accept": {
      const err = expect("PLACED");
      if (err) return fail(err);
      order.status = "ACCEPTED";
      pushEvent(order, "ACCEPTED");
      break;
    }
    case "reject": {
      const err = expect("PLACED");
      if (err) return fail(err);
      order.status = "REJECTED";
      releaseStock(db, order);
      pushEvent(order, "REJECTED", act.reason);
      pushEvent(order, "REFUND_INITIATED", "Full mock refund");
      break;
    }
    case "propose_substitution": {
      const err = expect("PLACED", "ACCEPTED");
      if (err) return fail(err);
      const item = order.items[act.itemIndex];
      if (!item) return fail("Bad item index");
      const cat = (db.catalogs[order.shopId] ?? []).find(
        (c) => c.productId === act.productId && c.isVisible,
      );
      const product = db.products.find((p) => p.id === act.productId);
      if (!cat || !product) return fail("Substitute not in shop catalog");
      if (cat.stock < item.qty) return fail("Substitute has insufficient stock");
      order.substitution = {
        itemIndex: act.itemIndex,
        productId: act.productId,
        name: product.name,
        unitPrice: cat.price,
      };
      order.status = "SUBSTITUTION_PENDING";
      pushEvent(order, "SUBSTITUTION_PROPOSED", `${item.name} -> ${product.name}`);
      break;
    }
    case "approve_substitution": {
      const err = expect("SUBSTITUTION_PENDING");
      if (err) return fail(err);
      const sub = order.substitution;
      if (!sub) return fail("No proposal on order");
      const item = order.items[sub.itemIndex];
      adjustStock(db, order.shopId, item.productId, item.qty);
      adjustStock(db, order.shopId, sub.productId, -item.qty);
      order.items[sub.itemIndex] = {
        productId: sub.productId,
        name: sub.name,
        qty: item.qty,
        unitPrice: sub.unitPrice,
        lineTotal: sub.unitPrice * item.qty,
        substitutedFrom: item.name,
      };
      recalcTotals(order);
      order.substitution = null;
      order.status = "ACCEPTED";
      pushEvent(order, "SUBSTITUTION_APPROVED", "Price delta auto-adjusted (mock refund/charge)");
      break;
    }
    case "decline_substitution": {
      const err = expect("SUBSTITUTION_PENDING");
      if (err) return fail(err);
      const sub = order.substitution;
      if (!sub) return fail("No proposal on order");
      const item = order.items[sub.itemIndex];
      adjustStock(db, order.shopId, item.productId, item.qty);
      order.items.splice(sub.itemIndex, 1);
      order.substitution = null;
      if (order.items.length === 0) {
        order.status = "CANCELLED";
        pushEvent(order, "CANCELLED", "No items left after declined substitution");
        pushEvent(order, "REFUND_INITIATED", "Full mock refund");
      } else {
        recalcTotals(order);
        order.status = "ACCEPTED";
        pushEvent(order, "SUBSTITUTION_DECLINED", "Item removed, delta refunded (mock)");
      }
      break;
    }
    case "set_packing": {
      const err = expect("ACCEPTED");
      if (err) return fail(err);
      if (act.picked !== undefined) order.packing.picked = act.picked;
      if (act.packed !== undefined) order.packing.packed = act.packed;
      if (act.sealed !== undefined) order.packing.sealed = act.sealed;
      break;
    }
    case "mark_ready": {
      const err = expect("ACCEPTED");
      if (err) return fail(err);
      const p = order.packing;
      if (!p.picked || !p.packed || !p.sealed) {
        return fail("Complete the picking checklist (picked, packed, sealed) first");
      }
      order.status = "READY_FOR_PICKUP";
      pushEvent(order, "READY_FOR_PICKUP", "Sealed package confirmed by shop");
      break;
    }
    case "claim": {
      const err = expect("READY_FOR_PICKUP");
      if (err) return fail(err);
      if (order.riderId) return fail("Already claimed by another rider");
      if (!db.riders.some((r) => r.id === act.riderId)) return fail("Unknown rider");
      order.riderId = act.riderId;
      pushEvent(order, "RIDER_ASSIGNED", act.riderId);
      break;
    }
    case "pickup": {
      const err = expect("READY_FOR_PICKUP");
      if (err) return fail(err);
      if (!order.riderId) return fail("Claim the task first");
      order.status = "PICKED_UP";
      pushEvent(order, "PICKED_UP", "Rider confirmed sealed package");
      break;
    }
    case "deliver": {
      const err = expect("PICKED_UP");
      if (err) return fail(err);
      if (act.otp !== order.otp) return fail("Incorrect handoff OTP");
      order.status = "DELIVERED";
      pushEvent(order, "DELIVERED", "OTP verified, age re-check OK");
      break;
    }
    case "verification_failed": {
      const err = expect("PICKED_UP");
      if (err) return fail(err);
      order.status = "VERIFICATION_FAILED";
      releaseStock(db, order);
      pushEvent(order, "VERIFICATION_FAILED", act.reason);
      pushEvent(order, "RETURN_TO_SHOP", "Sealed package returned per policy");
      break;
    }
    case "cancel": {
      const err = expect("PLACED");
      if (err) return fail("Orders can only be cancelled before the shop accepts");
      order.status = "CANCELLED";
      releaseStock(db, order);
      pushEvent(order, "CANCELLED", "Cancelled by customer");
      pushEvent(order, "REFUND_INITIATED", "Full mock refund");
      break;
    }
  }
  saveDb();
  return { order };
}

function recalcTotals(order: Order): void {
  for (const it of order.items) it.lineTotal = it.unitPrice * it.qty;
  order.subtotal = order.items.reduce((s, i) => s + i.lineTotal, 0);
  order.total = order.subtotal + order.deliveryFee + order.convenienceFee;
}

// ---------- aggregates ----------

export function shopSettlement(db: Db, shopId: string) {
  const delivered = db.orders.filter(
    (o) => o.shopId === shopId && o.status === "DELIVERED",
  );
  const pct = db.stateConfig.commissionPct / 100;
  const rows = delivered.map((o) => ({
    orderId: o.id,
    code: o.code,
    date: o.createdAt.slice(0, 10),
    gross: o.subtotal,
    commission: Math.round(o.subtotal * pct),
    net: o.subtotal - Math.round(o.subtotal * pct),
  }));
  return {
    rows,
    gross: rows.reduce((s, r) => s + r.gross, 0),
    commission: rows.reduce((s, r) => s + r.commission, 0),
    net: rows.reduce((s, r) => s + r.net, 0),
  };
}

export function kpis(db: Db) {
  const orders = db.orders;
  const delivered = orders.filter((o) => o.status === "DELIVERED");
  const gmv = delivered.reduce((s, o) => s + o.subtotal, 0);
  const decided = orders.filter((o) =>
    ["ACCEPTED", "READY_FOR_PICKUP", "PICKED_UP", "DELIVERED", "REJECTED",
      "SUBSTITUTION_PENDING", "VERIFICATION_FAILED"].includes(o.status),
  );
  const accepted = decided.filter((o) => o.status !== "REJECTED");

  // register-derived analytics for Four Friends (the real dataset)
  const entries = catalogEntries(db, "four-friends");
  const topSkus = [...entries]
    .sort((a, b) => b.soldQty * b.price - a.soldQty * a.price)
    .slice(0, 10)
    .map((e) => ({ name: e.name, gmv: e.soldQty * e.price, units: e.soldQty }));
  const byCategory = new Map<string, number>();
  for (const e of entries) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.soldQty * e.price);
  }

  return {
    totalOrders: orders.length,
    liveOrders: orders.filter((o) =>
      ["PLACED", "ACCEPTED", "SUBSTITUTION_PENDING", "READY_FOR_PICKUP", "PICKED_UP"]
        .includes(o.status),
    ).length,
    deliveredOrders: delivered.length,
    gmv,
    aov: delivered.length ? Math.round(gmv / delivered.length) : 0,
    acceptanceRate: decided.length
      ? Math.round((accepted.length / decided.length) * 100)
      : 100,
    platformRevenue: delivered.reduce(
      (s, o) =>
        s +
        Math.round(o.subtotal * (db.stateConfig.commissionPct / 100)) +
        o.convenienceFee,
      0,
    ),
    registerTopSkus: topSkus,
    registerCategoryGmv: [...byCategory.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}
