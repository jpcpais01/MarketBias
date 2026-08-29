import { ProbabilityComparison } from "@/components/ProbabilityBar";
import { Badge, Stat } from "@/components/ui";
import {
  deviationLabel,
  formatDate,
  formatDateTime,
  formatDuration,
  formatPercent,
  hostnameOf,
} from "@/lib/format";
import type { Analysis, Confidence, Ensemble } from "@/lib/types";

const CONFIDENCE_TONE: Record<Confidence, "no" | "warn" | "yes"> = {
  low: "no",
  medium: "warn",
  high: "yes",
};

/** Full render of a persisted analysis. Used in the analyze drawer and history. */
export function AnalysisResult({ analysis, compact = false }: { analysis: Analysis; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <ProbabilityComparison
        polymarketProbability={analysis.polymarketProbability}
        aiProbability={analysis.aiProbability}
        blindProbability={analysis.blindProbability}
        deviation={analysis.deviation}
      />

      {analysis.ensemble && analysis.ensemble.completed > 1 ? (
        <EnsembleSpread ensemble={analysis.ensemble} />
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Badge tone={CONFIDENCE_TONE[analysis.confidence]}>
          {analysis.confidence} confidence
        </Badge>
        <Badge tone="neutral">{deviationLabel(analysis.deviation)}</Badge>
        {analysis.review.revised ? (
          <Badge tone="warn">Revised after price reveal</Badge>
        ) : (
          <Badge tone="brand">Held estimate after reveal</Badge>
        )}
        {analysis.webSearchEnabled ? <Badge tone="neutral">Web research</Badge> : <Badge tone="warn">No web search</Badge>}
      </div>

      <Section title="Reasoning">
        <p className="text-sm leading-relaxed text-ink-1">{analysis.reasoning}</p>
      </Section>

      {analysis.keyDrivers.length > 0 ? (
        <Section title="What this hinges on">
          <List items={analysis.keyDrivers} />
        </Section>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
        <Section title="Evidence for YES" tone="yes">
          <List items={analysis.evidenceFor} emptyText="No supporting evidence was recorded." />
        </Section>
        <Section title="Evidence for NO" tone="no">
          <List items={analysis.evidenceAgainst} emptyText="No opposing evidence was recorded." />
        </Section>
      </div>

      {analysis.baseRates.length > 0 ? (
        <Section title="Base rates and reference classes">
          <List items={analysis.baseRates} />
        </Section>
      ) : null}

      <Section title="Key uncertainties" tone="warn">
        <List items={analysis.uncertainties} emptyText="No uncertainties were recorded." />
      </Section>

      <Section title="Discrepancy review">
        <p className="text-sm leading-relaxed text-ink-1">{analysis.review.explanation}</p>
        {analysis.review.marketMayKnow.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
              What the market may be pricing in
            </p>
            <List items={analysis.review.marketMayKnow} />
          </div>
        ) : null}
        {analysis.review.forecastMayBeBetter.length > 0 ? (
          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
              Why this forecast may be better calibrated
            </p>
            <List items={analysis.review.forecastMayBeBetter} />
          </div>
        ) : null}
      </Section>

      <Section title={`Sources (${analysis.sources.length})`}>
        {analysis.sources.length === 0 ? (
          <p className="text-sm text-ink-3">
            No sources were cited. Enable web search (OPENROUTER_ENABLE_WEB_SEARCH) or choose a
            model with research capability for source-backed forecasts.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {analysis.sources.map((source, index) => (
              <li key={`${source.url}-${index}`} className="min-w-0 text-sm">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block break-words font-medium text-brand underline-offset-2 hover:underline"
                >
                  {/* Titles are sometimes just the URL again; clamp so one source
                      cannot take over the list. */}
                  <span className="line-clamp-2">{source.title}</span>
                </a>
                <span className="mt-0.5 block truncate font-mono text-xs text-ink-3">
                  {hostnameOf(source.url)}
                </span>
                {source.note ? <p className="mt-0.5 break-words text-ink-2">{source.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {compact ? null : (
        <dl className="hairline grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Stat label="Researched" value={formatDateTime(analysis.createdAt)} />
          <Stat label="Market expiry" value={formatDate(analysis.marketEndDate)} />
          <Stat
            label="Model"
            value={<span className="block break-all font-mono text-xs">{analysis.model}</span>}
          />
          <Stat
            label="Run time"
            value={formatDuration(analysis.durationMs)}
            hint={
              analysis.ensemble && analysis.ensemble.requested > 1
                ? `${analysis.ensemble.completed}/${analysis.ensemble.requested} forecasts`
                : undefined
            }
          />
        </dl>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "neutral" | "yes" | "no" | "warn";
}) {
  const accent: Record<string, string> = {
    neutral: "text-ink-3",
    yes: "text-yes",
    no: "text-no",
    warn: "text-warn",
  };

  return (
    <section className="min-w-0">
      <h3 className={`mb-2 text-xs font-semibold uppercase tracking-wide ${accent[tone]}`}>{title}</h3>
      {children}
    </section>
  );
}

function List({ items, emptyText }: { items: string[]; emptyText?: string }) {
  if (items.length === 0) {
    return emptyText ? <p className="text-sm text-ink-3">{emptyText}</p> : null;
  }

  return (
    <ul className="flex min-w-0 flex-col gap-2">
      {items.map((item, index) => (
        <li key={index} className="flex min-w-0 gap-2.5 text-sm leading-relaxed text-ink-1">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Distribution of the parallel forecasts on a 0-100 axis.
 *
 * The spread is the point: it separates "the model is consistently confident"
 * from "the model's answer moves 30 points between runs", which a single
 * averaged number would hide.
 */
function EnsembleSpread({ ensemble }: { ensemble: Ensemble }) {
  const agreement =
    ensemble.stdDev < 5 ? "tight" : ensemble.stdDev < 12 ? "moderate" : "wide";
  const tone = agreement === "tight" ? "yes" : agreement === "moderate" ? "warn" : "no";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-surface-3/60 bg-surface-1/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
          {ensemble.completed} independent forecasts, averaged
        </h3>
        <Badge tone={tone}>{agreement} agreement · σ {ensemble.stdDev} pts</Badge>
      </div>

      <div className="relative h-8">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-3/60" />
        {/* Range bar between the lowest and highest run. */}
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-ai/40"
          style={{ left: `${ensemble.min}%`, width: `${Math.max(ensemble.max - ensemble.min, 0.5)}%` }}
        />
        {ensemble.samples.map((sample) => (
          <span
            key={sample.index}
            title={`Run ${sample.index + 1}: ${formatPercent(sample.probability)} (${sample.confidence} confidence)`}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ai ring-2 ring-surface-1"
            style={{ left: `${sample.probability}%` }}
          />
        ))}
        <span
          title={`Mean: ${formatPercent(ensemble.mean)}`}
          className="absolute top-1/2 h-6 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink-0"
          style={{ left: `${ensemble.mean}%` }}
        />
      </div>

      {/* Scale, so a dot's position reads as a probability rather than a blob. */}
      <div className="-mt-2 flex justify-between font-mono text-[0.65rem] text-ink-3">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mean" value={formatPercent(ensemble.mean)} />
        <Stat label="Median" value={formatPercent(ensemble.median)} />
        <Stat label="Range" value={`${formatPercent(ensemble.min)} – ${formatPercent(ensemble.max)}`} />
        <Stat
          label="Runs"
          value={`${ensemble.completed} of ${ensemble.requested}`}
          hint={ensemble.failed > 0 ? `${ensemble.failed} failed` : undefined}
        />
      </dl>

      <p className="text-xs leading-relaxed text-ink-3">
        Reasoning below comes from run {ensemble.representativeIndex + 1}, the one nearest the mean.
        Evidence, uncertainties and sources are pooled across all runs.
      </p>
    </div>
  );
}
