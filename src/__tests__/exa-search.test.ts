/**
 * Exa Search Tool Tests
 *
 * Tests for the Exa AI-powered web search tool:
 * - API response parsing
 * - Content/snippet fallback logic
 * - Disabled state when EXA_API_KEY is unset
 * - Tool registration and risk level
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  exaSearch,
  extractSnippet,
  formatResults,
  type ExaSearchResult,
  type ExaSearchResponse,
} from "../agent/exa-search.js";
import { createBuiltinTools, executeTool } from "../agent/tools.js";
import {
  MockInferenceClient,
  MockConwayClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
} from "./mocks.js";
import type { AutomatonTool, ToolContext } from "../types.js";

// Mock erc8004.js to avoid ABI parse error (same as other test files)
vi.mock("../registry/erc8004.js", () => ({
  queryAgent: vi.fn(),
  getTotalAgents: vi.fn().mockResolvedValue(0),
  registerAgent: vi.fn(),
  leaveFeedback: vi.fn(),
}));

// ─── Fixture Data ───────────────────────────────────────────────

const MOCK_API_RESPONSE = {
  requestId: "req_test_123",
  results: [
    {
      title: "Introduction to Neural Search",
      url: "https://example.com/neural-search",
      publishedDate: "2024-06-15",
      author: "Jane Doe",
      text: "Neural search uses deep learning to understand query semantics.",
      highlights: [
        "Neural search uses deep learning to understand query semantics and return relevant results.",
      ],
      summary: "An overview of neural search technology.",
    },
    {
      title: "Search Engine Comparison",
      url: "https://example.com/comparison",
      publishedDate: null,
      author: null,
      highlights: ["Exa outperforms traditional keyword-based search."],
    },
    {
      title: "Empty Result Page",
      url: "https://example.com/empty",
      publishedDate: null,
      author: null,
    },
  ],
  searchType: "neural",
};

const MOCK_EMPTY_RESPONSE = {
  requestId: "req_empty_456",
  results: [],
  searchType: "auto",
};

// ─── Snippet Extraction ─────────────────────────────────────────

describe("extractSnippet", () => {
  it("prefers highlights when available", () => {
    const result: ExaSearchResult = {
      title: "Test",
      url: "https://example.com",
      publishedDate: null,
      author: null,
      highlights: ["First highlight", "Second highlight"],
      summary: "A summary",
      text: "Full text content",
    };
    expect(extractSnippet(result)).toBe("First highlight … Second highlight");
  });

  it("falls back to summary when highlights are missing", () => {
    const result: ExaSearchResult = {
      title: "Test",
      url: "https://example.com",
      publishedDate: null,
      author: null,
      summary: "A summary of the page",
      text: "Full text content",
    };
    expect(extractSnippet(result)).toBe("A summary of the page");
  });

  it("falls back to truncated text when highlights and summary are missing", () => {
    const longText = "A".repeat(500);
    const result: ExaSearchResult = {
      title: "Test",
      url: "https://example.com",
      publishedDate: null,
      author: null,
      text: longText,
    };
    const snippet = extractSnippet(result);
    expect(snippet.length).toBeLessThanOrEqual(301); // 300 + ellipsis
    expect(snippet).toContain("…");
  });

  it("returns short text without truncation", () => {
    const result: ExaSearchResult = {
      title: "Test",
      url: "https://example.com",
      publishedDate: null,
      author: null,
      text: "Short text",
    };
    expect(extractSnippet(result)).toBe("Short text");
  });

  it("returns placeholder when no content fields are present", () => {
    const result: ExaSearchResult = {
      title: "Test",
      url: "https://example.com",
      publishedDate: null,
      author: null,
    };
    expect(extractSnippet(result)).toBe("(no content)");
  });

  it("skips empty highlights array", () => {
    const result: ExaSearchResult = {
      title: "Test",
      url: "https://example.com",
      publishedDate: null,
      author: null,
      highlights: [],
      summary: "Fallback summary",
    };
    expect(extractSnippet(result)).toBe("Fallback summary");
  });
});

// ─── Result Formatting ──────────────────────────────────────────

describe("formatResults", () => {
  it("formats multiple results with numbered entries", () => {
    const response: ExaSearchResponse = {
      requestId: "req_123",
      results: MOCK_API_RESPONSE.results as ExaSearchResult[],
      searchType: "neural",
    };
    const formatted = formatResults(response);
    expect(formatted).toContain("1. Introduction to Neural Search");
    expect(formatted).toContain("https://example.com/neural-search");
    expect(formatted).toContain("Published: 2024-06-15");
    expect(formatted).toContain("Author: Jane Doe");
    expect(formatted).toContain("2. Search Engine Comparison");
    expect(formatted).toContain("3. Empty Result Page");
    // Results with no content fields show only title and URL (no snippet line)
    expect(formatted).not.toContain("(no content)");
  });

  it("returns 'No results found.' for empty results", () => {
    const response: ExaSearchResponse = {
      requestId: "req_empty",
      results: [],
      searchType: "auto",
    };
    expect(formatResults(response)).toBe("No results found.");
  });
});

// ─── API Response Parsing ───────────────────────────────────────

describe("exaSearch", () => {
  const originalEnv = process.env.EXA_API_KEY;

  beforeEach(() => {
    process.env.EXA_API_KEY = "test-api-key";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.EXA_API_KEY = originalEnv;
    } else {
      delete process.env.EXA_API_KEY;
    }
    vi.restoreAllMocks();
  });

  it("parses a successful API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_API_RESPONSE),
      }),
    );

    const response = await exaSearch({ query: "neural search" });

    expect(response.requestId).toBe("req_test_123");
    expect(response.searchType).toBe("neural");
    expect(response.results).toHaveLength(3);

    const first = response.results[0];
    expect(first.title).toBe("Introduction to Neural Search");
    expect(first.url).toBe("https://example.com/neural-search");
    expect(first.publishedDate).toBe("2024-06-15");
    expect(first.author).toBe("Jane Doe");
    expect(first.highlights).toEqual([
      "Neural search uses deep learning to understand query semantics and return relevant results.",
    ]);

    // Third result has no content fields
    const third = response.results[2];
    expect(third.text).toBeUndefined();
    expect(third.highlights).toBeUndefined();
    expect(third.summary).toBeUndefined();
  });

  it("sends correct request body with all options", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_EMPTY_RESPONSE),
    });
    vi.stubGlobal("fetch", mockFetch);

    await exaSearch({
      query: "AI agents",
      searchType: "neural",
      numResults: 10,
      category: "research paper",
      includeDomains: ["arxiv.org"],
      excludeDomains: ["pinterest.com"],
      includeText: ["transformer"],
      excludeText: ["deprecated"],
      startPublishedDate: "2024-01-01",
      endPublishedDate: "2024-12-31",
      contentMode: "all",
      maxCharacters: 2000,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.exa.ai/search");
    expect(options.method).toBe("POST");
    expect(options.headers["x-api-key"]).toBe("test-api-key");
    expect(options.headers["x-exa-integration"]).toBe("automaton");

    const body = JSON.parse(options.body);
    expect(body.query).toBe("AI agents");
    expect(body.type).toBe("neural");
    expect(body.numResults).toBe(10);
    expect(body.category).toBe("research paper");
    expect(body.includeDomains).toEqual(["arxiv.org"]);
    expect(body.excludeDomains).toEqual(["pinterest.com"]);
    expect(body.includeText).toEqual(["transformer"]);
    expect(body.excludeText).toEqual(["deprecated"]);
    expect(body.startPublishedDate).toBe("2024-01-01");
    expect(body.endPublishedDate).toBe("2024-12-31");
    expect(body.contents).toEqual({
      text: { maxCharacters: 2000 },
      highlights: { maxCharacters: 2000 },
      summary: { query: "" },
    });
  });

  it("throws when EXA_API_KEY is not set", async () => {
    delete process.env.EXA_API_KEY;
    await expect(exaSearch({ query: "test" })).rejects.toThrow(
      "EXA_API_KEY environment variable is not set",
    );
  });

  it("throws on API error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid API key"),
      }),
    );

    await expect(exaSearch({ query: "test" })).rejects.toThrow(
      "Exa API error (401): Invalid API key",
    );
  });

  it("handles missing fields in API response gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [{ url: "https://example.com" }],
          }),
      }),
    );

    const response = await exaSearch({ query: "test" });
    expect(response.requestId).toBe("");
    expect(response.results[0].title).toBe("(untitled)");
  });
});

// ─── Tool Registration ──────────────────────────────────────────

describe("exa_search tool registration", () => {
  let tools: AutomatonTool[];

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
  });

  it("is registered as a builtin tool", () => {
    const exaTool = tools.find((t) => t.name === "exa_search");
    expect(exaTool).toBeDefined();
  });

  it("has safe risk level", () => {
    const exaTool = tools.find((t) => t.name === "exa_search");
    expect(exaTool?.riskLevel).toBe("safe");
  });

  it("has conway category", () => {
    const exaTool = tools.find((t) => t.name === "exa_search");
    expect(exaTool?.category).toBe("conway");
  });

  it("requires query parameter", () => {
    const exaTool = tools.find((t) => t.name === "exa_search");
    const params = exaTool?.parameters as { required?: string[] };
    expect(params.required).toContain("query");
  });
});

// ─── Disabled State ─────────────────────────────────────────────

describe("exa_search disabled when EXA_API_KEY unset", () => {
  let tools: AutomatonTool[];
  let context: ToolContext;

  beforeEach(() => {
    tools = createBuiltinTools("test-sandbox-id");
    context = {
      identity: createTestIdentity(),
      config: createTestConfig(),
      db: createTestDb(),
      conway: new MockConwayClient(),
      inference: new MockInferenceClient(),
    };
  });

  it("returns helpful message when EXA_API_KEY is not set", async () => {
    const originalKey = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;

    const exaTool = tools.find((t) => t.name === "exa_search")!;
    const result = await exaTool.execute({ query: "test" }, context);

    expect(result).toContain("EXA_API_KEY");
    expect(result).toContain("not available");

    if (originalKey !== undefined) {
      process.env.EXA_API_KEY = originalKey;
    }
  });
});
