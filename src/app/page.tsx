import Link from "next/link";

import { MarketBrowser } from "@/components/MarketBrowser";
import { Badge } from "@/components/ui";
import { publicConfigSummary } from "@/lib/env";
import { getStore } from "@/lib/store";
import type { Analysis } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const summary = publicConfigSummary();

  // Best-effort: a store failure must not take the dashboard down.
  let recent: Analysis[] = [];
  let storeDurable = true;
  try {
    const store = getStore();
    storeDurable = store.durable;
    recent = (await store.list({ limit: 100 })).analyses;
  } catch (error) {
    console.error("Failed to read the analysis history", error);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="panel flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="brand">Blind forecasting</Badge>
          <Badge tone="neutral">
            Model <span className="font-mono">{summary.model}</span>
          </Badge>
          {summary.webSearchEnabled ? (
            <Badge tone="neutral">Web research on</Badge>
          ) : (
            <Badge tone="warn">Web research off</Badge>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-0 sm:text-3xl">
            Where does the market disagree with the evidence?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-2">
            TrueOdds asks an AI forecaster to research a Polymarket question and commit to a
            probability <em>before</em> it is shown the market price. Only then is the price
            revealed, for a review that is free to disagree. The gap between the two is the signal.
          </p>
        </div>

        {!summary.openRouterConfigured ? (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink-1">
            <strong className="font-semibold text-warn">OpenRouter is not configured.</strong> You
            can browse markets, but analysis will fail until <code className="font-mono">OPENROUTER_API_KEY</code>{" "}
            is set. See the README for setup.
          </p>
        ) : null}

        {!storeDurable ? (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink-1">
            <strong className="font-semibold text-warn">Analyses are not being persisted.</strong>{" "}
            The in-memory store is active, so forecasts are lost when the server restarts. Add
            Upstash Redis credentials to keep a durable history.
          </p>
        ) : null}

        {recent.length > 0 ? (
          <p className="text-sm text-ink-3">
            {recent.length} saved forecast{recent.length === 1 ? "" : "s"} ·{" "}
            <Link href="/history" className="text-brand hover:underline">
              view history
            </Link>
          </p>
        ) : null}
      </section>

      <MarketBrowser recentAnalyses={recent} />
    </div>
  );
}
