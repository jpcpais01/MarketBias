"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-xl font-semibold text-ink-0">Something went wrong</h1>
      <p className="max-w-md text-sm text-ink-2">
        {error.message || "An unexpected error occurred while rendering this page."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-surface-0 transition hover:bg-brand-strong"
      >
        Try again
      </button>
    </div>
  );
}
