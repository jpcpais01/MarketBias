/**
 * Polymarket Gamma API client.
 *
 * Gamma returns several fields as JSON-encoded strings (`outcomes`,
 * `outcomePrices`, `clobTokenIds`) and mixes numeric/string types for money
 * fields, so every field is parsed defensively and degrades to `null` rather
 * than throwing. See https://docs.polymarket.com/ for the upstream contract.
 */

import { config } from "@/lib/env";
import type { Market, MarketListResult } from "@/lib/types";

export class PolymarketError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "PolymarketError";
    this.status = status;
  }
}

type Raw = Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

/** Gamma encodes list fields as JSON strings; tolerate both shapes. */
function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v));
    } catch {
      // Not JSON — fall through to the empty list.
    }
  }
  return [];
}

/**
 * Derives the YES probability. Prefers the published outcome price, falling
 * back to the mid of the book and then to the last trade.
 */
function deriveYesProbability(raw: Raw, outcomes: string[]): number | null {
  const prices = asStringArray(raw.outcomePrices)
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p));

  if (prices.length > 0) {
    const yesIndex = outcomes.findIndex((o) => o.toLowerCase() === "yes");
    const index = yesIndex >= 0 ? yesIndex : 0;
    const price = prices[index];
    if (typeof price === "number" && price >= 0 && price <= 1) return price;
  }

  const bid = asNumber(raw.bestBid);
  const ask = asNumber(raw.bestAsk);
  if (bid !== null && ask !== null && bid >= 0 && ask <= 1 && ask >= bid) {
    return (bid + ask) / 2;
  }

  const last = asNumber(raw.lastTradePrice);
  if (last !== null && last >= 0 && last <= 1) return last;

  return null;
}

function firstEvent(raw: Raw): Raw | null {
  const events = raw.events;
  if (Array.isArray(events) && events.length > 0 && typeof events[0] === "object") {
    return events[0] as Raw;
  }
  return null;
}

export function normaliseMarket(raw: Raw): Market | null {
  const id = asString(raw.id);
  const question = asString(raw.question);
  if (!id || !question) return null;

  const outcomes = asStringArray(raw.outcomes);
  const event = firstEvent(raw);
  const slug = asString(raw.slug);
  const eventSlug = event ? asString(event.slug) : null;

  return {
    id,
    conditionId: asString(raw.conditionId),
    slug,
    question,
    description: asString(raw.description) ?? "",
    resolutionSource: asString(raw.resolutionSource),
    endDate: asString(raw.endDate) ?? asString(raw.endDateIso),
    startDate: asString(raw.startDate) ?? asString(raw.startDateIso),
    volume: asNumber(raw.volumeNum) ?? asNumber(raw.volume),
    volume24hr: asNumber(raw.volume24hr),
    liquidity: asNumber(raw.liquidityNum) ?? asNumber(raw.liquidity),
    yesProbability: deriveYesProbability(raw, outcomes),
    outcomes: outcomes.length > 0 ? outcomes : ["Yes", "No"],
    bestBid: asNumber(raw.bestBid),
    bestAsk: asNumber(raw.bestAsk),
    spread: asNumber(raw.spread),
    oneDayPriceChange: asNumber(raw.oneDayPriceChange),
    active: asBool(raw.active, true),
    closed: asBool(raw.closed, false),
    image: asString(raw.image),
    icon: asString(raw.icon),
    eventTitle: event ? asString(event.title) : null,
    eventSlug,
    // Gamma has no canonical market permalink; the event page is the closest
    // stable public URL, with the market slug as a fallback.
    url: eventSlug
      ? `https://polymarket.com/event/${eventSlug}`
      : slug
        ? `https://polymarket.com/market/${slug}`
        : null,
  };
}

