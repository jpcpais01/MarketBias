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
    <div className="flex flex-col gap-5 sm:gap-8">
      <section className="panel flex flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        {/* Badges scroll sideways on narrow screens rather than wrapping to three rows. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0">
          <Badge tone="brand" className="shrink-0">
            Blind forecasting
          </Badge>
          <Badge tone="neutral" className="shrink-0">
            <span className="font-mono">{summary.model}</span>
          </Badge>
          {summary.webSearchEnabled ? (
            <Badge tone="neutral" className="shrink-0">
              Web research on
            </Badge>
          ) : (
            <Badge tone="warn" className="shrink-0">
              Web research off
            </Badge>
          )}
          {summary.sampleRuns > 1 ? (
            <Badge tone="ai" className="shrink-0">
              {summary.sampleRuns} runs averaged
            </Badge>
          ) : null}
        </div>

        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-0 sm:text-3xl">
            Where does the market disagree with the evidence?
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            An AI forecaster commits to a probability <em>before</em> it sees the market price. The
            gap is the signal.
          </p>
        </div>

        {/* Detail stays one tap away instead of filling the first screen. */}
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-brand">
            How it works
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              className="size-4 transition group-open:rotate-180"
            >
              <path
                d="m6 9 6 6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <ol className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-ink-2">
            <li>
              <strong className="font-medium text-ink-1">Nothing runs automatically.</strong>{" "}
              Browsing markets makes no AI calls — research starts only when you tap Research on a
              market.
            </li>
            <li>
              The model researches the web and commits to a probability with the market price
              hidden from it.
            </li>
            <li>
              The price is then revealed for a review that is free to disagree — it must name a
              reason to change its mind.
            </li>
            <li>
              Run several forecasts in parallel to average out noise; the spread between them is
              shown.
            </li>
          </ol>
        </details>

        {!summary.openRouterConfigured ? (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-3 text-sm leading-relaxed text-ink-1 sm:px-4">
            <strong className="font-semibold text-warn">OpenRouter is not configured.</strong> You
            can browse markets, but research will fail until{" "}
            <code className="font-mono text-xs">OPENROUTER_API_KEY</code> is set. See the README.
          </p>
        ) : null}

        {!storeDurable ? (
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-3 text-sm leading-relaxed text-ink-1 sm:px-4">
            <strong className="font-semibold text-warn">Forecasts are not being saved.</strong> The
            in-memory store is active, so they are lost when the server restarts. Add Upstash Redis
            credentials for a durable history.
          </p>
        ) : null}

        {recent.length > 0 ? (
          <p className="hidden text-sm text-ink-3 sm:block">
            {recent.length} saved forecast{recent.length === 1 ? "" : "s"} ·{" "}
            <Link href="/history" className="text-brand hover:underline">
              view history
            </Link>
          </p>
        ) : null}
      </section>

      <MarketBrowser
        recentAnalyses={recent}
        defaultRuns={summary.sampleRuns}
        maxRuns={summary.maxSampleRuns}
      />
    </div>
  );
}
