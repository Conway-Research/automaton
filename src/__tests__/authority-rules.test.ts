/**
 * Authority + Rate Limit + Financial Phase 1 Rule Tests
 *
 * Tests for Sub-phase 1.4: Financial Policy & Treasury Configuration
 * - Authority rules: external input blocked from dangerous tools
 * - Authority rules: self-mod from external blocked on protected paths
 * - Rate limit rules: genesis prompt, self-mod, spawn
 * - Financial Phase 1 rules: inference daily cap, require confirmation
 * - Treasury config loading and validation
 * - promptWithDefault behavior
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import type {
  AutomatonTool,
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
  ToolContext,
  InputSource,
  SpendTrackerInterface,
  SpendCategory,
  SpendEntry,
  TreasuryPolicy,
  LimitCheckResult,
} from "../types.js";
import { DEFAULT_TREASURY_POLICY } from "../types.js";
import { PolicyEngine } from "../agent/policy-engine.js";
import { createAuthorityRules } from "../agent/policy-rules/authority.js";
import { createRateLimitRules } from "../agent/policy-rules/rate-limits.js";
import { createFinancialRules } from "../agent/policy-rules/financial.js";
import { createDefaultRules } from "../agent/policy-rules/index.js";

// ─── Test Helpers ───────────────────────────────────────────────

function createRawTestDb(): Database.Database {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "authority-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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
  `);

  return db;
}

function createMockSpendTracker(overrides: Partial<SpendTrackerInterface> = {}): SpendTrackerInterface {
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
    ...overrides,
  };
}

function createMockTool(overrides: Partial<AutomatonTool> = {}): AutomatonTool {
  return {
    name: "test_tool",
    description: "A test tool",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
    riskLevel: "safe",
    category: "vm",
    ...overrides,
  };
}

function createMockContext(rawDb?: Database.Database): ToolContext {
  return {
    identity: {} as any,
    config: {} as any,
    db: rawDb ? { raw: rawDb } as any : {} as any,
    conway: {} as any,
    inference: {} as any,
  };
}

function createRequest(
  tool: AutomatonTool,
  args: Record<string, unknown>,
  inputSource: InputSource | undefined,
  rawDb?: Database.Database,
  spendTracker?: SpendTrackerInterface,
): PolicyRequest {
  return {
    tool,
    args,
    context: createMockContext(rawDb),
    turnContext: {
      inputSource,
      turnToolCallCount: 0,
      sessionSpend: spendTracker ?? createMockSpendTracker(),
    },
  };
}

// ─── Authority Rules Tests ──────────────────────────────────────

describe("Authority Rules", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createRawTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("authority.external_tool_restriction", () => {
    it("blocks destructive tools from external (undefined) input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "delete_sandbox",
        riskLevel: "dangerous",
        category: "conway",
      });
      const request = createRequest(tool, {}, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("EXTERNAL_DANGEROUS_TOOL");
    });

    it("blocks spawn_child from heartbeat input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "spawn_child",
        riskLevel: "dangerous",
        category: "replication",
      });
      const request = createRequest(tool, {}, "heartbeat");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("EXTERNAL_DANGEROUS_TOOL");
    });

    it("blocks fund_child from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "fund_child",
        riskLevel: "dangerous",
        category: "replication",
      });
      const request = createRequest(tool, {}, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("EXTERNAL_DANGEROUS_TOOL");
    });

    it("blocks update_genesis_prompt from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "update_genesis_prompt",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, {}, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("EXTERNAL_DANGEROUS_TOOL");
    });

    it("allows register_erc8004 from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "register_erc8004",
        riskLevel: "dangerous",
        category: "registry",
      });
      const request = createRequest(tool, {}, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows register_erc8004 from heartbeat input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "register_erc8004",
        riskLevel: "dangerous",
        category: "registry",
      });
      const request = createRequest(tool, {}, "heartbeat");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows give_feedback from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "give_feedback",
        riskLevel: "dangerous",
        category: "registry",
      });
      const request = createRequest(tool, {}, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows destructive tools from agent input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "delete_sandbox",
        riskLevel: "dangerous",
        category: "conway",
      });
      const request = createRequest(tool, {}, "agent");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows destructive tools from creator input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "spawn_child",
        riskLevel: "dangerous",
        category: "replication",
      });
      const request = createRequest(tool, {}, "creator");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows safe tools from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "read_file",
        riskLevel: "safe",
        category: "vm",
      });
      const request = createRequest(tool, {}, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });
  });

  describe("authority.self_mod_from_external", () => {
    it("blocks edit_own_file on protected paths from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "edit_own_file",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, { path: "~/.automaton/SOUL.md" }, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("EXTERNAL_SELF_MOD");
    });

    it("blocks write_file targeting policy-rules from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "write_file",
        riskLevel: "caution",
        category: "vm",
      });
      const request = createRequest(tool, { path: "/app/src/agent/policy-rules/financial.ts" }, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("EXTERNAL_SELF_MOD");
    });

    it("allows write_file on non-protected paths from external input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "write_file",
        riskLevel: "caution",
        category: "vm",
      });
      const request = createRequest(tool, { path: "/app/src/data/output.txt" }, undefined);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("allows edit_own_file on protected paths from agent input", () => {
      const rules = createAuthorityRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "edit_own_file",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, { path: "~/.automaton/SOUL.md" }, "agent");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });
  });
});

// ─── Rate Limit Rules Tests ─────────────────────────────────────

describe("Rate Limit Rules", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createRawTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("rate.genesis_prompt_daily", () => {
    it("allows first genesis prompt change", () => {
      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "update_genesis_prompt",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, {}, "agent", db);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("blocks genesis prompt change after 1/day", () => {
      // Insert a recent allowed decision for update_genesis_prompt
      db.prepare(
        `INSERT INTO policy_decisions (id, tool_name, tool_args_hash, risk_level, decision, reason, created_at)
         VALUES ('dec1', 'update_genesis_prompt', 'hash1', 'dangerous', 'allow', 'ALLOWED', datetime('now'))`,
      ).run();

      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "update_genesis_prompt",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, {}, "agent", db);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("RATE_LIMIT_GENESIS");
    });
  });

  describe("rate.self_mod_hourly", () => {
    it("allows self-mod within rate limit", () => {
      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "edit_own_file",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, {}, "agent", db);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("blocks self-mod after 10/hour", () => {
      // Insert 10 recent allowed decisions for edit_own_file
      for (let i = 0; i < 10; i++) {
        db.prepare(
          `INSERT INTO policy_decisions (id, tool_name, tool_args_hash, risk_level, decision, reason, created_at)
           VALUES ('dec_edit_${i}', 'edit_own_file', 'hash${i}', 'dangerous', 'allow', 'ALLOWED', datetime('now'))`,
        ).run();
      }

      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "edit_own_file",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, {}, "agent", db);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("RATE_LIMIT_SELF_MOD");
    });
  });

  describe("rate.spawn_daily", () => {
    it("allows spawn within rate limit", () => {
      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "spawn_child",
        riskLevel: "dangerous",
        category: "replication",
      });
      const request = createRequest(tool, {}, "agent", db);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("blocks spawn after 3/day", () => {
      for (let i = 0; i < 3; i++) {
        db.prepare(
          `INSERT INTO policy_decisions (id, tool_name, tool_args_hash, risk_level, decision, reason, created_at)
           VALUES ('dec_spawn_${i}', 'spawn_child', 'hash${i}', 'dangerous', 'allow', 'ALLOWED', datetime('now'))`,
        ).run();
      }

      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "spawn_child",
        riskLevel: "dangerous",
        category: "replication",
      });
      const request = createRequest(tool, {}, "agent", db);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("RATE_LIMIT_SPAWN");
    });
  });

  describe("rate limit DB unavailable", () => {
    it("denies when DB is not accessible (fail-closed)", () => {
      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "update_genesis_prompt",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      // Pass no DB to simulate DB unavailable
      const request = createRequest(tool, {}, "agent");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("DB_UNAVAILABLE");
    });

    it("denies edit_own_file when DB is not accessible", () => {
      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "edit_own_file",
        riskLevel: "dangerous",
        category: "self_mod",
      });
      const request = createRequest(tool, {}, "agent");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("DB_UNAVAILABLE");
    });

    it("denies spawn_child when DB is not accessible", () => {
      const rules = createRateLimitRules();
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "spawn_child",
        riskLevel: "dangerous",
        category: "replication",
      });
      const request = createRequest(tool, {}, "agent");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("DB_UNAVAILABLE");
    });
  });
});

// ─── Financial Phase 1 Rules Tests ──────────────────────────────

describe("Financial Phase 1 Rules", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createRawTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("financial.inference_daily_cap", () => {
    it("allows inference when under daily cap", () => {
      const rules = createFinancialRules(DEFAULT_TREASURY_POLICY);
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "chat",
        riskLevel: "safe",
        category: "conway",
      });
      const spendTracker = createMockSpendTracker({
        getDailySpend: (category: SpendCategory) =>
          category === "inference" ? 1000 : 0,
      });
      const request = createRequest(tool, {}, "agent", undefined, spendTracker);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
    });

    it("denies inference when daily cap exceeded", () => {
      const rules = createFinancialRules(DEFAULT_TREASURY_POLICY);
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "chat",
        riskLevel: "safe",
        category: "conway",
      });
      const spendTracker = createMockSpendTracker({
        getDailySpend: (category: SpendCategory) =>
          category === "inference" ? 60000 : 0, // Over the 50000 default cap
      });
      const request = createRequest(tool, {}, "agent", undefined, spendTracker);

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("INFERENCE_BUDGET_EXCEEDED");
    });
  });

  describe("financial.require_confirmation", () => {
    it("allows transfers under confirmation threshold", () => {
      const rules = createFinancialRules(DEFAULT_TREASURY_POLICY);
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "transfer_credits",
        riskLevel: "dangerous",
        category: "financial",
      });
      const request = createRequest(tool, { amount_cents: 500 }, "agent");

      const decision = engine.evaluate(request);
      // Should not be quarantined (500 < 1000 threshold)
      expect(decision.action).not.toBe("quarantine");
    });

    it("quarantines transfers above confirmation threshold", () => {
      const rules = createFinancialRules(DEFAULT_TREASURY_POLICY);
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "transfer_credits",
        riskLevel: "dangerous",
        category: "financial",
      });
      const request = createRequest(tool, { amount_cents: 2000 }, "agent");

      const decision = engine.evaluate(request);
      // Should be quarantined (2000 > 1000 threshold), but may also be denied
      // by transfer_max_single if over that limit. 2000 < 5000 so it won't be denied.
      expect(decision.action).toBe("quarantine");
      expect(decision.reasonCode).toBe("CONFIRMATION_REQUIRED");
    });

    it("returns quarantine, not deny, for confirmation threshold", () => {
      // Use a custom policy with very high transfer limits so only confirmation triggers
      const policy: TreasuryPolicy = {
        ...DEFAULT_TREASURY_POLICY,
        maxSingleTransferCents: 100000,
        requireConfirmationAboveCents: 500,
      };
      const rules = createFinancialRules(policy);
      const engine = new PolicyEngine(db, rules);

      const tool = createMockTool({
        name: "transfer_credits",
        riskLevel: "dangerous",
        category: "financial",
      });
      const request = createRequest(tool, { amount_cents: 1000 }, "agent");

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("quarantine");
      expect(decision.reasonCode).toBe("CONFIRMATION_REQUIRED");
    });
  });
});

// ─── Treasury Config Tests ──────────────────────────────────────

describe("Treasury Config", () => {
  it("DEFAULT_TREASURY_POLICY has all required fields", () => {
    expect(DEFAULT_TREASURY_POLICY.maxSingleTransferCents).toBe(5000);
    expect(DEFAULT_TREASURY_POLICY.maxHourlyTransferCents).toBe(10000);
    expect(DEFAULT_TREASURY_POLICY.maxDailyTransferCents).toBe(25000);
    expect(DEFAULT_TREASURY_POLICY.minimumReserveCents).toBe(1000);
    expect(DEFAULT_TREASURY_POLICY.maxX402PaymentCents).toBe(100);
    expect(DEFAULT_TREASURY_POLICY.x402AllowedDomains).toEqual(["conway.tech"]);
    expect(DEFAULT_TREASURY_POLICY.transferCooldownMs).toBe(0);
    expect(DEFAULT_TREASURY_POLICY.maxTransfersPerTurn).toBe(2);
    expect(DEFAULT_TREASURY_POLICY.maxInferenceDailyCents).toBe(50000);
    expect(DEFAULT_TREASURY_POLICY.requireConfirmationAboveCents).toBe(1000);
  });

  it("all default values are positive", () => {
    for (const [key, value] of Object.entries(DEFAULT_TREASURY_POLICY)) {
      if (key === "x402AllowedDomains") continue;
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── createDefaultRules Integration ─────────────────────────────

describe("createDefaultRules", () => {
  it("includes authority and rate-limit rules", () => {
    const rules = createDefaultRules();
    const ruleIds = rules.map((r) => r.id);

    expect(ruleIds).toContain("authority.external_tool_restriction");
    expect(ruleIds).toContain("authority.self_mod_from_external");
    expect(ruleIds).toContain("rate.genesis_prompt_daily");
    expect(ruleIds).toContain("rate.self_mod_hourly");
    expect(ruleIds).toContain("rate.spawn_daily");
    expect(ruleIds).toContain("financial.inference_daily_cap");
    expect(ruleIds).toContain("financial.require_confirmation");
  });

  it("authority rules have priority 400", () => {
    const rules = createDefaultRules();
    const authorityRules = rules.filter((r) => r.id.startsWith("authority."));
    for (const rule of authorityRules) {
      expect(rule.priority).toBe(400);
    }
  });

  it("rate limit rules have priority 600", () => {
    const rules = createDefaultRules();
    const rateRules = rules.filter((r) => r.id.startsWith("rate."));
    for (const rule of rateRules) {
      expect(rule.priority).toBe(600);
    }
  });

  it("financial phase 1 rules have priority 500", () => {
    const rules = createDefaultRules();
    const financialRules = rules.filter(
      (r) => r.id === "financial.inference_daily_cap" || r.id === "financial.require_confirmation",
    );
    for (const rule of financialRules) {
      expect(rule.priority).toBe(500);
    }
  });

  it("accepts custom treasury policy", () => {
    const customPolicy: TreasuryPolicy = {
      ...DEFAULT_TREASURY_POLICY,
      maxSingleTransferCents: 100,
    };
    const rules = createDefaultRules(customPolicy);
    expect(rules.length).toBeGreaterThan(0);
  });
});

// ─── promptWithDefault Tests ────────────────────────────────────

describe("promptWithDefault", () => {
  // Note: promptWithDefault is an interactive prompt function.
  // We test its logic by importing and testing the behavior expectations.
  // The actual function requires readline, so we verify the exported signature.

  it("is exported from prompts module", async () => {
    const prompts = await import("../setup/prompts.js");
    expect(typeof prompts.promptWithDefault).toBe("function");
  });
});
