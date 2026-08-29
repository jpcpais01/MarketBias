"use client";

import { useEffect, useRef } from "react";

import { AnalysisResult } from "@/components/AnalysisResult";
import { ErrorState, Spinner } from "@/components/ui";
import { hostnameOf } from "@/lib/format";
import type { Analysis, AnalysisStage, Market, Source } from "@/lib/types";

/** Ordered pipeline shown to the user; mirrors the server's emitted stages. */
export const STAGE_SEQUENCE: { stage: AnalysisStage; label: string }[] = [
  { stage: "fetching-market", label: "Reading the question and rules" },
  { stage: "researching", label: "Researching (price hidden)" },
  { stage: "estimating", label: "Averaging the estimates" },
  { stage: "revealing-market-price", label: "Revealing the market price" },
  { stage: "reviewing", label: "Reviewing the discrepancy" },
  { stage: "saving", label: "Saving the forecast" },
];

export interface AnalyzeState {
  market: Market;
  stage: AnalysisStage | null;
  message: string;
  analysis: Analysis | null;
  error: string | null;
  done: boolean;
  /** Live ensemble progress while the parallel forecasts are in flight. */
  runs: number;
  completed: number;
  failed: number;
  /** Probabilities of the runs that have landed so far. */
  landed: number[];
  /** Sites consulted so far, de-duplicated across runs. */
  sources: Source[];
}

export function AnalyzeDrawer({
  state,
  onClose,
  onRetry,
}: {
  state: AnalyzeState;
  onClose: () => void;
  onRetry: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // Prevent the page behind the drawer from scrolling on mobile.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const activeIndex = state.stage
    ? STAGE_SEQUENCE.findIndex((entry) => entry.stage === state.stage)
    : -1;

  return (
    // Bottom sheet on phones, right-hand side panel from `sm` upwards.
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <button
        type="button"
        aria-label="Close research panel"
        onClick={onClose}
        className="absolute inset-0 bg-surface-0/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Research on: ${state.market.question}`}
        className="glass-blur backdrop-blur-xl backdrop-saturate-150 animate-sheet relative flex h-[92dvh] w-full flex-col rounded-t-3xl border-t border-white/[0.12] shadow-2xl sm:h-full sm:max-w-2xl sm:rounded-none sm:border-l sm:border-t-0"
      >
        {/* Grab-handle affordance; the sheet is tap-to-dismiss, not draggable. */}
        <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/25 sm:hidden" />

        <header className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-ink-3">
              {state.done && state.analysis
                ? "Research complete"
                : state.runs > 1
                  ? `Researching · ${state.runs} parallel forecasts`
                  : "Researching market"}
            </p>
            <h2 className="mt-1 line-clamp-2 break-words text-[0.95rem] font-semibold leading-snug text-ink-0 sm:line-clamp-3 sm:text-base">
              {state.market.question}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-ink-2 transition hover:bg-white/[0.1] hover:text-ink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
              <path
                d="m7 7 10 10M17 7 7 17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="safe-bottom flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          {state.error ? (
            <ErrorState title="Research failed" message={state.error} onRetry={onRetry} />
          ) : state.analysis ? (
            <AnalysisResult analysis={state.analysis} />
          ) : (
            <StageProgress activeIndex={activeIndex} message={state.message} state={state} />
          )}
        </div>
      </div>
    </div>
  );
}

function StageProgress({
  activeIndex,
  message,
  state,
}: {
  activeIndex: number;
  message: string;
  state: AnalyzeState;
}) {
  const settled = state.completed + state.failed;

  return (
    <div className="flex flex-col gap-6">
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-3/60">
        <span className="animate-sweep absolute inset-0" />
      </div>

      <ol className="flex flex-col gap-2.5">
        {STAGE_SEQUENCE.map((entry, index) => {
          const isDone = activeIndex > index;
          const isActive = activeIndex === index;

          return (
            <li key={entry.stage} className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                  isDone
                    ? "bg-yes/20 text-yes"
                    : isActive
                      ? "bg-brand/20 text-brand"
                      : "bg-white/[0.06] text-ink-3"
                }`}
              >
                {isDone ? "✓" : isActive ? <Spinner className="size-3" /> : index + 1}
              </span>
              <span
                className={`text-sm leading-snug ${
                  isDone ? "text-ink-2" : isActive ? "font-medium text-ink-0" : "text-ink-3"
                }`}
              >
                {entry.label}
              </span>
            </li>
          );
        })}
      </ol>

      {state.runs > 1 && settled > 0 ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-ink-3">
              {settled} of {state.runs} forecasts returned
              {state.failed > 0 ? ` · ${state.failed} failed` : ""}
            </span>
            <span className="shrink-0 font-mono text-ink-1 tabular-nums">
              {state.landed.map((value) => `${value}%`).join(" ")}
            </span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: state.runs }).map((_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  index < settled ? "bg-ai" : "bg-white/[0.1]"
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {state.sources.length > 0 ? <ResearchSources sources={state.sources} /> : null}

      <p aria-live="polite" className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-sm text-ink-2">
        {message || "Starting…"}
      </p>

      <p className="text-xs leading-relaxed text-ink-3">
        Each run takes 30–120 seconds — the model searches the web before committing to a number.
        Parallel runs happen at once. Keep this panel open.
      </p>
    </div>
  );
}

/**
 * Sites the forecaster consulted, shown while the run is still in progress.
 *
 * OpenRouter reports citations with the finished completion rather than at
 * fetch time, so this list fills in a run at a time rather than page by page.
 */
function ResearchSources({ sources }: { sources: Source[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
        Sites consulted ({sources.length})
      </h3>
      <ul className="flex flex-col gap-1.5">
        {sources.map((source) => (
          <li key={source.url} className="min-w-0">
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex min-w-0 items-baseline gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.06]"
            >
              <span className="shrink-0 font-mono text-[0.7rem] text-brand">
                {hostnameOf(source.url)}
              </span>
              <span className="min-w-0 truncate text-xs text-ink-2">{source.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
