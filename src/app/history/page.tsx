import Link from "next/link";

import { AnalysisHistoryCard } from "@/components/AnalysisHistoryCard";
import { EmptyState, ErrorState, Stat } from "@/components/ui";
import { formatSignedPoints } from "@/lib/format";
import { getStore } from "@/lib/store";
import type { Analysis } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analysis history — TrueOdds",
  description: "Every forecast TrueOdds has produced, timestamped and never overwritten.",
};

export default async function HistoryPage() {
  let analyses: Analysis[] = [];
  let total = 0;
  let error: string | null = null;
  let storeName = "";

  try {
    const store = getStore();
    storeName = store.name;
    const result = await store.list({ limit: 100 });
    analyses = result.analyses;
    total = result.total;
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "The analysis store is unavailable.";
  }

  const withDeviation = analyses.filter((a) => a.deviation !== null);
  const meanAbsDeviation =
    withDeviation.length > 0
      ? withDeviation.reduce((sum, a) => sum + Math.abs(a.deviation!), 0) / withDeviation.length
      : null;
  const disagreements = withDeviation.filter((a) => Math.abs(a.deviation!) >= 15).length;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-ink-0 sm:text-2xl">
          Research history
        </h1>
        <p className="max-w-2xl text-sm text-ink-2">
          Every forecast is stored with its timestamp and the market price at the moment it was
          made. Records are append-only — re-analysing a market adds a new forecast rather than
          replacing the previous one.
        </p>
      </div>

      {error ? <ErrorState title="Could not load history" message={error} /> : null}

      {!error && analyses.length > 0 ? (
        <dl className="panel grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:gap-5 sm:p-5">
          <Stat label="Forecasts" value={total} />
          <Stat
            label="Mean |deviation|"
            value={meanAbsDeviation === null ? "—" : formatSignedPoints(meanAbsDeviation).replace("+", "")}
          />
          <Stat label="Strong disagreements" value={disagreements} hint="15+ points apart" />
          <Stat label="Store" value={<span className="font-mono text-xs">{storeName}</span>} />
        </dl>
      ) : null}

      {!error && analyses.length === 0 ? (
        <EmptyState
          title="No forecasts yet"
          message="Analyse a market from the dashboard and it will appear here, timestamped and permanent."
          action={
            <Link
              href="/"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-surface-0 transition hover:bg-brand-strong"
            >
              Browse markets
            </Link>
          }
        />
      ) : null}

      <div className="flex flex-col gap-3">
        {analyses.map((analysis) => (
          <AnalysisHistoryCard key={analysis.id} analysis={analysis} />
        ))}
      </div>

      {total > analyses.length ? (
        <p className="text-center text-xs text-ink-3">
          Showing the {analyses.length} most recent of {total} forecasts.
        </p>
      ) : null}
    </div>
  );
}
