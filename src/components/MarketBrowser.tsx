"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnalyzeDrawer, type AnalyzeState } from "@/components/AnalyzeDrawer";
import { MarketCard } from "@/components/MarketCard";
import { EmptyState, ErrorState, SkeletonCard, Spinner } from "@/components/ui";
import { streamAnalysis } from "@/lib/stream";
import type { Analysis, Market, MarketListResult } from "@/lib/types";

const PAGE_SIZE = 24;

type SortKey = "volume24hr" | "volume" | "liquidity" | "endDate";

// Labels stay short so they are not truncated inside a narrow native select.
const SORTS: { key: SortKey; label: string; ascending: boolean }[] = [
  { key: "volume24hr", label: "Hot 24h", ascending: false },
  { key: "volume", label: "Top volume", ascending: false },
  { key: "liquidity", label: "Liquidity", ascending: false },
  { key: "endDate", label: "Ending soon", ascending: true },
];

/**
 * A completed listing. `key` records the query+sort it was fetched for, so
 * "loading" is derived by comparing it against the current key — no state has
 * to be set at the start of an effect just to show a spinner.
 */
interface Listing {
  key: string;
  markets: Market[];
  nextOffset: number | null;
  error: string | null;
  /** Markets withheld by the noise filter, for the "show all" affordance. */
  hidden: number;
}

