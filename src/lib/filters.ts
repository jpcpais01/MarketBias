/**
 * Market noise filtering.
 *
 * Polymarket carries a large tail of recurring, low-information markets —
 * hourly "up or down" crypto ticks, daily temperature markets, tweet counts —
 * that crowd out the questions worth forecasting. These are matched by keyword
 * against the question and event title.
 *
 * The list is a starting point, not a judgement about what matters: it is fully
 * replaceable via MARKET_EXCLUDE_KEYWORDS, and the UI can switch it off.
 */

import type { Market } from "@/lib/types";

/** Substrings matched case-insensitively against question + event title. */
export const DEFAULT_EXCLUDE_KEYWORDS = [
  // Weather and temperature markets, which resolve daily and rarely reward research.
  "weather",
  "temperature",
  "rainfall",
  "snowfall",
  "how much snow",
  "how much rain",
  // Intraday price ticks.
  "up or down",
  "higher or lower",
  // Social-media counting markets.
  "how many times",
  "how many tweets",
  "number of tweets",
  "tweet",
  "post on x ",
  "mentions",
  // Novelty markets.
  "what will trump say",
  "what will elon say",
  "say during",
  "wear",
];

/**
 * Parses the configured keyword list.
 *
 * An explicitly empty MARKET_EXCLUDE_KEYWORDS disables keyword filtering,
 * which is different from leaving it unset (use the defaults).
 */
export function parseExcludeKeywords(raw: string | undefined): string[] {
  if (raw === undefined) return DEFAULT_EXCLUDE_KEYWORDS;
  return raw
    .split(",")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the market matches any exclusion keyword. */
export function isNoisyMarket(market: Market, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const haystack = `${market.question} ${market.eventTitle ?? ""}`.toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

/** Splits a list into the markets to show and the count hidden. */
export function applyNoiseFilter(
  markets: Market[],
  keywords: string[],
): { kept: Market[]; hidden: number } {
  const kept = markets.filter((market) => !isNoisyMarket(market, keywords));
  return { kept, hidden: markets.length - kept.length };
}
