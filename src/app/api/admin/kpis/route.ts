import { NextResponse } from "next/server";
import { getDb } from "@/lib/store";
import { kpis } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(kpis(getDb()));
}
