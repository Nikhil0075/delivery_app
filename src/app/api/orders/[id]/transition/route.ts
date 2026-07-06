import { NextRequest, NextResponse } from "next/server";
import { transitionOrder } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json();
  const { order, error } = transitionOrder(id, body);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ order });
}
