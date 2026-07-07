"use client";

import type { Order } from "@/lib/types";
import { STATUS_COLOR, STATUS_LABEL, inr } from "@/lib/client";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${
        STATUS_COLOR[status] ?? "bg-amber-100 text-amber-900"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-amber-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  kind = "primary",
  disabled,
  small,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  small?: boolean;
}) {
  const kinds = {
    primary: "bg-amber-700 text-white hover:bg-amber-600",
    secondary: "bg-white border border-amber-300 text-gray-800 hover:bg-amber-50",
    danger: "bg-red-600 text-white hover:bg-red-500",
    ghost: "text-gray-600 hover:bg-amber-100",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
        small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"
      } ${kinds[kind]}`}
    >
      {children}
    </button>
  );
}

export function OrderItems({ order }: { order: Order }) {
  return (
    <ul className="divide-y divide-amber-100 text-sm">
      {order.items.map((it, i) => (
        <li key={i} className="flex justify-between gap-2 py-1.5">
          <span>
            {it.qty} × {it.name}
            {it.substitutedFrom && (
              <span className="ml-1 text-xs text-purple-600">
                (substituted for {it.substitutedFrom})
              </span>
            )}
          </span>
          <span className="tabular-nums">{inr(it.lineTotal)}</span>
        </li>
      ))}
    </ul>
  );
}

export function FeeBreakdown({ order }: { order: Order }) {
  return (
    <div className="space-y-1 text-sm text-gray-600">
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span className="tabular-nums">{inr(order.subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span>Delivery fee</span>
        <span className="tabular-nums">{inr(order.deliveryFee)}</span>
      </div>
      <div className="flex justify-between">
        <span>Convenience fee</span>
        <span className="tabular-nums">{inr(order.convenienceFee)}</span>
      </div>
      <div className="flex justify-between border-t border-amber-200 pt-1 font-semibold text-gray-900">
        <span>Total paid</span>
        <span className="tabular-nums">{inr(order.total)}</span>
      </div>
    </div>
  );
}

export function Timeline({ order }: { order: Order }) {
  return (
    <ol className="space-y-2">
      {order.events.map((e, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <div>
            <span className="font-medium">{e.type.replaceAll("_", " ")}</span>
            <span className="ml-2 text-xs text-gray-500">
              {new Date(e.at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {e.note && <div className="text-xs text-gray-500">{e.note}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-amber-300 p-8 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}
