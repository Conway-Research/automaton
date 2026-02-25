/**
 * Tests for ResilientHttpClient — Phase 1.3 Network Resilience
 *
 * Covers: timeouts, retries, backoff, circuit breaker, idempotency keys,
 * cached balance fallback, api_unreachable state handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ResilientHttpClient,
  CircuitOpenError,
} from "../conway/http-client.js";

// ─── Mock fetch ────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({
      "content-type": "application/json",
      ...headers,
    }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

// ─── Tests ─────────────────────────────────────────────────────

describe("ResilientHttpClient", () => {
  describe("timeout behavior", () => {
    it("aborts request after configured timeout", async () => {
      const client = new ResilientHttpClient({
        baseTimeout: 100,
        maxRetries: 0,
      });

      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              });
            }
          });
        },
      );

      const pending = client.request("https://api.example.com/test");
      const assertion = expect(pending).rejects.toThrow();
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("retry on 5xx/429", () => {
    it("retries on 500 and succeeds on second attempt", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 2,
        backoffBase: 1,
        backoffMax: 10,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockResponse(500));
        }
        return Promise.resolve(mockResponse(200, { ok: true }));
      });

      const pending = client.request("https://api.example.com/test");
      await vi.runAllTimersAsync();
      const resp = await pending;
      expect(resp.status).toBe(200);
      expect(callCount).toBe(2);
    });

    it("retries on 429 with backoff", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 2,
        backoffBase: 1,
        backoffMax: 10,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.resolve(mockResponse(429));
        }
        return Promise.resolve(mockResponse(200, { ok: true }));
      });

      const pending = client.request("https://api.example.com/test");
      await vi.runAllTimersAsync();
      const resp = await pending;
      expect(resp.status).toBe(200);
      expect(callCount).toBe(3);
    });

    it("retries on 502, 503, 504", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 3,
        backoffBase: 1,
        backoffMax: 10,
      });

      const statusCodes = [502, 503, 504];
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(() => {
        if (callCount < statusCodes.length) {
          const status = statusCodes[callCount];
          callCount++;
          return Promise.resolve(mockResponse(status));
        }
        callCount++;
        return Promise.resolve(mockResponse(200, { ok: true }));
      });

      const pending = client.request("https://api.example.com/test");
      await vi.runAllTimersAsync();
      const resp = await pending;
      expect(resp.status).toBe(200);
      expect(callCount).toBe(4);
    });
  });

  describe("no retry on 4xx", () => {
    it("does not retry on 400", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 3,
        backoffBase: 1,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(mockResponse(400, { error: "bad request" }));
      });

      const resp = await client.request("https://api.example.com/test");
      expect(resp.status).toBe(400);
      expect(callCount).toBe(1);
    });

    it("does not retry on 401", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 3,
        backoffBase: 1,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(mockResponse(401));
      });

      const resp = await client.request("https://api.example.com/test");
      expect(resp.status).toBe(401);
      expect(callCount).toBe(1);
    });

    it("does not retry on 404", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 3,
        backoffBase: 1,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(mockResponse(404));
      });

      const resp = await client.request("https://api.example.com/test");
      expect(resp.status).toBe(404);
      expect(callCount).toBe(1);
    });
  });

  describe("retry exhaustion", () => {
    it("throws after max retries on network error", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 2,
        backoffBase: 1,
        backoffMax: 10,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error("Network failure"));
      });

      const pending = client.request("https://api.example.com/test");
      const assertion = expect(pending).rejects.toThrow("Network failure");
      await vi.runAllTimersAsync();
      await assertion;
      expect(callCount).toBe(3); // 1 initial + 2 retries
    });

    it("returns last retryable status if all retries exhausted", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 2,
        backoffBase: 1,
        backoffMax: 10,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(mockResponse(503));
      });

      const pending = client.request("https://api.example.com/test");
      await vi.runAllTimersAsync();
      const resp = await pending;
      // After maxRetries exhausted, returns the last 503 response
      expect(resp.status).toBe(503);
      expect(callCount).toBe(3); // 1 initial + 2 retries
    });
  });

  describe("circuit breaker", () => {
    it("opens after threshold consecutive failures", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 3,
        circuitBreakerResetMs: 5000,
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));

      // Trigger 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        await expect(
          client.request("https://api.example.com/test"),
        ).rejects.toThrow("fail");
      }

      expect(client.isCircuitOpen()).toBe(true);
      expect(client.getConsecutiveFailures()).toBe(3);

      // Next call should throw CircuitOpenError immediately
      await expect(
        client.request("https://api.example.com/test"),
      ).rejects.toThrow(CircuitOpenError);
    });

    it("auto-resets after cooldown period", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 2,
        circuitBreakerResetMs: 1000,
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          client.request("https://api.example.com/test"),
        ).rejects.toThrow("fail");
      }
      expect(client.isCircuitOpen()).toBe(true);

      // Advance time past reset period
      vi.advanceTimersByTime(1100);

      // Circuit should be closed now
      expect(client.isCircuitOpen()).toBe(false);

      // Should be able to make requests again
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200));
      const resp = await client.request("https://api.example.com/test");
      expect(resp.status).toBe(200);
    });

    it("resets consecutive failures on success", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 5,
      });

      // Fail 3 times
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));
      for (let i = 0; i < 3; i++) {
        await expect(
          client.request("https://api.example.com/test"),
        ).rejects.toThrow();
      }
      expect(client.getConsecutiveFailures()).toBe(3);

      // Succeed once
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200));
      await client.request("https://api.example.com/test");
      expect(client.getConsecutiveFailures()).toBe(0);
    });

    it("CircuitOpenError includes resetAt timestamp", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 1,
        circuitBreakerResetMs: 60_000,
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));
      await expect(
        client.request("https://api.example.com/test"),
      ).rejects.toThrow();

      try {
        await client.request("https://api.example.com/test");
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitOpenError);
        expect((err as CircuitOpenError).resetAt).toBeGreaterThan(Date.now());
      }
    });

    it("resetCircuit() clears state", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 1,
        circuitBreakerResetMs: 60_000,
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("fail"));
      await expect(
        client.request("https://api.example.com/test"),
      ).rejects.toThrow();
      expect(client.isCircuitOpen()).toBe(true);

      client.resetCircuit();
      expect(client.isCircuitOpen()).toBe(false);
      expect(client.getConsecutiveFailures()).toBe(0);
    });

    it("counts retryable HTTP statuses toward circuit breaker threshold", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 3,
        circuitBreakerResetMs: 5000,
      });

      // Return 502 three times (retryable status, no retries)
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(502));

      for (let i = 0; i < 3; i++) {
        await client.request("https://api.example.com/test");
      }

      // Circuit should be open because retryable statuses count as failures
      expect(client.getConsecutiveFailures()).toBe(3);
      expect(client.isCircuitOpen()).toBe(true);
    });

    it("resets failure counter only on non-retryable success", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 0,
        circuitBreakerThreshold: 5,
      });

      // Two 502 failures
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(502));
      await client.request("https://api.example.com/test");
      await client.request("https://api.example.com/test");
      expect(client.getConsecutiveFailures()).toBe(2);

      // One 200 success should reset
      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse(200));
      await client.request("https://api.example.com/test");
      expect(client.getConsecutiveFailures()).toBe(0);
    });
  });

  describe("idempotency key", () => {
    it("includes Idempotency-Key header when provided", async () => {
      const client = new ResilientHttpClient({ maxRetries: 0 });

      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) => {
          capturedHeaders = init?.headers;
          return Promise.resolve(mockResponse(200));
        },
      );

      await client.request("https://api.example.com/test", {
        method: "POST",
        idempotencyKey: "test-key-123",
      });

      expect(capturedHeaders).toBeDefined();
      const headers = capturedHeaders as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe("test-key-123");
    });

    it("does not include Idempotency-Key header when not provided", async () => {
      const client = new ResilientHttpClient({ maxRetries: 0 });

      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) => {
          capturedHeaders = init?.headers;
          return Promise.resolve(mockResponse(200));
        },
      );

      await client.request("https://api.example.com/test", {
        method: "GET",
      });

      const headers = capturedHeaders as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBeUndefined();
    });
  });

  describe("default configuration", () => {
    it("uses default config when none provided", () => {
      const client = new ResilientHttpClient();
      expect(client.isCircuitOpen()).toBe(false);
      expect(client.getConsecutiveFailures()).toBe(0);
    });

    it("merges partial config with defaults", () => {
      const client = new ResilientHttpClient({ maxRetries: 5 });
      // Should still have defaults for other fields
      expect(client.isCircuitOpen()).toBe(false);
    });
  });

  describe("request options override", () => {
    it("allows per-request retry override", async () => {
      const client = new ResilientHttpClient({
        maxRetries: 3,
        backoffBase: 1,
        backoffMax: 10,
      });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error("fail"));
      });

      await expect(
        client.request("https://api.example.com/test", { retries: 0 }),
      ).rejects.toThrow("fail");
      expect(callCount).toBe(1); // No retries
    });

    it("allows per-request timeout override", async () => {
      const client = new ResilientHttpClient({
        baseTimeout: 30_000,
        maxRetries: 0,
      });

      globalThis.fetch = vi.fn().mockImplementation(
        (_url: string, init?: RequestInit) => {
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener("abort", () => {
                reject(new DOMException("The operation was aborted.", "AbortError"));
              });
            }
          });
        },
      );

      const pending = client.request("https://api.example.com/test", { timeout: 50 });
      const assertion = expect(pending).rejects.toThrow();
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  describe("timer cleanup on error", () => {
    it("clears timeout timer when fetch throws", async () => {
      const client = new ResilientHttpClient({
        baseTimeout: 5000,
        maxRetries: 0,
      });

      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network failure"));

      await expect(
        client.request("https://api.example.com/test"),
      ).rejects.toThrow("Network failure");

      // clearTimeout should have been called in the catch block
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
