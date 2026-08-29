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
  /** Markets withheld by the noise filter on this page. */
  hidden?: number;
}

export type Confidence = "low" | "medium" | "high";

export interface Source {
  title: string;
  url: string;
  /** Short note on what the source contributed, when the model provides one. */
  note?: string;
}

/**
 * Stage 1a: the shared evidence base.
 *
 * Gathered once per analysis with web search, then handed to every estimate
 * run. Deliberately carries no probability — a number here would anchor every
 * run to the same value and destroy the point of sampling.
 */
export interface ResearchBrief {
  summary: string;
  keyDrivers: string[];
  baseRates: string[];
  evidenceFor: string[];
  evidenceAgainst: string[];
  uncertainties: string[];
  sources: Source[];
  /** Wording in the resolution criteria that changes how the question resolves. */
  criteriaNotes: string[];
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
  /** Number of independent blind forecasts to run in parallel and average. */
  runs?: number;
}

/** One completed blind forecast within an ensemble. */
export interface EnsembleSample {
  index: number;
  probability: number; // 0-100
  confidence: Confidence;
  reasoning: string;
}

/**
 * Spread statistics across the parallel blind forecasts.
 *
 * `stdDev` is the honest headline here: it measures how much the model
 * disagrees with itself, which is a different thing from the confidence the
 * model reports about the world.
 */
export interface Ensemble {
  /** Runs requested by the caller. */
  requested: number;
  /**
   * True when every run judged the same shared research brief.
   *
   * The spread then measures variance in judgement given fixed evidence, not
   * variance in what the runs found — a narrower claim, and the UI says so.
   */
  sharedResearch?: boolean;
  /** Runs that returned a usable forecast. */
  completed: number;
  /** Runs that errored; the analysis proceeds on the survivors. */
  failed: number;
  samples: EnsembleSample[];
  mean: number;
  median: number;
  /** Population standard deviation of the sample probabilities. */
  stdDev: number;
  min: number;
  max: number;
  /** Index of the sample nearest the mean, whose reasoning is shown. */
  representativeIndex: number;
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
  /**
   * Blind estimate, before the market price was revealed, 0-100.
   * With multiple runs this is the mean across the ensemble.
   */
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
  /**
   * Spread across the parallel blind forecasts. Optional so that records
   * written before ensembles existed still load.
   */
  ensemble?: Ensemble;
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
  /**
   * Sites a completed run consulted. Emitted per run: OpenRouter returns its
   * citations with the finished completion, so these arrive as each parallel
   * forecast lands rather than at the moment a page is fetched.
   */
  | { type: "sources"; runIndex: number; sources: Source[] }
  /** Emitted as each parallel forecast lands, for live ensemble progress. */
  | {
      type: "sample";
      completed: number;
      failed: number;
      total: number;
      probability: number | null;
    }
  | { type: "result"; analysis: Analysis }
  | { type: "error"; message: string };
