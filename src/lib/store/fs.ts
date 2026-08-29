import { promises as fs } from "node:fs";
import path from "node:path";

import type { Analysis } from "@/lib/types";
import type { AnalysisStore, ListOptions } from "@/lib/store/types";

/**
 * Filesystem store: one JSON file per analysis, named by timestamp + id so the
 * directory sorts chronologically and nothing is ever overwritten.
 *
 * Intended for local development. Serverless filesystems are ephemeral, so on
 * Vercel this is auto-swapped for the Upstash driver (see index.ts).
 */
export function createFsStore(dir: string, maxRecords: number): AnalysisStore {
  // turbopackIgnore keeps the bundler from tracing the whole project into the
  // serverless output because of this dynamic path. This driver is only ever
  // selected outside serverless environments (see store/index.ts).
  const root = path.isAbsolute(dir)
    ? dir
    : path.join(/* turbopackIgnore: true */ process.cwd(), dir);

  async function ensureDir() {
    await fs.mkdir(root, { recursive: true });
  }

  async function readAll(): Promise<Analysis[]> {
    await ensureDir();
    const entries = await fs.readdir(root);
    const files = entries.filter((f) => f.endsWith(".json")).sort().reverse();

    const analyses: Analysis[] = [];
    for (const file of files.slice(0, maxRecords)) {
      try {
        const contents = await fs.readFile(path.join(root, file), "utf8");
        analyses.push(JSON.parse(contents) as Analysis);
      } catch {
        // Skip unreadable/corrupt records rather than failing the whole listing.
      }
    }
    return analyses;
  }

  return {
    name: "filesystem",
    durable: true,
    async save(analysis) {
      await ensureDir();
      // Colons are illegal in filenames on Windows; keep the name portable.
      const stamp = analysis.createdAt.replace(/[:.]/g, "-");
      const file = path.join(root, `${stamp}__${analysis.id}.json`);
      await fs.writeFile(file, JSON.stringify(analysis, null, 2), "utf8");
    },
    async list(options: ListOptions = {}) {
      const all = await readAll();
      const filtered = options.marketId ? all.filter((a) => a.marketId === options.marketId) : all;
      const offset = options.offset ?? 0;
      const limit = options.limit ?? 50;
      return { analyses: filtered.slice(offset, offset + limit), total: filtered.length };
    },
    async get(id) {
      const all = await readAll();
      return all.find((a) => a.id === id) ?? null;
    },
  };
}
