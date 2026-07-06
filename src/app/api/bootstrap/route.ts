import { NextResponse } from "next/server";
import { getDb } from "@/lib/store";
import { orderingAllowed } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  return NextResponse.json({
    shops: db.shops,
    customers: db.customers,
    riders: db.riders,
    stateConfig: db.stateConfig,
    ordering: orderingAllowed(db.stateConfig),
  });
}
