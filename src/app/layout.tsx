import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { MobileNav } from "@/components/MobileNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrueOdds — independent forecasts vs. Polymarket",
  description:
    "Compare live Polymarket probabilities with independent, research-backed AI probability estimates made without seeing the market price.",
  appleWebApp: { capable: true, title: "TrueOdds", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#12161f",
  // Lets the layout paint under the notch/home indicator; the safe-area
  // padding in globals.css keeps content clear of them.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          {/* Bottom padding clears the mobile tab bar. */}
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pb-16">
            {children}
          </main>
          <SiteFooter />
          <MobileNav />
        </div>
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-3/50 bg-surface-0/85 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 items-center justify-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/30"
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-[18px]">
              <path
                d="M4 15.5 9 9l4 4.5L20 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 5h5v5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-tight text-ink-0">TrueOdds</span>
            <span className="mt-0.5 hidden text-[0.7rem] text-ink-3 sm:block">
              Independent forecasts vs. Polymarket
            </span>
          </span>
        </Link>

        {/* Desktop nav; mobile uses the bottom tab bar instead. */}
        <nav className="hidden items-center gap-1 text-sm sm:flex">
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
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-ink-1 transition hover:bg-surface-2/70 hover:text-ink-0"
    >
      {children}
    </Link>
  );
}

function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl px-4 pb-24 text-xs leading-relaxed text-ink-3 sm:px-6 sm:pb-8">
      <p className="hairline border-t pt-5">
        TrueOdds produces AI-generated probability estimates for research purposes. Forecasts are
        model output, not financial advice, and may be wrong. Market data comes from Polymarket&apos;s
        public API.
      </p>
    </footer>
  );
}
