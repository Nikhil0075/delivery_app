"use client";

import { useState } from "react";
import type { Order } from "@/lib/types";
import { Bootstrap, api, inr, timeAgo, usePoll } from "@/lib/client";
import { Btn, Card, Empty, OrderItems, StatusBadge } from "@/components/ui";

const EARNING_PER_DELIVERY = 35;

export default function RiderApp() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [riderId, setRiderId] = useState("rider-suresh");
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"tasks" | "earnings">("tasks");
  const [otpInput, setOtpInput] = useState<Record<string, string>>({});
  const [sealedOk, setSealedOk] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  usePoll(() => {
    api<Bootstrap>("/api/bootstrap").then(setBoot).catch(() => {});
  }, [], 5000);

  usePoll(() => {
    api<{ orders: Order[] }>(`/api/orders?riderId=${riderId}`)
      .then((d) => setOrders(d.orders))
      .catch(() => {});
  }, [riderId], 3000);

  async function transition(orderId: string, body: object) {
    setError(null);
    try {
      await api(`/api/orders/${orderId}/transition`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const d = await api<{ orders: Order[] }>(`/api/orders?riderId=${riderId}`);
      setOrders(d.orders);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!boot) return <main className="p-10 text-center text-sm text-gray-500">Loading…</main>;

  const shopName = (id: string) => boot.shops.find((s) => s.id === id)?.name ?? id;
  const custName = (id: string) => boot.customers.find((c) => c.id === id)?.name ?? id;
  const addressOf = (o: Order) =>
    boot.customers
      .find((c) => c.id === o.customerId)
      ?.addresses.find((a) => a.id === o.addressId);

  const unclaimed = orders.filter((o) => o.status === "READY_FOR_PICKUP" && !o.riderId);
  const mine = orders.filter(
    (o) => o.riderId === riderId && ["READY_FOR_PICKUP", "PICKED_UP"].includes(o.status),
  );
  const done = orders.filter(
    (o) => o.riderId === riderId && ["DELIVERED", "VERIFICATION_FAILED"].includes(o.status),
  );
  const deliveredCount = done.filter((o) => o.status === "DELIVERED").length;

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <select
          className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold"
          value={riderId}
          onChange={(e) => setRiderId(e.target.value)}
        >
          {boot.riders.map((r) => (
            <option key={r.id} value={r.id}>{r.name} · {r.vehicleNo}</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-xl bg-gray-200 p-1 text-sm font-medium">
          {(["tasks", "earnings"] as const).map((t) => (
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

      {error && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-700">
              Available pickups ({unclaimed.length})
            </h2>
            <div className="space-y-3">
              {unclaimed.length === 0 && <Empty text="No unclaimed pickups right now." />}
              {unclaimed.map((o) => (
                <Card key={o.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{o.code}</div>
                      <div className="text-xs text-gray-500">
                        Pickup: {shopName(o.shopId)} → {addressOf(o)?.area ?? "—"}
                      </div>
                      <div className="text-xs text-gray-400">{timeAgo(o.createdAt)}</div>
                    </div>
                    <Btn small onClick={() => transition(o.id, { action: "claim", riderId })}>
                      Claim
                    </Btn>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
              My active tasks ({mine.length})
            </h2>
            <div className="space-y-3">
              {mine.length === 0 && <Empty text="No active tasks. Claim a pickup above." />}
              {mine.map((o) => (
                <Card key={o.id}>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">{o.code}</div>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="space-y-1 text-xs text-gray-600">
                    <div>🏪 {shopName(o.shopId)}</div>
                    <div>
                      📍 {custName(o.customerId)} — {addressOf(o)?.line1}, {addressOf(o)?.area}
                    </div>
                  </div>
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <OrderItems order={o} />
                  </div>

                  {o.status === "READY_FOR_PICKUP" && (
                    <div className="mt-3 rounded-lg bg-cyan-50 p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sealedOk[o.id] ?? false}
                          onChange={(e) =>
                            setSealedOk((p) => ({ ...p, [o.id]: e.target.checked }))
                          }
                        />
                        Package received sealed & intact
                      </label>
                      <div className="mt-2">
                        <Btn
                          small
                          disabled={!sealedOk[o.id]}
                          onClick={() => transition(o.id, { action: "pickup" })}
                        >
                          Confirm pickup
                        </Btn>
                      </div>
                    </div>
                  )}

                  {o.status === "PICKED_UP" && (
                    <div className="mt-3 rounded-lg bg-indigo-50 p-3">
                      <div className="text-xs font-medium text-indigo-800">
                        Handoff: check customer ID (18+), then enter their OTP
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={otpInput[o.id] ?? ""}
                          onChange={(e) =>
                            setOtpInput((p) => ({ ...p, [o.id]: e.target.value }))
                          }
                          placeholder="4-digit OTP"
                          maxLength={4}
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-center text-sm tracking-widest"
                        />
                        <Btn
                          small
                          onClick={() =>
                            transition(o.id, { action: "deliver", otp: otpInput[o.id] ?? "" })
                          }
                        >
                          Complete delivery
                        </Btn>
                      </div>
                      <div className="mt-2">
                        <Btn
                          small
                          kind="danger"
                          onClick={() =>
                            transition(o.id, {
                              action: "verification_failed",
                              reason: "AGE_CHECK_FAILED",
                            })
                          }
                        >
                          Verification failed / refused
                        </Btn>
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "earnings" && (
        <div className="space-y-3">
          <Card className="text-center">
            <div className="text-xs text-gray-500">Completed deliveries</div>
            <div className="text-2xl font-bold">{deliveredCount}</div>
            <div className="mt-1 text-sm text-green-700">
              Earnings: {inr(deliveredCount * EARNING_PER_DELIVERY)}
              <span className="text-xs text-gray-400"> ({inr(EARNING_PER_DELIVERY)}/delivery)</span>
            </div>
          </Card>
          <div className="space-y-2">
            {done.map((o) => (
              <Card key={o.id} className="flex items-center justify-between !p-3">
                <div>
                  <div className="text-sm font-medium">{o.code} · {shopName(o.shopId)}</div>
                  <div className="text-xs text-gray-500">{timeAgo(o.createdAt)}</div>
                </div>
                <div className="text-right">
                  <StatusBadge status={o.status} />
                  <div className="mt-1 text-xs font-medium text-green-700">
                    {o.status === "DELIVERED" ? `+${inr(EARNING_PER_DELIVERY)}` : "—"}
                  </div>
                </div>
              </Card>
            ))}
            {done.length === 0 && <Empty text="No completed tasks yet." />}
          </div>
        </div>
      )}
    </main>
  );
}
