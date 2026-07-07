import { NextRequest, NextResponse } from "next/server";
import { transitionOrder } from "@/lib/logic";
import { ensureFresh, persistDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();
  await ensureFresh(0);
  const { order, error } = transitionOrder(id, body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  await persistDb();
  return NextResponse.json({ order });
}
