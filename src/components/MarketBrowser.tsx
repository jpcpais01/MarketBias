"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AnalyzeDrawer, type AnalyzeState } from "@/components/AnalyzeDrawer";
import { MarketCard } from "@/components/MarketCard";
import { EmptyState, ErrorState, SkeletonCard, Spinner } from "@/components/ui";
import { streamAnalysis } from "@/lib/stream";
import type { Analysis, Market, MarketListResult } from "@/lib/types";

const PAGE_SIZE = 24;

type SortKey = "volume24hr" | "volume" | "liquidity" | "endDate";

const SORTS: { key: SortKey; label: string; ascending: boolean }[] = [
  { key: "volume24hr", label: "Hot (24h volume)", ascending: false },
  { key: "volume", label: "Total volume", ascending: false },
  { key: "liquidity", label: "Liquidity", ascending: false },
  { key: "endDate", label: "Ending soonest", ascending: true },
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
}

async function fetchMarkets(query: string, sort: SortKey, offset: number): Promise<MarketListResult> {
  const sortConfig = SORTS.find((s) => s.key === sort) ?? SORTS[0];
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    order: sortConfig.key,
    ascending: String(sortConfig.ascending),
  });
  if (query) params.set("q", query);

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
}: {
  recentAnalyses: Analysis[];
  /** Server default from ANALYSIS_SAMPLE_RUNS. */
  defaultRuns: number;
  /** Server ceiling from ANALYSIS_MAX_SAMPLE_RUNS. */
  maxRuns: number;
}) {
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("volume24hr");
  const [runs, setRuns] = useState<number>(defaultRuns);
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

  const key = `${reloadToken}|${sort}|${query}`;
  const loading = listing?.key !== key;
  const markets = loading ? [] : (listing?.markets ?? []);
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
        const payload = await fetchMarkets(query, sort, 0);
        if (cancelled) return;
        setListing({ key, markets: payload.markets, nextOffset: payload.nextOffset, error: null });
      } catch (cause) {
        if (cancelled) return;
        setListing({
          key,
          markets: [],
          nextOffset: null,
          error: cause instanceof Error ? cause.message : "Failed to load markets.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, query, sort]);

  const loadMore = useCallback(async () => {
    if (!listing || listing.nextOffset === null) return;

    setLoadingMore(true);
    setMoreError(null);
    try {
      const payload = await fetchMarkets(query, sort, listing.nextOffset);
      setListing((current) =>
        current && current.key === listing.key
          ? {
              ...current,
              markets: dedupe([...current.markets, ...payload.markets]),
              nextOffset: payload.nextOffset,
            }
          : current,
      );
    } catch (cause) {
      setMoreError(cause instanceof Error ? cause.message : "Failed to load more markets.");
    } finally {
      setLoadingMore(false);
    }
  }, [listing, query, sort]);

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
      });

    void streamAnalysis({ marketId: market.id, runs }, (event) => {
      if (event.type === "stage") {
        setAnalyze((current) =>
          current && current.market.id === market.id
            ? { ...current, stage: event.stage, message: event.message }
            : current,
        );
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
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            placeholder="Search active markets — elections, rates, sports, crypto…"
            className="w-full rounded-xl border border-surface-3/70 bg-surface-1/70 py-2.5 pl-9 pr-3 text-sm text-ink-0 placeholder:text-ink-3 focus:border-brand/60"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-3">
          <span className="sr-only sm:not-sr-only">Runs</span>
          <select
            value={runs}
            onChange={(event) => setRuns(Number(event.target.value))}
            title="How many independent forecasts to run in parallel and average"
            className="rounded-xl border border-surface-3/70 bg-surface-1/70 px-3 py-2.5 text-sm text-ink-1 focus:border-brand/60"
          >
            {runChoices.map((choice) => (
              <option key={choice} value={choice} className="bg-surface-1">
                {choice === 1 ? "1 run" : `${choice} runs averaged`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-3">
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="rounded-xl border border-surface-3/70 bg-surface-1/70 px-3 py-2.5 text-sm text-ink-1 focus:border-brand/60"
          >
            {SORTS.map((option) => (
              <option key={option.key} value={option.key} className="bg-surface-1">
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-ink-3">{heading}</p>
        {runs > 1 ? (
          <p className="text-xs text-ink-3">
            Each <span className="text-ink-1">Research</span> runs {runs} independent forecasts in
            parallel and averages them — {runs}× the LLM cost.
          </p>
        ) : null}
      </div>

      {error ? (
        <ErrorState
          title="Could not load markets"
          message={error}
          onRetry={() => setReloadToken((token) => token + 1)}
        />
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {markets.map((market) => (
            <MarketCard
              key={market.id}
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
            className="inline-flex items-center gap-2 rounded-xl border border-surface-3/70 px-4 py-2.5 text-sm font-medium text-ink-1 transition hover:bg-surface-2/70 disabled:opacity-50"
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
