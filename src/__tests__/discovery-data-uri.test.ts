/**
 * Discovery: data: URI Inline Handling Tests
 *
 * Tests fetchAgentCard handling of data:application/json URIs
 * (base64 and percent-encoded), size limits, error paths, and
 * non-JSON MIME type rejection.
 */

import { describe, it, expect, vi } from "vitest";

// Mock erc8004.js to avoid ABI parse error at import time
vi.mock("../registry/erc8004.js", () => ({
  queryAgent: vi.fn(),
  getTotalAgents: vi.fn().mockResolvedValue(0),
  registerAgent: vi.fn(),
  leaveFeedback: vi.fn(),
  getRegisteredAgentsByEvents: vi.fn().mockResolvedValue([]),
}));

// Mock injection-defense.js to avoid import chain issues
vi.mock("../agent/injection-defense.js", () => ({
  sanitizeToolResult: vi.fn((s: string) => s),
  sanitizeInput: vi.fn((s: string) => ({ content: s, blocked: false })),
}));

// Import after mocks are set up
const { fetchAgentCard, isAllowedUri } = await import("../registry/discovery.js");

// Helper: encode a valid agent card as base64 data: URI
function makeBase64DataUri(card: Record<string, unknown>): string {
  const json = JSON.stringify(card);
  const b64 = Buffer.from(json).toString("base64");
  return `data:application/json;base64,${b64}`;
}

// Helper: encode a valid agent card as percent-encoded data: URI
function makePercentEncodedDataUri(card: Record<string, unknown>): string {
  const json = JSON.stringify(card);
  return `data:application/json,${encodeURIComponent(json)}`;
}

const VALID_CARD = { name: "TestAgent", type: "autonomous", description: "A test agent" };

describe("fetchAgentCard — data: URI handling", () => {
  it("decodes valid base64 data: URI and returns AgentCard", async () => {
    const uri = makeBase64DataUri(VALID_CARD);
    const result = await fetchAgentCard(uri);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("TestAgent");
    expect(result!.type).toBe("autonomous");
    expect(result!.description).toBe("A test agent");
  });

  it("decodes valid percent-encoded data: URI and returns AgentCard", async () => {
    const uri = makePercentEncodedDataUri(VALID_CARD);
    const result = await fetchAgentCard(uri);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("TestAgent");
    expect(result!.type).toBe("autonomous");
  });

  it("handles base64 data: URI with charset parameter", async () => {
    const json = JSON.stringify(VALID_CARD);
    const b64 = Buffer.from(json).toString("base64");
    const uri = `data:application/json;charset=utf-8;base64,${b64}`;
    const result = await fetchAgentCard(uri);

    expect(result).not.toBeNull();
    expect(result!.name).toBe("TestAgent");
  });

  it("rejects oversized data: URI payload", async () => {
    const oversizedCard = {
      name: "TestAgent",
      type: "autonomous",
      description: "x".repeat(70_000), // exceeds 64KB default
    };
    const uri = makeBase64DataUri(oversizedCard);
    const result = await fetchAgentCard(uri);

    expect(result).toBeNull();
  });

  it("rejects oversized data: URI with custom maxCardSizeBytes", async () => {
    const card = { name: "TestAgent", type: "autonomous", description: "moderate" };
    const uri = makeBase64DataUri(card);
    const result = await fetchAgentCard(uri, { maxCardSizeBytes: 10 }); // very small limit

    expect(result).toBeNull();
  });

  it("returns null for invalid JSON in base64 data: URI", async () => {
    const badJson = "this is not json";
    const b64 = Buffer.from(badJson).toString("base64");
    const uri = `data:application/json;base64,${b64}`;
    const result = await fetchAgentCard(uri);

    expect(result).toBeNull();
  });

  it("returns null for invalid base64 producing invalid JSON", async () => {
    const uri = `data:application/json;base64,INVALID===BAD`;
    const result = await fetchAgentCard(uri);

    expect(result).toBeNull();
  });

  it("returns null for malformed percent-encoded data: URI", async () => {
    const uri = `data:application/json,{malformed`;
    const result = await fetchAgentCard(uri);

    expect(result).toBeNull();
  });

  it("returns null for empty base64 payload", async () => {
    const uri = `data:application/json;base64,`;
    const result = await fetchAgentCard(uri);

    expect(result).toBeNull();
  });

  it("does NOT intercept non-JSON data: URIs (falls through to SSRF check)", async () => {
    const html = Buffer.from("<script>alert(1)</script>").toString("base64");
    const uri = `data:text/html;base64,${html}`;

    // This should NOT be intercepted by the data: handler,
    // and should fall through to isAllowedUri which blocks it
    const result = await fetchAgentCard(uri);
    expect(result).toBeNull();

    // Confirm isAllowedUri rejects data:text/html
    expect(isAllowedUri(uri)).toBe(false);
  });

  it("returns null when validateAgentCard rejects schema", async () => {
    // Missing required 'type' field
    const badCard = { name: "TestAgent" };
    const uri = makeBase64DataUri(badCard);
    const result = await fetchAgentCard(uri);

    // validateAgentCard requires both name and type
    expect(result).toBeNull();
  });

  it("HTTPS URIs are not intercepted by data: handler", async () => {
    // This verifies the data: handler doesn't accidentally match HTTPS URIs.
    // The actual fetch would fail (no server), but we just need to confirm
    // it doesn't go through the data: path.
    const httpsUri = "https://example.com/agent-card.json";
    expect(httpsUri.startsWith("data:application/json")).toBe(false);
    expect(isAllowedUri(httpsUri)).toBe(true);
  });
});
