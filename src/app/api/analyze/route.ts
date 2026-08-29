import { AnalysisError, resolveRunCount, runAnalysis } from "@/lib/analysis";
import { ConfigError } from "@/lib/env";
import { OpenRouterError } from "@/lib/openrouter";
import { PolymarketError, getMarket } from "@/lib/polymarket";
import type { AnalysisEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * The workflow makes two LLM calls, the first with web search, so it needs
 * well over the default limit. 300s is the Fluid Compute maximum on Vercel's
 * Hobby plan; lower it if your plan or provider caps function duration sooner.
 */
export const maxDuration = 300;

/**
 * POST /api/analyze  { marketId: string, model?: string, runs?: number }
 *
 * Streams newline-delimited JSON `AnalysisEvent`s so the client can show real
 * stage-by-stage progress. The final line is either a `result` or an `error`.
 */
export async function POST(request: Request) {
  let marketId: string;
  let model: string | undefined;
  let runs: number | undefined;

  try {
    const body = (await request.json()) as {
      marketId?: unknown;
      model?: unknown;
      runs?: unknown;
    };
    if (typeof body.marketId !== "string" || !body.marketId.trim()) {
      return jsonError("A `marketId` is required.", 400);
    }
    marketId = body.marketId.trim();
    model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    // Clamped server-side, so an oversized `runs` cannot fan out the workload.
    runs = typeof body.runs === "number" ? resolveRunCount(body.runs) : undefined;
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalysisEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({ type: "stage", stage: "fetching-market", message: "Fetching the market and its resolution rules…" });
        const market = await getMarket(marketId);

        const analysis = await runAnalysis({ market, model, runs, onEvent: send });
        send({ type: "result", analysis });
      } catch (error) {
        send({ type: "error", message: describeError(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Stops proxies (including Vercel's) from buffering the progress events.
      "X-Accel-Buffering": "no",
    },
  });
}

function describeError(error: unknown): string {
  if (error instanceof ConfigError) return error.message;
  if (error instanceof PolymarketError) return `Polymarket: ${error.message}`;
  if (error instanceof OpenRouterError) return error.message;
  if (error instanceof AnalysisError) return error.message;
  if (error instanceof Error) {
    console.error("Analysis failed", error);
    return `Analysis failed: ${error.message}`;
  }
  console.error("Analysis failed", error);
  return "Analysis failed for an unknown reason.";
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
