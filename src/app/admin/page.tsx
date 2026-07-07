"use client";

import { useState } from "react";
import type { Order, Shop } from "@/lib/types";
import { Bootstrap, api, inr, timeAgo, usePoll } from "@/lib/client";
import { Btn, Card, Empty, OrderItems, StatusBadge, Timeline } from "@/components/ui";

type Tab = "dashboard" | "orders" | "shops" | "compliance";

interface Kpis {
  totalOrders: number;
  liveOrders: number;
  deliveredOrders: number;
  gmv: number;
  aov: number;
  acceptanceRate: number;
  platformRevenue: number;
  registerTopSkus: { name: string; gmv: number; units: number }[];
  registerCategoryGmv: { category: string; amount: number }[];
}

export default function AdminConsole() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  usePoll(() => {
    api<Bootstrap>("/api/bootstrap").then(setBoot).catch(() => {});
    api<Kpis>("/api/admin/kpis").then(setKpis).catch(() => {});
    api<{ orders: Order[] }>("/api/orders").then((d) => setOrders(d.orders)).catch(() => {});
  }, [], 3000);

  async function patchConfig(patch: object) {
    setBusy(true);
    try {
      await api("/api/admin/config", { method: "PATCH", body: JSON.stringify(patch) });
      const b = await api<Bootstrap>("/api/bootstrap");
      setBoot(b);
    } finally {
      setBusy(false);
    }
  }

  async function setShopStatus(shop: Shop, status: "ACTIVE" | "PAUSED") {
    await api(`/api/admin/shops/${shop.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    const b = await api<Bootstrap>("/api/bootstrap");
    setBoot(b);
  }

  if (!boot || !kpis) {
    return <main className="p-10 text-center text-sm text-gray-500">Loading…</main>;
  }

  const cfg = boot.stateConfig;
  const maxCat = Math.max(...kpis.registerCategoryGmv.map((c) => c.amount), 1);
  const maxSku = Math.max(...kpis.registerTopSkus.map((s) => s.gmv), 1);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Admin Console — {cfg.city}, {cfg.state}</h1>
        <div className="flex gap-1 rounded-xl bg-amber-200/60 p-1 text-sm font-medium">
          {(["dashboard", "orders", "shops", "compliance"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 capitalize ${tab === t ? "bg-white shadow" : "text-gray-600"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {cfg.dryDay && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700">
          ⛔ DRY DAY ACTIVE — all ordering is suspended network-wide.
        </div>
      )}

      {/* ---------- dashboard ---------- */}
      {tab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {([
              ["Total orders", String(kpis.totalOrders)],
              ["Live now", String(kpis.liveOrders)],
              ["Delivered", String(kpis.deliveredOrders)],
              ["GMV (delivered)", inr(kpis.gmv)],
              ["AOV", inr(kpis.aov)],
              ["Acceptance", `${kpis.acceptanceRate}%`],
            ] as [string, string][]).map(([label, value]) => (
              <Card key={label}>
                <div className="text-[11px] text-gray-500">{label}</div>
                <div className="text-lg font-bold">{value}</div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-bold">
                Top 10 SKUs by GMV
                <span className="ml-2 text-xs font-normal text-gray-400">
                  (from the 01-Jul-2026 sales register)
                </span>
              </h3>
              <div className="space-y-2">
                {kpis.registerTopSkus.map((s) => (
                  <div key={s.name}>
                    <div className="flex justify-between text-xs">
                      <span className="min-w-0 truncate pr-2" title={s.name}>{s.name}</span>
                      <span className="shrink-0 tabular-nums text-gray-500">
                        {inr(s.gmv)} · {s.units}u
                      </span>
                    </div>
                    <div className="mt-0.5 h-2 rounded bg-amber-100">
                      <div
                        className="h-2 rounded bg-amber-700"
                        style={{ width: `${(s.gmv / maxSku) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-bold">
                Category GMV mix
                <span className="ml-2 text-xs font-normal text-gray-400">(register day)</span>
              </h3>
              <div className="space-y-2">
                {kpis.registerCategoryGmv.map((c) => (
                  <div key={c.category}>
                    <div className="flex justify-between text-xs">
                      <span>{c.category}</span>
                      <span className="tabular-nums text-gray-500">{inr(c.amount)}</span>
                    </div>
                    <div className="mt-0.5 h-2 rounded bg-amber-100">
                      <div
                        className="h-2 rounded bg-yellow-500"
                        style={{ width: `${(c.amount / maxCat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Card>
            <div className="text-xs text-gray-500">
              Platform revenue (commission {cfg.commissionPct}% + convenience fees on delivered
              orders): <span className="font-bold text-gray-900">{inr(kpis.platformRevenue)}</span>
            </div>
          </Card>
        </div>
      )}

      {/* ---------- orders ---------- */}
      {tab === "orders" && (
        <div className="space-y-2">
          {orders.length === 0 && <Empty text="No orders." />}
          {orders.map((o) => {
            const isOpen = openOrder === o.id;
            const shop = boot.shops.find((s) => s.id === o.shopId);
            const cust = boot.customers.find((c) => c.id === o.customerId);
            const rider = boot.riders.find((r) => r.id === o.riderId);
            return (
              <Card key={o.id} className="!p-3">
                <button
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setOpenOrder(isOpen ? null : o.id)}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-sm font-semibold">{o.code}</span>
                    <span className="truncate text-xs text-gray-500">
                      {cust?.name} ← {shop?.name}
                      {rider ? ` · 🛵 ${rider.name}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs tabular-nums text-gray-500">{inr(o.total)}</span>
                    <span className="text-xs text-gray-400">{timeAgo(o.createdAt)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-3 grid gap-4 border-t border-amber-100 pt-3 md:grid-cols-2">
                    <div>
                      <h4 className="mb-1 text-xs font-bold uppercase text-gray-500">Items</h4>
                      <OrderItems order={o} />
                      <div className="mt-2 text-xs text-gray-500">
                        Handoff OTP: <span className="font-mono font-bold">{o.otp}</span>
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-1 text-xs font-bold uppercase text-gray-500">
                        Audit event log
                      </h4>
                      <Timeline order={o} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ---------- shops ---------- */}
      {tab === "shops" && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead className="bg-amber-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Shop</th>
                <th className="px-3 py-2">Licence</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Radius</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100">
              {boot.shops.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{s.licenceNo}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{s.area}</td>
                  <td className="px-3 py-2 text-xs">{s.serviceRadiusKm} km</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.status === "ACTIVE"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.status === "ACTIVE" ? (
                      <Btn small kind="secondary" onClick={() => setShopStatus(s, "PAUSED")}>
                        Pause
                      </Btn>
                    ) : (
                      <Btn small onClick={() => setShopStatus(s, "ACTIVE")}>Resume</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ---------- compliance ---------- */}
      {tab === "compliance" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="text-sm font-bold">State compliance engine — {cfg.state}</h3>
            <dl className="mt-2 space-y-1 text-sm text-gray-600">
              <div className="flex justify-between">
                <dt>Legal drinking age</dt>
                <dd className="font-medium">{cfg.legalAge}+</dd>
              </div>
              <div className="flex justify-between">
                <dt>Permitted ordering window</dt>
                <dd className="font-medium">
                  {cfg.deliveryWindow.open}–{cfg.deliveryWindow.close}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Cart policy</dt>
                <dd className="font-medium">Single-shop only</dd>
              </div>
              <div className="flex justify-between">
                <dt>Payment policy</dt>
                <dd className="font-medium">Prepaid only</dd>
              </div>
            </dl>
            <div className="mt-4 space-y-3 border-t border-amber-100 pt-3">
              <label className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">Dry day shutdown</span>
                  <span className="block text-xs text-gray-500">
                    Instantly blocks checkout across all shops
                  </span>
                </span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={cfg.dryDay}
                  onChange={(e) => patchConfig({ dryDay: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>
                  <span className="font-medium">Delivery-window override</span>
                  <span className="block text-xs text-gray-500">
                    Demo only: allow orders outside {cfg.deliveryWindow.open}–{cfg.deliveryWindow.close}
                  </span>
                </span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={cfg.windowOverride}
                  onChange={(e) => patchConfig({ windowOverride: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-bold">Demo controls</h3>
            <p className="mt-1 text-xs text-gray-500">
              Resets orders, inventory, and toggles back to the generated seed data
              (extracted from the Four Friends sales register).
            </p>
            <div className="mt-3">
              <Btn
                kind="danger"
                onClick={async () => {
                  if (confirm("Reset all live data back to seed?")) {
                    await api("/api/admin/reset", { method: "POST", body: "{}" });
                    location.reload();
                  }
                }}
              >
                Reset demo data
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
