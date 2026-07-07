import { NextRequest, NextResponse } from "next/server";
import { ensureFresh, getDb } from "@/lib/store";
import { shopSettlement } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shopId = req.nextUrl.searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "shopId required" }, { status: 400 });
  await ensureFresh();
  return NextResponse.json(shopSettlement(getDb(), shopId));
}
