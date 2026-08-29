/**
 * Server-side configuration. This module must never be imported from a client
 * component — the OpenRouter key lives here and is read from process.env only.
 */

import "server-only";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : undefined;
}

function bool(name: string, fallback: boolean): boolean {
  const value = optional(name);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(name: string, fallback: number): number {
  const value = optional(name);
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// No `:online` suffix — web research is added by the `web` plugin instead, so
// that search works identically whichever model is configured.
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export const config = {
  openRouter: {
    /** Read lazily via `requireOpenRouterKey()` so the app still boots without it. */
    apiKey: optional("OPENROUTER_API_KEY"),
    baseUrl: optional("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1",
    /** Fully configurable so models can be swapped without touching code. */
    model: optional("OPENROUTER_MODEL") ?? DEFAULT_MODEL,
    /** Optional attribution headers used by OpenRouter's leaderboards. */
    siteUrl: optional("OPENROUTER_SITE_URL"),
    siteName: optional("OPENROUTER_SITE_NAME") ?? "TrueOdds",
    /** Enables OpenRouter's `web` plugin so the forecaster can research live. */
    webSearch: bool("OPENROUTER_ENABLE_WEB_SEARCH", true),
    webMaxResults: int("OPENROUTER_WEB_MAX_RESULTS", 8),
    /** Some models reject `response_format`; off by default, prompt-enforced JSON. */
    jsonMode: bool("OPENROUTER_JSON_MODE", false),
    timeoutMs: int("OPENROUTER_TIMEOUT_MS", 240_000),
  },
  polymarket: {
    gammaUrl: optional("POLYMARKET_GAMMA_URL") ?? "https://gamma-api.polymarket.com",
    /** Cache window (seconds) for market list/detail fetches. */
    revalidateSeconds: int("POLYMARKET_REVALIDATE_SECONDS", 60),
    timeoutMs: int("POLYMARKET_TIMEOUT_MS", 20_000),
  },
  store: {
    /** "auto" | "upstash" | "fs" | "memory" — see lib/store/index.ts. */
    driver: (optional("ANALYSIS_STORE_DRIVER") ?? "auto").toLowerCase(),
    upstashUrl: optional("UPSTASH_REDIS_REST_URL") ?? optional("KV_REST_API_URL"),
    upstashToken: optional("UPSTASH_REDIS_REST_TOKEN") ?? optional("KV_REST_API_TOKEN"),
    fsDir: optional("ANALYSIS_STORE_DIR") ?? ".data/analyses",
    /** Maximum records kept in the history index. */
    maxRecords: int("ANALYSIS_STORE_MAX_RECORDS", 500),
  },
} as const;

export function requireOpenRouterKey(): string {
  if (!config.openRouter.apiKey) {
    throw new ConfigError(
      "OPENROUTER_API_KEY is not set. Add it to .env.local (local) or to your Vercel project's environment variables.",
    );
  }
  return config.openRouter.apiKey;
}

/** Safe, non-secret configuration summary for the UI / health endpoint. */
export function publicConfigSummary() {
  return {
    model: config.openRouter.model,
    webSearchEnabled: config.openRouter.webSearch,
    openRouterConfigured: Boolean(config.openRouter.apiKey),
  };
}
