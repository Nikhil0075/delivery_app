import { NextRequest, NextResponse } from "next/server";
import { ensureFresh, getDb, persistDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  await ensureFresh(0);
  const db = getDb();
  if (typeof body.dryDay === "boolean") db.stateConfig.dryDay = body.dryDay;
  if (typeof body.windowOverride === "boolean") {
    db.stateConfig.windowOverride = body.windowOverride;
  }
  await persistDb();
  return NextResponse.json({ stateConfig: db.stateConfig });
}
