import { NextResponse } from "next/server";

import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/analyses?marketId=&limit=&offset= — newest first. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const store = getStore();
    const result = await store.list({
      marketId: searchParams.get("marketId") ?? undefined,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
      offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
    });
    return NextResponse.json({ ...result, store: { name: store.name, durable: store.durable } });
  } catch (error) {
    console.error("GET /api/analyses failed", error);
    return NextResponse.json({ error: "Failed to load the analysis history." }, { status: 500 });
  }
}
