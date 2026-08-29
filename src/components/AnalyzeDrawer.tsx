"use client";

import { useEffect, useRef } from "react";

import { AnalysisResult } from "@/components/AnalysisResult";
import { ErrorState, Spinner } from "@/components/ui";
import type { Analysis, AnalysisStage, Market } from "@/lib/types";

/** Ordered pipeline shown to the user; mirrors the server's emitted stages. */
export const STAGE_SEQUENCE: { stage: AnalysisStage; label: string }[] = [
  { stage: "fetching-market", label: "Reading the market question and resolution rules" },
  { stage: "researching", label: "Researching evidence (market price hidden from the model)" },
  { stage: "estimating", label: "Forming an independent probability estimate" },
  { stage: "revealing-market-price", label: "Revealing the Polymarket price" },
  { stage: "reviewing", label: "Reviewing the discrepancy" },
  { stage: "saving", label: "Saving the timestamped forecast" },
];

export interface AnalyzeState {
  market: Market;
  stage: AnalysisStage | null;
  message: string;
  analysis: Analysis | null;
  error: string | null;
  done: boolean;
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close analysis"
        onClick={onClose}
        className="absolute inset-0 bg-surface-0/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Analysis of: ${state.market.question}`}
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-surface-3/70 bg-surface-1 shadow-2xl"
      >
        <header className="hairline flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-ink-3">
              {state.done && state.analysis ? "Analysis complete" : "Analyzing market"}
            </p>
            <h2 className="mt-1 text-base font-semibold leading-snug text-ink-0">
              {state.market.question}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-surface-3/70 px-3 py-1.5 text-sm text-ink-2 transition hover:bg-surface-2 hover:text-ink-0"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {state.error ? (
            <ErrorState title="Analysis failed" message={state.error} onRetry={onRetry} />
          ) : state.analysis ? (
            <AnalysisResult analysis={state.analysis} />
          ) : (
            <StageProgress activeIndex={activeIndex} message={state.message} />
          )}
        </div>
      </div>
    </div>
  );
}

function StageProgress({ activeIndex, message }: { activeIndex: number; message: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-surface-3/60">
        <span className="animate-sweep absolute inset-0" />
      </div>

      <ol className="flex flex-col gap-3">
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
                      : "bg-surface-2 text-ink-3"
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

      <p aria-live="polite" className="rounded-xl bg-surface-2/60 px-4 py-3 text-sm text-ink-2">
        {message || "Starting…"}
      </p>

      <p className="text-xs leading-relaxed text-ink-3">
        Research-grade forecasts take time — a full run typically needs 30–120 seconds because the
        model searches the web before committing to a number. Keep this panel open.
      </p>
    </div>
  );
}
