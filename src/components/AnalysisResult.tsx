import { ProbabilityComparison } from "@/components/ProbabilityBar";
import { Badge, Stat } from "@/components/ui";
import {
  deviationLabel,
  formatDate,
  formatDateTime,
  formatDuration,
  hostnameOf,
} from "@/lib/format";
import type { Analysis, Confidence } from "@/lib/types";

const CONFIDENCE_TONE: Record<Confidence, "no" | "warn" | "yes"> = {
  low: "no",
  medium: "warn",
  high: "yes",
};

/** Full render of a persisted analysis. Used in the analyze drawer and history. */
export function AnalysisResult({ analysis, compact = false }: { analysis: Analysis; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <ProbabilityComparison
        polymarketProbability={analysis.polymarketProbability}
        aiProbability={analysis.aiProbability}
        blindProbability={analysis.blindProbability}
        deviation={analysis.deviation}
      />

      <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid gap-4 sm:grid-cols-2">
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
              <li key={`${source.url}-${index}`} className="text-sm">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-brand underline-offset-2 hover:underline"
                >
                  {source.title}
                </a>
                <span className="ml-2 font-mono text-xs text-ink-3">{hostnameOf(source.url)}</span>
                {source.note ? <p className="mt-0.5 text-ink-2">{source.note}</p> : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {compact ? null : (
        <dl className="hairline grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4">
          <Stat label="Analysed" value={formatDateTime(analysis.createdAt)} />
          <Stat label="Market expiry" value={formatDate(analysis.marketEndDate)} />
          <Stat label="Model" value={<span className="font-mono text-xs">{analysis.model}</span>} />
          <Stat label="Run time" value={formatDuration(analysis.durationMs)} />
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
    <section>
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
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-ink-1">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
