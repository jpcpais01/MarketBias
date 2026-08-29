"use client";

import { ProbabilityBar } from "@/components/ProbabilityBar";
import { Badge, Spinner } from "@/components/ui";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import type { Market } from "@/lib/types";
import { useClientNow } from "@/lib/useClientNow";

export function MarketCard({
  market,
  onResearch,
  isResearching,
  disabled,
  priorAnalyses = 0,
}: {
  market: Market;
  onResearch: (market: Market) => void;
  isResearching: boolean;
  disabled: boolean;
  /** Count of stored forecasts for this market, shown as a history hint. */
  priorAnalyses?: number;
}) {
  // Resolved after mount so the clock is never read during render.
  const now = useClientNow();
  const expired =
    now !== null && market.endDate ? new Date(market.endDate).getTime() < now : false;

  return (
    <article className="panel flex flex-col gap-4 p-5 transition hover:border-brand/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {market.eventTitle && market.eventTitle !== market.question ? (
            <p className="truncate text-xs text-ink-3">{market.eventTitle}</p>
          ) : null}
          <h3 className="mt-0.5 line-clamp-3 text-[0.95rem] font-medium leading-snug text-ink-0">
            {market.question}
          </h3>
        </div>
        {priorAnalyses > 0 ? (
          <Badge tone="ai" className="shrink-0">
            {priorAnalyses} forecast{priorAnalyses === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      {/* Gamma prices are 0-1 fractions; the bar takes percentages. */}
      <ProbabilityBar
        probability={market.yesProbability === null ? null : market.yesProbability * 100}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        <span title="Total traded volume">Vol {formatMoney(market.volume)}</span>
        <span title="Resting liquidity">Liq {formatMoney(market.liquidity)}</span>
        <span title={market.endDate ?? undefined}>
          {expired ? "Expired" : "Ends"} {formatDate(market.endDate)}
          {market.endDate && now !== null ? ` · ${formatRelative(market.endDate, now)}` : ""}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onResearch(market)}
          disabled={disabled}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-surface-0 transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isResearching ? (
            <>
              <Spinner /> Researching…
            </>
          ) : (
            "Research"
          )}
        </button>
        {market.url ? (
          <a
            href={market.url}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg border border-surface-3/70 px-3 py-2 text-sm text-ink-2 transition hover:bg-surface-2/70 hover:text-ink-0"
          >
            View ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}
