/**
 * Integration tests for UnifiedInferenceClient failover behavior.
 *
 * These tests exercise the interaction between UnifiedInferenceClient and
 * ProviderRegistry as a unit: registry tier resolution, circuit-breaker state
 * synced back into the registry, survival-mode tier downgrade, and the
 * emergency stop policy all working together.
 *
 * The OpenAI network layer is mocked via vi.hoisted so no real HTTP calls are
 * made. Each test gets a fresh client + registry pair to avoid state bleed.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRegistry, type ProviderConfig } from "../../inference/provider-registry.js";
import { UnifiedInferenceClient } from "../../inference/inference-client.js";
import type { ChatMessage } from "../../types.js";

// ---------------------------------------------------------------------------
// OpenAI mock — must be hoisted so the module mock runs before imports resolve
// ---------------------------------------------------------------------------

const mockState = vi.hoisted(() => {
  const queue: Array<(payload: unknown) => unknown | Promise<unknown>> = [];
  const calls: unknown[] = [];

  const create = vi.fn(async (payload: unknown) => {
    calls.push(payload);
    const next = queue.shift();
    if (!next) {
      throw new Error("No OpenAI mock response queued");
    }
    return next(payload);
  });

  const ctor = vi.fn().mockImplementation(function MockOpenAI(this: Record<string, unknown>) {
    this.chat = { completions: { create } };
  });

  return { queue, calls, create, ctor };
});

vi.mock("openai", () => ({ default: mockState.ctor }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORIGINAL_ENV = { ...process.env };
const BASE_MESSAGES: ChatMessage[] = [{ role: "user", content: "ping" }];

/** Build a minimal enabled provider with models for all three tiers. */
function makeProvider(
  id: string,
  priority: number,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example.com/v1`,
    apiKeyEnvVar: `${id.toUpperCase()}_API_KEY`,
    models: [
      {
        id: `${id}-reasoning`,
        tier: "reasoning",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        costPerInputToken: 1.0,
        costPerOutputToken: 2.0,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: `${id}-fast`,
        tier: "fast",
        contextWindow: 128000,
        maxOutputTokens: 4096,
        costPerInputToken: 0.2,
        costPerOutputToken: 0.4,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
      {
        id: `${id}-cheap`,
        tier: "cheap",
        contextWindow: 128000,
        maxOutputTokens: 2048,
        costPerInputToken: 0.05,
        costPerOutputToken: 0.1,
        supportsTools: true,
        supportsVision: false,
        supportsStreaming: true,
      },
    ],
    maxRequestsPerMinute: 100,
    maxTokensPerMinute: 500000,
    priority,
    enabled: true,
    ...overrides,
  };
}

/** Build a registry with the given providers and explicit tier preference order. */
function makeRegistry(providers: ProviderConfig[], preferredForReasoning?: string): ProviderRegistry {
  const primaryId = preferredForReasoning ?? providers[0]?.id ?? "alpha";
  const fallbackIds = providers.slice(1).map((p) => p.id);
  return new ProviderRegistry(providers, {
    reasoning: { preferredProvider: primaryId, fallbackOrder: fallbackIds },
    fast: { preferredProvider: primaryId, fallbackOrder: fallbackIds },
    cheap: { preferredProvider: primaryId, fallbackOrder: fallbackIds },
  });
}

function makeClient(registry: ProviderRegistry): UnifiedInferenceClient {
  return new UnifiedInferenceClient(registry);
}

/** Push a successful chat completion onto the mock queue. */
function queueCompletion(content = "ok", promptTokens = 100, completionTokens = 20): void {
  mockState.queue.push(async () => ({
    choices: [{ message: { content } }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  }));
}

/** Push an HTTP error response onto the mock queue. */
function queueError(status: number, message = `HTTP ${status}`): void {
  mockState.queue.push(async () => {
    const err = new Error(message) as Error & { status: number };
    err.status = status;
    throw err;
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockState.queue.splice(0, mockState.queue.length);
  mockState.calls.splice(0, mockState.calls.length);
  process.env = { ...ORIGINAL_ENV };
  delete process.env.AUTOMATON_CREDITS_BALANCE;
  delete process.env.AUTOMATON_INFERENCE_TASK_TYPE;
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration/inference-failover", () => {
  // -------------------------------------------------------------------------
  // 1. Provider resolution
  // -------------------------------------------------------------------------

  describe("provider resolution", () => {
    it("uses the preferred provider for a tier on the first request", async () => {
      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      queueCompletion("from-alpha");

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      expect(result.content).toBe("from-alpha");
      expect(result.metadata.providerId).toBe("alpha");
      expect(result.metadata.failedProviders).toEqual([]);
    });

    it("respects provider priority order when preferred is absent from fallback list", async () => {
      // Create a registry where only beta has a reasoning model.
      const alpha = makeProvider("alpha", 1, {
        models: [
          {
            id: "alpha-fast",
            tier: "fast",
            contextWindow: 64000,
            maxOutputTokens: 2048,
            costPerInputToken: 0.1,
            costPerOutputToken: 0.2,
            supportsTools: true,
            supportsVision: false,
            supportsStreaming: true,
          },
        ],
      });
      const beta = makeProvider("beta", 2);
      const registry = new ProviderRegistry([alpha, beta]);
      const client = makeClient(registry);

      queueCompletion("from-beta");

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      expect(result.metadata.providerId).toBe("beta");
    });

    it("returns cost fields calculated from model pricing", async () => {
      const provider = makeProvider("pricing-test", 1);
      const registry = makeRegistry([provider]);
      const client = makeClient(registry);

      // 1000 input tokens, 500 output tokens
      queueCompletion("priced", 1000, 500);

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      // costPerInputToken=1.0 -> 1000/1000 * 1.0 = 1.0 credit
      // costPerOutputToken=2.0 -> 500/1000 * 2.0 = 1.0 credit
      expect(result.cost.inputCostCredits).toBeCloseTo(1.0);
      expect(result.cost.outputCostCredits).toBeCloseTo(1.0);
      expect(result.cost.totalCostCredits).toBeCloseTo(2.0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Failover between providers
  // -------------------------------------------------------------------------

  describe("failover between providers", () => {
    it("falls over to secondary provider after primary exhausts retries on 429", async () => {
      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      // Alpha gets 4 calls: 3 retried + final failure (exhausted retry budget)
      queueError(429, "alpha-rate-limit");
      queueError(429, "alpha-rate-limit");
      queueError(429, "alpha-rate-limit");
      queueError(429, "alpha-rate-limit");
      queueCompletion("from-beta");

      vi.useFakeTimers();
      const pending = client.chat({ tier: "reasoning", messages: BASE_MESSAGES });
      await vi.runAllTimersAsync();
      const result = await pending;
      vi.useRealTimers();

      expect(result.content).toBe("from-beta");
      expect(result.metadata.providerId).toBe("beta");
      expect(result.metadata.failedProviders).toContain("alpha");
      expect(result.metadata.retries).toBe(3);
    });

    it("falls over to secondary provider after primary exhausts retries on 503", async () => {
      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      queueError(503);
      queueError(503);
      queueError(503);
      queueError(503);
      queueCompletion("beta-ok");

      vi.useFakeTimers();
      const pending = client.chat({ tier: "reasoning", messages: BASE_MESSAGES });
      await vi.runAllTimersAsync();
      const result = await pending;
      vi.useRealTimers();

      expect(result.metadata.providerId).toBe("beta");
      expect(result.metadata.failedProviders).toContain("alpha");
    });

    it("does not fail over on a non-retryable 400 error — throws immediately", async () => {
      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      queueError(400, "bad-request");
      // beta is queued but should never be called
      queueCompletion("should-not-reach");

      await expect(
        client.chat({ tier: "reasoning", messages: BASE_MESSAGES }),
      ).rejects.toThrow("bad-request");

      // Only one OpenAI call should have been made (alpha, no retry/failover)
      expect(mockState.create).toHaveBeenCalledTimes(1);
    });

    it("throws all-providers-failed error with provider names when both providers exhaust retries", async () => {
      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      // Both exhaust their 3-retry budget (4 calls each)
      for (let i = 0; i < 4; i++) queueError(429, `alpha-${i}`);
      for (let i = 0; i < 4; i++) queueError(500, `beta-${i}`);

      vi.useFakeTimers();
      const pending = expect(
        client.chat({ tier: "reasoning", messages: BASE_MESSAGES }),
      ).rejects.toThrow(/All providers failed.*alpha.*beta/);
      await vi.runAllTimersAsync();
      await pending;
      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Circuit breaker ↔ registry coordination
  // -------------------------------------------------------------------------

  describe("circuit breaker and registry coordination", () => {
    it("circuit breaker opens after 5 non-retryable failures and skips provider in chat()", async () => {
      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      // Trip the circuit on alpha via chatDirect
      for (let i = 0; i < 5; i++) {
        queueError(400, `trip-${i}`);
        await expect(
          client.chatDirect({ providerId: "alpha", modelId: "alpha-reasoning", messages: BASE_MESSAGES }),
        ).rejects.toThrow(`trip-${i}`);
      }

      // Now chat() should skip alpha (circuit open) and go straight to beta
      queueCompletion("beta-after-trip");
      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      expect(result.metadata.providerId).toBe("beta");
      // alpha was skipped by the circuit, not "failed" mid-flight
      expect(result.metadata.failedProviders).toEqual([]);
    });

    it("registry.disableProvider is called when circuit breaker threshold is reached", async () => {
      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);
      const disableSpy = vi.spyOn(registry, "disableProvider");

      for (let i = 0; i < 5; i++) {
        queueError(400, `fail-${i}`);
        await expect(
          client.chatDirect({ providerId: "alpha", modelId: "alpha-reasoning", messages: BASE_MESSAGES }),
        ).rejects.toThrow();
      }

      expect(disableSpy).toHaveBeenCalledWith(
        "alpha",
        expect.stringContaining("circuit-breaker"),
        expect.any(Number),
      );
    });

    it("circuit breaker re-enables provider after cooldown and registry reflects it", async () => {
      vi.useFakeTimers();

      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      // Trip the circuit on alpha
      for (let i = 0; i < 5; i++) {
        queueError(400, `trip-${i}`);
        await expect(
          client.chatDirect({ providerId: "alpha", modelId: "alpha-reasoning", messages: BASE_MESSAGES }),
        ).rejects.toThrow();
      }

      // Alpha is circuit-open; registry also has it disabled
      expect(registry.getProviders().find((p) => p.id === "alpha")?.enabled).toBe(false);

      // Advance past the 5-minute cooldown (CIRCUIT_BREAKER_DISABLE_MS = 5 * 60_000)
      vi.advanceTimersByTime(5 * 60_000 + 1);

      // A successful call to alpha resets the state
      queueCompletion("alpha-recovered");
      const result = await client.chatDirect({
        providerId: "alpha",
        modelId: "alpha-reasoning",
        messages: BASE_MESSAGES,
      });

      expect(result.content).toBe("alpha-recovered");
      expect(registry.getProviders().find((p) => p.id === "alpha")?.enabled).toBe(true);

      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Survival mode tier downgrade
  // -------------------------------------------------------------------------

  describe("survival mode tier downgrade", () => {
    it("downgrades reasoning to fast tier when credits are in survival range (100-999)", async () => {
      process.env.AUTOMATON_CREDITS_BALANCE = "500";

      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);

      queueCompletion("survival-fast");

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      // Survival mode maps reasoning -> fast, so the actual model served is fast
      expect(result.metadata.modelId).toBe("alpha-fast");
      // But the requested tier is preserved in metadata
      expect(result.metadata.tier).toBe("reasoning");
    });

    it("downgrades fast to cheap tier when credits are in survival range", async () => {
      process.env.AUTOMATON_CREDITS_BALANCE = "200";

      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);

      queueCompletion("survival-cheap");

      const result = await client.chat({ tier: "fast", messages: BASE_MESSAGES });

      expect(result.metadata.modelId).toBe("alpha-cheap");
      expect(result.metadata.tier).toBe("fast");
    });

    it("does not downgrade when credits are above survival threshold (>=1000)", async () => {
      process.env.AUTOMATON_CREDITS_BALANCE = "1000";

      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);

      queueCompletion("full-reasoning");

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      expect(result.metadata.modelId).toBe("alpha-reasoning");
    });

    it("does not downgrade when AUTOMATON_CREDITS_BALANCE is not set", async () => {
      delete process.env.AUTOMATON_CREDITS_BALANCE;

      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);

      queueCompletion("normal-reasoning");

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });

      expect(result.metadata.modelId).toBe("alpha-reasoning");
    });

    it("populates failedProviders in metadata when failover occurs during survival mode", async () => {
      process.env.AUTOMATON_CREDITS_BALANCE = "300";

      const alpha = makeProvider("alpha", 1);
      const beta = makeProvider("beta", 2);
      const registry = makeRegistry([alpha, beta], "alpha");
      const client = makeClient(registry);

      // In survival mode, reasoning -> fast; alpha-fast fails, beta-fast succeeds
      queueError(429);
      queueError(429);
      queueError(429);
      queueError(429);
      queueCompletion("beta-survival");

      vi.useFakeTimers();
      const pending = client.chat({ tier: "reasoning", messages: BASE_MESSAGES });
      await vi.runAllTimersAsync();
      const result = await pending;
      vi.useRealTimers();

      expect(result.metadata.failedProviders).toContain("alpha");
      expect(result.metadata.providerId).toBe("beta");
    });
  });

  // -------------------------------------------------------------------------
  // 5. Emergency stop policy
  // -------------------------------------------------------------------------

  describe("emergency stop policy", () => {
    it("throws when credits are below emergency threshold for non-planner tasks", async () => {
      process.env.AUTOMATON_CREDITS_BALANCE = "50";
      process.env.AUTOMATON_INFERENCE_TASK_TYPE = "agent_turn";

      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);

      await expect(
        client.chat({ tier: "reasoning", messages: BASE_MESSAGES }),
      ).rejects.toThrow(/Emergency stop active/);
    });

    it("allows planner calls through even below emergency threshold", async () => {
      process.env.AUTOMATON_CREDITS_BALANCE = "50";
      process.env.AUTOMATON_INFERENCE_TASK_TYPE = "planner_step";

      const alpha = makeProvider("alpha", 1);
      const registry = makeRegistry([alpha]);
      const client = makeClient(registry);

      queueCompletion("planner-allowed");

      const result = await client.chat({ tier: "reasoning", messages: BASE_MESSAGES });
      expect(result.content).toBe("planner-allowed");
    });
  });
});
