import { NextResponse } from "next/server";
import { ensureFresh, getDb } from "@/lib/store";
import { kpis } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureFresh();
  return NextResponse.json(kpis(getDb()));
}
