import type { Analysis } from "@/lib/types";
import type { AnalysisStore, ListOptions } from "@/lib/store/types";

/**
 * Last-resort in-process store. Records are lost on restart and are not shared
 * between serverless instances — the health endpoint surfaces `durable: false`
 * so the UI can warn about it.
 *
 * The module-level array survives hot reloads via globalThis.
 */
const globalForMemoryStore = globalThis as typeof globalThis & {
  __trueOddsAnalyses?: Analysis[];
};

const records = (globalForMemoryStore.__trueOddsAnalyses ??= []);

export function createMemoryStore(maxRecords: number): AnalysisStore {
  return {
    name: "memory",
    durable: false,
    async save(analysis) {
      records.unshift(analysis);
      if (records.length > maxRecords) records.length = maxRecords;
    },
    async list(options: ListOptions = {}) {
      const filtered = options.marketId
        ? records.filter((a) => a.marketId === options.marketId)
        : records;
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 50;
      return { analyses: filtered.slice(offset, offset + limit), total: filtered.length };
    },
    async get(id) {
      return records.find((a) => a.id === id) ?? null;
    },
  };
}
