import { NextRequest, NextResponse } from "next/server";
import { ensureFresh, getDb } from "@/lib/store";
import { catalogEntries } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await ensureFresh();
  const db = getDb();
  if (!db.shops.some((s) => s.id === id)) {
    return NextResponse.json({ error: "Unknown shop" }, { status: 404 });
  }
  const q = req.nextUrl.searchParams;
  const search = (q.get("search") ?? "").trim().toUpperCase();
  const category = q.get("category");
  const sort = q.get("sort") ?? "top";
  const inStockOnly = q.get("inStock") !== "0";

  let entries = catalogEntries(db, id);
  if (inStockOnly) entries = entries.filter((e) => e.stock > 0);
  if (category) entries = entries.filter((e) => e.category === category);
  if (search) entries = entries.filter((e) => e.name.toUpperCase().includes(search));

  if (sort === "top") entries.sort((a, b) => b.soldQty - a.soldQty);
  else if (sort === "price_asc") entries.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") entries.sort((a, b) => b.price - a.price);
  else entries.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ entries: entries.slice(0, 200), total: entries.length });
}
