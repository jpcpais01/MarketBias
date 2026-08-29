/**
 * The TrueOdds forecasting workflow.
 *
 * Stage 1  — research + independent estimate, with the Polymarket price
 *            withheld from the model entirely.
 * Stage 2  — the price is revealed and the model reviews its own forecast,
 *            under instructions that explicitly discourage conformity.
 *
 * The result is a timestamped, append-only `Analysis` record.
 */

import "server-only";

import { randomUUID } from "node:crypto";

import { config } from "@/lib/env";
import { chat, parseJsonObject } from "@/lib/openrouter";
import {
  ESTIMATE_SYSTEM,
  RESEARCH_SYSTEM,
  STAGE_TWO_SYSTEM,
  buildEstimateUser,
  buildResearchUser,
  buildStageTwoUser,
} from "@/lib/prompts";
import { getStore } from "@/lib/store";
import type {
  Analysis,
  AnalysisEvent,
  BlindForecast,
  Confidence,
  DiscrepancyReview,
  Ensemble,
  EnsembleSample,
  Market,
  ResearchBrief,
  Source,
} from "@/lib/types";

export class AnalysisError extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "AnalysisError";
    this.status = status;
  }
}

/* ------------------------------- coercion -------------------------------- */

function coerceProbability(value: unknown, field: string): number {
  let numeric: number | null = null;
  if (typeof value === "number") numeric = value;
  else if (typeof value === "string") {
    const parsed = Number(value.replace(/[%\s]/g, ""));
    if (Number.isFinite(parsed)) numeric = parsed;
  }

  if (numeric === null || !Number.isFinite(numeric)) {
    throw new AnalysisError(`The model did not return a usable "${field}" value.`, 502);
  }
  // Tolerate a model that answers in 0-1 rather than 0-100.
  if (numeric > 0 && numeric <= 1) numeric *= 100;
  return Math.min(100, Math.max(0, Math.round(numeric * 10) / 10));
}

function coerceConfidence(value: unknown): Confidence {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("high")) return "high";
  if (text.includes("low")) return "low";
  return "medium";
}

function coerceStringList(value: unknown, limit = 12): string[] {
  const items: string[] = [];

  const push = (entry: unknown) => {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) items.push(trimmed);
    } else if (entry && typeof entry === "object") {
      // Models sometimes emit [{point: "..."}] instead of a string array.
      const record = entry as Record<string, unknown>;
      const candidate = record.text ?? record.point ?? record.evidence ?? record.description;
      if (typeof candidate === "string" && candidate.trim()) items.push(candidate.trim());
    }
  };

  if (Array.isArray(value)) value.forEach(push);
  else push(value);

  return items.slice(0, limit);
}

function coerceText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const joined = value.filter((v) => typeof v === "string").join(" ").trim();
    if (joined) return joined;
  }
  return fallback;
}

function coerceSources(value: unknown, limit = 20): Source[] {
  if (!Array.isArray(value)) return [];

  const sources: Source[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      if (/^https?:\/\//i.test(entry.trim())) sources.push({ title: entry.trim(), url: entry.trim() });
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) continue;

    sources.push({
      title: coerceText(record.title, url),
      url,
      note: coerceText(record.note ?? record.summary) || undefined,
    });
    if (sources.length >= limit) break;
  }
  return sources;
}

function mergeSources(...groups: Source[][]): Source[] {
  const merged: Source[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const source of group) {
      const key = source.url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(source);
    }
  }
  return merged;
}


