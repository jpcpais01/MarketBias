import { NextResponse } from "next/server";

import { PolymarketError, listMarkets } from "@/lib/polymarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/markets?q=&limit=&offset=&order=&ascending= */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = Number.parseInt(searchParams.get("limit") ?? "24", 10);
  const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const result = await listMarkets({
      query: searchParams.get("q") ?? undefined,
      limit: Number.isFinite(limit) ? limit : 24,
      offset: Number.isFinite(offset) ? offset : 0,
      order: searchParams.get("order") ?? undefined,
      ascending: searchParams.get("ascending") === "true",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PolymarketError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("GET /api/markets failed", error);
    return NextResponse.json({ error: "Failed to load markets." }, { status: 500 });
  }
}
