import { deviationBand, formatPercent, formatSignedPoints } from "@/lib/format";

/**
 * Single YES probability bar, used on market cards.
 *
 * `probability` is a PERCENTAGE (0-100), matching the analysis record fields.
 * Polymarket prices are 0-1 fractions, so convert at the call site.
 */
export function ProbabilityBar({
  probability,
  label = "Polymarket YES",
}: {
  probability: number | null;
  label?: string;
}) {
  const percent = probability === null ? 0 : Math.min(100, Math.max(0, probability));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-3">{label}</span>
        <span className="font-mono text-sm font-semibold text-ink-0 tabular-nums">
          {formatPercent(probability)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3/60">
        <div
          className="h-full rounded-full bg-yes/80 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Side-by-side comparison of the market price and the AI estimate, with the
 * gap between them called out. Both bars share one axis so the visual distance
 * between the two fills is the deviation.
 */
export function ProbabilityComparison({
  polymarketProbability,
  aiProbability,
  blindProbability,
  deviation,
}: {
  polymarketProbability: number | null;
  aiProbability: number;
  blindProbability?: number;
  deviation: number | null;
}) {
  const band = deviationBand(deviation);
  const bandStyles: Record<string, string> = {
    aligned: "text-ink-1 bg-surface-2/80 ring-surface-3/70",
    moderate: "text-warn bg-warn/10 ring-warn/30",
    large: "text-no bg-no/10 ring-no/30",
  };

  const revised =
    blindProbability !== undefined && Math.abs(blindProbability - aiProbability) >= 0.05;

  return (
    <div className="flex flex-col gap-4">
      <Row
        label="Polymarket"
        sublabel="Market-implied YES"
        value={polymarketProbability}
        barClass="bg-yes"
        valueClass="text-yes"
      />
      <Row
        label="TrueOdds AI"
        sublabel={
          revised
            ? `Blind estimate ${formatPercent(blindProbability)} → revised after review`
            : "Independent estimate, made before seeing the market"
        }
        value={aiProbability}
        barClass="bg-ai"
        valueClass="text-ai"
        marker={revised ? blindProbability : undefined}
      />

      <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-3/60 bg-surface-1/60 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-3">Deviation</span>
        <span
          className={`rounded-full px-3 py-1 font-mono text-sm font-semibold tabular-nums ring-1 ring-inset ${bandStyles[band]}`}
        >
          {formatSignedPoints(deviation)}
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  sublabel,
  value,
  barClass,
  valueClass,
  marker,
}: {
  label: string;
  sublabel: string;
  value: number | null;
  barClass: string;
  valueClass: string;
  /** Optional tick showing where the blind estimate sat before revision. */
  marker?: number;
}) {
  const percent = value === null ? 0 : Math.min(100, Math.max(0, value));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-0">{label}</span>
        <span className={`font-mono text-xl font-semibold tabular-nums ${valueClass}`}>
          {formatPercent(value)}
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3/60">
        <div
          className={`h-full rounded-full ${barClass} transition-[width] duration-700`}
          style={{ width: `${percent}%` }}
        />
        {marker !== undefined ? (
          <span
            aria-hidden
            title={`Blind estimate: ${formatPercent(marker)}`}
            className="absolute top-0 h-full w-0.5 bg-ink-0/70"
            style={{ left: `${Math.min(100, Math.max(0, marker))}%` }}
          />
        ) : null}
      </div>
      <p className="text-xs text-ink-3">{sublabel}</p>
    </div>
  );
}