/* ------------------------------- ensemble -------------------------------- */

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function stdDev(values: number[], average: number): number {
  if (values.length < 2) return 0;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return Math.sqrt(variance);
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Most frequent confidence across the ensemble; ties resolve to the lower one. */
function modalConfidence(values: Confidence[]): Confidence {
  const order: Confidence[] = ["low", "medium", "high"];
  const counts = new Map<Confidence, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  let best: Confidence = "medium";
  let bestCount = -1;
  for (const candidate of order) {
    const count = counts.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Merges the ensemble's blind forecasts into one.
 *
 * Numbers are averaged; evidence, uncertainties and sources are unioned so a
 * point raised by any single run survives into the output. The narrative
 * fields come from the run nearest the mean rather than being stitched
 * together, so the reasoning stays internally consistent with its number.
 */
function aggregate(forecasts: BlindForecast[], requested: number, failed: number) {
  const probabilities = forecasts.map((f) => f.probability);
  const average = mean(probabilities);

  // The run closest to the mean speaks for the ensemble.
  let representativeIndex = 0;
  let smallestGap = Number.POSITIVE_INFINITY;
  forecasts.forEach((forecast, index) => {
    const gap = Math.abs(forecast.probability - average);
    if (gap < smallestGap) {
      smallestGap = gap;
      representativeIndex = index;
    }
  });

  const representative = forecasts[representativeIndex];

  const samples: EnsembleSample[] = forecasts.map((forecast, index) => ({
    index,
    probability: forecast.probability,
    confidence: forecast.confidence,
    reasoning: forecast.reasoning,
  }));

  const ensemble: Ensemble = {
    requested,
    completed: forecasts.length,
    failed,
    samples,
    mean: round1(average),
    median: round1(median(probabilities)),
    stdDev: round1(stdDev(probabilities, average)),
    min: Math.min(...probabilities),
    max: Math.max(...probabilities),
    representativeIndex,
  };

  const merged: BlindForecast = {
    probability: round1(average),
    confidence: modalConfidence(forecasts.map((f) => f.confidence)),
    reasoning: representative.reasoning,
    keyDrivers: unionStrings(forecasts.map((f) => f.keyDrivers)),
    baseRates: unionStrings(forecasts.map((f) => f.baseRates)),
    evidenceFor: unionStrings(forecasts.map((f) => f.evidenceFor)),
    evidenceAgainst: unionStrings(forecasts.map((f) => f.evidenceAgainst)),
    uncertainties: unionStrings(forecasts.map((f) => f.uncertainties)),
    sources: mergeSources(...forecasts.map((f) => f.sources)),
  };

  return { merged, ensemble };
}

/** Union of string lists, case-insensitively de-duplicated, order preserved. */
function unionStrings(groups: string[][], limit = 16): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  // Round-robin across runs so no single run's list crowds out the others.
  const depth = Math.max(0, ...groups.map((group) => group.length));
  for (let position = 0; position < depth; position += 1) {
    for (const group of groups) {
      const item = group[position];
      if (!item) continue;
      const key = item.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

/**
 * Runs `count` blind forecasts in parallel and aggregates them.
 *
 * Individual failures are tolerated: the analysis proceeds on whatever
 * returned, and only a total wipeout throws. Each run is an independent
 * request, so the model cannot see its other attempts.
 */
async function runEstimateEnsemble(
  market: Market,
  brief: ResearchBrief,
  model: string,
  count: number,
  onSample: (completed: number, failed: number, probability: number | null) => void,
) {
  let completed = 0;
  let failed = 0;

  const settled = await Promise.allSettled(
    Array.from({ length: count }, async () => {
      const forecast = await runEstimate(market, brief, model);
      completed += 1;
      onSample(completed, failed, forecast.probability);
      return forecast;
    }).map((promise) =>
      promise.catch((error: unknown) => {
        failed += 1;
        onSample(completed, failed, null);
        throw error;
      }),
    ),
  );

  const forecasts = settled
    .filter((result): result is PromiseFulfilledResult<BlindForecast> => result.status === "fulfilled")
    .map((result) => result.value);

  if (forecasts.length === 0) {
    const firstRejection = settled.find((result) => result.status === "rejected");
    const reason = firstRejection?.status === "rejected" ? firstRejection.reason : null;
    if (reason instanceof Error) throw reason;
    throw new AnalysisError("Every forecasting run failed.", 502);
  }

  return aggregate(forecasts, count, failed);
}

/* ------------------------------- stages ---------------------------------- */

/**
 * Gathers the shared evidence base with one web-search call.
 *
 * Doing this once, rather than once per run, is what makes multi-run analysis
 * fast and affordable: the slow, expensive part of the workflow happens a
 * single time and every estimate then judges the same material.
 */
async function runResearch(market: Market, model: string): Promise<ResearchBrief> {
  const result = await chat({
    model,
    webSearch: config.openRouter.webSearch,
    temperature: config.openRouter.researchTemperature,
    json: true,
    messages: [
      { role: "system", content: RESEARCH_SYSTEM },
      { role: "user", content: buildResearchUser(market, new Date()) },
    ],
  });

  const parsed = parseJsonObject(result.content);

  return {
    summary: coerceText(parsed.summary, "The model did not return a research summary."),
    criteriaNotes: coerceStringList(parsed.criteriaNotes),
    keyDrivers: coerceStringList(parsed.keyDrivers),
    baseRates: coerceStringList(parsed.baseRates),
    evidenceFor: coerceStringList(parsed.evidenceFor),
    evidenceAgainst: coerceStringList(parsed.evidenceAgainst),
    uncertainties: coerceStringList(parsed.uncertainties),
    // Model-cited sources first, then any the web plugin attached.
    sources: mergeSources(coerceSources(parsed.sources), result.citations),
  };
}

/**
 * One independent judgement of the shared brief.
 *
 * Each call is a separate request with no shared conversation, so runs cannot
 * see one another. Web search is off here — the evidence is already gathered.
 */
async function runEstimate(
  market: Market,
  brief: ResearchBrief,
  model: string,
): Promise<BlindForecast> {
  const result = await chat({
    model,
    webSearch: false,
    temperature: config.openRouter.estimateTemperature,
    json: true,
    messages: [
      { role: "system", content: ESTIMATE_SYSTEM },
      { role: "user", content: buildEstimateUser(market, brief, new Date()) },
    ],
  });

  const parsed = parseJsonObject(result.content);

  return {
    probability: coerceProbability(parsed.probability, "probability"),
    confidence: coerceConfidence(parsed.confidence),
    reasoning: coerceText(parsed.reasoning, "The model did not provide a reasoning summary."),
    // Evidence fields come from the shared brief, carried through unchanged.
    evidenceFor: brief.evidenceFor,
    evidenceAgainst: brief.evidenceAgainst,
    uncertainties: brief.uncertainties,
    baseRates: brief.baseRates,
    keyDrivers: brief.keyDrivers,
    sources: brief.sources,
  };
}

async function runDiscrepancyReview(
  market: Market,
  forecast: BlindForecast,
  polymarketProbability: number | null,
  model: string,
  ensemble?: Ensemble,
): Promise<DiscrepancyReview> {
  const result = await chat({
    model,
    // No web search here: this stage reasons over evidence already gathered.
    webSearch: false,
    temperature: 0.2,
    json: true,
    messages: [
      { role: "system", content: STAGE_TWO_SYSTEM },
      { role: "user", content: buildStageTwoUser(market, forecast, polymarketProbability, ensemble) },
    ],
  });

  const parsed = parseJsonObject(result.content);
  const finalProbability = coerceProbability(parsed.finalProbability, "finalProbability");

  return {
    finalProbability,
    // Trust the numbers over the model's own `revised` flag.
    revised: Math.abs(finalProbability - forecast.probability) >= 0.05,
    explanation: coerceText(parsed.explanation, "The model did not explain its review."),
    marketMayKnow: coerceStringList(parsed.marketMayKnow),
    forecastMayBeBetter: coerceStringList(parsed.forecastMayBeBetter),
    confidence: coerceConfidence(parsed.confidence ?? forecast.confidence),
  };
}

/* ------------------------------ orchestration ---------------------------- */

export interface RunAnalysisOptions {
  market: Market;
  model?: string;
  /** Parallel blind forecasts to average. Defaults to ANALYSIS_SAMPLE_RUNS. */
  runs?: number;
  /** Called as each stage begins, for streaming progress to the client. */
  onEvent?: (event: AnalysisEvent) => void;
}

/** Clamps a requested run count to the configured ceiling. */
export function resolveRunCount(requested?: number): number {
  const fallback = config.analysis.sampleRuns;
  if (requested === undefined || !Number.isFinite(requested)) return clampRuns(fallback);
  return clampRuns(Math.floor(requested));
}

function clampRuns(value: number): number {
  return Math.min(Math.max(value, 1), Math.max(config.analysis.maxSampleRuns, 1));
}

/**
 * Runs the full workflow and persists the result.
 *
 * The returned record is always new: `save` appends, so re-analysing a market
 * adds a forecast to its history instead of replacing the previous one.
 */
export async function runAnalysis({
  market,
  model,
  runs,
  onEvent,
}: RunAnalysisOptions): Promise<Analysis> {
  const startedAt = Date.now();
  const resolvedModel = model?.trim() || config.openRouter.model;
  const runCount = resolveRunCount(runs);
  const emit = (event: AnalysisEvent) => onEvent?.(event);

  // Snapshotted here so the comparison is against the price at analysis time.
  const polymarketProbability =
    market.yesProbability === null ? null : Math.round(market.yesProbability * 1000) / 10;

  emit({
    type: "stage",
    stage: "researching",
    message: config.openRouter.webSearch
      ? "Searching the web for current information, primary sources and base rates…"
      : "Assembling evidence from the model's own knowledge (web search is disabled)…",
  });

  // One research pass, shared by every estimate run.
  const brief = await runResearch(market, resolvedModel);

  if (brief.sources.length > 0) {
    emit({ type: "sources", runIndex: 0, sources: brief.sources });
  }

  emit({
    type: "stage",
    stage: "estimating",
    message:
      runCount === 1
        ? "Judging the evidence and committing to a probability…"
        : `Judging the same evidence ${runCount} times independently…`,
  });

  const { merged: forecast, ensemble: baseEnsemble } = await runEstimateEnsemble(
    market,
    brief,
    resolvedModel,
    runCount,
    (completed, failed, probability) =>
      emit({ type: "sample", completed, failed, total: runCount, probability }),
  );

  const ensemble = { ...baseEnsemble, sharedResearch: true };

  emit({
    type: "stage",
    stage: "revealing-market-price",
    message:
      polymarketProbability === null
        ? "No Polymarket price available to reveal."
        : `Revealing the Polymarket price (${polymarketProbability}%) for review…`,
  });

  emit({ type: "stage", stage: "reviewing", message: "Reviewing the discrepancy…" });

  const review = await runDiscrepancyReview(
    market,
    forecast,
    polymarketProbability,
    resolvedModel,
    ensemble,
  );

  const aiProbability = review.finalProbability;

  const analysis: Analysis = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    marketId: market.id,
    marketQuestion: market.question,
    marketSlug: market.slug,
    marketUrl: market.url,
    marketEndDate: market.endDate,
    polymarketProbability,
    blindProbability: forecast.probability,
    aiProbability,
    deviation:
      polymarketProbability === null
        ? null
        : Math.round((aiProbability - polymarketProbability) * 10) / 10,
    confidence: review.confidence,
    reasoning: forecast.reasoning,
    evidenceFor: forecast.evidenceFor,
    evidenceAgainst: forecast.evidenceAgainst,
    uncertainties: forecast.uncertainties,
    baseRates: forecast.baseRates,
    keyDrivers: forecast.keyDrivers,
    sources: forecast.sources,
    review,
    model: resolvedModel,
    webSearchEnabled: config.openRouter.webSearch,
    ensemble,
    durationMs: Date.now() - startedAt,
  };

  emit({ type: "stage", stage: "saving", message: "Saving this forecast to the history…" });

  try {
    await getStore().save(analysis);
  } catch (error) {
    // A storage failure must not discard a completed forecast — return it and
    // let the client render it, with the failure logged server-side.
    console.error("Failed to persist analysis", error);
  }

  return analysis;
}
