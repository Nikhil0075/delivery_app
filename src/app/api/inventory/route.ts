import { NextRequest, NextResponse } from "next/server";
import { ensureFresh, getDb, persistDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const { shopId, productId, price, stock, isVisible } = await req.json();
  await ensureFresh(0);
  const db = getDb();
  const item = (db.catalogs[shopId] ?? []).find((c) => c.productId === productId);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (typeof price === "number" && price > 0) item.price = price;
  if (typeof stock === "number" && stock >= 0) item.stock = Math.floor(stock);
  if (typeof isVisible === "boolean") item.isVisible = isVisible;
  await persistDb();
  return NextResponse.json({ item });
}
