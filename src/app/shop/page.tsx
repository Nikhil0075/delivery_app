"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogEntry, Order } from "@/lib/types";
import { Bootstrap, api, inr, timeAgo, usePoll } from "@/lib/client";
import {
  Btn, Card, Empty, OrderItems, StatusBadge, Timeline,
} from "@/components/ui";

type Tab = "orders" | "inventory" | "settlement";

const REJECT_REASONS = [
  "OUT_OF_STOCK", "SHOP_CLOSING", "OVER_CAPACITY", "PRICE_MISMATCH",
];

interface Settlement {
  rows: { orderId: string; code: string; date: string; gross: number; commission: number; net: number }[];
  gross: number;
  commission: number;
  net: number;
}

export default function ShopPanel() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [shopId, setShopId] = useState("four-friends");
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // substitution picker state
  const [subFor, setSubFor] = useState<{ orderId: string; itemIndex: number } | null>(null);
  const [subSearch, setSubSearch] = useState("");
  const [subResults, setSubResults] = useState<CatalogEntry[]>([]);
  // inventory state
  const [invSearch, setInvSearch] = useState("");
  const [inv, setInv] = useState<CatalogEntry[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [settlement, setSettlement] = useState<Settlement | null>(null);

  usePoll(() => {
    api<Bootstrap>("/api/bootstrap").then(setBoot).catch(() => {});
  }, [], 5000);

  usePoll(() => {
    api<{ orders: Order[] }>(`/api/orders?shopId=${shopId}`)
      .then((d) => setOrders(d.orders))
      .catch(() => {});
  }, [shopId], 3000);

  const loadInventory = useCallback(() => {
    const p = new URLSearchParams({ sort: "name", inStock: "0" });
    if (invSearch.trim()) p.set("search", invSearch.trim());
    api<{ entries: CatalogEntry[]; total: number }>(`/api/shops/${shopId}/catalog?${p}`)
      .then((d) => { setInv(d.entries); setInvTotal(d.total); })
      .catch(() => {});
  }, [shopId, invSearch]);

  useEffect(() => {
    if (tab === "inventory") loadInventory();
  }, [tab, loadInventory]);

  useEffect(() => {
    if (tab === "settlement") {
      api<Settlement>(`/api/settlements?shopId=${shopId}`).then(setSettlement).catch(() => {});
    }
  }, [tab, shopId, orders.length]);

  useEffect(() => {
    if (!subFor) return;
    const p = new URLSearchParams({ sort: "top" });
    if (subSearch.trim()) p.set("search", subSearch.trim());
    api<{ entries: CatalogEntry[] }>(`/api/shops/${shopId}/catalog?${p}`)
      .then((d) => setSubResults(d.entries.slice(0, 8)))
      .catch(() => {});
  }, [subFor, subSearch, shopId]);

  async function transition(orderId: string, body: object) {
    setError(null);
    try {
      await api(`/api/orders/${orderId}/transition`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const d = await api<{ orders: Order[] }>(`/api/orders?shopId=${shopId}`);
      setOrders(d.orders);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function patchInventory(productId: string, patch: object) {
    setError(null);
    try {
      await api("/api/inventory", {
        method: "PATCH",
        body: JSON.stringify({ shopId, productId, ...patch }),
      });
      loadInventory();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!boot) return <main className="p-10 text-center text-sm text-gray-500">Loading…</main>;

  const shop = boot.shops.find((s) => s.id === shopId);
  const needsAction = orders.filter((o) => o.status === "PLACED");
  const inProgress = orders.filter((o) =>
    ["ACCEPTED", "SUBSTITUTION_PENDING", "READY_FOR_PICKUP", "PICKED_UP"].includes(o.status),
  );
  const finished = orders.filter((o) =>
    ["DELIVERED", "REJECTED", "CANCELLED", "VERIFICATION_FAILED"].includes(o.status),
  );

  function orderCard(o: Order, actions: React.ReactNode) {
    const isOpen = openOrder === o.id;
    return (
      <Card key={o.id}>
        <button
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setOpenOrder(isOpen ? null : o.id)}
        >
          <div>
            <div className="text-sm font-semibold">
              {o.code} <span className="ml-1 text-xs font-normal text-green-700">PREPAID</span>
            </div>
            <div className="text-xs text-gray-500">
              {o.items.reduce((s, i) => s + i.qty, 0)} units · {inr(o.subtotal)} · {timeAgo(o.createdAt)}
            </div>
          </div>
          <StatusBadge status={o.status} />
        </button>
        <div className="mt-2 border-t border-gray-100 pt-2">
          <OrderItems order={o} />
          {actions}
          {isOpen && <div className="mt-3 border-t border-gray-100 pt-3"><Timeline order={o} /></div>}
        </div>
      </Card>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <select
            className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold"
            value={shopId}
            onChange={(e) => { setShopId(e.target.value); setOpenOrder(null); }}
          >
            {boot.shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="mt-1 text-xs text-gray-500">
            Licence {shop?.licenceNo} · {shop?.status === "ACTIVE" ? "🟢 Active" : "🔴 Paused"} ·
            Hours {shop?.hours.open}–{shop?.hours.close}
          </div>
        </div>
        <div className="flex gap-1 rounded-xl bg-gray-200 p-1 text-sm font-medium">
          {([["orders", `Orders${needsAction.length ? ` (${needsAction.length})` : ""}`],
            ["inventory", "Inventory"], ["settlement", "Settlement"]] as [Tab, string][]).map(
            ([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 ${tab === t ? "bg-white shadow" : "text-gray-600"}`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {/* ---------- orders ---------- */}
      {tab === "orders" && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">
              Needs action ({needsAction.length})
            </h2>
            <div className="space-y-3">
              {needsAction.length === 0 && <Empty text="No new orders waiting." />}
              {needsAction.map((o) =>
                orderCard(
                  o,
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Btn small onClick={() => transition(o.id, { action: "accept" })}>Accept</Btn>
                    <select
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) transition(o.id, { action: "reject", reason: e.target.value });
                      }}
                    >
                      <option value="" disabled>Reject: reason…</option>
                      {REJECT_REASONS.map((r) => (
                        <option key={r} value={r}>{r.replaceAll("_", " ")}</option>
                      ))}
                    </select>
                    <select
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value !== "") {
                          setSubFor({ orderId: o.id, itemIndex: Number(e.target.value) });
                          setSubSearch("");
                        }
                      }}
                    >
                      <option value="" disabled>Suggest substitute for…</option>
                      {o.items.map((it, i) => (
                        <option key={i} value={i}>{it.name}</option>
                      ))}
                    </select>
                  </div>,
                ),
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-700">
              In progress ({inProgress.length})
            </h2>
            <div className="space-y-3">
              {inProgress.length === 0 && <Empty text="Nothing being prepared." />}
              {inProgress.map((o) =>
                orderCard(
                  o,
                  o.status === "ACCEPTED" ? (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      {(["picked", "packed", "sealed"] as const).map((k) => (
                        <label key={k} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={o.packing[k]}
                            onChange={(e) =>
                              transition(o.id, { action: "set_packing", [k]: e.target.checked })
                            }
                          />
                          <span className="capitalize">{k}</span>
                        </label>
                      ))}
                      <Btn
                        small
                        disabled={!o.packing.picked || !o.packing.packed || !o.packing.sealed}
                        onClick={() => transition(o.id, { action: "mark_ready" })}
                      >
                        Mark ready for pickup
                      </Btn>
                    </div>
                  ) : o.status === "SUBSTITUTION_PENDING" ? (
                    <p className="mt-2 text-xs text-purple-700">
                      Waiting for customer to respond to the substitution proposal.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">
                      {o.status === "READY_FOR_PICKUP"
                        ? o.riderId
                          ? "Rider assigned, awaiting pickup."
                          : "Waiting for a rider to claim the task."
                        : "Out for delivery."}
                    </p>
                  ),
                ),
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
              Completed ({finished.length})
            </h2>
            <div className="space-y-3">
              {finished.slice(0, 10).map((o) => orderCard(o, null))}
            </div>
          </section>
        </div>
      )}

      {/* substitute picker modal */}
      {subFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold">Suggest a substitute</h3>
              <button className="text-sm text-gray-500" onClick={() => setSubFor(null)}>✕ close</button>
            </div>
            <input
              autoFocus
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              placeholder="Search your catalog…"
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {subResults.map((r) => (
                <button
                  key={r.id}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-gray-100"
                  onClick={() => {
                    transition(subFor.orderId, {
                      action: "propose_substitution",
                      itemIndex: subFor.itemIndex,
                      productId: r.id,
                    });
                    setSubFor(null);
                  }}
                >
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-gray-500">
                    {inr(r.price)} · {r.stock} in stock
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------- inventory ---------- */}
      {tab === "inventory" && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <input
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              placeholder={`Search ${invTotal} SKUs…`}
              className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-gray-500">
              Showing {inv.length} of {invTotal} (CSV import mocked by generator script)
            </span>
          </div>
          <Card className="overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Sold (register)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {inv.slice(0, 60).map((e) => (
                  <tr key={e.id} className={e.stock === 0 ? "bg-red-50/50" : ""}>
                    <td className="max-w-[280px] truncate px-3 py-1.5" title={e.name}>{e.name}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{e.category}</td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        className="w-20 rounded border border-gray-200 px-1 py-0.5 text-right"
                        defaultValue={e.price}
                        onBlur={(ev) => {
                          const v = Number(ev.target.value);
                          if (v !== e.price && v > 0) patchInventory(e.id, { price: v });
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        className="w-16 rounded border border-gray-200 px-1 py-0.5 text-right"
                        defaultValue={e.stock}
                        onBlur={(ev) => {
                          const v = Number(ev.target.value);
                          if (v !== e.stock && v >= 0) patchInventory(e.id, { stock: v });
                        }}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{e.soldQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ---------- settlement ---------- */}
      {tab === "settlement" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <div className="text-xs text-gray-500">Gross (delivered)</div>
              <div className="text-lg font-bold">{inr(settlement?.gross ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs text-gray-500">
                Commission ({boot.stateConfig.commissionPct}%)
              </div>
              <div className="text-lg font-bold text-red-600">
                −{inr(settlement?.commission ?? 0)}
              </div>
            </Card>
            <Card>
              <div className="text-xs text-gray-500">Net payout</div>
              <div className="text-lg font-bold text-green-700">{inr(settlement?.net ?? 0)}</div>
            </Card>
          </div>
          <Card className="overflow-x-auto !p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Commission</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(settlement?.rows ?? []).map((r) => (
                  <tr key={r.orderId}>
                    <td className="px-3 py-1.5 font-medium">{r.code}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.date}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{inr(r.gross)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-600">−{inr(r.commission)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{inr(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(settlement?.rows ?? []).length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                No delivered orders yet — settlements appear after delivery.
              </div>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}
