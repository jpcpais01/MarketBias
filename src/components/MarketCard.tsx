"use client";

import { Badge, Spinner } from "@/components/ui";
import { formatDate, formatMoney, formatPercent, formatRelative } from "@/lib/format";
import type { Market } from "@/lib/types";
import { useClientNow } from "@/lib/useClientNow";

/**
 * A single market in the browse grid.
 *
 * `min-w-0` is load-bearing: as a grid child this element would otherwise size
 * to its longest unbreakable string (market questions carry things like
 * `BTC/USD-PERPETUAL-2026-12-31`) and push the whole page wider than the phone.
 */
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

  const percent = market.yesProbability === null ? null : market.yesProbability * 100;
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));

  return (
    <article className="group panel flex min-w-0 flex-col gap-4 p-4 transition hover:border-brand/40 sm:p-5">
      <header className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          {market.eventTitle && market.eventTitle !== market.question ? (
            <p className="truncate text-[0.7rem] uppercase tracking-wide text-ink-3">
              {market.eventTitle}
            </p>
          ) : null}
          <h3 className="mt-1 line-clamp-3 text-[0.95rem] font-medium leading-snug text-ink-0">
            {market.question}
          </h3>
        </div>
        {priorAnalyses > 0 ? (
          <Badge tone="ai" className="shrink-0">
            {priorAnalyses}
            <span className="sr-only"> saved forecasts</span>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-3">
              <path
                d="M4 17V9M9.5 17V5M15 17v-6M20.5 17v-3"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </Badge>
        ) : null}
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <span className="text-[0.7rem] uppercase tracking-wide text-ink-3">Market YES</span>
          <span className="font-mono text-2xl font-semibold leading-none text-yes tabular-nums">
            {formatPercent(percent)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3/60">
          <div
            className="h-full rounded-full bg-yes transition-[width] duration-500"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <span title="Total traded volume">{formatMoney(market.volume)} vol</span>
        <span aria-hidden className="text-surface-3">
          ·
        </span>
        <span title={market.endDate ?? undefined} className="min-w-0 truncate">
          {expired ? "Expired" : "Ends"}{" "}
          {market.endDate && now !== null ? formatRelative(market.endDate, now) : formatDate(market.endDate)}
        </span>
      </div>

      <div className="mt-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => onResearch(market)}
          disabled={disabled}
          className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-surface-0 transition hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
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
            aria-label="Open this market on Polymarket"
            title="Open on Polymarket"
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-surface-3/70 text-ink-3 transition hover:bg-surface-2/70 hover:text-ink-0 sm:size-11"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-[18px]">
              <path
                d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        ) : null}
      </div>
    </article>
  );
}
