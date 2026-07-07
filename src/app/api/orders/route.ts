import { NextRequest, NextResponse } from "next/server";
import { ensureFresh, getDb, persistDb } from "@/lib/store";
import { createOrder } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const customerId = q.get("customerId");
  const shopId = q.get("shopId");
  const riderId = q.get("riderId");
  await ensureFresh();
  const db = getDb();

  let orders = db.orders;
  if (customerId) orders = orders.filter((o) => o.customerId === customerId);
  if (shopId) orders = orders.filter((o) => o.shopId === shopId);
  if (riderId) {
    // a rider sees their own tasks plus unclaimed ready orders
    orders = orders.filter(
      (o) =>
        o.riderId === riderId ||
        (o.status === "READY_FOR_PICKUP" && !o.riderId),
    );
  }
  orders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await ensureFresh(0);
  const { order, error } = createOrder(body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  await persistDb();
  return NextResponse.json({ order }, { status: 201 });
}
