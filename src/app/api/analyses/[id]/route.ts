import { NextResponse } from "next/server";

import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/analyses/:id */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  try {
    const analysis = await getStore().get(id);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error(`GET /api/analyses/${id} failed`, error);
    return NextResponse.json({ error: "Failed to load the analysis." }, { status: 500 });
  }
}
