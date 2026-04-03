/**
 * Inference Budget Tracker Tests
 *
 * Tests for per-call ceiling, hourly budget enforcement,
 * cost recording, and cost queries.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { createTestDb } from "./mocks.js";
import type { AutomatonDatabase, ModelStrategyConfig, InferenceCostRow } from "../types.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../types.js";

function createConfig(overrides?: Partial<ModelStrategyConfig>): ModelStrategyConfig {
  return {
    ...DEFAULT_MODEL_STRATEGY_CONFIG,
    ...overrides,
  };
}

function costRow(overrides?: Partial<Omit<InferenceCostRow, "id" | "createdAt">>): Omit<InferenceCostRow, "id" | "createdAt"> {
  return {
    model: "gpt-5.2",
    provider: "openai",
    promptTokens: 100,
    completionTokens: 50,
    costCents: 10,
    sessionId: "sess-1",
    turnId: null,
    latencyMs: 200,
    tier: "normal",
    inputTokens: 100,
    outputTokens: 50,
    taskType: "agent_turn",
    cacheHit: false,
    ...overrides,
  };
}

describe("InferenceBudgetTracker", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("checkBudget", () => {
    it("allows calls when no limits are set", () => {
      const tracker = new InferenceBudgetTracker(
        db.raw,
        createConfig({ perCallCeilingCents: 0, hourlyBudgetCents: 0 }),
      );

      const result = tracker.checkBudget(500, "gpt-5.2");
      expect(result.allowed).toBe(true);
    });

    it("rejects calls exceeding per-call ceiling", () => {
      const tracker = new InferenceBudgetTracker(
        db.raw,
        createConfig({ perCallCeilingCents: 100 }),
      );

      const result = tracker.checkBudget(150, "gpt-5.2");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Per-call cost");
      expect(result.reason).toContain("ceiling");
    });

    it("allows calls within per-call ceiling", () => {
      const tracker = new InferenceBudgetTracker(
        db.raw,
        createConfig({ perCallCeilingCents: 100 }),
      );

      const result = tracker.checkBudget(50, "gpt-5.2");
      expect(result.allowed).toBe(true);
    });

    it("rejects calls when hourly budget is exhausted", () => {
      const tracker = new InferenceBudgetTracker(
        db.raw,
        createConfig({ hourlyBudgetCents: 200 }),
      );

      // Record some costs first
      tracker.recordCost(costRow({ costCents: 180 }));

      const result = tracker.checkBudget(30, "gpt-5.2");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Hourly budget exhausted");
    });

    it("allows calls within hourly budget", () => {
      const tracker = new InferenceBudgetTracker(
        db.raw,
        createConfig({ hourlyBudgetCents: 200 }),
      );

      tracker.recordCost(costRow({ costCents: 50 }));

      const result = tracker.checkBudget(30, "gpt-5.2");
      expect(result.allowed).toBe(true);
    });
  });

  describe("recordCost and queries", () => {
    it("records and retrieves hourly cost", () => {
      const tracker = new InferenceBudgetTracker(db.raw, createConfig());

      tracker.recordCost(costRow({ costCents: 42 }));

      expect(tracker.getHourlyCost()).toBe(42);
    });

    it("records and retrieves daily cost", () => {
      const tracker = new InferenceBudgetTracker(db.raw, createConfig());

      tracker.recordCost(costRow({ costCents: 25 }));
      tracker.recordCost(costRow({ costCents: 35 }));

      expect(tracker.getDailyCost()).toBe(60);
    });

    it("accumulates session costs", () => {
      const tracker = new InferenceBudgetTracker(db.raw, createConfig());

      tracker.recordCost(costRow({ costCents: 10, sessionId: "sess-A" }));
      tracker.recordCost(costRow({ costCents: 20, sessionId: "sess-A" }));
      tracker.recordCost(costRow({ costCents: 5, sessionId: "sess-B" }));

      expect(tracker.getSessionCost("sess-A")).toBe(30);
      expect(tracker.getSessionCost("sess-B")).toBe(5);
    });

    it("returns model cost breakdown", () => {
      const tracker = new InferenceBudgetTracker(db.raw, createConfig());

      tracker.recordCost(costRow({ costCents: 15 }));
      tracker.recordCost(costRow({ costCents: 25 }));

      const costs = tracker.getModelCosts("gpt-5.2");
      expect(costs.totalCents).toBe(40);
      expect(costs.callCount).toBe(2);
    });

    it("returns zero for unknown model", () => {
      const tracker = new InferenceBudgetTracker(db.raw, createConfig());
      const costs = tracker.getModelCosts("nonexistent-model");
      expect(costs.totalCents).toBe(0);
      expect(costs.callCount).toBe(0);
    });
  });
});
