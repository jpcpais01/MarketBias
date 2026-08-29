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
  STAGE_ONE_SYSTEM,
  STAGE_TWO_SYSTEM,
  buildStageOneUser,
  buildStageTwoUser,
} from "@/lib/prompts";
import { getStore } from "@/lib/store";
import type {
  Analysis,
  AnalysisEvent,
  BlindForecast,
  Confidence,
  DiscrepancyReview,
  Market,
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

/* ------------------------------- stages ---------------------------------- */

async function runBlindForecast(market: Market, model: string): Promise<BlindForecast> {
  const result = await chat({
    model,
    webSearch: config.openRouter.webSearch,
    temperature: 0.2,
    json: true,
    messages: [
      { role: "system", content: STAGE_ONE_SYSTEM },
      { role: "user", content: buildStageOneUser(market, new Date()) },
    ],
  });

  const parsed = parseJsonObject(result.content);

  return {
    probability: coerceProbability(parsed.probability, "probability"),
    confidence: coerceConfidence(parsed.confidence),
    reasoning: coerceText(parsed.reasoning, "The model did not provide a reasoning summary."),
    evidenceFor: coerceStringList(parsed.evidenceFor),
    evidenceAgainst: coerceStringList(parsed.evidenceAgainst),
    uncertainties: coerceStringList(parsed.uncertainties),
    baseRates: coerceStringList(parsed.baseRates),
    keyDrivers: coerceStringList(parsed.keyDrivers),
    // Model-cited sources first, then any the web plugin attached.
    sources: mergeSources(coerceSources(parsed.sources), result.citations),
  };
}

async function runDiscrepancyReview(
  market: Market,
  forecast: BlindForecast,
  polymarketProbability: number | null,
  model: string,
): Promise<DiscrepancyReview> {
  const result = await chat({
    model,
    // No web search here: this stage reasons over evidence already gathered.
    webSearch: false,
    temperature: 0.2,
    json: true,
    messages: [
      { role: "system", content: STAGE_TWO_SYSTEM },
      { role: "user", content: buildStageTwoUser(market, forecast, polymarketProbability) },
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
  /** Called as each stage begins, for streaming progress to the client. */
  onEvent?: (event: AnalysisEvent) => void;
}

/**
 * Runs the full workflow and persists the result.
 *
 * The returned record is always new: `save` appends, so re-analysing a market
 * adds a forecast to its history instead of replacing the previous one.
 */
export async function runAnalysis({ market, model, onEvent }: RunAnalysisOptions): Promise<Analysis> {
  const startedAt = Date.now();
  const resolvedModel = model?.trim() || config.openRouter.model;
  const emit = (event: AnalysisEvent) => onEvent?.(event);

  // Snapshotted here so the comparison is against the price at analysis time.
  const polymarketProbability =
    market.yesProbability === null ? null : Math.round(market.yesProbability * 1000) / 10;

  emit({
    type: "stage",
    stage: "researching",
    message: config.openRouter.webSearch
      ? "Researching current information, primary sources and base rates…"
      : "Reasoning from the model's own knowledge (web search is disabled)…",
  });

  const forecast = await runBlindForecast(market, resolvedModel);

  emit({
    type: "stage",
    stage: "estimating",
    message: `Independent estimate formed: ${forecast.probability}% (market price still hidden).`,
  });

  emit({
    type: "stage",
    stage: "revealing-market-price",
    message:
      polymarketProbability === null
        ? "No Polymarket price available to reveal."
        : `Revealing the Polymarket price (${polymarketProbability}%) for review…`,
  });

  emit({ type: "stage", stage: "reviewing", message: "Reviewing the discrepancy…" });

  const review = await runDiscrepancyReview(market, forecast, polymarketProbability, resolvedModel);

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
