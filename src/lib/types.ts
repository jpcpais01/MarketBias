/**
 * Shared domain types for TrueOdds.
 *
 * Everything the UI renders flows through these shapes, so the Polymarket
 * response format and the OpenRouter response format are both normalised at
 * their respective boundaries (see `polymarket.ts` and `analysis.ts`).
 */

/** A single binary (YES/NO) market, normalised from Polymarket's Gamma API. */
export interface Market {
  /** Gamma numeric market id, as a string. Stable primary key. */
  id: string;
  /** On-chain condition id, useful for cross-referencing the CLOB API. */
  conditionId: string | null;
  slug: string | null;
  question: string;
  /** Full description / resolution criteria text. May be empty. */
  description: string;
  /** Explicit resolution source, when the market defines one. */
  resolutionSource: string | null;
  /** ISO-8601 expiry, or null for markets without a published end date. */
  endDate: string | null;
  startDate: string | null;
  /** Total traded volume in USD. */
  volume: number | null;
  volume24hr: number | null;
  /** Resting liquidity in USD. */
  liquidity: number | null;
  /** Current YES probability in [0, 1], or null when no price is published. */
  yesProbability: number | null;
  /** Outcome labels as published, normally ["Yes", "No"]. */
  outcomes: string[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  /** 24h change in YES price, in probability points (not percentage points). */
  oneDayPriceChange: number | null;
  active: boolean;
  closed: boolean;
  image: string | null;
  icon: string | null;
  /** Title of the parent event, when the market belongs to one. */
  eventTitle: string | null;
  eventSlug: string | null;
  /** Canonical polymarket.com URL, best-effort. */
  url: string | null;
}

export interface MarketListResult {
  markets: Market[];
  /** Offset to pass back for the next page, or null when the page was short. */
  nextOffset: number | null;
}

export type Confidence = "low" | "medium" | "high";

export interface Source {
  title: string;
  url: string;
  /** Short note on what the source contributed, when the model provides one. */
  note?: string;
}

/** Stage 1: the blind forecast, produced without sight of the market price. */
export interface BlindForecast {
  probability: number; // 0-100
  confidence: Confidence;
  reasoning: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  uncertainties: string[];
  baseRates: string[];
  sources: Source[];
  keyDrivers: string[];
}

/** Stage 2: the review performed after the market price is revealed. */
export interface DiscrepancyReview {
  /** Final probability after review. Equals the blind estimate when unrevised. */
  finalProbability: number; // 0-100
  revised: boolean;
  /** Why the estimate moved, or why it deliberately did not. */
  explanation: string;
  /** Concrete hypotheses about what the market may be pricing in. */
  marketMayKnow: string[];
  /** Concrete reasons the independent estimate may be better calibrated. */
  forecastMayBeBetter: string[];
  confidence: Confidence;
}

export interface AnalysisRequestOptions {
  /** Overrides the model for a single run; defaults to OPENROUTER_MODEL. */
  model?: string;
}

/** A persisted, timestamped analysis. Records are append-only. */
export interface Analysis {
  id: string;
  createdAt: string; // ISO-8601
  marketId: string;
  marketQuestion: string;
  marketSlug: string | null;
  marketUrl: string | null;
  marketEndDate: string | null;
  /** Market YES probability at analysis time, 0-100. Snapshotted, never updated. */
  polymarketProbability: number | null;
  /** Blind estimate, before the market price was revealed, 0-100. */
  blindProbability: number;
  /** Post-review estimate, 0-100. This is the headline "AI probability". */
  aiProbability: number;
  /** aiProbability - polymarketProbability, in percentage points. */
  deviation: number | null;
  confidence: Confidence;
  reasoning: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  uncertainties: string[];
  baseRates: string[];
  keyDrivers: string[];
  sources: Source[];
  review: DiscrepancyReview;
  /** Model id actually used for the run. */
  model: string;
  webSearchEnabled: boolean;
  /** Wall-clock duration of the full workflow, in milliseconds. */
  durationMs: number;
}

/** Streaming progress events emitted by POST /api/analyze (NDJSON). */
export type AnalysisStage =
  | "fetching-market"
  | "researching"
  | "estimating"
  | "revealing-market-price"
  | "reviewing"
  | "saving";

export type AnalysisEvent =
  | { type: "stage"; stage: AnalysisStage; message: string }
  | { type: "result"; analysis: Analysis }
  | { type: "error"; message: string };