async function gammaFetch(path: string, params: Record<string, string | number | boolean | undefined>) {
  // Concatenate rather than `new URL(path, base)`, which would discard any
  // path component of a configured base URL (e.g. a proxy at /gamma).
  const url = new URL(`${config.polymarket.gammaUrl.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(config.polymarket.timeoutMs),
      next: { revalidate: config.polymarket.revalidateSeconds },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PolymarketError(`Could not reach the Polymarket API: ${reason}`, 504);
  }

  if (!response.ok) {
    throw new PolymarketError(
      `Polymarket API returned ${response.status} ${response.statusText}.`,
      response.status === 404 ? 404 : 502,
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new PolymarketError("Polymarket API returned a malformed response.");
  }
}

/** Gamma sometimes wraps list payloads in `{ data: [...] }`. */
function toArray(payload: unknown): Raw[] {
  if (Array.isArray(payload)) return payload as Raw[];
  if (payload && typeof payload === "object") {
    const data = (payload as Raw).data;
    if (Array.isArray(data)) return data as Raw[];
  }
  return [];
}

export interface ListMarketsParams {
  limit?: number;
  offset?: number;
  /** Free-text filter. Applied server-side when possible, locally otherwise. */
  query?: string;
  /** Gamma sort key, e.g. "volume24hr", "volume", "liquidity", "endDate". */
  order?: string;
  ascending?: boolean;
}

const SEARCH_POOL_SIZE = 500;
const SEARCH_PAGE_SIZE = 100;

/** Only binary YES/NO markets are analysable by the workflow. */
function isBinary(market: Market): boolean {
  if (market.outcomes.length !== 2) return false;
  const lower = market.outcomes.map((o) => o.toLowerCase());
  return lower.includes("yes") && lower.includes("no");
}

function isTradeable(market: Market): boolean {
  return market.active && !market.closed && market.yesProbability !== null;
}

function matchesQuery(market: Market, query: string): boolean {
  const haystack = [market.question, market.description, market.eventTitle ?? "", market.slug ?? ""]
    .join(" ")
    .toLowerCase();
  // Every whitespace-separated term must appear somewhere in the market text.
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

async function fetchMarketPage(limit: number, offset: number, order: string, ascending: boolean) {
  const payload = await gammaFetch("/markets", {
    limit,
    offset,
    active: true,
    closed: false,
    archived: false,
    order,
    ascending,
  });
  return toArray(payload)
    .map(normaliseMarket)
    .filter((m): m is Market => m !== null);
}

/**
 * Lists active markets, newest/most-liquid first.
 *
 * Gamma has no text-query parameter on `/markets`, so a search scans a bounded
 * pool of the highest-volume active markets and filters locally. The pool is
 * capped so a search can never fan out into an unbounded number of requests.
 */
export async function listMarkets(params: ListMarketsParams = {}): Promise<MarketListResult> {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const order = params.order ?? "volume24hr";
  const ascending = params.ascending ?? false;
  const query = params.query?.trim();

  if (!query) {
    // Over-fetch so post-filtering (non-binary markets) still fills the page.
    const raw = await fetchMarketPage(Math.min(limit * 3, 100), offset, order, ascending);
    const markets = raw.filter((m) => isBinary(m) && isTradeable(m));
    return {
      markets: markets.slice(0, limit),
      nextOffset: raw.length === 0 ? null : offset + Math.min(limit * 3, 100),
    };
  }

  const pool: Market[] = [];
  for (let scanned = 0; scanned < SEARCH_POOL_SIZE; scanned += SEARCH_PAGE_SIZE) {
    const page = await fetchMarketPage(SEARCH_PAGE_SIZE, scanned, order, ascending);
    pool.push(...page);
    if (page.length < SEARCH_PAGE_SIZE) break;
  }

  const matches = pool.filter((m) => isBinary(m) && isTradeable(m) && matchesQuery(m, query));
  return {
    markets: matches.slice(offset, offset + limit),
    nextOffset: offset + limit < matches.length ? offset + limit : null,
  };
}

/** Fetches a single market by its Gamma id. */
export async function getMarket(id: string): Promise<Market> {
  const payload = await gammaFetch(`/markets/${encodeURIComponent(id)}`, {});
  const raw = Array.isArray(payload) ? (payload[0] as Raw | undefined) : (payload as Raw);
  const market = raw ? normaliseMarket(raw) : null;
  if (!market) throw new PolymarketError(`Market "${id}" was not found.`, 404);
  return market;
}
