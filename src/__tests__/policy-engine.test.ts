/**
 * Policy Engine Tests
 *
 * Comprehensive tests for the PolicyEngine class:
 * - Empty rules allow all tool calls
 * - Deny rules block execution
 * - Decision logging
 * - Rule filtering by appliesTo (name, category, risk, all)
 * - Priority-ordered evaluation
 * - First deny wins
 * - Quarantine when no deny but quarantine exists
 * - AuthorityLevel derivation from InputSource
 * - Tool call IDs are ULIDs
 * - riskLevel classification covers all tools
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PolicyEngine } from "../agent/policy-engine.js";
import { createBuiltinTools, executeTool } from "../agent/tools.js";
import {
  createTestDb,
  createTestIdentity,
  createTestConfig,
  MockConwayClient,
  MockInferenceClient,
} from "./mocks.js";
import type {
  AutomatonTool,
  PolicyRule,
  PolicyRequest,
  PolicyRuleResult,
  PolicyDecision,
  ToolContext,
  InputSource,
  RiskLevel,
  AutomatonDatabase,
  SpendTrackerInterface,
  SpendCategory,
  SpendEntry,
  TreasuryPolicy,
  LimitCheckResult,
} from "../types.js";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";

// ─── Test Helpers ───────────────────────────────────────────────

function createRawTestDb(): Database.Database {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "policy-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Create the policy_decisions table
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

function createDenyRule(id: string, appliesTo: PolicyRule["appliesTo"], priority = 100): PolicyRule {
  return {
    id,
    description: `Deny rule: ${id}`,
    priority,
    appliesTo,
    evaluate: (): PolicyRuleResult => ({
      rule: id,
      action: "deny",
      reasonCode: "TEST_DENY",
      humanMessage: `Denied by ${id}`,
    }),
  };
}

function createAllowRule(id: string, appliesTo: PolicyRule["appliesTo"], priority = 100): PolicyRule {
  return {
    id,
    description: `Allow rule: ${id}`,
    priority,
    appliesTo,
    evaluate: (): PolicyRuleResult => ({
      rule: id,
      action: "allow",
      reasonCode: "TEST_ALLOW",
      humanMessage: `Allowed by ${id}`,
    }),
  };
}

function createQuarantineRule(id: string, appliesTo: PolicyRule["appliesTo"], priority = 100): PolicyRule {
  return {
    id,
    description: `Quarantine rule: ${id}`,
    priority,
    appliesTo,
    evaluate: (): PolicyRuleResult => ({
      rule: id,
      action: "quarantine",
      reasonCode: "TEST_QUARANTINE",
      humanMessage: `Quarantined by ${id}`,
    }),
  };
}

function createNullRule(id: string, appliesTo: PolicyRule["appliesTo"], priority = 100): PolicyRule {
  return {
    id,
    description: `Null rule: ${id}`,
    priority,
    appliesTo,
    evaluate: (): null => null,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("PolicyEngine", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createRawTestDb();
  });

  afterEach(() => {
    db.close();
  });

  describe("evaluate()", () => {
    it("allows all tool calls with empty rules", () => {
      const engine = new PolicyEngine(db, []);
      const tool = createMockTool();
      const request: PolicyRequest = {
        tool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("allow");
      expect(decision.reasonCode).toBe("ALLOWED");
      expect(decision.rulesEvaluated).toEqual([]);
      expect(decision.rulesTriggered).toEqual([]);
    });

    it("blocks execution when a deny rule matches", () => {
      const rule = createDenyRule("test.deny_all", { by: "all" });
      const engine = new PolicyEngine(db, [rule]);
      const tool = createMockTool();
      const request: PolicyRequest = {
        tool,
        args: { foo: "bar" },
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 1,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("TEST_DENY");
      expect(decision.rulesTriggered).toContain("test.deny_all");
    });

    it("filters rules by name selector", () => {
      const rule = createDenyRule("test.deny_exec", {
        by: "name",
        names: ["exec"],
      });
      const engine = new PolicyEngine(db, [rule]);

      // Matching tool
      const execTool = createMockTool({ name: "exec" });
      const execRequest: PolicyRequest = {
        tool: execTool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };
      expect(engine.evaluate(execRequest).action).toBe("deny");

      // Non-matching tool
      const readTool = createMockTool({ name: "read_file" });
      const readRequest: PolicyRequest = {
        tool: readTool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };
      expect(engine.evaluate(readRequest).action).toBe("allow");
    });

    it("filters rules by category selector", () => {
      const rule = createDenyRule("test.deny_financial", {
        by: "category",
        categories: ["financial"],
      });
      const engine = new PolicyEngine(db, [rule]);

      const financialTool = createMockTool({
        name: "transfer_credits",
        category: "financial",
        riskLevel: "dangerous",
      });
      const request: PolicyRequest = {
        tool: financialTool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };
      expect(engine.evaluate(request).action).toBe("deny");

      const vmTool = createMockTool({ name: "exec", category: "vm" });
      const vmRequest: PolicyRequest = {
        tool: vmTool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };
      expect(engine.evaluate(vmRequest).action).toBe("allow");
    });

    it("filters rules by risk level selector", () => {
      const rule = createDenyRule("test.deny_dangerous", {
        by: "risk",
        levels: ["dangerous"],
      });
      const engine = new PolicyEngine(db, [rule]);

      const dangerousTool = createMockTool({
        name: "edit_own_file",
        riskLevel: "dangerous",
      });
      const dangerousRequest: PolicyRequest = {
        tool: dangerousTool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };
      expect(engine.evaluate(dangerousRequest).action).toBe("deny");

      const safeTool = createMockTool({
        name: "read_file",
        riskLevel: "safe",
      });
      const safeRequest: PolicyRequest = {
        tool: safeTool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };
      expect(engine.evaluate(safeRequest).action).toBe("allow");
    });

    it("evaluates rules in priority order", () => {
      const evaluationOrder: string[] = [];

      const rule1: PolicyRule = {
        id: "low_priority",
        description: "Low priority",
        priority: 200,
        appliesTo: { by: "all" },
        evaluate: () => {
          evaluationOrder.push("low_priority");
          return null;
        },
      };

      const rule2: PolicyRule = {
        id: "high_priority",
        description: "High priority",
        priority: 100,
        appliesTo: { by: "all" },
        evaluate: () => {
          evaluationOrder.push("high_priority");
          return null;
        },
      };

      // Pass rules in reverse order to prove priority sorting works
      const engine = new PolicyEngine(db, [rule1, rule2]);
      const tool = createMockTool();
      const request: PolicyRequest = {
        tool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      engine.evaluate(request);
      expect(evaluationOrder).toEqual(["high_priority", "low_priority"]);
    });

    it("first deny wins over later allow", () => {
      const denyRule = createDenyRule("test.deny", { by: "all" }, 100);
      const allowRule = createAllowRule("test.allow", { by: "all" }, 200);

      const engine = new PolicyEngine(db, [denyRule, allowRule]);
      const tool = createMockTool();
      const request: PolicyRequest = {
        tool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("deny");
      expect(decision.reasonCode).toBe("TEST_DENY");
      // Only the deny rule should have been evaluated (first deny wins, breaks)
      expect(decision.rulesEvaluated).toContain("test.deny");
    });

    it("returns quarantine when no deny but quarantine exists", () => {
      const quarantineRule = createQuarantineRule("test.quarantine", { by: "all" }, 100);
      const nullRule = createNullRule("test.null", { by: "all" }, 200);

      const engine = new PolicyEngine(db, [quarantineRule, nullRule]);
      const tool = createMockTool();
      const request: PolicyRequest = {
        tool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      expect(decision.action).toBe("quarantine");
      expect(decision.reasonCode).toBe("TEST_QUARANTINE");
    });

    it("produces correct argsHash for given args", () => {
      const engine = new PolicyEngine(db, []);
      const tool = createMockTool();
      const args = { command: "ls -la" };
      const request: PolicyRequest = {
        tool,
        args,
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      expect(decision.argsHash).toHaveLength(64); // SHA-256 hex
      expect(decision.argsHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("includes correct toolName and riskLevel in decision", () => {
      const engine = new PolicyEngine(db, []);
      const tool = createMockTool({ name: "transfer_credits", riskLevel: "dangerous" });
      const request: PolicyRequest = {
        tool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      expect(decision.toolName).toBe("transfer_credits");
      expect(decision.riskLevel).toBe("dangerous");
    });
  });

  describe("logDecision()", () => {
    it("logs decisions to the policy_decisions table", () => {
      const engine = new PolicyEngine(db, []);
      const tool = createMockTool();
      const request: PolicyRequest = {
        tool,
        args: {},
        context: {} as ToolContext,
        turnContext: {
          inputSource: "creator",
          turnToolCallCount: 0,
          turnTransferCount: 0,
          sessionSpend: createMockSpendTracker(),
        },
      };

      const decision = engine.evaluate(request);
      engine.logDecision(decision, "turn_123");

      const rows = db
        .prepare("SELECT * FROM policy_decisions")
        .all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].tool_name).toBe("test_tool");
      expect(rows[0].decision).toBe("allow");
      expect(rows[0].turn_id).toBe("turn_123");
    });
  });

  describe("deriveAuthorityLevel()", () => {
    it("returns external for undefined", () => {
      expect(PolicyEngine.deriveAuthorityLevel(undefined)).toBe("external");
    });

    it("returns external for heartbeat", () => {
      expect(PolicyEngine.deriveAuthorityLevel("heartbeat")).toBe("external");
    });

    it("returns agent for creator", () => {
      expect(PolicyEngine.deriveAuthorityLevel("creator")).toBe("agent");
    });

    it("returns agent for agent", () => {
      expect(PolicyEngine.deriveAuthorityLevel("agent")).toBe("agent");
    });

    it("returns system for system", () => {
      expect(PolicyEngine.deriveAuthorityLevel("system")).toBe("system");
    });

    it("returns system for wakeup", () => {
      expect(PolicyEngine.deriveAuthorityLevel("wakeup")).toBe("system");
    });
  });
});

describe("Tool risk classifications", () => {
  it("all tools have riskLevel set (not undefined)", () => {
    const tools = createBuiltinTools("test-sandbox-id");
    for (const tool of tools) {
      expect(tool.riskLevel, `Tool ${tool.name} missing riskLevel`).toBeDefined();
      expect(
        ["safe", "caution", "dangerous", "forbidden"].includes(tool.riskLevel),
        `Tool ${tool.name} has invalid riskLevel: ${tool.riskLevel}`,
      ).toBe(true);
    }
  });

  it("has no dangerous? property on any tool", () => {
    const tools = createBuiltinTools("test-sandbox-id");
    for (const tool of tools) {
      expect(
        (tool as any).dangerous,
        `Tool ${tool.name} still has dangerous property`,
      ).toBeUndefined();
    }
  });

  it("classifies safe tools correctly", () => {
    const tools = createBuiltinTools("test-sandbox-id");
    const expectedSafe = [
      "read_file", "check_credits", "check_usdc_balance", "list_sandboxes",
      "list_models", "system_synopsis", "list_skills", "list_children",
      "check_child_status", "git_status", "git_diff", "git_log",
      "check_reputation", "discover_agents", "heartbeat_ping",
      "search_domains", "manage_dns",
    ];
    for (const name of expectedSafe) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `Tool ${name} not found`).toBeDefined();
      expect(tool!.riskLevel, `Tool ${name} should be safe`).toBe("safe");
    }
  });

  it("classifies dangerous tools correctly", () => {
    const tools = createBuiltinTools("test-sandbox-id");
    const expectedDangerous = [
      "edit_own_file", "pull_upstream", "install_npm_package",
      "install_mcp_server", "install_skill", "create_skill", "remove_skill",
      "transfer_credits", "fund_child", "x402_fetch", "register_domain",
      "spawn_child", "delete_sandbox", "update_genesis_prompt",
      "register_erc8004", "give_feedback", "distress_signal",
    ];
    for (const name of expectedDangerous) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, `Tool ${name} not found`).toBeDefined();
      expect(tool!.riskLevel, `Tool ${name} should be dangerous`).toBe("dangerous");
    }
  });
});

describe("Tool call IDs", () => {
  it("executeTool returns ULID IDs (not Date.now patterns)", async () => {
    const tools = createBuiltinTools("test-sandbox-id");
    const identity = createTestIdentity();
    const config = createTestConfig();
    const conway = new MockConwayClient();
    const appDb = createTestDb();
    const inference = new MockInferenceClient([]);

    const context: ToolContext = {
      identity,
      config,
      db: appDb,
      conway,
      inference,
    };

    const result = await executeTool("check_credits", {}, tools, context);

    // ULID is 26 chars, base32 encoded
    expect(result.id).toHaveLength(26);
    expect(result.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // Should NOT be in the old tc_timestamp format
    expect(result.id).not.toMatch(/^tc_\d+$/);

    appDb.close();
  });

  it("unknown tool returns ULID ID too", async () => {
    const tools = createBuiltinTools("test-sandbox-id");
    const context = {} as ToolContext;

    const result = await executeTool("nonexistent_tool", {}, tools, context);

    expect(result.id).toHaveLength(26);
    expect(result.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(result.error).toContain("Unknown tool");
  });
});

describe("executeTool with PolicyEngine", () => {
  let db: Database.Database;
  let appDb: AutomatonDatabase;

  beforeEach(() => {
    db = createRawTestDb();
    appDb = createTestDb();
  });

  afterEach(() => {
    db.close();
    appDb.close();
  });

  it("blocks tool execution when policy denies", async () => {
    const denyRule = createDenyRule("test.block_all", { by: "all" });
    const engine = new PolicyEngine(db, [denyRule]);

    const tools = createBuiltinTools("test-sandbox-id");
    const identity = createTestIdentity();
    const config = createTestConfig();
    const conway = new MockConwayClient();
    const inference = new MockInferenceClient([]);

    const context: ToolContext = {
      identity,
      config,
      db: appDb,
      conway,
      inference,
    };

    const turnContext = {
      inputSource: "creator" as InputSource,
      turnToolCallCount: 0,
      turnTransferCount: 0,
      sessionSpend: createMockSpendTracker(),
    };

    const result = await executeTool(
      "check_credits",
      {},
      tools,
      context,
      engine,
      turnContext,
    );

    expect(result.error).toContain("Policy denied");
    expect(result.error).toContain("TEST_DENY");
    expect(result.result).toBe("");
  });

  it("allows tool execution when no policy engine is provided", async () => {
    const tools = createBuiltinTools("test-sandbox-id");
    const identity = createTestIdentity();
    const config = createTestConfig();
    const conway = new MockConwayClient();
    const inference = new MockInferenceClient([]);

    const context: ToolContext = {
      identity,
      config,
      db: appDb,
      conway,
      inference,
    };

    // No policyEngine or turnContext - backward compatible
    const result = await executeTool("check_credits", {}, tools, context);

    expect(result.error).toBeUndefined();
    expect(result.result).toContain("Credit balance");
  });

  it("allows tool execution when policy allows", async () => {
    const engine = new PolicyEngine(db, []);

    const tools = createBuiltinTools("test-sandbox-id");
    const identity = createTestIdentity();
    const config = createTestConfig();
    const conway = new MockConwayClient();
    const inference = new MockInferenceClient([]);

    const context: ToolContext = {
      identity,
      config,
      db: appDb,
      conway,
      inference,
    };

    const turnContext = {
      inputSource: "creator" as InputSource,
      turnToolCallCount: 0,
      turnTransferCount: 0,
      sessionSpend: createMockSpendTracker(),
    };

    const result = await executeTool(
      "check_credits",
      {},
      tools,
      context,
      engine,
      turnContext,
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toContain("Credit balance");
  });
});
