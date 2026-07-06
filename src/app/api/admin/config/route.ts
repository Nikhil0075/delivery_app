import { NextRequest, NextResponse } from "next/server";
import { getDb, saveDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  if (typeof body.dryDay === "boolean") db.stateConfig.dryDay = body.dryDay;
  if (typeof body.windowOverride === "boolean") {
    db.stateConfig.windowOverride = body.windowOverride;
  }
  saveDb();
  return NextResponse.json({ stateConfig: db.stateConfig });
}
