/** Small presentational primitives shared across the app. */

import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "yes" | "no" | "ai" | "warn" | "brand";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/[0.06] text-ink-2 ring-white/10",
    yes: "bg-yes/10 text-yes ring-yes/30",
    no: "bg-no/10 text-no ring-no/30",
    ai: "bg-ai/10 text-ai ring-ai/30",
    warn: "bg-warn/10 text-warn ring-warn/30",
    brand: "bg-brand/10 text-brand ring-brand/30",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-no/30 bg-no/5 p-4 text-sm text-ink-1"
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-no">
          <svg viewBox="0 0 24 24" fill="none" className="size-5">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-0">{title}</p>
          <p className="mt-1 break-words text-ink-2">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="self-start rounded-lg border border-no/40 px-3 py-1.5 text-xs font-medium text-ink-0 transition hover:bg-no/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span aria-hidden className="text-ink-3">
        <svg viewBox="0 0 24 24" fill="none" className="size-8">
          <path d="M4 17V9M9.5 17V5M15 17v-6M20.5 17v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <p className="text-base font-medium text-ink-0">{title}</p>
      <p className="max-w-md text-sm text-ink-2">{message}</p>
      {action}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass min-w-0 animate-pulse p-4 sm:p-5">
      <div className="h-3 w-24 rounded bg-white/[0.07]" />
      <div className="mt-4 h-4 w-full rounded bg-white/[0.07]" />
      <div className="mt-2 h-4 w-4/5 rounded bg-white/[0.07]" />
      <div className="mt-6 h-2 w-full rounded-full bg-white/[0.07]" />
      <div className="mt-5 h-12 w-full rounded-xl bg-white/[0.07]" />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[0.7rem] font-medium uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-ink-0">{value}</dd>
      {hint ? <p className="text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}
