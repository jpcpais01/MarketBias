import "server-only";

import { config } from "@/lib/env";
import { createFsStore } from "@/lib/store/fs";
import { createMemoryStore } from "@/lib/store/memory";
import { createUpstashStore } from "@/lib/store/upstash";
import type { AnalysisStore } from "@/lib/store/types";

export type { AnalysisStore, ListOptions } from "@/lib/store/types";

let cached: AnalysisStore | null = null;

/**
 * Resolves the analysis store.
 *
 * "auto" (the default) picks the best available driver:
 *   1. Upstash Redis, when REST credentials are present — the Vercel path.
 *   2. The filesystem, when running outside a serverless environment.
 *   3. An in-memory store, so the app still runs with zero configuration.
 *
 * Set ANALYSIS_STORE_DRIVER to pin a specific driver.
 */
export function getStore(): AnalysisStore {
  if (cached) return cached;

  const { driver, upstashUrl, upstashToken, fsDir, maxRecords } = config.store;
  const hasUpstash = Boolean(upstashUrl && upstashToken);
  // Vercel's filesystem is read-only apart from /tmp, and /tmp is per-instance.
  const isServerless = Boolean(process.env.VERCEL);

  if (driver === "upstash" || (driver === "auto" && hasUpstash)) {
    if (!hasUpstash) {
      throw new Error(
        "ANALYSIS_STORE_DRIVER=upstash requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      );
    }
    cached = createUpstashStore(upstashUrl!, upstashToken!, maxRecords);
  } else if (driver === "fs" || (driver === "auto" && !isServerless)) {
    cached = createFsStore(fsDir, maxRecords);
  } else {
    cached = createMemoryStore(maxRecords);
  }

  return cached;
}
