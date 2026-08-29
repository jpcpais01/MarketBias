/**
 * Client helper for reading the NDJSON stream from POST /api/analyze.
 *
 * Kept separate from React so the parsing (partial lines, trailing buffer,
 * non-stream error responses) is easy to reason about on its own.
 */

import type { AnalysisEvent } from "@/lib/types";

export async function streamAnalysis(
  body: { marketId: string; model?: string; runs?: number },
  onEvent: (event: AnalysisEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  // Validation failures return a plain JSON error rather than a stream.
  if (!response.ok || !response.body) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the status-based message.
    }
    onEvent({ type: "error", message });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      onEvent(JSON.parse(trimmed) as AnalysisEvent);
    } catch {
      // Ignore any non-JSON line rather than aborting a run in progress.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // The final element may be a partial line; keep it buffered.
    buffer = lines.pop() ?? "";
    lines.forEach(flushLine);
  }

  buffer += decoder.decode();
  flushLine(buffer);
}
