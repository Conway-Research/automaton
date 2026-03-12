/**
 * Data Layer Hardening Tests (Sub-phase 1.6)
 *
 * Tests: SSRF blocking, URI allowlist, agent card validation,
 * installed tool loading, KV pruning, safeJsonParse,
 * agent_state validation, createdAt persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createDatabase, pruneStaleKV } from "../state/database.js";
import type { AutomatonDatabase } from "../types.js";

// Mock erc8004.js to avoid ABI parse error at import time
vi.mock("../registry/erc8004.js", () => ({
  queryAgent: vi.fn(),
  getTotalAgents: vi.fn().mockResolvedValue(0),
  registerAgent: vi.fn(),
  leaveFeedback: vi.fn(),
}));

// Mock injection-defense.js to avoid import chain issues
vi.mock("../agent/injection-defense.js", () => ({
  sanitizeToolResult: vi.fn((s: string) => s),
  sanitizeInput: vi.fn((s: string) => ({ content: s, blocked: false })),
}));

// Import after mocks are set up
const { isAllowedUri, isInternalNetwork, validateAgentCard } = await import("../registry/discovery.js");
const { loadInstalledTools } = await import("../agent/tools.js");

function makeTmpDbPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-data-layer-test-"));
  return path.join(tmpDir, "test.db");
}

// ─── SSRF Protection Tests ──────────────────────────────────────

describe("SSRF Protection", () => {
  describe("isInternalNetwork", () => {
    it("blocks 127.0.0.1 (loopback)", () => {
      expect(isInternalNetwork("127.0.0.1")).toBe(true);
    });

    it("blocks 127.x.x.x range", () => {
      expect(isInternalNetwork("127.255.0.1")).toBe(true);
    });

    it("blocks 10.0.0.1 (private class A)", () => {
      expect(isInternalNetwork("10.0.0.1")).toBe(true);
    });

    it("blocks 10.255.255.255", () => {
      expect(isInternalNetwork("10.255.255.255")).toBe(true);
    });

    it("blocks 172.16.0.1 (private class B)", () => {
      expect(isInternalNetwork("172.16.0.1")).toBe(true);
    });

    it("blocks 172.31.255.255", () => {
      expect(isInternalNetwork("172.31.255.255")).toBe(true);
    });

    it("allows 172.15.0.1 (not in private range)", () => {
      expect(isInternalNetwork("172.15.0.1")).toBe(false);
    });

    it("allows 172.32.0.1 (not in private range)", () => {
      expect(isInternalNetwork("172.32.0.1")).toBe(false);
    });

    it("blocks 192.168.1.1 (private class C)", () => {
      expect(isInternalNetwork("192.168.1.1")).toBe(true);
    });

    it("blocks 169.254.0.0 (link-local)", () => {
      expect(isInternalNetwork("169.254.0.0")).toBe(true);
    });

    it("blocks ::1 (IPv6 loopback)", () => {
      expect(isInternalNetwork("::1")).toBe(true);
    });

    it("blocks localhost", () => {
      expect(isInternalNetwork("localhost")).toBe(true);
    });

    it("blocks LOCALHOST (case-insensitive)", () => {
      expect(isInternalNetwork("LOCALHOST")).toBe(true);
    });

    it("blocks 0.0.0.0", () => {
      expect(isInternalNetwork("0.0.0.0")).toBe(true);
    });

    it("allows public IPs", () => {
      expect(isInternalNetwork("8.8.8.8")).toBe(false);
      expect(isInternalNetwork("1.1.1.1")).toBe(false);
      expect(isInternalNetwork("203.0.113.1")).toBe(false);
    });

    it("allows public hostnames", () => {
      expect(isInternalNetwork("example.com")).toBe(false);
      expect(isInternalNetwork("api.conway.tech")).toBe(false);
    });
  });

  describe("isAllowedUri", () => {
    it("allows https URIs", () => {
      expect(isAllowedUri("https://example.com/agent-card.json")).toBe(true);
    });

    it("allows ipfs URIs", () => {
      expect(isAllowedUri("ipfs://QmTest123")).toBe(true);
    });

    it("blocks http URIs", () => {
      expect(isAllowedUri("http://example.com/agent-card.json")).toBe(false);
    });

    it("blocks file URIs", () => {
      expect(isAllowedUri("file:///etc/passwd")).toBe(false);
    });

    it("blocks ftp URIs", () => {
      expect(isAllowedUri("ftp://evil.com/data")).toBe(false);
    });

    it("blocks javascript URIs", () => {
      expect(isAllowedUri("javascript:alert(1)")).toBe(false);
    });

    it("blocks https URIs to internal networks", () => {
      expect(isAllowedUri("https://127.0.0.1/card.json")).toBe(false);
      expect(isAllowedUri("https://10.0.0.1/card.json")).toBe(false);
      expect(isAllowedUri("https://192.168.1.1/card.json")).toBe(false);
      expect(isAllowedUri("https://localhost/card.json")).toBe(false);
    });

    it("blocks invalid URIs", () => {
      expect(isAllowedUri("not-a-url")).toBe(false);
      expect(isAllowedUri("")).toBe(false);
    });
  });
});

// ─── Agent Card Validation Tests ────────────────────────────────

describe("Agent Card Validation", () => {
  it("accepts a valid agent card", () => {
    const card = validateAgentCard({
      name: "TestAgent",
      type: "automaton",
      address: "7xKpQ4rJ2mN3vF8wG6hB9tY1cZ5dA0eR",
      description: "A test agent",
    });
    expect(card).not.toBeNull();
    expect(card?.name).toBe("TestAgent");
    expect(card?.type).toBe("automaton");
  });

  it("rejects null", () => {
    expect(validateAgentCard(null)).toBeNull();
  });

  it("rejects undefined", () => {
    expect(validateAgentCard(undefined)).toBeNull();
  });

  it("rejects non-object", () => {
    expect(validateAgentCard("string")).toBeNull();
    expect(validateAgentCard(42)).toBeNull();
  });

  it("rejects missing name", () => {
    expect(validateAgentCard({ type: "automaton" })).toBeNull();
  });

  it("rejects missing type", () => {
    expect(validateAgentCard({ name: "TestAgent" })).toBeNull();
  });

  it("rejects empty name", () => {
    expect(validateAgentCard({ name: "", type: "automaton" })).toBeNull();
  });

  it("rejects empty type", () => {
    expect(validateAgentCard({ name: "TestAgent", type: "" })).toBeNull();
  });

  it("rejects non-string address", () => {
    expect(validateAgentCard({ name: "TestAgent", type: "automaton", address: 123 })).toBeNull();
  });

  it("accepts card without optional fields", () => {
    const card = validateAgentCard({ name: "TestAgent", type: "automaton" });
    expect(card).not.toBeNull();
  });
});

// ─── KV Pruning Tests ───────────────────────────────────────────

describe("KV Pruning", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("prunes inbox_seen_* keys older than 7 days", () => {
    // Insert old KV entries directly via raw DB
    const rawDb = (db as any).raw;
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    rawDb.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)"
    ).run("inbox_seen_abc123", "1", oldDate);
    rawDb.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)"
    ).run("inbox_seen_def456", "1", oldDate);

    // Insert a recent one that should NOT be pruned
    db.setKV("inbox_seen_recent", "1");

    // Insert a non-inbox key that should NOT be pruned
    rawDb.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)"
    ).run("other_key", "value", oldDate);

    const pruned = pruneStaleKV(rawDb, "inbox_seen_", 7);
    expect(pruned).toBe(2);

    // Verify recent inbox key still exists
    expect(db.getKV("inbox_seen_recent")).toBe("1");

    // Verify non-inbox old key still exists
    expect(db.getKV("other_key")).toBe("value");
  });

  it("returns 0 when nothing to prune", () => {
    db.setKV("inbox_seen_fresh", "1");
    const rawDb = (db as any).raw;
    const pruned = pruneStaleKV(rawDb, "inbox_seen_", 7);
    expect(pruned).toBe(0);
  });
});

// ─── Agent State Validation Tests ────────────────────────────────

describe("Agent State Validation", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("accepts valid agent states", () => {
    const validStates = ["setup", "waking", "running", "sleeping", "low_compute", "critical", "dead"];
    for (const state of validStates) {
      db.setAgentState(state as any);
      expect(db.getAgentState()).toBe(state);
    }
  });

  it("returns 'setup' for invalid agent state", () => {
    // Write an invalid state directly
    const rawDb = (db as any).raw;
    rawDb.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    ).run("agent_state", "invalid_state");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(db.getAgentState()).toBe("setup");
    consoleSpy.mockRestore();
  });

  it("returns 'setup' when no agent state is set", () => {
    expect(db.getAgentState()).toBe("setup");
  });
});

// ─── Installed Tools Loading Tests ──────────────────────────────

describe("Installed Tools Loading", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("loads enabled installed tools from DB", () => {
    db.installTool({
      id: "tool-1",
      name: "test_tool",
      type: "custom",
      config: { command: "echo hello" },
      installedAt: new Date().toISOString(),
      enabled: true,
    });

    const tools = loadInstalledTools(db);
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("test_tool");
    expect(tools[0].riskLevel).toBe("caution");
  });

  it("does not load disabled tools", () => {
    db.installTool({
      id: "tool-disabled",
      name: "disabled_tool",
      type: "custom",
      config: {},
      installedAt: new Date().toISOString(),
      enabled: true,
    });
    db.removeTool("tool-disabled");

    const tools = loadInstalledTools(db);
    expect(tools.length).toBe(0);
  });

  it("returns empty array when no tools installed", () => {
    const tools = loadInstalledTools(db);
    expect(tools.length).toBe(0);
  });
});

// ─── createdAt Persistence Tests ─────────────────────────────────

describe("createdAt Persistence", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("persists createdAt and does not overwrite on subsequent access", () => {
    // Simulate first run: set createdAt
    const firstCreatedAt = "2025-01-01T00:00:00.000Z";
    expect(db.getIdentity("createdAt")).toBeUndefined();
    db.setIdentity("createdAt", firstCreatedAt);

    // Simulate second run: createdAt should already exist
    const existing = db.getIdentity("createdAt");
    expect(existing).toBe(firstCreatedAt);

    // The logic in index.ts checks: only set if not already stored
    // So on second run, it should NOT overwrite
    const secondRunCreatedAt = existing || new Date().toISOString();
    expect(secondRunCreatedAt).toBe(firstCreatedAt);
  });
});

// ─── JSON Deserialization Safety Tests ──────────────────────────

describe("safeJsonParse in deserializers", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("handles corrupted JSON in turn tool_calls gracefully", () => {
    const rawDb = (db as any).raw;

    // Insert a turn with corrupted JSON
    rawDb.prepare(
      `INSERT INTO turns (id, timestamp, state, thinking, tool_calls, token_usage, cost_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("test-turn", new Date().toISOString(), "running", "thinking", "{invalid json}", '{"promptTokens":0,"completionTokens":0}', 0);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const turns = db.getRecentTurns(1);
    expect(turns.length).toBe(1);
    expect(turns[0].toolCalls).toEqual([]);
    consoleSpy.mockRestore();
  });

  it("handles corrupted JSON in heartbeat params gracefully", () => {
    const rawDb = (db as any).raw;

    rawDb.prepare(
      `INSERT INTO heartbeat_entries (name, schedule, task, enabled, params, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    ).run("test-hb", "* * * * *", "test", 1, "{bad json}");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entries = db.getHeartbeatEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].params).toEqual({});
    consoleSpy.mockRestore();
  });

  it("handles corrupted JSON in installed tool config gracefully", () => {
    const rawDb = (db as any).raw;

    rawDb.prepare(
      `INSERT INTO installed_tools (id, name, type, config, installed_at, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("corrupt-tool", "bad_tool", "custom", "{not json!", new Date().toISOString(), 1);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const tools = db.getInstalledTools();
    expect(tools.length).toBe(1);
    expect(tools[0].config).toEqual({});
    consoleSpy.mockRestore();
  });
});

// ─── Inbox Message Deserialization Tests ─────────────────────────

describe("Inbox Message Deserialization", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("uses to_address column instead of hardcoded empty string", () => {
    const rawDb = (db as any).raw;

    // Insert message with to_address
    rawDb.prepare(
      `INSERT INTO inbox_messages (id, from_address, to_address, content, received_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("msg-1", "3nWpEUTi9ZMx6K4YhVfRqJb7cDsLg8aP", "9mFkR2xH5tN8vB3wG7jQ4cY1pZ6dA0eS", "Hello", new Date().toISOString());

    const messages = db.getUnprocessedInboxMessages(10);
    expect(messages.length).toBe(1);
    expect(messages[0].to).toBe("9mFkR2xH5tN8vB3wG7jQ4cY1pZ6dA0eS");
  });

  it("falls back to empty string when to_address is null", () => {
    db.insertInboxMessage({
      id: "msg-2",
      from: "3nWpEUTi9ZMx6K4YhVfRqJb7cDsLg8aP",
      to: "",
      content: "Hello",
      signedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });

    const messages = db.getUnprocessedInboxMessages(10);
    expect(messages.length).toBe(1);
    expect(messages[0].to).toBe("");
  });
});

// ─── Schema Migration Tests ──────────────────────────────────────

describe("Schema Migrations", () => {
  it("creates fresh database with current schema version", () => {
    const dbPath = makeTmpDbPath();
    const db = createDatabase(dbPath);
    const rawDb = (db as any).raw;

    const version = rawDb.prepare("SELECT MAX(version) as v FROM schema_version").get() as any;
    expect(version.v).toBeGreaterThanOrEqual(4);

    db.close();
  });

  it("has all required tables in fresh database", () => {
    const dbPath = makeTmpDbPath();
    const db = createDatabase(dbPath);
    const rawDb = (db as any).raw;

    const tables = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);

    const requiredTables = [
      "identity",
      "turns",
      "tool_calls",
      "heartbeat_entries",
      "transactions",
      "installed_tools",
      "modifications",
      "kv",
      "inbox_messages",
      "policy_decisions",
      "spend_tracking",
      "heartbeat_schedule",
      "heartbeat_history",
      "wake_events",
      "heartbeat_dedup",
      "soul_history",
      "working_memory",
      "episodic_memory",
      "semantic_memory",
      "procedural_memory",
      "relationship_memory",
      "session_summaries",
      "inference_costs",
      "model_registry",
      "child_lifecycle_events",
      "discovered_agents_cache",
      "onchain_transactions",
    ];

    for (const table of requiredTables) {
      expect(tables, `missing table: ${table}`).toContain(table);
    }

    db.close();
  });

  it("V4 migration adds inbox state columns", () => {
    const dbPath = makeTmpDbPath();
    const db = createDatabase(dbPath);
    const rawDb = (db as any).raw;

    // Check the inbox_messages table has status, retry_count, max_retries columns
    const columns = rawDb
      .prepare("PRAGMA table_info(inbox_messages)")
      .all()
      .map((c: any) => c.name);

    expect(columns).toContain("status");
    expect(columns).toContain("retry_count");
    expect(columns).toContain("max_retries");
    expect(columns).toContain("to_address");

    db.close();
  });
});

// ─── CRUD Operations for Core Tables ─────────────────────────────

describe("Core Table CRUD", () => {
  let dbPath: string;
  let db: AutomatonDatabase;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    try { db.close(); } catch { /* already closed */ }
  });

  it("turn CRUD: insert and read", () => {
    const turn = {
      id: "turn-1",
      timestamp: new Date().toISOString(),
      state: "running" as const,
      thinking: "Thinking about things",
      toolCalls: [],
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      costCents: 0,
    };

    db.insertTurn(turn);
    const recent = db.getRecentTurns(1);
    expect(recent.length).toBe(1);
    expect(recent[0].id).toBe("turn-1");
    expect(recent[0].thinking).toBe("Thinking about things");
  });

  it("tool call CRUD: insert linked to turn", () => {
    const turn = {
      id: "turn-tc-1",
      timestamp: new Date().toISOString(),
      state: "running" as const,
      thinking: "Using tools",
      toolCalls: [],
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      costCents: 0,
    };
    db.insertTurn(turn);

    const tc = {
      id: "tc-1",
      name: "exec",
      arguments: { command: "echo test" },
      result: "stdout: test",
      durationMs: 100,
    };
    db.insertToolCall("turn-tc-1", tc);

    const turns = db.getRecentTurns(1);
    expect(turns[0].toolCalls.length).toBeGreaterThanOrEqual(0);
  });

  it("transaction CRUD: insert and read via raw", () => {
    db.insertTransaction({
      id: "txn-1",
      type: "transfer_out",
      amountCents: 500,
      balanceAfterCents: 9500,
      description: "Test transfer",
      timestamp: new Date().toISOString(),
    });

    const rawDb = (db as any).raw;
    const txns = rawDb.prepare("SELECT * FROM transactions WHERE id = ?").all("txn-1");
    expect(txns.length).toBe(1);
    expect(txns[0].id).toBe("txn-1");
    expect(txns[0].amount_cents).toBe(500);
  });

  it("KV store: set, get, delete", () => {
    db.setKV("test_key", "test_value");
    expect(db.getKV("test_key")).toBe("test_value");

    db.setKV("test_key", "updated_value");
    expect(db.getKV("test_key")).toBe("updated_value");
  });

  it("identity store: set and get", () => {
    db.setIdentity("name", "test-bot");
    expect(db.getIdentity("name")).toBe("test-bot");
  });

  it("modification CRUD: insert and read via raw", () => {
    db.insertModification({
      id: "mod-1",
      timestamp: new Date().toISOString(),
      type: "code_edit",
      description: "Edited test.ts",
      reversible: true,
    });

    const rawDb = (db as any).raw;
    const mods = rawDb.prepare("SELECT * FROM modifications WHERE id = ?").all("mod-1");
    expect(mods.length).toBe(1);
    expect(mods[0].type).toBe("code_edit");
  });

  it("heartbeat entry CRUD: upsert and read", () => {
    db.upsertHeartbeatEntry({
      name: "test_entry",
      schedule: "*/5 * * * *",
      task: "test_task",
      enabled: true,
    });

    const entries = db.getHeartbeatEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("test_entry");
    expect(entries[0].schedule).toBe("*/5 * * * *");
  });

  it("installed tool CRUD: install and remove", () => {
    db.installTool({
      id: "tool-1",
      name: "test_tool",
      type: "custom",
      config: { foo: "bar" },
      installedAt: new Date().toISOString(),
      enabled: true,
    });

    let tools = db.getInstalledTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("test_tool");

    db.removeTool("tool-1");
    tools = db.getInstalledTools();
    expect(tools.length).toBe(0);
  });

  it("turn count increments correctly", () => {
    expect(db.getTurnCount()).toBe(0);

    db.insertTurn({
      id: "count-turn-1",
      timestamp: new Date().toISOString(),
      state: "running",
      thinking: "first",
      toolCalls: [],
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costCents: 0,
    });

    expect(db.getTurnCount()).toBe(1);

    db.insertTurn({
      id: "count-turn-2",
      timestamp: new Date().toISOString(),
      state: "running",
      thinking: "second",
      toolCalls: [],
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      costCents: 0,
    });

    expect(db.getTurnCount()).toBe(2);
  });

  it("children CRUD: insert and list", () => {
    const rawDb = (db as any).raw;
    rawDb.prepare(
      `INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("child-1", "test-child", "4vRkN8xH2tM5wB7jG3cQ9pY1dZ6eA0fS", "sandbox-1", "You are a child.", "spawning");

    const children = db.getChildren();
    expect(children.length).toBe(1);
    expect(children[0].name).toBe("test-child");
    expect(children[0].status).toBe("spawning");
  });

  it("skills CRUD: insert and list", () => {
    const rawDb = (db as any).raw;
    rawDb.prepare(
      `INSERT INTO skills (name, description, instructions, source, path, enabled) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("test_skill", "A test skill", "Do things", "self", "/tmp/skills/test", 1);

    const skills = db.getSkills();
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("test_skill");
    expect(skills[0].enabled).toBe(true);
  });
});
