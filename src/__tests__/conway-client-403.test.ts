/**
 * Tests for Conway client 403 fallback removal and
 * heartbeat daemon first-tick overlap fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConwayClient } from "../conway/client.js";

// ─── Mock fetch ─────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ─── Conway Client 403 Tests ────────────────────────────────────

describe("Conway client sandbox 403 handling", () => {
  it("exec throws on 403 instead of falling back to local shell", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "sandbox-123",
    });

    await expect(client.exec("whoami")).rejects.toThrow("403");
  });

  it("writeFile throws on 403 instead of falling back to local FS", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "sandbox-123",
    });

    await expect(client.writeFile("/tmp/test.txt", "data")).rejects.toThrow("403");
  });

  it("readFile throws on 403 instead of falling back to local FS", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        statusText: "Forbidden",
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "sandbox-123",
    });

    await expect(client.readFile("/etc/hostname")).rejects.toThrow("403");
  });

  it("exec still falls back to local when sandboxId is empty", async () => {
    const client = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "",
    });

    // isLocal mode should work without fetch
    const result = await client.exec("echo hello");
    expect(result.stdout).toContain("hello");
    expect(result.exitCode).toBe(0);
  });

  it("exec propagates non-403 errors normally", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      }),
    );

    const client = createConwayClient({
      apiUrl: "https://api.conway.tech",
      apiKey: "test-key",
      sandboxId: "sandbox-123",
    });

    await expect(client.exec("ls")).rejects.toThrow("404");
  });
});
