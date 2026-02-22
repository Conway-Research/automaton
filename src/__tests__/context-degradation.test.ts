/**
 * Context Degradation Fix Tests (PR #5)
 *
 * Tests for:
 * - Fix A: IDLE filter deep fallback (loop.ts)
 * - Fix B: Episodic memory filtering (retrieval.ts + loop.ts)
 * - Fix C: Enhanced anti-repetition warning (context.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildContextMessages } from "../agent/context.js";
import { MemoryRetriever } from "../memory/retrieval.js";
import { MemoryIngestionPipeline } from "../memory/ingestion.js";
import {
  createTestDb,
  createTestIdentity,
  createTestConfig,
} from "./mocks.js";
import type {
  AutomatonDatabase,
  AgentTurn,
  ToolCallResult,
  EpisodicMemoryEntry,
} from "../types.js";

// ─── Helper: Create a mock AgentTurn ───────────────────────────

function makeTurn(overrides?: Partial<AgentTurn>): AgentTurn {
  return {
    id: `turn_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    state: "running",
    input: undefined,
    inputSource: undefined,
    thinking: "Checking status",
    toolCalls: [],
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    costCents: 1,
    ...overrides,
  };
}

function makeIdleTurn(toolName: string): AgentTurn {
  return makeTurn({
    thinking: `Calling ${toolName}`,
    toolCalls: [
      {
        id: `call_${Math.random().toString(36).slice(2)}`,
        name: toolName,
        arguments: {},
        result: "ok",
        durationMs: 10,
      },
    ],
  });
}

function makeProductiveTurn(toolName: string): AgentTurn {
  return makeTurn({
    thinking: `Executing ${toolName}`,
    toolCalls: [
      {
        id: `call_${Math.random().toString(36).slice(2)}`,
        name: toolName,
        arguments: { command: "echo hello" },
        result: "ok",
        durationMs: 100,
      },
    ],
  });
}

// ─── Fix A: IDLE Filter Deep Fallback ───────────────────────────

describe("Fix A: IDLE filter deep fallback", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("includes productive turns from history when all 20 recent turns are idle", () => {
    // Insert 5 productive turns at positions 25-29 (early history)
    for (let i = 0; i < 5; i++) {
      const turn = makeProductiveTurn("exec");
      turn.timestamp = new Date(Date.now() - 60000 * (30 - i)).toISOString();
      db.insertTurn(turn);
    }

    // Insert 20 idle turns (recent history)
    const idleTools = ["check_credits", "system_synopsis", "review_memory", "discover_agents"];
    for (let i = 0; i < 20; i++) {
      const tool = idleTools[i % idleTools.length];
      const turn = makeIdleTurn(tool);
      turn.timestamp = new Date(Date.now() - 60000 * (20 - i)).toISOString();
      db.insertTurn(turn);
    }

    // Replicate the IDLE filter logic from loop.ts
    const IDLE_ONLY_TOOLS = new Set([
      "check_credits", "check_usdc_balance", "system_synopsis", "review_memory",
      "list_children", "check_child_status", "list_sandboxes", "list_models",
      "list_skills", "git_status", "git_log", "check_reputation",
      "discover_agents", "recall_facts", "recall_procedure", "heartbeat_ping",
      "check_inference_spending",
    ]);

    const allTurns = db.getRecentTurns(20);
    const meaningfulTurns = allTurns.filter((t) => {
      if (t.toolCalls.length === 0) return true;
      return t.toolCalls.some((tc) => !IDLE_ONLY_TOOLS.has(tc.name));
    });

    // All 20 turns should be idle-only
    expect(meaningfulTurns.length).toBe(0);

    // Deep fallback: scan 100 turns
    let contextTurns;
    if (meaningfulTurns.length > 0) {
      contextTurns = meaningfulTurns;
    } else {
      const extendedTurns = db.getRecentTurns(100);
      const productiveTurns = extendedTurns.filter((t) =>
        t.toolCalls.length > 0 &&
        t.toolCalls.some((tc) => !IDLE_ONLY_TOOLS.has(tc.name)),
      );
      const historicalProductive = productiveTurns.slice(0, 5);
      const recentAnchor = allTurns.slice(-2);
      contextTurns = historicalProductive.length > 0
        ? [...historicalProductive, ...recentAnchor]
        : recentAnchor;
    }

    // Should have 5 productive + 2 recent anchor = 7 turns
    expect(contextTurns.length).toBe(7);

    // Verify productive turns are present
    const hasExec = contextTurns.some((t) =>
      t.toolCalls.some((tc) => tc.name === "exec"),
    );
    expect(hasExec).toBe(true);

    // Verify recent anchor turns are present (last 2 idle turns)
    const lastTwo = contextTurns.slice(-2);
    expect(lastTwo.every((t) =>
      t.toolCalls.every((tc) => IDLE_ONLY_TOOLS.has(tc.name)),
    )).toBe(true);
  });

  it("falls back to current behavior when no productive turns in 100", () => {
    // Insert 25 idle turns only
    for (let i = 0; i < 25; i++) {
      const turn = makeIdleTurn("check_credits");
      turn.timestamp = new Date(Date.now() - 60000 * (25 - i)).toISOString();
      db.insertTurn(turn);
    }

    const IDLE_ONLY_TOOLS = new Set([
      "check_credits", "check_usdc_balance", "system_synopsis", "review_memory",
      "list_children", "check_child_status", "list_sandboxes", "list_models",
      "list_skills", "git_status", "git_log", "check_reputation",
      "discover_agents", "recall_facts", "recall_procedure", "heartbeat_ping",
      "check_inference_spending",
    ]);

    const allTurns = db.getRecentTurns(20);
    const meaningfulTurns = allTurns.filter((t) => {
      if (t.toolCalls.length === 0) return true;
      return t.toolCalls.some((tc) => !IDLE_ONLY_TOOLS.has(tc.name));
    });

    expect(meaningfulTurns.length).toBe(0);

    // Deep fallback finds nothing productive
    const extendedTurns = db.getRecentTurns(100);
    const productiveTurns = extendedTurns.filter((t) =>
      t.toolCalls.length > 0 &&
      t.toolCalls.some((tc) => !IDLE_ONLY_TOOLS.has(tc.name)),
    );

    expect(productiveTurns.length).toBe(0);

    // Should fall back to last 2 turns (same as original behavior)
    const recentAnchor = allTurns.slice(-2);
    const contextTurns = productiveTurns.length > 0
      ? [...productiveTurns.slice(0, 5), ...recentAnchor]
      : recentAnchor;

    expect(contextTurns.length).toBe(2);
  });

  it("does NOT trigger deep fallback when meaningful turns exist", () => {
    // Insert 5 productive + 15 idle turns (normal operation)
    for (let i = 0; i < 5; i++) {
      const turn = makeProductiveTurn("exec");
      turn.timestamp = new Date(Date.now() - 60000 * (20 - i)).toISOString();
      db.insertTurn(turn);
    }
    for (let i = 0; i < 15; i++) {
      const turn = makeIdleTurn("check_credits");
      turn.timestamp = new Date(Date.now() - 60000 * (15 - i)).toISOString();
      db.insertTurn(turn);
    }

    const IDLE_ONLY_TOOLS = new Set([
      "check_credits", "check_usdc_balance", "system_synopsis", "review_memory",
      "list_children", "check_child_status", "list_sandboxes", "list_models",
      "list_skills", "git_status", "git_log", "check_reputation",
      "discover_agents", "recall_facts", "recall_procedure", "heartbeat_ping",
      "check_inference_spending",
    ]);

    const allTurns = db.getRecentTurns(20);
    const meaningfulTurns = allTurns.filter((t) => {
      if (t.toolCalls.length === 0) return true;
      return t.toolCalls.some((tc) => !IDLE_ONLY_TOOLS.has(tc.name));
    });

    // Should have 5 meaningful turns — deep fallback NOT triggered
    expect(meaningfulTurns.length).toBe(5);
  });
});

// ─── Fix B: Episodic Memory Filtering ───────────────────────────

describe("Fix B: episodic memory filtering", () => {
  let db: AutomatonDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("filters maintenance/idle entries from retrieval", () => {
    const sessionId = "test-session";
    const ingestion = new MemoryIngestionPipeline(db.raw);

    // Ingest productive turns
    for (let i = 0; i < 3; i++) {
      const turn = makeProductiveTurn("exec");
      const toolCalls: ToolCallResult[] = [{
        id: `call_prod_${i}`,
        name: "exec",
        arguments: { command: "echo hello" },
        result: "ok",
        durationMs: 100,
      }];
      ingestion.ingest(sessionId, turn, toolCalls);
    }

    // Ingest maintenance turns
    for (let i = 0; i < 10; i++) {
      const turn = makeIdleTurn("check_credits");
      const toolCalls: ToolCallResult[] = [{
        id: `call_maint_${i}`,
        name: "check_credits",
        arguments: {},
        result: "$100.00",
        durationMs: 10,
      }];
      ingestion.ingest(sessionId, turn, toolCalls);
    }

    // Retrieve — should filter out maintenance
    const retriever = new MemoryRetriever(db.raw);
    const result = retriever.retrieve(sessionId);

    // Only productive entries should remain in episodic memory
    for (const entry of result.episodicMemory) {
      expect(entry.classification).not.toBe("maintenance");
      expect(entry.classification).not.toBe("idle");
    }
  });

  it("handles all-maintenance episodic entries without crashing", () => {
    const sessionId = "test-session";
    const ingestion = new MemoryIngestionPipeline(db.raw);

    // Ingest only maintenance turns
    for (let i = 0; i < 20; i++) {
      const turn = makeIdleTurn("check_credits");
      const toolCalls: ToolCallResult[] = [{
        id: `call_maint_${i}`,
        name: "check_credits",
        arguments: {},
        result: "$100.00",
        durationMs: 10,
      }];
      ingestion.ingest(sessionId, turn, toolCalls);
    }

    // Retrieve — should return empty episodic
    const retriever = new MemoryRetriever(db.raw);
    const result = retriever.retrieve(sessionId);

    expect(result.episodicMemory.length).toBe(0);
  });

  it("preserves strategic and error entries in episodic memory", () => {
    const sessionId = "test-session";
    const ingestion = new MemoryIngestionPipeline(db.raw);

    // Ingest a strategic turn
    const strategicTurn = makeTurn({
      thinking: "Registering on-chain identity",
      toolCalls: [{
        id: "call_strategic_1",
        name: "register_erc8004",
        arguments: { agentURI: "https://agent.com" },
        result: "Registered successfully",
        durationMs: 5000,
      }],
    });
    ingestion.ingest(sessionId, strategicTurn, strategicTurn.toolCalls);

    // Ingest an error turn
    const errorTurn = makeTurn({
      thinking: "Trying exec",
      toolCalls: [{
        id: "call_error_1",
        name: "exec",
        arguments: { command: "failing_command" },
        result: "",
        durationMs: 100,
        error: "Command failed with exit code 1",
      }],
    });
    ingestion.ingest(sessionId, errorTurn, errorTurn.toolCalls);

    // Ingest maintenance turns
    for (let i = 0; i < 5; i++) {
      const turn = makeIdleTurn("system_synopsis");
      const toolCalls: ToolCallResult[] = [{
        id: `call_maint_keep_${i}`,
        name: "system_synopsis",
        arguments: {},
        result: "All systems nominal",
        durationMs: 10,
      }];
      ingestion.ingest(sessionId, turn, toolCalls);
    }

    const retriever = new MemoryRetriever(db.raw);
    const result = retriever.retrieve(sessionId);

    // Strategic and error entries should be preserved
    const classifications = result.episodicMemory.map((e) => e.classification);
    expect(classifications).toContain("strategic");
    expect(classifications).toContain("error");
    // Maintenance should be filtered out
    expect(classifications).not.toContain("maintenance");
  });
});

// ─── Fix B1: Memory block injection filtering ───────────────────

describe("Fix B1: memory block injection filtering", () => {
  it("filters maintenance entries from memory block in loop context", () => {
    // Simulate the filtering logic from loop.ts
    const mockEpisodicMemory: Partial<EpisodicMemoryEntry>[] = [
      { classification: "productive", summary: "Executed command" },
      { classification: "maintenance", summary: "Checked credits" },
      { classification: "maintenance", summary: "Checked synopsis" },
      { classification: "idle", summary: "No activity" },
      { classification: "strategic", summary: "Registered on-chain" },
      { classification: "error", summary: "Command failed" },
      { classification: "communication", summary: "Sent message" },
    ];

    const filtered = mockEpisodicMemory.filter(
      (e) => e.classification !== "maintenance" && e.classification !== "idle",
    );

    expect(filtered.length).toBe(4);
    expect(filtered.map((e) => e.classification)).toEqual([
      "productive", "strategic", "error", "communication",
    ]);
  });

  it("returns empty array when all entries are maintenance/idle", () => {
    const mockEpisodicMemory: Partial<EpisodicMemoryEntry>[] = [
      { classification: "maintenance", summary: "Checked credits" },
      { classification: "maintenance", summary: "Checked synopsis" },
      { classification: "idle", summary: "No activity" },
    ];

    const filtered = mockEpisodicMemory.filter(
      (e) => e.classification !== "maintenance" && e.classification !== "idle",
    );

    expect(filtered.length).toBe(0);
  });
});

// ─── Fix C: Enhanced Anti-Repetition Warning ────────────────────

describe("Fix C: enhanced anti-repetition warning", () => {
  it("includes specific productive tools in warning message", () => {
    const turns: AgentTurn[] = [];

    // 5 turns calling check_credits repeatedly
    for (let i = 0; i < 5; i++) {
      turns.push(makeIdleTurn("check_credits"));
    }

    const messages = buildContextMessages("System prompt", turns);

    // Find the warning message
    const warning = messages.find(
      (m) => m.role === "user" && m.content.includes("MAINTENANCE LOOP DETECTED"),
    );
    expect(warning).toBeDefined();
    expect(warning!.content).toContain("PRODUCTIVE tool");
    expect(warning!.content).toContain("exec");
    expect(warning!.content).toContain("write_file");
    expect(warning!.content).toContain("expose_port");
    expect(warning!.content).toContain("register_erc8004");
  });

  it("includes tools to avoid in warning message", () => {
    const turns: AgentTurn[] = [];

    for (let i = 0; i < 5; i++) {
      turns.push(makeIdleTurn("check_credits"));
    }

    const messages = buildContextMessages("System prompt", turns);

    const warning = messages.find(
      (m) => m.role === "user" && m.content.includes("MAINTENANCE LOOP DETECTED"),
    );
    expect(warning).toBeDefined();
    expect(warning!.content).toContain("Do NOT call");
    expect(warning!.content).toContain("check_credits");
    expect(warning!.content).toContain("system_synopsis");
  });

  it("references genesis prompt in warning", () => {
    const turns: AgentTurn[] = [];

    for (let i = 0; i < 5; i++) {
      turns.push(makeIdleTurn("review_memory"));
    }

    const messages = buildContextMessages("System prompt", turns);

    const warning = messages.find(
      (m) => m.role === "user" && m.content.includes("MAINTENANCE LOOP DETECTED"),
    );
    expect(warning).toBeDefined();
    expect(warning!.content).toContain("genesis prompt");
  });

  it("does NOT trigger warning with diverse productive tools", () => {
    const turns: AgentTurn[] = [
      makeProductiveTurn("exec"),
      makeProductiveTurn("write_file"),
      makeProductiveTurn("git_commit"),
      makeProductiveTurn("expose_port"),
      makeProductiveTurn("send_message"),
    ];

    const messages = buildContextMessages("System prompt", turns);

    const warning = messages.find(
      (m) => m.role === "user" && m.content.includes("MAINTENANCE LOOP DETECTED"),
    );
    expect(warning).toBeUndefined();
  });

  it("does NOT trigger when fewer than 3 turns in window", () => {
    const turns: AgentTurn[] = [
      makeIdleTurn("check_credits"),
      makeIdleTurn("check_credits"),
    ];

    const messages = buildContextMessages("System prompt", turns);

    const warning = messages.find(
      (m) => m.role === "user" && m.content.includes("MAINTENANCE LOOP DETECTED"),
    );
    expect(warning).toBeUndefined();
  });

  it("does NOT include old generic warning text", () => {
    const turns: AgentTurn[] = [];

    for (let i = 0; i < 5; i++) {
      turns.push(makeIdleTurn("check_credits"));
    }

    const messages = buildContextMessages("System prompt", turns);

    const oldWarning = messages.find(
      (m) => m.role === "user" && m.content.includes("Move on to BUILDING something"),
    );
    expect(oldWarning).toBeUndefined();
  });
});
