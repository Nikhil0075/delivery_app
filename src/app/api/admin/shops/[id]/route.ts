import { NextRequest, NextResponse } from "next/server";
import { ensureFresh, getDb, persistDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { status } = await req.json();
  await ensureFresh(0);
  const db = getDb();
  const shop = db.shops.find((s) => s.id === id);
  if (!shop) return NextResponse.json({ error: "Unknown shop" }, { status: 404 });
  if (status !== "ACTIVE" && status !== "PAUSED") {
    return NextResponse.json({ error: "Bad status" }, { status: 400 });
  }
  shop.status = status;
  await persistDb();
  return NextResponse.json({ shop });
}
