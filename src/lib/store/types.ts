import type { Analysis } from "@/lib/types";

export interface ListOptions {
  /** Restrict to a single market's history. */
  marketId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Append-only analysis store.
 *
 * `save` must never overwrite an existing record: every analysis gets a fresh
 * id and is added to the history, so a re-run of the same market produces a new
 * timestamped forecast alongside the old ones.
 */
export interface AnalysisStore {
  readonly name: string;
  /** True when records survive a process restart. */
  readonly durable: boolean;
  save(analysis: Analysis): Promise<void>;
  list(options?: ListOptions): Promise<{ analyses: Analysis[]; total: number }>;
  get(id: string): Promise<Analysis | null>;
}
