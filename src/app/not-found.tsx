import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-sm text-ink-3">404</p>
      <h1 className="text-xl font-semibold text-ink-0">Page not found</h1>
      <Link
        href="/"
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-surface-0 transition hover:bg-brand-strong"
      >
        Back to markets
      </Link>
    </div>
  );
}
