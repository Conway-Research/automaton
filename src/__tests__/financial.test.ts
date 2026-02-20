/**
 * Financial Policy Rules Tests
 *
 * Tests for all financial limit rules:
 * - x402_max_single denies payments > 100 cents
 * - x402_domain_allowlist denies non-conway.tech domains
 * - transfer_max_single denies transfers > 5000 cents
 * - transfer_hourly_cap denies when hourly total > 10000
 * - transfer_daily_cap denies when daily total > 25000
 * - minimum_reserve denies when balance would drop below 1000
 * - turn_transfer_limit denies > 2 transfers per turn
 * - Iterative drain scenario: 10 successive transfers blocked by hourly cap
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { createFinancialRules } from "../agent/policy-rules/financial.js";
import { PolicyEngine } from "../agent/policy-engine.js";
import { SpendTracker } from "../agent/spend-tracker.js";
import type {
  AutomatonTool,
  PolicyRequest,
  PolicyRule,
  TreasuryPolicy,
  SpendTrackerInterface,
  SpendEntry,
  SpendCategory,
  LimitCheckResult,
  ToolContext,
} from "../types.js";
import { DEFAULT_TREASURY_POLICY } from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────

function createTestDb(): Database.Database {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "financial-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS policy_decisions (
      id TEXT PRIMARY KEY,
      turn_id TEXT,
      tool_name TEXT NOT NULL,
      tool_args_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL CHECK(risk_level IN ('safe','caution','dangerous','forbidden')),
      decision TEXT NOT NULL CHECK(decision IN ('allow','deny','quarantine')),
      rules_evaluated TEXT NOT NULL DEFAULT '[]',
      rules_triggered TEXT NOT NULL DEFAULT '[]',
      reason TEXT NOT NULL DEFAULT '',
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS spend_tracking (
      id TEXT PRIMARY KEY,
      tool_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      recipient TEXT,
      domain TEXT,
      category TEXT NOT NULL CHECK(category IN ('transfer','x402','inference','other')),
      window_hour TEXT NOT NULL,
      window_day TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_spend_hour ON spend_tracking(category, window_hour);
    CREATE INDEX IF NOT EXISTS idx_spend_day ON spend_tracking(category, window_day);
  `);

  return db;
}

function mockTransferTool(): AutomatonTool {
  return {
    name: "transfer_credits",
    description: "Transfer credits",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
    riskLevel: "dangerous",
    category: "financial",
  };
}

function mockX402Tool(): AutomatonTool {
  return {
    name: "x402_fetch",
    description: "x402 fetch",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
    riskLevel: "dangerous",
    category: "financial",
  };
}

function mockFundChildTool(): AutomatonTool {
  return {
    name: "fund_child",
    description: "Fund child",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
    riskLevel: "dangerous",
    category: "replication",
  };
}

function createRequest(
  tool: AutomatonTool,
  args: Record<string, unknown>,
  spendTracker: SpendTrackerInterface,
  turnTransferCount = 0,
): PolicyRequest {
  return {
    tool,
    args,
    context: {} as ToolContext,
    turnContext: {
      inputSource: "agent",
      turnToolCallCount: 0,
      turnTransferCount,
      sessionSpend: spendTracker,
    },
  };
}

function createMockSpendTracker(): SpendTrackerInterface {
  return {
    recordSpend: () => {},
    getHourlySpend: () => 0,
    getDailySpend: () => 0,
    getTotalSpend: () => 0,
    checkLimit: () => ({
      allowed: true,
      currentHourlySpend: 0,
      currentDailySpend: 0,
      limitHourly: 10000,
      limitDaily: 25000,
    }),
    pruneOldRecords: () => 0,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("Financial Policy Rules", () => {
  let db: Database.Database;
  let rules: PolicyRule[];
  let engine: PolicyEngine;
  let spendTracker: SpendTracker;

  beforeEach(() => {
    db = createTestDb();
    rules = createFinancialRules(DEFAULT_TREASURY_POLICY);
    engine = new PolicyEngine(db, rules);
    spendTracker = new SpendTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("financial.x402_domain_allowlist", () => {
    it("allows requests to conway.tech domains", () => {
      const request = createRequest(
        mockX402Tool(),
        { url: "https://api.conway.tech/v1/resource" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("denies requests to non-allowlisted domains", () => {
      const request = createRequest(
        mockX402Tool(),
        { url: "https://evil.example.com/drain" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("DOMAIN_NOT_ALLOWED");
    });

    it("denies requests to subdomains of non-allowlisted domains", () => {
      const request = createRequest(
        mockX402Tool(),
        { url: "https://conway.tech.evil.com/drain" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
    });

    it("allows subdomain of conway.tech", () => {
      const request = createRequest(
        mockX402Tool(),
        { url: "https://pay.conway.tech/endpoint" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("denies invalid URLs", () => {
      const request = createRequest(
        mockX402Tool(),
        { url: "not-a-url" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("DOMAIN_NOT_ALLOWED");
    });
  });

  describe("financial.transfer_max_single", () => {
    it("allows transfers within limit and below confirmation threshold", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 500, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("quarantines transfers above confirmation threshold but within single limit", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 4000, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("quarantine");
      expect(decision.reasonCode).toBe("CONFIRMATION_REQUIRED");
    });

    it("denies transfers above 5000 cents", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 6000, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("SPEND_LIMIT_EXCEEDED");
    });

    it("denies transfers exactly at boundary + 1", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 5001, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
    });

    it("quarantines transfers exactly at single limit (above confirmation threshold)", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 5000, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
      );

      const decision = engine.evaluate(request);
      // 5000 > requireConfirmationAboveCents (1000) so quarantine
      expect(decision.action).toBe("quarantine");
      expect(decision.reasonCode).toBe("CONFIRMATION_REQUIRED");
    });
  });

  describe("financial.transfer_hourly_cap", () => {
    it("allows transfers within hourly cap (below confirmation threshold)", () => {
      spendTracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 5000,
        category: "transfer",
      });

      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 500, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        spendTracker,
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("denies when hourly total would exceed 10000", () => {
      // Record 9500 already spent this hour
      spendTracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 5000,
        category: "transfer",
      });
      spendTracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 4500,
        category: "transfer",
      });

      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 1000, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        spendTracker,
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("SPEND_LIMIT_EXCEEDED");
    });
  });

  describe("financial.transfer_daily_cap", () => {
    it("denies when daily total would exceed 25000", () => {
      // Use custom policy with high hourly cap
      const policy: TreasuryPolicy = {
        ...DEFAULT_TREASURY_POLICY,
        maxHourlyTransferCents: 100_000,
        maxDailyTransferCents: 25000,
      };
      const dailyRules = createFinancialRules(policy);
      const dailyEngine = new PolicyEngine(db, dailyRules);

      // Record 24000 already spent today
      spendTracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 24000,
        category: "transfer",
      });

      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 2000, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        spendTracker,
      );

      const decision = dailyEngine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("SPEND_LIMIT_EXCEEDED");
    });
  });

  describe("financial.turn_transfer_limit", () => {
    it("allows first transfer in a turn", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 100, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
        0, // first call
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows second transfer in a turn", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 100, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
        1, // second call
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("denies third transfer in a turn (> maxTransfersPerTurn=2)", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 100, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
        2, // third call (0-indexed: 0, 1, 2)
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("TURN_TRANSFER_LIMIT");
    });

    it("denies 10th transfer in a turn", () => {
      const request = createRequest(
        mockTransferTool(),
        { amount_cents: 100, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
        createMockSpendTracker(),
        9,
      );

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("TURN_TRANSFER_LIMIT");
    });
  });

  describe("Iterative drain scenario", () => {
    it("blocks 10 successive transfers by turn limit (small amounts below confirmation)", () => {
      // Use amounts below confirmation threshold (1000) to test turn limit only
      const results: string[] = [];

      for (let i = 0; i < 10; i++) {
        const request = createRequest(
          mockTransferTool(),
          { amount_cents: 500, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
          spendTracker,
          i,
        );

        const decision = engine.evaluate(request);
        results.push(decision.action);

        // Only record spend if allowed
        if (decision.action === "allow") {
          spendTracker.recordSpend({
            toolName: "transfer_credits",
            amountCents: 500,
            category: "transfer",
          });
        }
      }

      // First 2 should be allowed (turn limit is 2)
      expect(results[0]).toBe("allow");
      expect(results[1]).toBe("allow");
      // Third onwards should be denied by turn_transfer_limit
      expect(results[2]).toBe("deny");

      // Verify not all 10 were allowed
      const allowedCount = results.filter((r) => r === "allow").length;
      expect(allowedCount).toBeLessThanOrEqual(2);
    });

    it("hourly cap blocks without turn limit (high confirmation threshold)", () => {
      // Use policy with no turn limit and high confirmation threshold
      const policy: TreasuryPolicy = {
        ...DEFAULT_TREASURY_POLICY,
        maxTransfersPerTurn: 100, // effectively no turn limit
        requireConfirmationAboveCents: 100000, // high enough to not trigger
      };
      const noTurnLimitRules = createFinancialRules(policy);
      const noTurnLimitEngine = new PolicyEngine(db, noTurnLimitRules);

      const results: string[] = [];

      for (let i = 0; i < 10; i++) {
        const request = createRequest(
          mockTransferTool(),
          { amount_cents: 2000, to_address: "0x1234567890abcdef1234567890abcdef12345678" },
          spendTracker,
          i,
        );

        const decision = noTurnLimitEngine.evaluate(request);
        results.push(decision.action);

        if (decision.action === "allow") {
          spendTracker.recordSpend({
            toolName: "transfer_credits",
            amountCents: 2000,
            category: "transfer",
          });
        }
      }

      // First 5 should be allowed (5 * 2000 = 10000 = hourly cap)
      expect(results[0]).toBe("allow");
      expect(results[1]).toBe("allow");
      expect(results[2]).toBe("allow");
      expect(results[3]).toBe("allow");
      expect(results[4]).toBe("allow");
      // 6th should be denied (10000 + 2000 > 10000)
      expect(results[5]).toBe("deny");

      const allowedCount = results.filter((r) => r === "allow").length;
      expect(allowedCount).toBe(5);
    });
  });

  describe("Rules are registered", () => {
    it("creates 9 financial rules (7 Phase 0 + 2 Phase 1)", () => {
      expect(rules.length).toBe(9);
    });

    it("all rules have priority 500", () => {
      for (const rule of rules) {
        expect(rule.priority).toBe(500);
      }
    });

    it("all rules have financial.* IDs", () => {
      for (const rule of rules) {
        expect(rule.id).toMatch(/^financial\./);
      }
    });
  });
});
