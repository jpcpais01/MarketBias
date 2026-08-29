import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "TrueOdds — independent forecasts vs. Polymarket",
  description:
    "Compare live Polymarket probabilities with independent, research-backed AI probability estimates made without seeing the market price.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6">
          <SiteHeader />
          <main className="flex-1 pb-16">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="group flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/30"
        >
          <svg viewBox="0 0 24 24" fill="none" className="size-5">
            <path d="M4 15.5 9 9l4 4.5L20 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 5h5v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-lg font-semibold tracking-tight text-ink-0">TrueOdds</span>
          <span className="text-xs text-ink-3">Independent forecasts vs. Polymarket</span>
        </span>
      </Link>

      <nav className="flex items-center gap-1 text-sm">
        <NavLink href="/">Markets</NavLink>
        <NavLink href="/history">History</NavLink>
        <a
          href="https://polymarket.com"
          target="_blank"
          rel="noreferrer noopener"
          className="rounded-lg px-3 py-2 text-ink-3 transition hover:text-ink-1"
        >
          Polymarket ↗
        </a>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-lg px-3 py-2 text-ink-1 transition hover:bg-surface-2/70 hover:text-ink-0">
      {children}
    </Link>
  );
}

function SiteFooter() {
  return (
    <footer className="hairline border-t py-6 text-xs leading-relaxed text-ink-3">
      <p>
        TrueOdds produces AI-generated probability estimates for research purposes. Forecasts are
        model output, not financial advice, and may be wrong. Market data comes from Polymarket&apos;s
        public API.
      </p>
    </footer>
  );
}
