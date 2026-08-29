/**
 * Prompt construction for the two-stage forecasting workflow.
 *
 * Stage 1 is deliberately blind: the market's own probability is never included
 * in the stage-1 messages. Stage 2 reveals it and asks for a review that is
 * explicitly permitted — and encouraged — to disagree.
 */

import type { BlindForecast, Ensemble, Market } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "not published";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function daysUntil(iso: string | null): string {
  if (!iso) return "unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "already past";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Market context WITHOUT any pricing information.
 *
 * Every price-bearing field (probability, bid/ask, spread, price change) is
 * omitted here. Volume and liquidity are included because they describe market
 * size, not direction.
 */
function blindMarketContext(market: Market): string {
  const lines = [
    `QUESTION: ${market.question}`,
    market.eventTitle ? `EVENT: ${market.eventTitle}` : null,
    `RESOLUTION DATE: ${formatDate(market.endDate)} (in ${daysUntil(market.endDate)})`,
    `OUTCOMES: ${market.outcomes.join(" / ")}`,
    market.resolutionSource ? `RESOLUTION SOURCE: ${market.resolutionSource}` : null,
    "",
    "RESOLUTION CRITERIA / DESCRIPTION:",
    market.description.trim() || "(No description was published for this market.)",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

export const STAGE_ONE_SYSTEM = `You are a rigorous superforecaster producing a calibrated probability estimate for a binary question.

Your process, in order:
1. Read the resolution criteria carefully. The question resolves on the literal criteria, not on the vibe of the headline. Note any wording that makes YES harder or easier than it first appears (thresholds, deadlines, named sources, "officially announced" vs "reported", etc.).
2. Research the current state of the world using web search. Prioritise: the latest news (check dates — recency matters), primary sources (official statements, filings, government or organisation publications, direct data) over commentary, and any scheduled events between now and the resolution date.
3. Establish a base rate. How often do events of this reference class occur in this kind of time window? Start from that outside view before adjusting.
4. Build the case FOR yes and the case FOR no, honestly and separately. Do not build a strawman on either side.
5. List what you genuinely do not know, and what would most change your estimate.
6. Give a single probability from 0 to 100 that YES resolves.

Calibration rules:
- Anchor on base rates, then adjust for specific evidence. Do not let a vivid recent headline dominate a strong base rate.
- Avoid the 50% cop-out. If the evidence points somewhere, say so.
- Avoid false precision. Probabilities like 3, 12, 35, 60, 88 are fine; 37.4 is not.
- Reserve probabilities below 3 or above 97 for cases that are near-certain on the criteria as written.
- Short time horizons favour the status quo. Things that require many steps to happen, usually do not happen in time.

Critical constraint: you do NOT have access to any prediction-market price for this question, and you must not try to recall, infer, or guess what a market is pricing. Reason only from evidence about the world. If you happen to remember a market price, ignore it — an independent estimate is the entire point of this task.

Cite the sources you actually used, with working URLs.

Respond with a single JSON object and nothing else. No prose before or after, no markdown fences. Schema:
{
  "probability": <number 0-100, probability that YES resolves>,
  "confidence": "low" | "medium" | "high",
  "reasoning": "<2-5 sentences: the core of your judgement and how you got to this number>",
  "keyDrivers": ["<the specific factors this forecast hinges on>"],
  "baseRates": ["<reference classes and historical frequencies you anchored on>"],
  "evidenceFor": ["<concrete evidence supporting YES, each with what it is and why it matters>"],
  "evidenceAgainst": ["<concrete evidence supporting NO, same standard>"],
  "uncertainties": ["<what you don't know, and what would move your estimate most>"],
  "sources": [{"title": "<source name>", "url": "<url>", "note": "<what this source established>"}]
}

"confidence" describes how much evidence you have and how stable your estimate is — not how extreme the probability is.`;

export function buildStageOneUser(market: Market, now: Date): string {
  return `Today's date is ${now.toISOString().slice(0, 10)}. Research this question and produce your independent probability estimate.

${blindMarketContext(market)}

Search the web for current information before answering. Return only the JSON object.`;
}

export const STAGE_TWO_SYSTEM = `You are reviewing your own probability forecast after being shown, for the first time, the price of a prediction market on the same question.

The market price is information, not an authority. Prediction markets are often well calibrated, but they are also frequently wrong: they can be thin, stale, dominated by one large trader, distorted by fees or by the cost of capital on long-dated questions, or simply anchored on an old headline. Your independent estimate was made from primary evidence, which the market may not have priced in.

How to review:
- If you can name a specific piece of information the market plausibly has that you missed, or a specific error in your own reasoning, revise — and say exactly what changed your mind.
- If you cannot name one, do NOT revise. A disagreement you cannot explain away is a finding, not a mistake. Moving your number toward the market merely because it differs is the failure mode this review exists to prevent.
- Partial revision is allowed only for a stated reason, never as a compromise.
- Note especially whether the market's price could be explained by the resolution criteria being stricter or looser than the headline reading of the question.

Respond with a single JSON object and nothing else. No prose before or after, no markdown fences. Schema:
{
  "finalProbability": <number 0-100; repeat your original number unchanged if you are not revising>,
  "revised": <true only if finalProbability differs from your original estimate>,
  "explanation": "<2-4 sentences: why you revised, or why you are holding your estimate despite the gap>",
  "marketMayKnow": ["<specific things the market may be pricing that you did not account for; empty array if none>"],
  "forecastMayBeBetter": ["<specific reasons your independent estimate may be better calibrated here; empty array if none>"],
  "confidence": "low" | "medium" | "high"
}`;

export function buildStageTwoUser(
  market: Market,
  forecast: BlindForecast,
  polymarketProbability: number | null,
  ensemble?: Ensemble,
): string {
  const marketLine =
    polymarketProbability === null
      ? "The Polymarket price for this question is unavailable (the market has no published price right now)."
      : `The Polymarket price implies a ${polymarketProbability.toFixed(1)}% probability of YES.`;

  const gap =
    polymarketProbability === null
      ? ""
      : `\nThat is a gap of ${Math.abs(forecast.probability - polymarketProbability).toFixed(1)} percentage points ${
          forecast.probability > polymarketProbability ? "above" : "below"
        } your estimate.`;

  // With several runs, the spread between them is itself evidence about how
  // stable the estimate is, so the reviewer is told about it explicitly.
  const ensembleNote =
    ensemble && ensemble.completed > 1
      ? `
This estimate is the mean of ${ensemble.completed} independent forecasting runs of the same question, each made without sight of any market price.
Individual runs: ${ensemble.samples.map((sample) => `${sample.probability}%`).join(", ")}
Median ${ensemble.median}%, range ${ensemble.min}-${ensemble.max}%, standard deviation ${ensemble.stdDev} points.
A wide spread means the evidence supports a range of readings, so treat the mean as less firm. A tight spread means the runs converged independently, which makes an unexplained gap with the market more notable, not less.`
      : "";

  return `QUESTION: ${market.question}

YOUR INDEPENDENT ESTIMATE (made without seeing any market price): ${forecast.probability}%${ensembleNote}
Your confidence: ${forecast.confidence}
Your reasoning: ${forecast.reasoning}
Your key drivers: ${forecast.keyDrivers.join("; ") || "none recorded"}
Evidence you found for YES: ${forecast.evidenceFor.join("; ") || "none recorded"}
Evidence you found for NO: ${forecast.evidenceAgainst.join("; ") || "none recorded"}
Your stated uncertainties: ${forecast.uncertainties.join("; ") || "none recorded"}

MARKET DATA (revealed to you only now):
${marketLine}${gap}
Market volume: ${market.volume !== null ? `$${Math.round(market.volume).toLocaleString("en-US")}` : "unknown"}
Market liquidity: ${market.liquidity !== null ? `$${Math.round(market.liquidity).toLocaleString("en-US")}` : "unknown"}
${market.spread !== null ? `Bid/ask spread: ${(market.spread * 100).toFixed(1)} points` : ""}

Review your forecast. Return only the JSON object.`;
}
