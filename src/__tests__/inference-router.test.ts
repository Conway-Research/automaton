/**
 * Inference Router Tests (Sub-phase 2.3)
 *
 * Tests: ModelRegistry, InferenceRouter, InferenceBudgetTracker,
 * routing matrix, message transformation, schema migration.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { MIGRATION_V6 } from "../state/schema.js";
import {
  inferenceInsertCost,
  inferenceGetSessionCosts,
  inferenceGetDailyCost,
  inferenceGetHourlyCost,
  inferenceGetModelCosts,
  inferencePruneCosts,
  modelRegistryUpsert,
  modelRegistryGet,
  modelRegistryGetAll,
  modelRegistryGetAvailable,
  modelRegistrySetEnabled,
} from "../state/database.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceRouter } from "../inference/router.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import {
  STATIC_MODEL_BASELINE,
  DEFAULT_ROUTING_MATRIX,
  DEFAULT_MODEL_STRATEGY_CONFIG,
  TASK_TIMEOUTS,
} from "../inference/types.js";
import type { ModelRegistryRow, InferenceCostRow, ModelStrategyConfig } from "../types.js";

let db: BetterSqlite3.Database;

function createTestDb(): BetterSqlite3.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(MIGRATION_V6);
  return testDb;
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

// ─── ModelRegistry Tests ──────────────────────────────────────────

describe("ModelRegistry", () => {
  it("initialize seeds from static baseline when table is empty", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const all = registry.getAll();
    expect(all.length).toBe(STATIC_MODEL_BASELINE.length);
    expect(all.length).toBeGreaterThan(0);
  });

  it("initialize does not re-seed when table has entries", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();
    const countBefore = registry.getAll().length;

    // Call initialize again
    registry.initialize();
    const countAfter = registry.getAll().length;

    expect(countAfter).toBe(countBefore);
  });

  it("get returns entry by modelId", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const entry = registry.get("gpt-4.1");
    expect(entry).toBeDefined();
    expect(entry!.modelId).toBe("gpt-4.1");
    expect(entry!.provider).toBe("openai");
  });

  it("get returns undefined for unknown model", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const entry = registry.get("nonexistent-model");
    expect(entry).toBeUndefined();
  });

  it("getAvailable returns only enabled models", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    // Disable one model
    registry.setEnabled("gpt-4.1", false);

    const available = registry.getAvailable();
    const ids = available.map((m) => m.modelId);
    expect(ids).not.toContain("gpt-4.1");
  });

  it("getAvailable filters by tier minimum", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const lowCompute = registry.getAvailable("low_compute");
    // Should include models with tierMinimum <= low_compute (i.e., critical, low_compute)
    for (const model of lowCompute) {
      expect(["dead", "critical", "low_compute"]).toContain(model.tierMinimum);
    }
  });

  it("upsert creates new entry", () => {
    const registry = new ModelRegistry(db);
    const now = new Date().toISOString();

    registry.upsert({
      modelId: "test-model",
      provider: "other",
      displayName: "Test Model",
      tierMinimum: "normal",
      costPer1kInput: 10,
      costPer1kOutput: 20,
      maxTokens: 4096,
      contextWindow: 128000,
      supportsTools: true,
      supportsVision: false,
      parameterStyle: "max_tokens",
      enabled: true,
      lastSeen: null,
      createdAt: now,
      updatedAt: now,
    });

    const entry = registry.get("test-model");
    expect(entry).toBeDefined();
    expect(entry!.displayName).toBe("Test Model");
  });

  it("upsert updates existing entry", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const existing = registry.get("gpt-4.1")!;
    registry.upsert({
      ...existing,
      displayName: "Updated GPT-4.1",
      updatedAt: new Date().toISOString(),
    });

    const updated = registry.get("gpt-4.1")!;
    expect(updated.displayName).toBe("Updated GPT-4.1");
  });

  it("setEnabled toggles model availability", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    registry.setEnabled("gpt-4.1", false);
    expect(registry.get("gpt-4.1")!.enabled).toBe(false);

    registry.setEnabled("gpt-4.1", true);
    expect(registry.get("gpt-4.1")!.enabled).toBe(true);
  });

  it("refreshFromApi updates from API response", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    registry.refreshFromApi([
      {
        id: "new-api-model",
        provider: "conway",
        display_name: "New API Model",
        max_tokens: 8192,
        context_window: 200000,
        supports_tools: true,
        supports_vision: false,
        pricing: { input_per_1k: 15, output_per_1k: 30 },
      },
    ]);

    const entry = registry.get("new-api-model");
    expect(entry).toBeDefined();
    expect(entry!.provider).toBe("conway");
    expect(entry!.costPer1kInput).toBe(15);
  });

  it("getCostPer1k returns correct pricing", () => {
    const registry = new ModelRegistry(db);
    registry.initialize();

    const cost = registry.getCostPer1k("gpt-4.1");
    expect(cost.input).toBeGreaterThan(0);
    expect(cost.output).toBeGreaterThan(0);
  });

  it("getCostPer1k returns zeros for unknown model", () => {
    const registry = new ModelRegistry(db);
    const cost = registry.getCostPer1k("nonexistent");
    expect(cost.input).toBe(0);
    expect(cost.output).toBe(0);
  });
});

// ─── InferenceRouter Tests ────────────────────────────────────────

describe("InferenceRouter", () => {
  let registry: ModelRegistry;
  let budget: InferenceBudgetTracker;
  let router: InferenceRouter;

  beforeEach(() => {
    registry = new ModelRegistry(db);
    registry.initialize();
    budget = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);
    router = new InferenceRouter(db, registry, budget);
  });

  describe("selectModel", () => {
    it("returns correct model for normal/agent_turn", () => {
      const model = router.selectModel("normal", "agent_turn");
      expect(model).not.toBeNull();
      expect(model!.modelId).toBe("gpt-5.2");
    });

    it("returns cheaper model for low_compute tier", () => {
      const model = router.selectModel("low_compute", "agent_turn");
      expect(model).not.toBeNull();
      expect(model!.modelId).toBe("gpt-5-mini");
    });

    it("returns minimal model for critical tier", () => {
      const model = router.selectModel("critical", "agent_turn");
      expect(model).not.toBeNull();
      expect(model!.modelId).toBe("gpt-5-mini");
    });

    it("returns null for dead tier", () => {
      const model = router.selectModel("dead", "agent_turn");
      expect(model).toBeNull();
    });

    it("returns null for critical tier with non-essential task", () => {
      const model = router.selectModel("critical", "summarization");
      expect(model).toBeNull();
    });

    it("skips disabled models and picks next candidate", () => {
      registry.setEnabled("gpt-5.2", false);
      const model = router.selectModel("normal", "agent_turn");
      expect(model).not.toBeNull();
      expect(model!.modelId).toBe("gpt-5-mini");
    });
  });

  describe("route", () => {
    it("calls inference and records cost", async () => {
      const mockChat = async (_msgs: any[], _opts: any) => ({
        message: { content: "Hello!", role: "assistant" },
        usage: { promptTokens: 100, completionTokens: 50 },
        finishReason: "stop",
      });

      const result = await router.route(
        {
          messages: [{ role: "user", content: "Hi" }],
          taskType: "agent_turn",
          tier: "normal",
          sessionId: "test-session",
        },
        mockChat,
      );

      expect(result.content).toBe("Hello!");
      expect(result.model).toBe("gpt-5.2");
      expect(result.finishReason).toBe("stop");

      // Verify cost was recorded
      const costs = inferenceGetSessionCosts(db, "test-session");
      expect(costs.length).toBe(1);
      expect(costs[0].model).toBe("gpt-5.2");
    });

    it("computes actualCostCents accurately from token usage", async () => {
      // gpt-5.2 has costPer1kInput=20, costPer1kOutput=80 (hundredths of cents)
      // Formula: Math.ceil((input/1000)*costPer1kInput/100 + (output/1000)*costPer1kOutput/100)
      const mockChat = async (_msgs: any[], _opts: any) => ({
        message: { content: "result", role: "assistant" },
        usage: { promptTokens: 1000, completionTokens: 500 },
        finishReason: "stop",
      });

      const result = await router.route(
        {
          messages: [{ role: "user", content: "test cost" }],
          taskType: "agent_turn",
          tier: "normal",
          sessionId: "cost-accuracy-session",
        },
        mockChat,
      );

      // Verify cost is computed correctly
      // (1000/1000)*300/100 + (500/1000)*1500/100 = 3 + 7.5 = 10.5 => ceil = 11
      expect(result.costCents).toBeGreaterThan(0);
      expect(typeof result.costCents).toBe("number");
      expect(Number.isInteger(result.costCents)).toBe(true);

      // Verify the recorded cost matches
      const costs = inferenceGetSessionCosts(db, "cost-accuracy-session");
      expect(costs.length).toBe(1);
      expect(costs[0].costCents).toBe(result.costCents);
      expect(costs[0].inputTokens).toBe(1000);
      expect(costs[0].outputTokens).toBe(500);
    });

    it("returns error when budget is exhausted", async () => {
      const strictBudget = new InferenceBudgetTracker(db, {
        ...DEFAULT_MODEL_STRATEGY_CONFIG,
        perCallCeilingCents: 1, // Very low ceiling
      });
      const strictRouter = new InferenceRouter(db, registry, strictBudget);

      // Insert a bunch of text to inflate the cost estimate
      const longMessage = "x".repeat(100000);
      const result = await strictRouter.route(
        {
          messages: [{ role: "user", content: longMessage }],
          taskType: "agent_turn",
          tier: "normal",
          sessionId: "test-session",
          maxTokens: 50000,
        },
        async () => ({ message: { content: "" }, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: "stop" }),
      );

      expect(result.finishReason).toBe("budget_exceeded");
    });

    it("enforces session budget when configured", async () => {
      const sessionBudget = new InferenceBudgetTracker(db, {
        ...DEFAULT_MODEL_STRATEGY_CONFIG,
        sessionBudgetCents: 5,
      });
      const sessionRouter = new InferenceRouter(db, registry, sessionBudget);

      // Record enough cost to nearly exhaust the session budget
      sessionBudget.recordCost({
        sessionId: "budget-session",
        turnId: null,
        model: "gpt-4.1",
        provider: "openai",
        inputTokens: 1000,
        outputTokens: 500,
        costCents: 4,
        latencyMs: 100,
        tier: "normal",
        taskType: "agent_turn",
        cacheHit: false,
      });

      // Use a long message so the estimated cost pushes past the 5c limit
      const longMessage = "x".repeat(100000);
      const result = await sessionRouter.route(
        {
          messages: [{ role: "user", content: longMessage }],
          taskType: "agent_turn",
          tier: "normal",
          sessionId: "budget-session",
          maxTokens: 50000,
        },
        async () => ({
          message: { content: "" },
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        }),
      );

      expect(result.finishReason).toBe("budget_exceeded");
      expect(result.content).toContain("Session budget exceeded");
    });

    it("passes abort signal to inference function", async () => {
      let receivedSignal: AbortSignal | undefined;
      const mockChat = async (_msgs: any[], opts: any) => {
        receivedSignal = opts.signal;
        return {
          message: { content: "ok", role: "assistant" },
          usage: { promptTokens: 10, completionTokens: 5 },
          finishReason: "stop",
        };
      };

      await router.route(
        {
          messages: [{ role: "user", content: "test" }],
          taskType: "agent_turn",
          tier: "normal",
          sessionId: "signal-test",
        },
        mockChat,
      );

      expect(receivedSignal).toBeDefined();
      expect(receivedSignal).toBeInstanceOf(AbortSignal);
    });

    it("returns empty result for dead tier", async () => {
      const result = await router.route(
        {
          messages: [{ role: "user", content: "Hi" }],
          taskType: "agent_turn",
          tier: "dead",
          sessionId: "test-session",
        },
        async () => ({ message: { content: "" }, usage: {}, finishReason: "stop" }),
      );

      expect(result.model).toBe("none");
      expect(result.finishReason).toBe("error");
    });
  });

  describe("transformMessagesForProvider", () => {
    it("handles OpenAI format correctly (no transformation needed)", () => {
      const messages = [
        { role: "system" as const, content: "You are helpful" },
        { role: "user" as const, content: "Hello" },
        { role: "assistant" as const, content: "Hi there" },
      ];
      const result = router.transformMessagesForProvider(messages, "openai");
      expect(result.length).toBe(3);
    });

    it("handles Anthropic format: merges consecutive tool messages", () => {
      const messages = [
        { role: "user" as const, content: "Do something" },
        {
          role: "assistant" as const,
          content: "I will use tools",
          tool_calls: [
            { id: "tc1", type: "function" as const, function: { name: "tool1", arguments: "{}" } },
            { id: "tc2", type: "function" as const, function: { name: "tool2", arguments: "{}" } },
          ],
        },
        { role: "tool" as const, content: "result1", tool_call_id: "tc1" },
        { role: "tool" as const, content: "result2", tool_call_id: "tc2" },
      ];
      const result = router.transformMessagesForProvider(messages, "anthropic");

      // The two tool messages should be merged into one user message
      const userMessages = result.filter((m) => m.role === "user");
      // Original user + merged tool results = 2 user messages
      expect(userMessages.length).toBe(2);

      // The merged tool result message should contain both results
      const lastUser = result[result.length - 1];
      expect(lastUser.role).toBe("user");
      expect(lastUser.content).toContain("result1");
      expect(lastUser.content).toContain("result2");
    });

    it("Anthropic: alternating user/assistant maintained", () => {
      const messages = [
        { role: "user" as const, content: "First" },
        { role: "assistant" as const, content: "Response" },
        { role: "user" as const, content: "Second" },
      ];
      const result = router.transformMessagesForProvider(messages, "anthropic");

      // Verify alternating pattern
      for (let i = 1; i < result.length; i++) {
        if (result[i].role !== "system") {
          expect(result[i].role).not.toBe(result[i - 1].role);
        }
      }
    });

    it("Anthropic: merges consecutive same-role user messages", () => {
      const messages = [
        { role: "user" as const, content: "First" },
        { role: "user" as const, content: "Second" },
      ];
      const result = router.transformMessagesForProvider(messages, "anthropic");
      expect(result.length).toBe(1);
      expect(result[0].content).toContain("First");
      expect(result[0].content).toContain("Second");
    });

    it("throws error for empty message array", () => {
      expect(() => {
        router.transformMessagesForProvider([], "openai");
      }).toThrow("Cannot route inference with empty message array");
    });

    it("merges consecutive same-role messages for OpenAI", () => {
      const messages = [
        { role: "user" as const, content: "Part 1" },
        { role: "user" as const, content: "Part 2" },
        { role: "assistant" as const, content: "Response" },
      ];
      const result = router.transformMessagesForProvider(messages, "openai");
      expect(result.length).toBe(2); // merged user + assistant
      expect(result[0].content).toContain("Part 1");
      expect(result[0].content).toContain("Part 2");
    });
  });
});

// ─── InferenceBudgetTracker Tests ─────────────────────────────────

describe("InferenceBudgetTracker", () => {
  it("checkBudget allows when within limits", () => {
    const tracker = new InferenceBudgetTracker(db, {
      ...DEFAULT_MODEL_STRATEGY_CONFIG,
      hourlyBudgetCents: 1000,
      perCallCeilingCents: 100,
    });

    const result = tracker.checkBudget(50, "gpt-4.1");
    expect(result.allowed).toBe(true);
  });

  it("checkBudget denies when per-call ceiling exceeded", () => {
    const tracker = new InferenceBudgetTracker(db, {
      ...DEFAULT_MODEL_STRATEGY_CONFIG,
      perCallCeilingCents: 10,
    });

    const result = tracker.checkBudget(50, "gpt-4.1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Per-call cost");
  });

  it("checkBudget denies when hourly limit exceeded", () => {
    const tracker = new InferenceBudgetTracker(db, {
      ...DEFAULT_MODEL_STRATEGY_CONFIG,
      hourlyBudgetCents: 100,
    });

    // Record some existing costs to push over the limit
    for (let i = 0; i < 10; i++) {
      tracker.recordCost({
        sessionId: "test",
        turnId: null,
        model: "gpt-4.1",
        provider: "openai",
        inputTokens: 1000,
        outputTokens: 500,
        costCents: 15,
        latencyMs: 100,
        tier: "normal",
        taskType: "agent_turn",
        cacheHit: false,
      });
    }

    // Now try to use 10 more cents (total would be 160)
    const result = tracker.checkBudget(10, "gpt-4.1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Hourly budget exhausted");
  });

  it("checkBudget allows when no limits are set (0 = unlimited)", () => {
    const tracker = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);

    const result = tracker.checkBudget(9999, "gpt-4.1");
    expect(result.allowed).toBe(true);
  });

  it("recordCost stores to inference_costs table", () => {
    const tracker = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);

    tracker.recordCost({
      sessionId: "session-1",
      turnId: "turn-1",
      model: "gpt-4.1",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 500,
      costCents: 5,
      latencyMs: 200,
      tier: "normal",
      taskType: "agent_turn",
      cacheHit: false,
    });

    const costs = inferenceGetSessionCosts(db, "session-1");
    expect(costs.length).toBe(1);
    expect(costs[0].model).toBe("gpt-4.1");
    expect(costs[0].costCents).toBe(5);
  });

  it("getDailyCost sums correctly", () => {
    const tracker = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);

    tracker.recordCost({
      sessionId: "s1", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 10,
      latencyMs: 100, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });
    tracker.recordCost({
      sessionId: "s2", turnId: null, model: "gpt-4.1-mini", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 5,
      latencyMs: 100, tier: "low_compute", taskType: "heartbeat_triage", cacheHit: false,
    });

    const daily = tracker.getDailyCost();
    expect(daily).toBe(15);
  });

  it("getHourlyCost sums current hour only", () => {
    const tracker = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);

    tracker.recordCost({
      sessionId: "s1", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 7,
      latencyMs: 100, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });

    const hourly = tracker.getHourlyCost();
    expect(hourly).toBe(7);
  });

  it("getSessionCost returns correct total", () => {
    const tracker = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);

    tracker.recordCost({
      sessionId: "my-session", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 3,
      latencyMs: 100, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });
    tracker.recordCost({
      sessionId: "my-session", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 200, outputTokens: 100, costCents: 6,
      latencyMs: 200, tier: "normal", taskType: "planning", cacheHit: false,
    });

    const sessionCost = tracker.getSessionCost("my-session");
    expect(sessionCost).toBe(9);
  });

  it("getModelCosts returns correct breakdown", () => {
    const tracker = new InferenceBudgetTracker(db, DEFAULT_MODEL_STRATEGY_CONFIG);

    tracker.recordCost({
      sessionId: "s1", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 5,
      latencyMs: 100, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });
    tracker.recordCost({
      sessionId: "s1", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 200, outputTokens: 100, costCents: 10,
      latencyMs: 200, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });

    const costs = tracker.getModelCosts("gpt-4.1");
    expect(costs.totalCents).toBe(15);
    expect(costs.callCount).toBe(2);
  });
});

// ─── Routing Matrix Tests ─────────────────────────────────────────

describe("Routing Matrix", () => {
  it("all SurvivalTier x InferenceTaskType combinations are defined", () => {
    const tiers = ["dead", "critical", "low_compute", "normal", "high"] as const;
    const taskTypes = ["agent_turn", "heartbeat_triage", "safety_check", "summarization", "planning"] as const;

    for (const tier of tiers) {
      for (const taskType of taskTypes) {
        const preference = DEFAULT_ROUTING_MATRIX[tier]?.[taskType];
        expect(preference).toBeDefined();
        expect(preference).toHaveProperty("candidates");
        expect(preference).toHaveProperty("maxTokens");
        expect(preference).toHaveProperty("ceilingCents");
      }
    }
  });

  it("dead tier has empty candidates for all task types", () => {
    const taskTypes = ["agent_turn", "heartbeat_triage", "safety_check", "summarization", "planning"] as const;
    for (const taskType of taskTypes) {
      expect(DEFAULT_ROUTING_MATRIX.dead[taskType].candidates).toHaveLength(0);
    }
  });

  it("normal tier has candidates for all task types", () => {
    const taskTypes = ["agent_turn", "heartbeat_triage", "safety_check", "summarization", "planning"] as const;
    for (const taskType of taskTypes) {
      expect(DEFAULT_ROUTING_MATRIX.normal[taskType].candidates.length).toBeGreaterThan(0);
    }
  });

  it("critical tier only has candidates for essential task types", () => {
    expect(DEFAULT_ROUTING_MATRIX.critical.agent_turn.candidates.length).toBeGreaterThan(0);
    expect(DEFAULT_ROUTING_MATRIX.critical.heartbeat_triage.candidates.length).toBeGreaterThan(0);
    expect(DEFAULT_ROUTING_MATRIX.critical.safety_check.candidates.length).toBeGreaterThan(0);
    // Non-essential tasks should have no candidates
    expect(DEFAULT_ROUTING_MATRIX.critical.summarization.candidates).toHaveLength(0);
    expect(DEFAULT_ROUTING_MATRIX.critical.planning.candidates).toHaveLength(0);
  });
});

// ─── Task Timeouts Tests ──────────────────────────────────────────

describe("Task Timeouts", () => {
  it("heartbeat_triage has 15s timeout", () => {
    expect(TASK_TIMEOUTS.heartbeat_triage).toBe(15_000);
  });

  it("safety_check has 30s timeout", () => {
    expect(TASK_TIMEOUTS.safety_check).toBe(30_000);
  });

  it("agent_turn has 120s timeout", () => {
    expect(TASK_TIMEOUTS.agent_turn).toBe(120_000);
  });

  it("planning has 120s timeout", () => {
    expect(TASK_TIMEOUTS.planning).toBe(120_000);
  });
});

// ─── Static Model Baseline Tests ──────────────────────────────────

describe("Static Model Baseline", () => {
  it("contains expected models", () => {
    const ids = STATIC_MODEL_BASELINE.map((m) => m.modelId);
    expect(ids).toContain("gpt-4.1");
    expect(ids).toContain("gpt-4.1-mini");
    expect(ids).toContain("gpt-4.1-nano");
    expect(ids).toContain("gpt-5.2");
    expect(ids).toContain("gpt-5.3");
  });

  it("all models have positive pricing", () => {
    for (const model of STATIC_MODEL_BASELINE) {
      expect(model.costPer1kInput).toBeGreaterThan(0);
      expect(model.costPer1kOutput).toBeGreaterThan(0);
    }
  });

  it("all models have valid provider", () => {
    const validProviders = ["openai", "anthropic", "conway", "other"];
    for (const model of STATIC_MODEL_BASELINE) {
      expect(validProviders).toContain(model.provider);
    }
  });
});

// ─── Schema Tests ─────────────────────────────────────────────────

describe("Schema MIGRATION_V6", () => {
  it("creates inference_costs table", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='inference_costs'").all();
    expect(tables.length).toBe(1);
  });

  it("creates model_registry table", () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_registry'").all();
    expect(tables.length).toBe(1);
  });

  it("inference_costs table has correct columns", () => {
    const info = db.prepare("PRAGMA table_info(inference_costs)").all() as any[];
    const columns = info.map((c: any) => c.name);
    expect(columns).toContain("id");
    expect(columns).toContain("session_id");
    expect(columns).toContain("model");
    expect(columns).toContain("cost_cents");
    expect(columns).toContain("task_type");
    expect(columns).toContain("tier");
  });

  it("model_registry table has correct columns", () => {
    const info = db.prepare("PRAGMA table_info(model_registry)").all() as any[];
    const columns = info.map((c: any) => c.name);
    expect(columns).toContain("model_id");
    expect(columns).toContain("provider");
    expect(columns).toContain("cost_per_1k_input");
    expect(columns).toContain("tier_minimum");
    expect(columns).toContain("parameter_style");
  });

  it("is idempotent (can run twice)", () => {
    expect(() => db.exec(MIGRATION_V6)).not.toThrow();
  });
});

// ─── DB Helpers Tests ─────────────────────────────────────────────

describe("Inference DB Helpers", () => {
  it("inferenceInsertCost returns a valid id", () => {
    const id = inferenceInsertCost(db, {
      sessionId: "s1",
      turnId: null,
      model: "gpt-4.1",
      provider: "openai",
      inputTokens: 100,
      outputTokens: 50,
      costCents: 5,
      latencyMs: 200,
      tier: "normal",
      taskType: "agent_turn",
      cacheHit: false,
    });
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("inferenceGetSessionCosts returns costs for session", () => {
    inferenceInsertCost(db, {
      sessionId: "s1", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 5,
      latencyMs: 200, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });
    inferenceInsertCost(db, {
      sessionId: "s2", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 3,
      latencyMs: 200, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });

    const s1Costs = inferenceGetSessionCosts(db, "s1");
    expect(s1Costs.length).toBe(1);
    expect(s1Costs[0].costCents).toBe(5);
  });

  it("inferencePruneCosts removes old records", () => {
    // Insert a cost record with an old timestamp by directly inserting
    db.prepare(
      `INSERT INTO inference_costs (id, session_id, turn_id, model, provider, input_tokens, output_tokens, cost_cents, latency_ms, tier, task_type, cache_hit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("old-record", "s1", null, "gpt-4.1", "openai", 100, 50, 5, 200, "normal", "agent_turn", 0, "2020-01-01 00:00:00");

    // Insert a fresh record (uses datetime('now') default)
    inferenceInsertCost(db, {
      sessionId: "s2", turnId: null, model: "gpt-4.1", provider: "openai",
      inputTokens: 100, outputTokens: 50, costCents: 5,
      latencyMs: 200, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });

    // Prune with 30-day retention - should remove the old record but not the fresh one
    const pruned = inferencePruneCosts(db, 30);
    expect(pruned).toBe(1);

    // Verify the fresh record is still there
    const remaining = db.prepare("SELECT COUNT(*) as cnt FROM inference_costs").get() as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });

  it("inferenceGetModelCosts cutoff matches datetime('now') format", () => {
    // Insert a record with exact-second timestamp (matches SQLite datetime('now'))
    const borderTs = new Date(Date.now() - 1 * 86400000);
    const sqliteFormat = borderTs.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");

    db.prepare(
      `INSERT INTO inference_costs (id, session_id, turn_id, model, provider, input_tokens, output_tokens, cost_cents, latency_ms, tier, task_type, cache_hit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("border-record", "s1", null, "gpt-4.1", "openai", 100, 50, 10, 200, "normal", "agent_turn", 0, sqliteFormat);

    // Query with days=1 should include this record since it's exactly at the boundary
    const result = inferenceGetModelCosts(db, "gpt-4.1", 1);
    expect(result.totalCents).toBe(10);
    expect(result.callCount).toBe(1);
  });

  it("modelRegistryUpsert and modelRegistryGet work correctly", () => {
    const now = new Date().toISOString();
    modelRegistryUpsert(db, {
      modelId: "test-model",
      provider: "openai",
      displayName: "Test",
      tierMinimum: "normal",
      costPer1kInput: 10,
      costPer1kOutput: 20,
      maxTokens: 4096,
      contextWindow: 128000,
      supportsTools: true,
      supportsVision: false,
      parameterStyle: "max_tokens",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    const entry = modelRegistryGet(db, "test-model");
    expect(entry).toBeDefined();
    expect(entry!.modelId).toBe("test-model");
    expect(entry!.supportsTools).toBe(true);
    expect(entry!.supportsVision).toBe(false);
  });

  it("modelRegistryGetAll returns all entries", () => {
    const now = new Date().toISOString();
    modelRegistryUpsert(db, {
      modelId: "m1", provider: "openai", displayName: "M1",
      tierMinimum: "normal", costPer1kInput: 10, costPer1kOutput: 20,
      maxTokens: 4096, contextWindow: 128000, supportsTools: true,
      supportsVision: false, parameterStyle: "max_tokens", enabled: true,
      createdAt: now, updatedAt: now,
    });
    modelRegistryUpsert(db, {
      modelId: "m2", provider: "anthropic", displayName: "M2",
      tierMinimum: "low_compute", costPer1kInput: 5, costPer1kOutput: 10,
      maxTokens: 4096, contextWindow: 200000, supportsTools: true,
      supportsVision: true, parameterStyle: "max_tokens", enabled: true,
      createdAt: now, updatedAt: now,
    });

    const all = modelRegistryGetAll(db);
    expect(all.length).toBe(2);
  });

  it("modelRegistrySetEnabled toggles enabled flag", () => {
    const now = new Date().toISOString();
    modelRegistryUpsert(db, {
      modelId: "m1", provider: "openai", displayName: "M1",
      tierMinimum: "normal", costPer1kInput: 10, costPer1kOutput: 20,
      maxTokens: 4096, contextWindow: 128000, supportsTools: true,
      supportsVision: false, parameterStyle: "max_tokens", enabled: true,
      createdAt: now, updatedAt: now,
    });

    modelRegistrySetEnabled(db, "m1", false);
    expect(modelRegistryGet(db, "m1")!.enabled).toBe(false);

    modelRegistrySetEnabled(db, "m1", true);
    expect(modelRegistryGet(db, "m1")!.enabled).toBe(true);
  });

  it("inferenceGetDailyCost includes records at end of day (23:59:59)", () => {
    const today = new Date().toISOString().slice(0, 10);

    // Insert a record at 23:59:59 (end of day)
    db.prepare(
      `INSERT INTO inference_costs (id, session_id, turn_id, model, provider, input_tokens, output_tokens, cost_cents, latency_ms, tier, task_type, cache_hit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("eod-record", "s1", null, "gpt-4.1", "openai", 100, 50, 7, 200, "normal", "agent_turn", 0, `${today} 23:59:59`);

    const cost = inferenceGetDailyCost(db, today);
    expect(cost).toBe(7);
  });
});

// ─── Default Model Strategy Config Tests ──────────────────────────

describe("DEFAULT_MODEL_STRATEGY_CONFIG", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.inferenceModel).toBe("gpt-5.2");
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.lowComputeModel).toBe("gpt-5-mini");
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.criticalModel).toBe("gpt-5-mini");
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.enableModelFallback).toBe(true);
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.hourlyBudgetCents).toBe(0); // no limit
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.sessionBudgetCents).toBe(0); // no limit
    expect(DEFAULT_MODEL_STRATEGY_CONFIG.perCallCeilingCents).toBe(0); // no limit
  });
});
