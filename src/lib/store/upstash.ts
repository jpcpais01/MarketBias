import type { Analysis } from "@/lib/types";
import type { AnalysisStore, ListOptions } from "@/lib/store/types";

/**
 * Upstash Redis (REST) store — the recommended driver for Vercel.
 *
 * Uses the plain HTTP API rather than an SDK, so there is no extra dependency
 * and it works on both the Node and Edge runtimes.
 *
 * Layout:
 *   analysis:<id>           -> the full record (never rewritten)
 *   analyses:index          -> list of ids, newest first
 *   analyses:market:<id>    -> per-market list of ids, newest first
 */
export function createUpstashStore(url: string, token: string, maxRecords: number): AnalysisStore {
  const base = url.replace(/\/$/, "");

  async function command<T>(args: (string | number)[]): Promise<T> {
    const response = await fetch(base, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args.map(String)),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Upstash request failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(`Upstash error: ${payload.error}`);
    return payload.result as T;
  }

  async function pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const response = await fetch(`${base}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Upstash pipeline failed (${response.status}): ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as { result?: unknown; error?: string }[];
    return payload.map((entry) => {
      if (entry.error) throw new Error(`Upstash error: ${entry.error}`);
      return entry.result;
    });
  }

  async function hydrate(ids: string[]): Promise<Analysis[]> {
    if (ids.length === 0) return [];
    const raw = await command<(string | null)[]>(["MGET", ...ids.map((id) => `analysis:${id}`)]);
    const analyses: Analysis[] = [];
    for (const entry of raw ?? []) {
      if (!entry) continue;
      try {
        analyses.push(JSON.parse(entry) as Analysis);
      } catch {
        // Skip corrupt records rather than failing the listing.
      }
    }
    return analyses;
  }

  return {
    name: "upstash-redis",
    durable: true,
    async save(analysis) {
      const key = `analysis:${analysis.id}`;
      await pipeline([
        // SET on a fresh uuid key: an existing analysis is never overwritten.
        ["SET", key, JSON.stringify(analysis)],
        ["LPUSH", "analyses:index", analysis.id],
        ["LTRIM", "analyses:index", 0, maxRecords - 1],
        ["LPUSH", `analyses:market:${analysis.marketId}`, analysis.id],
        ["LTRIM", `analyses:market:${analysis.marketId}`, 0, maxRecords - 1],
      ]);
    },
    async list(options: ListOptions = {}) {
      const listKey = options.marketId ? `analyses:market:${options.marketId}` : "analyses:index";
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 50;

      const [total, ids] = (await pipeline([
        ["LLEN", listKey],
        ["LRANGE", listKey, offset, offset + limit - 1],
      ])) as [number, string[]];

      return { analyses: await hydrate(ids ?? []), total: total ?? 0 };
    },
    async get(id) {
      const raw = await command<string | null>(["GET", `analysis:${id}`]);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Analysis;
      } catch {
        return null;
      }
    },
  };
}
