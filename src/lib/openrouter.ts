/**
 * OpenRouter chat-completions client.
 *
 * The API key is read from the server-only config and never leaves this module.
 * The model is entirely env-driven (`OPENROUTER_MODEL`) so swapping models is a
 * config change, not a code change.
 */

import "server-only";

import { config, requireOpenRouterKey } from "@/lib/env";
import type { Source } from "@/lib/types";

export class OpenRouterError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  model?: string;
  /** Enables OpenRouter's `web` plugin for this call. */
  webSearch?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Requests a JSON object response when the model supports it. */
  json?: boolean;
}

export interface ChatResult {
  content: string;
  model: string;
  /** Citations surfaced by the web plugin, normalised to our Source shape. */
  citations: Source[];
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

interface Annotation {
  type?: string;
  url_citation?: { url?: string; title?: string; content?: string };
}

function extractCitations(message: Record<string, unknown> | undefined): Source[] {
  if (!message) return [];
  const annotations = message.annotations;
  if (!Array.isArray(annotations)) return [];

  const sources: Source[] = [];
  const seen = new Set<string>();
  for (const entry of annotations as Annotation[]) {
    const citation = entry?.url_citation;
    const url = citation?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    sources.push({ title: citation?.title?.trim() || url, url });
  }
  return sources;
}

/** Single non-streaming chat completion. Throws OpenRouterError on failure. */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const apiKey = requireOpenRouterKey();
  const model = options.model?.trim() || config.openRouter.model;

  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.2,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.json && config.openRouter.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  if (options.webSearch) {
    // OpenRouter's provider-agnostic web plugin: works with any model, and is
    // equivalent to the `:online` model suffix.
    body.plugins = [{ id: "web", max_results: config.openRouter.webMaxResults }];
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": config.openRouter.siteName,
  };
  if (config.openRouter.siteUrl) headers["HTTP-Referer"] = config.openRouter.siteUrl;

  let response: Response;
  try {
    response = await fetch(`${config.openRouter.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.openRouter.timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new OpenRouterError(`Could not reach OpenRouter: ${reason}`, 504);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new OpenRouterError(
      `OpenRouter returned ${response.status}: ${extractErrorMessage(text) ?? response.statusText}`,
      response.status === 401 || response.status === 402 ? response.status : 502,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OpenRouterError("OpenRouter returned a malformed response.");
  }

  // OpenRouter can return a 200 with an error envelope for upstream failures.
  if (payload.error) {
    throw new OpenRouterError(`OpenRouter error: ${extractErrorMessage(text) ?? "unknown error"}`);
  }

  const choices = payload.choices;
  const choice = Array.isArray(choices) ? (choices[0] as Record<string, unknown> | undefined) : undefined;
  const message = choice?.message as Record<string, unknown> | undefined;
  const content = typeof message?.content === "string" ? message.content : "";

  if (!content.trim()) {
    throw new OpenRouterError("OpenRouter returned an empty completion.");
  }

  const usage = payload.usage as Record<string, unknown> | undefined;

  return {
    content,
    model: typeof payload.model === "string" ? payload.model : model,
    citations: extractCitations(message),
    usage: usage
      ? {
          promptTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
          completionTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
          totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
        }
      : undefined,
  };
}

function extractErrorMessage(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Non-JSON error body; fall through.
  }
  return text.slice(0, 300) || null;
}

/**
 * Extracts a JSON object from a model response.
 *
 * Models wrap JSON in prose or fences even when told not to, and web-search
 * models often prepend citations, so this scans for the first balanced object
 * rather than trusting `JSON.parse` on the whole string.
 */
export function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();

  const candidates: string[] = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  const balanced = findBalancedObject(trimmed);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new OpenRouterError(
    "The model did not return parseable JSON. Try a different OPENROUTER_MODEL — the workflow needs a model that follows JSON instructions reliably.",
  );
}

/** Returns the first top-level `{...}` block, ignoring braces inside strings. */
function findBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}
