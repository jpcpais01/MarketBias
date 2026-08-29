import { NextResponse } from "next/server";

import { PolymarketError, getMarket } from "@/lib/polymarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/markets/:id */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    return NextResponse.json({ market: await getMarket(id) });
  } catch (error) {
    if (error instanceof PolymarketError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(`GET /api/markets/${id} failed`, error);
    return NextResponse.json({ error: "Failed to load the market." }, { status: 500 });
  }
}
