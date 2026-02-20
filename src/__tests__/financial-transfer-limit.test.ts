/**
 * Tests for financial.turn_transfer_limit fix:
 * The rule should count only transfer_credits calls, not all tool calls.
 *
 * Also tests for command safety credential pattern hardening:
 * Credential harvesting patterns should match sensitive paths
 * regardless of the command used (not just `cat`).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { createFinancialRules } from "../agent/policy-rules/financial.js";
import { createCommandSafetyRules } from "../agent/policy-rules/command-safety.js";
import { PolicyEngine } from "../agent/policy-engine.js";
import type {
  AutomatonTool,
  PolicyRequest,
  TreasuryPolicy,
  SpendTrackerInterface,
  ToolContext,
} from "../types.js";
import { DEFAULT_TREASURY_POLICY } from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────

function createTestDb(): Database.Database {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "transfer-limit-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS policy_decisions (
      id TEXT PRIMARY KEY,
      turn_id TEXT,
      tool_name TEXT NOT NULL,
      tool_args_hash TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      decision TEXT NOT NULL,
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
      category TEXT NOT NULL,
      window_hour TEXT NOT NULL,
      window_day TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
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

function mockExecTool(): AutomatonTool {
  return {
    name: "exec",
    description: "Execute command",
    parameters: { type: "object", properties: {} },
    execute: async () => "ok",
    riskLevel: "caution",
    category: "system",
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

function createTransferRequest(
  turnToolCallCount: number,
  turnTransferCount: number,
): PolicyRequest {
  return {
    tool: mockTransferTool(),
    args: { amount_cents: 100, to_address: "0x1234" },
    context: {} as ToolContext,
    turnContext: {
      inputSource: "agent",
      turnToolCallCount,
      turnTransferCount,
      sessionSpend: createMockSpendTracker(),
    },
  };
}

function createExecRequest(command: string): PolicyRequest {
  return {
    tool: mockExecTool(),
    args: { command },
    context: {} as ToolContext,
    turnContext: {
      inputSource: "agent",
      turnToolCallCount: 0,
      turnTransferCount: 0,
      sessionSpend: createMockSpendTracker(),
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("financial.turn_transfer_limit uses turnTransferCount", () => {
  let db: Database.Database;
  let engine: PolicyEngine;

  beforeEach(() => {
    db = createTestDb();
    engine = new PolicyEngine(db, createFinancialRules(DEFAULT_TREASURY_POLICY));
  });

  afterEach(() => {
    db.close();
  });

  it("allows transfer when turnToolCallCount is high but turnTransferCount is 0", () => {
    // 10 non-transfer tool calls happened, but zero transfers
    const request = createTransferRequest(10, 0);
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("allow");
  });

  it("allows transfer when turnToolCallCount is high but turnTransferCount is 1", () => {
    // Many tool calls, but only 1 transfer so far
    const request = createTransferRequest(15, 1);
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("allow");
  });

  it("denies transfer when turnTransferCount reaches maxTransfersPerTurn", () => {
    // Only 2 total tool calls, but both were transfers (maxTransfersPerTurn=2)
    const request = createTransferRequest(2, 2);
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("TURN_TRANSFER_LIMIT");
  });

  it("denies transfer when turnTransferCount exceeds limit regardless of total calls", () => {
    const request = createTransferRequest(3, 5);
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
    expect(decision.reasonCode).toBe("TURN_TRANSFER_LIMIT");
  });
});

describe("command safety: credential patterns match any command", () => {
  let db: Database.Database;
  let engine: PolicyEngine;

  beforeEach(() => {
    db = createTestDb();
    engine = new PolicyEngine(db, createCommandSafetyRules());
  });

  afterEach(() => {
    db.close();
  });

  it("blocks 'less .ssh/id_rsa'", () => {
    const request = createExecRequest("less .ssh/id_rsa");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
  });

  it("blocks 'head -n 1 .env'", () => {
    const request = createExecRequest("head -n 1 .env");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
  });

  it("blocks 'base64 wallet.json'", () => {
    const request = createExecRequest("base64 wallet.json");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
  });

  it("blocks 'cp .ssh/id_rsa /tmp/key'", () => {
    const request = createExecRequest("cp .ssh/id_rsa /tmp/key");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
  });

  it("blocks 'cat ~/.gnupg/private-keys'", () => {
    const request = createExecRequest("cat ~/.gnupg/private-keys");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
  });

  it("blocks 'python3 -c open(\"wallet.json\")'", () => {
    const request = createExecRequest('python3 -c "print(open(\'wallet.json\').read())"');
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("deny");
  });

  it("allows normal commands without sensitive paths", () => {
    const request = createExecRequest("ls -la /tmp");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("allow");
  });

  it("does not false-positive on '.envelope' or 'env_setup'", () => {
    // .env should be a word boundary match, not partial
    const request = createExecRequest("cat .envelope");
    const decision = engine.evaluate(request);
    expect(decision.action).toBe("allow");
  });
});
