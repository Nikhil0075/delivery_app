"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CatalogEntry, Order } from "@/lib/types";
import {
  Bootstrap, CATEGORY_EMOJI, api, inr, timeAgo, usePoll,
} from "@/lib/client";
import {
  Btn, Card, Empty, FeeBreakdown, OrderItems, StatusBadge, Timeline,
} from "@/components/ui";

type View = "shops" | "browse" | "cart" | "orders";
type CartLine = { productId: string; name: string; price: number; qty: number; stock: number };

const CATEGORIES = ["WHISKY", "BEER", "RUM", "VODKA", "WINE", "BRANDY", "GIN", "RTD", "OTHER"];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default function CustomerApp() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [ageOk, setAgeOk] = useState<boolean | null>(null);
  const [customerId, setCustomerId] = useState("cust-ravi");
  const [addressId, setAddressId] = useState("addr-ravi-1");
  const [view, setView] = useState<View>("shops");
  const [shopId, setShopId] = useState<string | null>(null);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    setAgeOk(localStorage.getItem("age-verified") === "yes");
  }, []);

  usePoll(() => {
    api<Bootstrap>("/api/bootstrap").then(setBoot).catch(() => {});
  }, [], 4000);

  usePoll(() => {
    api<{ orders: Order[] }>(`/api/orders?customerId=${customerId}`)
      .then((d) => setOrders(d.orders))
      .catch(() => {});
  }, [customerId], 3000);

  const customer = boot?.customers.find((c) => c.id === customerId);
  const address = customer?.addresses.find((a) => a.id === addressId) ?? customer?.addresses[0];
  const shop = boot?.shops.find((s) => s.id === shopId);

  const loadCatalog = useCallback(() => {
    if (!shopId) return;
    const params = new URLSearchParams({ sort: "top" });
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    api<{ entries: CatalogEntry[]; total: number }>(
      `/api/shops/${shopId}/catalog?${params}`,
    )
      .then((d) => { setEntries(d.entries); setTotalEntries(d.total); })
      .catch(() => {});
  }, [shopId, search, category]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const cartTotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  function setQty(entry: CatalogEntry, qty: number) {
    setCart((prev) => {
      const rest = prev.filter((l) => l.productId !== entry.id);
      if (qty <= 0) return rest;
      return [...rest, {
        productId: entry.id, name: entry.name, price: entry.price,
        qty: Math.min(qty, entry.stock), stock: entry.stock,
      }];
    });
  }

  async function placeOrder() {
    if (!shopId || !address) return;
    setPlacing(true);
    setError(null);
    try {
      const { order } = await api<{ order: Order }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          shopId,
          addressId: address.id,
          items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
        }),
      });
      setCart([]);
      setView("orders");
      setOpenOrder(order.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPlacing(false);
    }
  }

  async function transition(orderId: string, body: object) {
    setError(null);
    try {
      await api(`/api/orders/${orderId}/transition`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const d = await api<{ orders: Order[] }>(`/api/orders?customerId=${customerId}`);
      setOrders(d.orders);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const shopsWithDistance = useMemo(() => {
    if (!boot || !address) return [];
    return boot.shops
      .map((s) => ({ shop: s, km: haversineKm(address.lat, address.lng, s.lat, s.lng) }))
      .sort((a, b) => a.km - b.km);
  }, [boot, address]);

  // ---------- age gate ----------
  if (ageOk === null) return null;
  if (!ageOk) {
    return (
      <main className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
        <div className="text-5xl">🔞</div>
        <h1 className="mt-4 text-xl font-bold">Are you 18 or older?</h1>
        <p className="mt-2 text-sm text-gray-600">
          Sale of liquor to persons under 18 years is prohibited under the
          Odisha Excise Act. Your age will be re-checked with a valid ID at
          the time of delivery.
        </p>
        <div className="mt-6 flex gap-3">
          <Btn onClick={() => { localStorage.setItem("age-verified", "yes"); setAgeOk(true); }}>
            I am 18+ — Continue
          </Btn>
          <Btn kind="secondary" onClick={() => (window.location.href = "https://www.google.com")}>
            Exit
          </Btn>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          Prototype: this is a mock age gate; production requires KYC per state rules.
        </p>
      </main>
    );
  }

  if (!boot) {
    return <main className="p-10 text-center text-sm text-gray-500">Loading…</main>;
  }

  const orderingBlocked = !boot.ordering.ok;

  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-4">
      {/* identity + address bar */}
      <div className="mb-3 flex items-center justify-between gap-2 text-xs text-gray-600">
        <div>
          Deliver to{" "}
          <select
            className="rounded border border-gray-300 bg-white px-1 py-0.5 font-medium"
            value={addressId}
            onChange={(e) => setAddressId(e.target.value)}
          >
            {customer?.addresses.map((a) => (
              <option key={a.id} value={a.id}>{a.label} · {a.area}</option>
            ))}
          </select>
        </div>
        <select
          className="rounded border border-gray-300 bg-white px-1 py-0.5"
          value={customerId}
          onChange={(e) => {
            const c = boot.customers.find((x) => x.id === e.target.value)!;
            setCustomerId(c.id);
            setAddressId(c.addresses[0].id);
            setCart([]);
          }}
        >
          {boot.customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {orderingBlocked && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⛔ {(boot.ordering as { reason: string }).reason}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-200 p-1 text-sm font-medium">
        {([
          ["shops", "Shops"],
          ["browse", shop ? shop.name.split(" ")[0] : "Browse"],
          ["cart", `Cart${cartCount ? ` (${cartCount})` : ""}`],
          ["orders", "My Orders"],
        ] as [View, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            disabled={v !== "shops" && v !== "orders" && !shopId}
            className={`flex-1 rounded-lg px-2 py-1.5 transition disabled:opacity-40 ${
              view === v ? "bg-white shadow" : "text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ---------- shops ---------- */}
      {view === "shops" && (
        <div className="space-y-3">
          {shopsWithDistance.map(({ shop: s, km }) => {
            const serviceable = km <= s.serviceRadiusKm;
            const open = s.status === "ACTIVE";
            return (
              <Card key={s.id} className={!serviceable || !open ? "opacity-60" : ""}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      {s.area} · {km.toFixed(1)} km away · ★ {s.rating}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">
                      Licence {s.licenceNo} · {s.hours.open}–{s.hours.close}
                    </div>
                  </div>
                  <div className="text-right">
                    {!open ? (
                      <span className="text-xs font-semibold text-red-500">Paused</span>
                    ) : !serviceable ? (
                      <span className="text-xs text-gray-400">Out of range</span>
                    ) : (
                      <Btn small onClick={() => {
                        if (shopId !== s.id) setCart([]);
                        setShopId(s.id);
                        setView("browse");
                      }}>
                        Order
                      </Btn>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
          <p className="text-center text-[11px] text-gray-400">
            Single-shop checkout: each order is fulfilled by one licensed retailer.
          </p>
        </div>
      )}

      {/* ---------- browse ---------- */}
      {view === "browse" && shop && (
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${totalEntries} products at ${shop.name}…`}
            className="mb-3 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setCategory(null)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                !category ? "bg-gray-900 text-white" : "bg-white border border-gray-300"
              }`}
            >
              All
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(category === c ? null : c)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                  category === c ? "bg-gray-900 text-white" : "bg-white border border-gray-300"
                }`}
              >
                {CATEGORY_EMOJI[c]} {c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {!search && !category && (
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Fast movers
            </div>
          )}
          <div className="space-y-2">
            {entries.map((e) => {
              const line = cart.find((l) => l.productId === e.id);
              return (
                <Card key={e.id} className="flex items-center justify-between gap-3 !p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium" title={e.name}>
                      {CATEGORY_EMOJI[e.category]} {e.name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {inr(e.price)}
                      {e.stock <= 5 && (
                        <span className="ml-2 text-amber-600">only {e.stock} left</span>
                      )}
                    </div>
                  </div>
                  {line ? (
                    <div className="flex items-center gap-2">
                      <Btn small kind="secondary" onClick={() => setQty(e, line.qty - 1)}>−</Btn>
                      <span className="w-5 text-center text-sm font-semibold">{line.qty}</span>
                      <Btn small kind="secondary" onClick={() => setQty(e, line.qty + 1)}
                        disabled={line.qty >= e.stock}>+</Btn>
                    </div>
                  ) : (
                    <Btn small onClick={() => setQty(e, 1)} disabled={orderingBlocked}>
                      Add
                    </Btn>
                  )}
                </Card>
              );
            })}
            {entries.length === 0 && <Empty text="No products match." />}
          </div>
        </div>
      )}

      {/* ---------- cart ---------- */}
      {view === "cart" && (
        <div className="space-y-3">
          {cart.length === 0 ? (
            <Empty text="Your cart is empty." />
          ) : (
            <>
              <Card>
                <div className="mb-2 text-sm font-semibold">{shop?.name}</div>
                <ul className="divide-y divide-gray-100 text-sm">
                  {cart.map((l) => (
                    <li key={l.productId} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0 truncate">{l.name}</span>
                      <span className="flex items-center gap-2">
                        <Btn small kind="secondary"
                          onClick={() => setCart((p) => p
                            .map((x) => x.productId === l.productId ? { ...x, qty: x.qty - 1 } : x)
                            .filter((x) => x.qty > 0))}>−</Btn>
                        <span className="w-5 text-center font-semibold">{l.qty}</span>
                        <Btn small kind="secondary" disabled={l.qty >= l.stock}
                          onClick={() => setCart((p) => p
                            .map((x) => x.productId === l.productId ? { ...x, qty: x.qty + 1 } : x))}>+</Btn>
                        <span className="w-16 text-right tabular-nums">{inr(l.price * l.qty)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between"><span>Subtotal</span><span>{inr(cartTotal)}</span></div>
                  <div className="flex justify-between"><span>Delivery fee</span><span>{inr(boot.stateConfig.deliveryFee)}</span></div>
                  <div className="flex justify-between"><span>Convenience fee</span><span>{inr(boot.stateConfig.convenienceFee)}</span></div>
                  <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
                    <span>To pay</span>
                    <span>{inr(cartTotal + boot.stateConfig.deliveryFee + boot.stateConfig.convenienceFee)}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <Btn onClick={placeOrder} disabled={placing || orderingBlocked}>
                    {placing ? "Placing…" : "Pay & Place Order (mock UPI)"}
                  </Btn>
                </div>
                <p className="mt-2 text-[11px] text-gray-400">
                  Prepaid only. ID re-check with OTP handoff at delivery.
                </p>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ---------- orders ---------- */}
      {view === "orders" && (
        <div className="space-y-3">
          {orders.length === 0 && <Empty text="No orders yet." />}
          {orders.map((o) => {
            const s = boot.shops.find((x) => x.id === o.shopId);
            const isOpen = openOrder === o.id;
            return (
              <Card key={o.id}>
                <button className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setOpenOrder(isOpen ? null : o.id)}>
                  <div>
                    <div className="text-sm font-semibold">{o.code} · {s?.name}</div>
                    <div className="text-xs text-gray-500">
                      {o.items.length} item{o.items.length > 1 ? "s" : ""} · {inr(o.total)} · {timeAgo(o.createdAt)}
                    </div>
                  </div>
                  <StatusBadge status={o.status} />
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                    <OrderItems order={o} />
                    <FeeBreakdown order={o} />

                    {o.status === "SUBSTITUTION_PENDING" && o.substitution && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm">
                        <div className="font-medium text-purple-800">
                          Shop suggests a substitute for{" "}
                          {o.items[o.substitution.itemIndex]?.name}:
                        </div>
                        <div className="mt-1">
                          {o.substitution.name} — {inr(o.substitution.unitPrice)}/unit
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Btn small onClick={() => transition(o.id, { action: "approve_substitution" })}>
                            Approve
                          </Btn>
                          <Btn small kind="secondary"
                            onClick={() => transition(o.id, { action: "decline_substitution" })}>
                            Decline (remove item)
                          </Btn>
                        </div>
                      </div>
                    )}

                    {(o.status === "PICKED_UP" || o.status === "READY_FOR_PICKUP") && (
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-center">
                        <div className="text-xs text-indigo-700">
                          Share this OTP with the rider after showing your ID
                        </div>
                        <div className="mt-1 text-2xl font-bold tracking-[0.4em] text-indigo-900">
                          {o.otp}
                        </div>
                      </div>
                    )}

                    {o.status === "PLACED" && (
                      <Btn small kind="danger" onClick={() => transition(o.id, { action: "cancel" })}>
                        Cancel order
                      </Btn>
                    )}

                    <Timeline order={o} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* sticky cart bar */}
      {cartCount > 0 && view !== "cart" && (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md p-3">
          <button
            onClick={() => setView("cart")}
            className="flex w-full items-center justify-between rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white shadow-lg"
          >
            <span>{cartCount} item{cartCount > 1 ? "s" : ""} · {inr(cartTotal)}</span>
            <span>View cart →</span>
          </button>
        </div>
      )}
    </main>
  );
}
