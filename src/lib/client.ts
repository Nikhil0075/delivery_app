"use client";

import { useEffect, useRef } from "react";
import type { Customer, Rider, Shop, StateConfig } from "./types";

export interface Bootstrap {
  shops: Shop[];
  customers: Customer[];
  riders: Rider[];
  stateConfig: StateConfig;
  ordering: { ok: true } | { ok: false; reason: string };
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("/api/") && !path.startsWith("/api/rpc")
    ? `/api/rpc?path=${encodeURIComponent(path)}`
    : path;
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

/**
 * Poll a refetch function every `ms`, immediately on mount and deps change.
 * Browsers throttle timers in background tabs, so also refetch the instant
 * the tab regains focus/visibility — otherwise data looks stale after
 * switching between the persona tabs.
 */
export function usePoll(fn: () => void, deps: unknown[], ms = 3000): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);

  useEffect(() => {
    ref.current();
    const t = setInterval(() => {
      if (!document.hidden) ref.current();
    }, ms);
    const onWake = () => {
      if (!document.hidden) ref.current();
    };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const STATUS_LABEL: Record<string, string> = {
  PLACED: "Placed",
  ACCEPTED: "Accepted",
  SUBSTITUTION_PENDING: "Substitution proposed",
  READY_FOR_PICKUP: "Ready for pickup",
  PICKED_UP: "Out for delivery",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  VERIFICATION_FAILED: "Verification failed",
};

export const STATUS_COLOR: Record<string, string> = {
  PLACED: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  SUBSTITUTION_PENDING: "bg-purple-100 text-purple-800",
  READY_FOR_PICKUP: "bg-cyan-100 text-cyan-800",
  PICKED_UP: "bg-indigo-100 text-indigo-800",
  DELIVERED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-stone-200 text-stone-700",
  VERIFICATION_FAILED: "bg-red-100 text-red-800",
};

export const CATEGORY_EMOJI: Record<string, string> = {
  WHISKY: "\u{1F943}",
  BEER: "\u{1F37A}",
  RUM: "\u{1F943}",
  VODKA: "\u{1F378}",
  WINE: "\u{1F377}",
  BRANDY: "\u{1F943}",
  GIN: "\u{1F378}",
  RTD: "\u{1F379}",
  OTHER: "\u{1F376}",
};
