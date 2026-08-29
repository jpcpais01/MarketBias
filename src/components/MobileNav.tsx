"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fixed bottom tab bar — the primary navigation on phones.
 *
 * Hidden from `sm` upwards, where the header nav takes over. Tap targets are
 * a full 56px tall, and the bar pads itself past the iOS home indicator.
 */
const TABS = [
  {
    href: "/",
    label: "Markets",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <>
        <path
          d="M4 17V9M9.5 17V5M15 17v-6M20.5 17v-3"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="glass-blur backdrop-blur-xl backdrop-saturate-150 safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] sm:hidden"
    >
      <ul className="grid grid-cols-2">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition ${
                  active ? "text-brand" : "text-ink-3"
                }`}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-brand"
                  />
                ) : null}
                <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
