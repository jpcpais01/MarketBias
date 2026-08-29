"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, exposed as an external store.
 *
 * Reading `Date.now()` during render is impure and causes hydration
 * mismatches, so time-dependent output (relative dates, expiry checks) goes
 * through here instead. The snapshot is `null` on the server and on the first
 * client render, then becomes a real timestamp once subscribed, refreshed once
 * a minute — which is as precise as any label we render.
 */
const REFRESH_MS = 60_000;

const listeners = new Set<() => void>();
let current: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (timer === null) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      for (const notify of listeners) notify();
    }, REFRESH_MS);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function useClientNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