async function fetchMarkets(
  query: string,
  sort: SortKey,
  offset: number,
  includeNoisy: boolean,
): Promise<MarketListResult> {
  const sortConfig = SORTS.find((s) => s.key === sort) ?? SORTS[0];
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    order: sortConfig.key,
    ascending: String(sortConfig.ascending),
  });
  if (query) params.set("q", query);
  if (includeNoisy) params.set("includeNoisy", "true");

  const response = await fetch(`/api/markets?${params}`, { cache: "no-store" });
  const payload = (await response.json()) as MarketListResult & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`);
  return payload;
}

/** Parallel-run choices offered in the UI, capped by the server's ceiling. */
const RUN_CHOICES = [1, 3, 5];

export function MarketBrowser({
  recentAnalyses,
  defaultRuns,
  maxRuns,
  noiseFilterActive,
}: {
  recentAnalyses: Analysis[];
  /** Server default from ANALYSIS_SAMPLE_RUNS. */
  defaultRuns: number;
  /** Server ceiling from ANALYSIS_MAX_SAMPLE_RUNS. */
  maxRuns: number;
  /** Whether MARKET_FILTER_NOISE is on, so the toggle is worth showing. */
  noiseFilterActive: boolean;
}) {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("volume24hr");
  const [runs, setRuns] = useState<number>(defaultRuns);
  const [includeNoisy, setIncludeNoisy] = useState(false);
  // Bumped to force a refetch of the current key (the retry button).
  const [reloadToken, setReloadToken] = useState(0);

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  const [analyze, setAnalyze] = useState<AnalyzeState | null>(null);
  // Forecast counts start from the server-rendered history and grow as runs finish.
  const [analysisCounts, setAnalysisCounts] = useState<Record<string, number>>(() =>
    countByMarket(recentAnalyses),
  );

  const abortRef = useRef<AbortController | null>(null);

  // Offer the standard choices plus the configured default, never above the cap.
  const runChoices = Array.from(new Set([...RUN_CHOICES, defaultRuns]))
    .filter((choice) => choice >= 1 && choice <= maxRuns)
    .sort((a, b) => a - b);

  const key = `${reloadToken}|${sort}|${query}|${includeNoisy}`;
  const loading = listing?.key !== key;
  const markets = loading ? [] : (listing?.markets ?? []);
  const hiddenCount = loading ? 0 : (listing?.hidden ?? 0);
  const error = loading ? null : (listing?.error ?? null);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  // Fetch the first page whenever the query, sort, or reload token changes.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const payload = await fetchMarkets(query, sort, 0, includeNoisy);
        if (cancelled) return;
        setListing({
          key,
          markets: payload.markets,
          nextOffset: payload.nextOffset,
          error: null,
          hidden: payload.hidden ?? 0,
        });
      } catch (cause) {
        if (cancelled) return;
        setListing({
          key,
          markets: [],
          nextOffset: null,
          hidden: 0,
          error: cause instanceof Error ? cause.message : "Failed to load markets.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, query, sort, includeNoisy]);

  const loadMore = useCallback(async () => {
    if (!listing || listing.nextOffset === null) return;

    setLoadingMore(true);
    setMoreError(null);
    try {
      const payload = await fetchMarkets(query, sort, listing.nextOffset, includeNoisy);
      setListing((current) =>
        current && current.key === listing.key
          ? {
              ...current,
              markets: dedupe([...current.markets, ...payload.markets]),
              nextOffset: payload.nextOffset,
              hidden: current.hidden + (payload.hidden ?? 0),
            }
          : current,
      );
    } catch (cause) {
      setMoreError(cause instanceof Error ? cause.message : "Failed to load more markets.");
    } finally {
      setLoadingMore(false);
    }
  }, [listing, query, sort, includeNoisy]);

  const startResearch = useCallback(
    (market: Market) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setAnalyze({
        market,
        stage: null,
        message: "Starting the research…",
        analysis: null,
        error: null,
        done: false,
        runs,
        completed: 0,
        failed: 0,
        landed: [],
        sources: [],
      });

    void streamAnalysis({ marketId: market.id, runs }, (event) => {
      if (event.type === "stage") {
        setAnalyze((current) =>
          current && current.market.id === market.id
            ? { ...current, stage: event.stage, message: event.message }
            : current,
        );
      } else if (event.type === "sources") {
        setAnalyze((current) => {
          if (!current || current.market.id !== market.id) return current;
          // De-duplicate by URL: parallel runs often cite the same page.
          const seen = new Set(current.sources.map((source) => source.url));
          const added = event.sources.filter((source) => !seen.has(source.url));
          return added.length === 0 ? current : { ...current, sources: [...current.sources, ...added] };
        });
      } else if (event.type === "sample") {
        setAnalyze((current) =>
          current && current.market.id === market.id
            ? {
                ...current,
                completed: event.completed,
                failed: event.failed,
                landed:
                  event.probability === null
                    ? current.landed
                    : [...current.landed, event.probability],
              }
            : current,
        );
      } else if (event.type === "result") {
        setAnalyze((current) =>
          current && current.market.id === market.id
            ? { ...current, analysis: event.analysis, done: true, stage: null }
            : current,
        );
        setAnalysisCounts((current) => ({
          ...current,
          [market.id]: (current[market.id] ?? 0) + 1,
        }));
      } else {
        setAnalyze((current) =>
          current && current.market.id === market.id
            ? { ...current, error: event.message, done: true }
            : current,
        );
      }
    }, controller.signal).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setAnalyze((current) =>
        current && current.market.id === market.id
          ? {
              ...current,
              error: cause instanceof Error ? cause.message : "The research request failed.",
              done: true,
            }
          : current,
      );
    });
    },
    [runs],
  );

  const closeDrawer = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalyze(null);
  }, []);

  const inFlightId = analyze && !analyze.done && !analyze.error ? analyze.market.id : null;

  const heading = loading
    ? "Loading markets…"
    : query
      ? `${markets.length} market${markets.length === 1 ? "" : "s"} matching “${query}”`
      : `${markets.length} active market${markets.length === 1 ? "" : "s"}`;

  return (
    <section className="flex flex-col gap-3 sm:gap-5">
      {/*
        Sticky under the app bar on phones, so search and sorting stay reachable
        while scrolling a long market list. Static from `sm` upwards.
      */}
      <div className="glass-blur backdrop-blur-xl backdrop-saturate-150 sticky top-14 z-30 -mx-4 flex flex-col gap-2 border-b border-white/[0.07] px-4 py-2.5 sm:static sm:mx-0 sm:flex-row sm:items-center sm:gap-3 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none sm:backdrop-saturate-100">
        <label className="relative flex-1">
          <span className="sr-only">Search markets</span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={rawQuery}
            onChange={(event) => setRawQuery(event.target.value)}
            placeholder="Search markets…"
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.05] pl-9 pr-3 text-ink-0 placeholder:text-ink-3 transition focus:border-brand/60 focus:bg-white/[0.07] sm:h-10 sm:text-sm"
          />
        </label>

        {/* Two native selects share a row on phones — they open the OS picker. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          <label className="contents sm:flex sm:items-center sm:gap-2">
            <span className="sr-only">Forecast runs</span>
            <select
              value={runs}
              onChange={(event) => setRuns(Number(event.target.value))}
              title="How many independent forecasts to run in parallel and average"
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-3 text-ink-1 transition focus:border-brand/60 sm:h-10 sm:w-auto sm:text-sm"
            >
              {runChoices.map((choice) => (
                <option key={choice} value={choice} className="bg-surface-1">
                  {choice === 1 ? "1 run" : `${choice} runs`}
                </option>
              ))}
            </select>
          </label>

          <label className="contents sm:flex sm:items-center sm:gap-2">
            <span className="sr-only">Sort markets</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.05] px-3 text-ink-1 transition focus:border-brand/60 sm:h-10 sm:w-auto sm:text-sm"
            >
              {SORTS.map((option) => (
                <option key={option.key} value={option.key} className="bg-surface-1">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex min-w-0 items-baseline justify-between gap-3 text-xs text-ink-3">
        <p className="min-w-0 truncate">{heading}</p>
        {runs > 1 ? <p className="shrink-0">{runs}× cost per research</p> : null}
      </div>

      {noiseFilterActive && (hiddenCount > 0 || includeNoisy) ? (
        <button
          type="button"
          onClick={() => setIncludeNoisy((value) => !value)}
          className="flex items-center gap-2 self-start rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs text-ink-2 transition hover:bg-white/[0.08] hover:text-ink-0"
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${includeNoisy ? "bg-warn" : "bg-yes"}`}
          />
          {includeNoisy
            ? "Showing every market, including weather and hourly ticks"
            : `${hiddenCount} noisy market${hiddenCount === 1 ? "" : "s"} hidden — show all`}
        </button>
      ) : null}

      {error ? (
        <ErrorState
          title="Could not load markets"
          message={error}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      ) : null}

      {loading ? (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : markets.length === 0 && !error ? (
        <EmptyState
          title="No markets found"
          message={
            query
              ? "No active binary markets matched that search. Try a broader term."
              : "Polymarket returned no active binary markets right now. Try again in a moment."
          }
        />
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {markets.map((market, index) => (
            <MarketCard
              key={market.id}
              index={index}
              market={market}
              onResearch={startResearch}
              isResearching={inFlightId === market.id}
              disabled={inFlightId !== null}
              priorAnalyses={analysisCounts[market.id] ?? 0}
            />
          ))}
        </div>
      )}

      {moreError ? <ErrorState title="Could not load more" message={moreError} /> : null}

      {!loading && listing?.nextOffset !== null && markets.length > 0 ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 text-sm font-medium text-ink-1 transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Spinner /> Loading…
              </>
            ) : (
              "Load more markets"
            )}
          </button>
        </div>
      ) : null}

      {analyze ? (
        <AnalyzeDrawer
          state={analyze}
          onClose={closeDrawer}
          onRetry={() => startResearch(analyze.market)}
        />
      ) : null}
    </section>
  );
}

function dedupe(markets: Market[]): Market[] {
  const seen = new Set<string>();
  return markets.filter((market) => {
    if (seen.has(market.id)) return false;
    seen.add(market.id);
    return true;
  });
}

function countByMarket(analyses: Analysis[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const analysis of analyses) {
    counts[analysis.marketId] = (counts[analysis.marketId] ?? 0) + 1;
  }
  return counts;
}
