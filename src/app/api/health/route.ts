import { NextResponse } from "next/server";

import { publicConfigSummary } from "@/lib/env";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — non-secret configuration status for diagnostics and the UI. */
export async function GET() {
  let store: { name: string; durable: boolean } | { error: string };
  try {
    const resolved = getStore();
    store = { name: resolved.name, durable: resolved.durable };
  } catch (error) {
    store = { error: error instanceof Error ? error.message : "Store unavailable." };
  }

  return NextResponse.json({ ok: true, ...publicConfigSummary(), store });
}
