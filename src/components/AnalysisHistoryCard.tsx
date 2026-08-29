"use client";

import { useState } from "react";

import { AnalysisResult } from "@/components/AnalysisResult";
import { Badge } from "@/components/ui";
import { deviationBand, formatDateTime, formatPercent, formatSignedPoints } from "@/lib/format";
import type { Analysis } from "@/lib/types";

/** Collapsed history row that expands into the full analysis. */
export function AnalysisHistoryCard({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState(false);
  const band = deviationBand(analysis.deviation);

  const bandTone = band === "aligned" ? "neutral" : band === "moderate" ? "warn" : "no";

  return (
    <article className="glass min-w-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-white/[0.04] sm:gap-4 sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-3">{formatDateTime(analysis.createdAt)}</p>
          <h3 className="mt-1 text-[0.95rem] font-medium leading-snug text-ink-0 sm:text-sm">
            {analysis.marketQuestion}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Badge tone="yes">Market {formatPercent(analysis.polymarketProbability)}</Badge>
            <Badge tone="ai">AI {formatPercent(analysis.aiProbability)}</Badge>
            <Badge tone={bandTone}>{formatSignedPoints(analysis.deviation)}</Badge>
            <Badge tone="neutral">{analysis.confidence} confidence</Badge>
          </div>
        </div>
        <span aria-hidden className={`mt-1 shrink-0 text-ink-3 transition ${open ? "rotate-180" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" className="size-5">
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="border-t border-white/[0.08] px-4 py-5 sm:px-5">
          <AnalysisResult analysis={analysis} />
          {analysis.marketUrl ? (
            <a
              href={analysis.marketUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-block text-sm font-medium text-brand hover:underline"
            >
              Open on Polymarket ↗
            </a>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
