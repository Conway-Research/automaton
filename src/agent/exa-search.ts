/**
 * Exa AI-Powered Web Search
 *
 * Provides web search via the Exa API (https://exa.ai).
 * Uses raw HTTP calls to match the repo's fetch-based pattern.
 */

import { createLogger } from "../observability/logger.js";

const logger = createLogger("exa-search");

const EXA_API_URL = "https://api.exa.ai/search";

// ─── Types ──────────────────────────────────────────────────────

export interface ExaSearchOptions {
  query: string;
  searchType?: "auto" | "neural" | "fast";
  numResults?: number;
  category?:
    | "company"
    | "research paper"
    | "news"
    | "personal site"
    | "financial report"
    | "people";
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: string[];
  excludeText?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  contentMode?: "text" | "highlights" | "summary" | "all";
  maxCharacters?: number;
}

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate: string | null;
  author: string | null;
  text?: string;
  highlights?: string[];
  summary?: string;
}

export interface ExaSearchResponse {
  requestId: string;
  results: ExaSearchResult[];
  searchType: string;
}

// ─── Content Builder ────────────────────────────────────────────

function buildContents(
  mode: string,
  maxCharacters?: number,
): Record<string, unknown> {
  const contents: Record<string, unknown> = {};
  const charLimit = maxCharacters ?? 1000;

  if (mode === "text" || mode === "all") {
    contents.text = { maxCharacters: charLimit };
  }
  if (mode === "highlights" || mode === "all") {
    contents.highlights = { maxCharacters: charLimit };
  }
  if (mode === "summary" || mode === "all") {
    contents.summary = { query: "" };
  }

  return contents;
}

// ─── Snippet Extraction ─────────────────────────────────────────

/**
 * Build a display snippet from whichever content fields are available.
 * Cascades: highlights -> summary -> text (truncated).
 */
export function extractSnippet(result: ExaSearchResult): string {
  if (result.highlights && result.highlights.length > 0) {
    return result.highlights.join(" … ");
  }
  if (result.summary) {
    return result.summary;
  }
  if (result.text) {
    return result.text.length > 300
      ? result.text.slice(0, 300) + "…"
      : result.text;
  }
  return "(no content)";
}

// ─── Search Function ────────────────────────────────────────────

export async function exaSearch(
  options: ExaSearchOptions,
): Promise<ExaSearchResponse> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EXA_API_KEY environment variable is not set. " +
        "Get an API key at https://dashboard.exa.ai/api-keys",
    );
  }

  const contentMode = options.contentMode ?? "highlights";
  const contents = buildContents(contentMode, options.maxCharacters);

  const body: Record<string, unknown> = {
    query: options.query,
    type: options.searchType ?? "auto",
    numResults: options.numResults ?? 5,
    contents,
  };

  if (options.category) body.category = options.category;
  if (options.includeDomains?.length)
    body.includeDomains = options.includeDomains;
  if (options.excludeDomains?.length)
    body.excludeDomains = options.excludeDomains;
  if (options.includeText?.length) body.includeText = options.includeText;
  if (options.excludeText?.length) body.excludeText = options.excludeText;
  if (options.startPublishedDate)
    body.startPublishedDate = options.startPublishedDate;
  if (options.endPublishedDate)
    body.endPublishedDate = options.endPublishedDate;

  logger.info("Exa search request", {
    query: options.query,
    type: body.type as string,
    numResults: body.numResults as number,
  });

  const response = await fetch(EXA_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-exa-integration": "automaton",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`Exa API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    requestId?: string;
    results?: Array<{
      title?: string;
      url?: string;
      publishedDate?: string | null;
      author?: string | null;
      text?: string;
      highlights?: string[];
      summary?: string;
    }>;
    searchType?: string;
  };

  const results: ExaSearchResult[] = (data.results ?? []).map((r) => ({
    title: r.title ?? "(untitled)",
    url: r.url ?? "",
    publishedDate: r.publishedDate ?? null,
    author: r.author ?? null,
    ...(r.text !== undefined ? { text: r.text } : {}),
    ...(r.highlights !== undefined ? { highlights: r.highlights } : {}),
    ...(r.summary !== undefined ? { summary: r.summary } : {}),
  }));

  return {
    requestId: data.requestId ?? "",
    results,
    searchType: data.searchType ?? "unknown",
  };
}

// ─── Formatter ──────────────────────────────────────────────────

export function formatResults(response: ExaSearchResponse): string {
  if (response.results.length === 0) {
    return "No results found.";
  }

  const lines = response.results.map((r, i) => {
    const parts = [`${i + 1}. ${r.title}`, `   ${r.url}`];
    if (r.publishedDate) parts.push(`   Published: ${r.publishedDate}`);
    if (r.author) parts.push(`   Author: ${r.author}`);
    const snippet = extractSnippet(r);
    if (snippet !== "(no content)") parts.push(`   ${snippet}`);
    return parts.join("\n");
  });

  return lines.join("\n\n");
}
