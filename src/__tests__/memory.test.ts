/**
 * Memory System Tests (Sub-phase 2.2)
 *
 * Tests: working memory, episodic memory, semantic memory, procedural memory,
 * relationship memory, budget management, retrieval, ingestion pipeline,
 * memory tools, turn classification, context formatting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { MIGRATION_V5 } from "../state/schema.js";
import { WorkingMemoryManager } from "../memory/working.js";
import { EpisodicMemoryManager } from "../memory/episodic.js";
import { SemanticMemoryManager } from "../memory/semantic.js";
import { ProceduralMemoryManager } from "../memory/procedural.js";
import { RelationshipMemoryManager } from "../memory/relationship.js";
import { MemoryBudgetManager } from "../memory/budget.js";
import { MemoryRetriever } from "../memory/retrieval.js";
import { MemoryIngestionPipeline } from "../memory/ingestion.js";
import { classifyTurn } from "../memory/types.js";
import {
  rememberFact,
  recallFacts,
  setGoal,
  completeGoal,
  saveProcedure,
  recallProcedure,
  noteAboutAgent,
  reviewMemory,
  forget,
} from "../memory/tools.js";
import { formatMemoryBlock } from "../agent/context.js";
import { DEFAULT_MEMORY_BUDGET } from "../types.js";
import type { MemoryRetrievalResult, ToolCallResult, AgentTurn } from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(MIGRATION_V5);
  db.exec("INSERT INTO schema_version (version) VALUES (5)");
  return db;
}

function makeToolCallResult(overrides: Partial<ToolCallResult> = {}): ToolCallResult {
  return {
    id: "tc_001",
    name: "exec",
    arguments: {},
    result: "ok",
    durationMs: 100,
    ...overrides,
  };
}

function makeTurn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: "turn_001",
    timestamp: new Date().toISOString(),
    state: "running",
    thinking: "I should do something useful.",
    toolCalls: [],
    tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    costCents: 0,
    ...overrides,
  };
}

// ─── Working Memory Tests ──────────────────────────────────────

describe("WorkingMemoryManager", () => {
  let db: Database.Database;
  let wm: WorkingMemoryManager;

  beforeEach(() => {
    db = createTestDb();
    wm = new WorkingMemoryManager(db);
  });

  it("should add and retrieve a working memory entry", () => {
    const id = wm.add({
      sessionId: "session1",
      content: "Find and respond to messages",
      contentType: "goal",
      priority: 0.9,
    });
    expect(id).toBeTruthy();

    const entries = wm.getBySession("session1");
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("Find and respond to messages");
    expect(entries[0].contentType).toBe("goal");
    expect(entries[0].priority).toBe(0.9);
    expect(entries[0].tokenCount).toBeGreaterThan(0);
  });

  it("should order entries by priority descending", () => {
    wm.add({ sessionId: "s1", content: "Low", contentType: "note", priority: 0.1 });
    wm.add({ sessionId: "s1", content: "High", contentType: "goal", priority: 0.9 });
    wm.add({ sessionId: "s1", content: "Mid", contentType: "task", priority: 0.5 });

    const entries = wm.getBySession("s1");
    expect(entries[0].content).toBe("High");
    expect(entries[1].content).toBe("Mid");
    expect(entries[2].content).toBe("Low");
  });

  it("should update an entry", () => {
    const id = wm.add({ sessionId: "s1", content: "Original", contentType: "note" });
    wm.update(id, { content: "Updated", priority: 0.8 });

    const entries = wm.getBySession("s1");
    expect(entries[0].content).toBe("Updated");
    expect(entries[0].priority).toBe(0.8);
  });

  it("should delete an entry", () => {
    const id = wm.add({ sessionId: "s1", content: "Delete me", contentType: "note" });
    wm.delete(id);

    const entries = wm.getBySession("s1");
    expect(entries).toHaveLength(0);
  });

  it("should prune lowest priority entries when over limit", () => {
    for (let i = 0; i < 5; i++) {
      wm.add({ sessionId: "s1", content: `Entry ${i}`, contentType: "note", priority: i / 10 });
    }

    const removed = wm.prune("s1", 3);
    expect(removed).toBe(2);
    expect(wm.getBySession("s1")).toHaveLength(3);
  });

  it("should not prune when under limit", () => {
    wm.add({ sessionId: "s1", content: "Only one", contentType: "note" });
    const removed = wm.prune("s1", 10);
    expect(removed).toBe(0);
  });

  it("should clear expired entries", () => {
    // Add one expired entry with past date
    db.prepare(
      `INSERT INTO working_memory (id, session_id, content, content_type, priority, token_count, expires_at)
       VALUES ('expired1', 's1', 'Expired', 'note', 0.5, 10, '2020-01-01T00:00:00.000Z')`,
    ).run();
    wm.add({ sessionId: "s1", content: "Active", contentType: "note" });

    const removed = wm.clearExpired();
    expect(removed).toBe(1);
    expect(wm.getBySession("s1")).toHaveLength(1);
    expect(wm.getBySession("s1")[0].content).toBe("Active");
  });

  it("should isolate entries by session", () => {
    wm.add({ sessionId: "s1", content: "S1 entry", contentType: "note" });
    wm.add({ sessionId: "s2", content: "S2 entry", contentType: "note" });

    expect(wm.getBySession("s1")).toHaveLength(1);
    expect(wm.getBySession("s2")).toHaveLength(1);
    expect(wm.getBySession("s1")[0].content).toBe("S1 entry");
  });

  it("prune with negative maxEntries does not delete entries", () => {
    wm.add({ sessionId: "s1", content: "Entry 1", contentType: "note" });
    wm.add({ sessionId: "s1", content: "Entry 2", contentType: "note" });

    const removed = wm.prune("s1", -5);
    expect(removed).toBe(0);
    expect(wm.getBySession("s1")).toHaveLength(2);
  });
});

// ─── Episodic Memory Tests ────────────────────────────────────

describe("EpisodicMemoryManager", () => {
  let db: Database.Database;
  let ep: EpisodicMemoryManager;

  beforeEach(() => {
    db = createTestDb();
    ep = new EpisodicMemoryManager(db);
  });

  it("should record and retrieve an episodic event", () => {
    const id = ep.record({
      sessionId: "s1",
      eventType: "tool:exec",
      summary: "Ran a shell command",
      outcome: "success",
      importance: 0.7,
      classification: "productive",
    });
    expect(id).toBeTruthy();

    const recent = ep.getRecent("s1");
    expect(recent).toHaveLength(1);
    expect(recent[0].eventType).toBe("tool:exec");
    expect(recent[0].outcome).toBe("success");
    expect(recent[0].classification).toBe("productive");
  });

  it("should search episodic memory by summary", () => {
    ep.record({ sessionId: "s1", eventType: "tool:exec", summary: "Deployed web app" });
    ep.record({ sessionId: "s1", eventType: "tool:check_credits", summary: "Checked balance" });

    const results = ep.search("web app");
    expect(results).toHaveLength(1);
    expect(results[0].summary).toBe("Deployed web app");
  });

  it("should mark an entry as accessed", () => {
    const id = ep.record({ sessionId: "s1", eventType: "test", summary: "Test event" });
    ep.markAccessed(id);

    const recent = ep.getRecent("s1");
    expect(recent[0].accessedCount).toBe(1);
    expect(recent[0].lastAccessedAt).toBeTruthy();
  });

  it("should return both entries when recording multiple", () => {
    ep.record({ sessionId: "s1", eventType: "first", summary: "First" });
    ep.record({ sessionId: "s1", eventType: "second", summary: "Second" });

    const recent = ep.getRecent("s1", 10);
    expect(recent).toHaveLength(2);
    // Both entries should be present (ordering depends on SQLite datetime resolution)
    const types = recent.map((e) => e.eventType).sort();
    expect(types).toEqual(["first", "second"]);
  });

  it("should summarize a session", () => {
    ep.record({ sessionId: "s1", eventType: "tool:exec", summary: "Built project", outcome: "success", importance: 0.9, classification: "productive" });
    ep.record({ sessionId: "s1", eventType: "tool:deploy", summary: "Deployed", outcome: "failure", importance: 0.8, classification: "productive" });

    const summary = ep.summarizeSession("s1");
    expect(summary).toContain("2 recorded event");
    expect(summary).toContain("1 successful outcome");
    expect(summary).toContain("1 failed outcome");
  });

  it("should limit results", () => {
    for (let i = 0; i < 5; i++) {
      ep.record({ sessionId: "s1", eventType: "test", summary: `Event ${i}` });
    }
    expect(ep.getRecent("s1", 3)).toHaveLength(3);
  });

  it("prune with zero or negative retentionDays does not delete entries", () => {
    ep.record({ sessionId: "s1", eventType: "test", summary: "Recent event" });

    expect(ep.prune(0)).toBe(0);
    expect(ep.prune(-30)).toBe(0);
    expect(ep.getRecent("s1")).toHaveLength(1);
  });
  
  it("should escape SQL LIKE wildcards in search queries", () => {
    ep.record({ sessionId: "s1", eventType: "test", summary: "100% complete" });
    ep.record({ sessionId: "s1", eventType: "test", summary: "file_name test" });
    ep.record({ sessionId: "s1", eventType: "test", summary: "unrelated entry" });

    // '%' in query should match literally, not as a wildcard
    const pctResults = ep.search("100%");
    expect(pctResults).toHaveLength(1);
    expect(pctResults[0].summary).toBe("100% complete");

    // '_' in query should match literally, not as single-char wildcard
    const underResults = ep.search("file_name");
    expect(underResults).toHaveLength(1);
    expect(underResults[0].summary).toBe("file_name test");
  });
});

// ─── Semantic Memory Tests ────────────────────────────────────

describe("SemanticMemoryManager", () => {
  let db: Database.Database;
  let sm: SemanticMemoryManager;

  beforeEach(() => {
    db = createTestDb();
    sm = new SemanticMemoryManager(db);
  });

  it("should store and retrieve a fact", () => {
    sm.store({ category: "financial", key: "balance", value: "$100", source: "s1" });

    const fact = sm.get("financial", "balance");
    expect(fact).toBeTruthy();
    expect(fact!.value).toBe("$100");
    expect(fact!.confidence).toBe(1.0);
  });

  it("should upsert on category+key", () => {
    sm.store({ category: "financial", key: "balance", value: "$100", source: "s1" });
    sm.store({ category: "financial", key: "balance", value: "$200", source: "s2" });

    const entries = sm.getByCategory("financial");
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("$200");
  });

  it("should return the correct id on upsert (not a stale new id)", () => {
    const id1 = sm.store({ category: "financial", key: "balance", value: "$100", source: "s1" });
    const id2 = sm.store({ category: "financial", key: "balance", value: "$200", source: "s2" });

    // On upsert, the DB keeps the original row's id, so both calls should return the same id
    expect(id2).toBe(id1);

    // The returned id should actually exist in the database
    const entry = sm.get("financial", "balance");
    expect(entry).toBeDefined();
    expect(entry!.id).toBe(id2);
  });

  it("should search by query across key and value", () => {
    sm.store({ category: "self", key: "name", value: "TestBot", source: "s1" });
    sm.store({ category: "environment", key: "region", value: "us-east", source: "s1" });

    const results = sm.search("TestBot");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("name");
  });

  it("should search within a category", () => {
    sm.store({ category: "self", key: "name", value: "Bot", source: "s1" });
    sm.store({ category: "environment", key: "name", value: "Server", source: "s1" });

    const results = sm.search("name", "self");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("self");
  });

  it("should delete a fact", () => {
    sm.store({ category: "self", key: "temp", value: "data", source: "s1" });
    const entry = sm.get("self", "temp");
    sm.delete(entry!.id);

    expect(sm.get("self", "temp")).toBeUndefined();
  });

  it("should prune by LRU when over limit", () => {
    for (let i = 0; i < 5; i++) {
      sm.store({ category: "domain", key: `key${i}`, value: `val${i}`, confidence: i / 10, source: "s1" });
    }

    const removed = sm.prune(3);
    expect(removed).toBe(2);
    expect(sm.getByCategory("domain")).toHaveLength(3);
  });

  it("should escape SQL LIKE wildcards in search queries", () => {
    sm.store({ category: "financial", key: "balance", value: "100% allocated", source: "s1" });
    sm.store({ category: "financial", key: "status", value: "50 allocated", source: "s1" });
    sm.store({ category: "environment", key: "file_name", value: "config", source: "s1" });
    sm.store({ category: "environment", key: "filename", value: "other", source: "s1" });

    // '%' in query should match literally, not as a wildcard
    const pctResults = sm.search("100%");
    expect(pctResults).toHaveLength(1);
    expect(pctResults[0].value).toBe("100% allocated");

    // '_' in query should match literally, not as single-char wildcard
    const underResults = sm.search("file_name");
    expect(underResults).toHaveLength(1);
    expect(underResults[0].key).toBe("file_name");

    // Category-scoped search should also escape wildcards
    const catResults = sm.search("100%", "financial");
    expect(catResults).toHaveLength(1);
    expect(catResults[0].value).toBe("100% allocated");
  });
});

// ─── Procedural Memory Tests ──────────────────────────────────

describe("ProceduralMemoryManager", () => {
  let db: Database.Database;
  let pm: ProceduralMemoryManager;

  beforeEach(() => {
    db = createTestDb();
    pm = new ProceduralMemoryManager(db);
  });

  it("should save and retrieve a procedure", () => {
    pm.save({
      name: "deploy_app",
      description: "Deploy a web application",
      steps: [
        { order: 1, description: "Build", tool: "exec", argsTemplate: null, expectedOutcome: null, onFailure: null },
        { order: 2, description: "Deploy", tool: "exec", argsTemplate: null, expectedOutcome: null, onFailure: null },
      ],
    });

    const proc = pm.get("deploy_app");
    expect(proc).toBeTruthy();
    expect(proc!.steps).toHaveLength(2);
    expect(proc!.steps[0].description).toBe("Build");
    expect(proc!.successCount).toBe(0);
  });

  it("should upsert on name", () => {
    pm.save({ name: "proc1", description: "Original", steps: [] });
    pm.save({ name: "proc1", description: "Updated", steps: [{ order: 1, description: "Step", tool: null, argsTemplate: null, expectedOutcome: null, onFailure: null }] });

    const proc = pm.get("proc1");
    expect(proc!.description).toBe("Updated");
    expect(proc!.steps).toHaveLength(1);
  });

  it("should record success and failure outcomes", () => {
    pm.save({ name: "test_proc", description: "Test", steps: [] });
    pm.recordOutcome("test_proc", true);
    pm.recordOutcome("test_proc", true);
    pm.recordOutcome("test_proc", false);

    const proc = pm.get("test_proc");
    expect(proc!.successCount).toBe(2);
    expect(proc!.failureCount).toBe(1);
  });

  it("should search by name or description", () => {
    pm.save({ name: "deploy_app", description: "Deploy a web application", steps: [] });
    pm.save({ name: "check_health", description: "Health check routine", steps: [] });

    const results = pm.search("deploy");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("deploy_app");
  });

  it("should delete a procedure", () => {
    pm.save({ name: "temp_proc", description: "Temp", steps: [] });
    pm.delete("temp_proc");
    expect(pm.get("temp_proc")).toBeUndefined();
  });

  it("should escape SQL LIKE wildcards in search queries", () => {
    pm.save({ name: "deploy_100%", description: "Full deploy", steps: [] });
    pm.save({ name: "deploy_app", description: "Standard deploy", steps: [] });

    // '%' should match literally — only "deploy_100%" matches, not both
    const pctResults = pm.search("100%");
    expect(pctResults).toHaveLength(1);
    expect(pctResults[0].name).toBe("deploy_100%");

    // '_' should match literally — "deploy_app" should not match "deploy.app"
    pm.save({ name: "deploy.app", description: "Dot deploy", steps: [] });
    const underResults = pm.search("deploy_app");
    expect(underResults).toHaveLength(1);
    expect(underResults[0].name).toBe("deploy_app");
  });
});

// ─── Relationship Memory Tests ────────────────────────────────

describe("RelationshipMemoryManager", () => {
  let db: Database.Database;
  let rm: RelationshipMemoryManager;

  beforeEach(() => {
    db = createTestDb();
    rm = new RelationshipMemoryManager(db);
  });

  it("should record and retrieve a relationship", () => {
    rm.record({
      entityAddress: "0x1234",
      entityName: "Alice",
      relationshipType: "peer",
      trustScore: 0.7,
      notes: "Friendly agent",
    });

    const rel = rm.get("0x1234");
    expect(rel).toBeTruthy();
    expect(rel!.entityName).toBe("Alice");
    expect(rel!.trustScore).toBe(0.7);
    expect(rel!.interactionCount).toBe(0);
  });

  it("should upsert on entityAddress", () => {
    rm.record({ entityAddress: "0x1234", relationshipType: "unknown", trustScore: 0.5 });
    rm.record({ entityAddress: "0x1234", entityName: "Updated", relationshipType: "peer", trustScore: 0.8 });

    const rel = rm.get("0x1234");
    expect(rel!.entityName).toBe("Updated");
    expect(rel!.trustScore).toBe(0.8);
  });

  it("should record interactions", () => {
    rm.record({ entityAddress: "0x1234", relationshipType: "peer" });
    rm.recordInteraction("0x1234");
    rm.recordInteraction("0x1234");

    const rel = rm.get("0x1234");
    expect(rel!.interactionCount).toBe(2);
    expect(rel!.lastInteractionAt).toBeTruthy();
  });

  it("should update trust score with clamping", () => {
    rm.record({ entityAddress: "0x1234", relationshipType: "peer", trustScore: 0.5 });

    rm.updateTrust("0x1234", 0.3);
    expect(rm.get("0x1234")!.trustScore).toBeCloseTo(0.8);

    // Should clamp to 1.0
    rm.updateTrust("0x1234", 0.5);
    expect(rm.get("0x1234")!.trustScore).toBe(1.0);

    // Should clamp to 0.0
    rm.updateTrust("0x1234", -2.0);
    expect(rm.get("0x1234")!.trustScore).toBe(0.0);
  });

  it("should filter by minimum trust", () => {
    rm.record({ entityAddress: "0x001", relationshipType: "peer", trustScore: 0.3 });
    rm.record({ entityAddress: "0x002", relationshipType: "peer", trustScore: 0.7 });
    rm.record({ entityAddress: "0x003", relationshipType: "peer", trustScore: 0.9 });

    const trusted = rm.getTrusted(0.5);
    expect(trusted).toHaveLength(2);
    expect(trusted[0].trustScore).toBe(0.9);
    expect(trusted[1].trustScore).toBe(0.7);
  });

  it("should delete a relationship", () => {
    rm.record({ entityAddress: "0xDEAD", relationshipType: "unknown" });
    rm.delete("0xDEAD");
    expect(rm.get("0xDEAD")).toBeUndefined();
  });
});

// ─── Memory Budget Tests ──────────────────────────────────────

describe("MemoryBudgetManager", () => {
  it("should trim memories to fit budget", () => {
    const budget = new MemoryBudgetManager({
      workingMemoryTokens: 10,
      episodicMemoryTokens: 10,
      semanticMemoryTokens: 10,
      proceduralMemoryTokens: 10,
      relationshipMemoryTokens: 10,
    });

    // Place the small entry first so it passes budget, then the large entry gets trimmed
    const largeContent = "x".repeat(200); // ~50 tokens
    const raw: MemoryRetrievalResult = {
      workingMemory: [
        { id: "1", sessionId: "s1", content: "short", contentType: "note", priority: 0.5, tokenCount: 2, expiresAt: null, sourceTurn: null, createdAt: "" },
        { id: "2", sessionId: "s1", content: largeContent, contentType: "goal", priority: 0.9, tokenCount: 50, expiresAt: null, sourceTurn: null, createdAt: "" },
      ],
      episodicMemory: [],
      semanticMemory: [],
      proceduralMemory: [],
      relationships: [],
      totalTokens: 0,
    };

    const result = budget.allocate(raw);
    // Only the short entry fits within the 10-token budget
    expect(result.workingMemory).toHaveLength(1);
    expect(result.workingMemory[0].id).toBe("1");
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("should calculate total budget", () => {
    const budget = new MemoryBudgetManager(DEFAULT_MEMORY_BUDGET);
    expect(budget.getTotalBudget()).toBe(10000); // 1500+3000+3000+1500+1000
  });

  it("should estimate tokens from text", () => {
    const budget = new MemoryBudgetManager(DEFAULT_MEMORY_BUDGET);
    // ~4 chars per token
    expect(budget.estimateTokens("Hello world")).toBeGreaterThan(0);
    expect(budget.estimateTokens("")).toBe(0);
  });
});

// ─── Memory Retriever Tests ───────────────────────────────────

describe("MemoryRetriever", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("should retrieve memories across all tiers", () => {
    const wm = new WorkingMemoryManager(db);
    const ep = new EpisodicMemoryManager(db);
    const sm = new SemanticMemoryManager(db);

    wm.add({ sessionId: "s1", content: "Goal: deploy app", contentType: "goal", priority: 0.9 });
    ep.record({ sessionId: "s1", eventType: "tool:exec", summary: "Ran build", outcome: "success" });
    sm.store({ category: "self", key: "name", value: "TestBot", source: "s1" });

    const retriever = new MemoryRetriever(db);
    const result = retriever.retrieve("s1");

    expect(result.workingMemory.length).toBeGreaterThan(0);
    expect(result.episodicMemory.length).toBeGreaterThan(0);
    expect(result.semanticMemory.length).toBeGreaterThan(0);
    expect(result.totalTokens).toBeGreaterThan(0);
  });

  it("should return empty result on error", () => {
    const badDb = new Database(":memory:");
    // No tables created — will throw when querying
    const retriever = new MemoryRetriever(badDb);
    const result = retriever.retrieve("s1");

    expect(result.workingMemory).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
  });

  it("should use input for semantic/procedural search", () => {
    const sm = new SemanticMemoryManager(db);
    sm.store({ category: "domain", key: "deploy_target", value: "production", source: "s1" });
    sm.store({ category: "domain", key: "test_env", value: "staging", source: "s1" });

    const retriever = new MemoryRetriever(db);
    const result = retriever.retrieve("s1", "deploy");

    // Should find the deploy_target entry via search
    const found = result.semanticMemory.find((e) => e.key === "deploy_target");
    expect(found).toBeTruthy();
  });
});

// ─── Memory Ingestion Pipeline Tests ──────────────────────────

describe("MemoryIngestionPipeline", () => {
  let db: Database.Database;
  let pipeline: MemoryIngestionPipeline;

  beforeEach(() => {
    db = createTestDb();
    pipeline = new MemoryIngestionPipeline(db);
  });

  it("should ingest a turn without throwing", () => {
    const turn = makeTurn({ toolCalls: [makeToolCallResult({ name: "exec", result: "ok" })] });
    expect(() => pipeline.ingest("s1", turn, turn.toolCalls)).not.toThrow();
  });

  it("should record episodic memory from a turn", () => {
    const turn = makeTurn({ toolCalls: [makeToolCallResult({ name: "exec", result: "built project" })] });
    pipeline.ingest("s1", turn, turn.toolCalls);

    const ep = new EpisodicMemoryManager(db);
    const recent = ep.getRecent("s1");
    expect(recent.length).toBeGreaterThan(0);
    expect(recent[0].eventType).toContain("tool:");
  });

  it("should extract semantic facts from check_credits", () => {
    const turn = makeTurn({
      toolCalls: [makeToolCallResult({ name: "check_credits", result: "Balance: $5.00 (500 cents)" })],
    });
    pipeline.ingest("s1", turn, turn.toolCalls);

    const sm = new SemanticMemoryManager(db);
    const balance = sm.get("financial", "last_known_balance");
    expect(balance).toBeTruthy();
    expect(balance!.value).toContain("$5.00");
  });

  it("should update relationship memory from send_message", () => {
    const turn = makeTurn({
      toolCalls: [
        makeToolCallResult({
          name: "send_message",
          arguments: { to_address: "0xABCD" },
          result: "Message sent",
        }),
      ],
    });
    pipeline.ingest("s1", turn, turn.toolCalls);

    const rm = new RelationshipMemoryManager(db);
    const rel = rm.get("0xABCD");
    expect(rel).toBeTruthy();
    expect(rel!.relationshipType).toBe("contacted");
  });

  it("should not throw on errors in pipeline stages", () => {
    // Create a turn that might cause issues
    const turn = makeTurn({
      toolCalls: [makeToolCallResult({ name: "unknown_tool", error: "Tool not found" })],
    });
    // Should not throw
    expect(() => pipeline.ingest("s1", turn, turn.toolCalls)).not.toThrow();
  });

  it("should track strategic decisions in working memory", () => {
    const turn = makeTurn({
      toolCalls: [makeToolCallResult({ name: "edit_own_file", result: "File edited: src/main.ts" })],
    });
    pipeline.ingest("s1", turn, turn.toolCalls);

    const wm = new WorkingMemoryManager(db);
    const entries = wm.getBySession("s1");
    const decision = entries.find((e) => e.contentType === "decision");
    expect(decision).toBeTruthy();
    expect(decision!.content).toContain("edit_own_file");
  });

  it("should record inbox sender interaction only once per turn, not per tool call", () => {
    // Simulate a turn from an agent message with multiple tool calls
    const turn = makeTurn({
      inputSource: "agent" as any,
      input: "[Message from 0xDEADBEEF]: Hello there",
      toolCalls: [
        makeToolCallResult({ id: "tc_1", name: "exec", result: "ok" }),
        makeToolCallResult({ id: "tc_2", name: "exec", result: "ok" }),
        makeToolCallResult({ id: "tc_3", name: "exec", result: "ok" }),
      ],
    });
    pipeline.ingest("s1", turn, turn.toolCalls);

    const rm = new RelationshipMemoryManager(db);
    const rel = rm.get("0xDEADBEEF");
    expect(rel).toBeTruthy();
    // Should have interaction_count of 0 (new record) — NOT inflated by N tool calls
    expect(rel!.interactionCount).toBe(0);
  });
});

// ─── Turn Classification Tests ────────────────────────────────

describe("classifyTurn", () => {
  it("should classify error turns", () => {
    const result = classifyTurn(
      [makeToolCallResult({ error: "Something failed" })],
      "",
    );
    expect(result).toBe("error");
  });

  it("should classify strategic turns", () => {
    const result = classifyTurn(
      [makeToolCallResult({ name: "edit_own_file" })],
      "",
    );
    expect(result).toBe("strategic");
  });

  it("should classify communication turns", () => {
    const result = classifyTurn(
      [makeToolCallResult({ name: "send_message" })],
      "",
    );
    expect(result).toBe("communication");
  });

  it("should classify productive turns", () => {
    const result = classifyTurn(
      [makeToolCallResult({ name: "exec" })],
      "",
    );
    expect(result).toBe("productive");
  });

  it("should classify maintenance turns", () => {
    const result = classifyTurn(
      [makeToolCallResult({ name: "check_credits" })],
      "",
    );
    expect(result).toBe("maintenance");
  });

  it("should classify idle turns", () => {
    const result = classifyTurn([], "ok");
    expect(result).toBe("idle");
  });

  it("should classify error from thinking keywords", () => {
    const result = classifyTurn([], "The operation failed with an error.");
    expect(result).toBe("error");
  });
});

// ─── Memory Tools Tests ───────────────────────────────────────

describe("Memory Tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("rememberFact / recallFacts", () => {
    it("should store and recall a fact", () => {
      const storeResult = rememberFact(db, {
        category: "self",
        key: "version",
        value: "1.0.0",
      });
      expect(storeResult).toContain("Fact stored");

      const recallResult = recallFacts(db, { category: "self" });
      expect(recallResult).toContain("version");
      expect(recallResult).toContain("1.0.0");
    });

    it("should search facts by query", () => {
      rememberFact(db, { category: "environment", key: "server", value: "us-east-1" });
      rememberFact(db, { category: "financial", key: "balance", value: "$50" });

      const result = recallFacts(db, { query: "east" });
      expect(result).toContain("us-east-1");
      expect(result).not.toContain("$50");
    });

    it("should prompt for category or query", () => {
      const result = recallFacts(db, {});
      expect(result).toContain("provide a category or query");
    });
  });

  describe("setGoal / completeGoal", () => {
    it("should set and complete a goal", () => {
      const setResult = setGoal(db, { sessionId: "s1", content: "Deploy the app" });
      expect(setResult).toContain("Goal set");

      // Extract goal ID from review
      const review = reviewMemory(db, { sessionId: "s1" });
      const idMatch = review.match(/\[id: ([^\]]+)\]/);
      expect(idMatch).toBeTruthy();

      const completeResult = completeGoal(db, {
        goalId: idMatch![1],
        sessionId: "s1",
        outcome: "Successfully deployed",
      });
      expect(completeResult).toContain("Goal completed");

      // Goal should be removed from working memory
      const reviewAfter = reviewMemory(db, { sessionId: "s1" });
      expect(reviewAfter).toContain("(empty)");
    });

    it("should return error for non-existent goal", () => {
      const result = completeGoal(db, { goalId: "nonexistent", sessionId: "s1" });
      expect(result).toContain("not found");
    });
  });

  describe("saveProcedure / recallProcedure", () => {
    it("should save and recall a procedure", () => {
      const saveResult = saveProcedure(db, {
        name: "build_project",
        description: "Build the TypeScript project",
        steps: JSON.stringify([
          { order: 1, description: "npm install", tool: "exec", argsTemplate: null, expectedOutcome: null, onFailure: null },
          { order: 2, description: "npm run build", tool: "exec", argsTemplate: null, expectedOutcome: null, onFailure: null },
        ]),
      });
      expect(saveResult).toContain("Procedure saved");
      expect(saveResult).toContain("2 step(s)");

      const recallResult = recallProcedure(db, { name: "build_project" });
      expect(recallResult).toContain("build_project");
      expect(recallResult).toContain("npm install");
    });

    it("should search procedures by query", () => {
      saveProcedure(db, { name: "deploy", description: "Deploy app", steps: "[]" });
      saveProcedure(db, { name: "test", description: "Run tests", steps: "[]" });

      const result = recallProcedure(db, { query: "deploy" });
      expect(result).toContain("deploy");
      expect(result).not.toContain("test");
    });
  });

  describe("noteAboutAgent", () => {
    it("should record a relationship note", () => {
      const result = noteAboutAgent(db, {
        entityAddress: "0xABC",
        entityName: "Helper Bot",
        relationshipType: "service",
        notes: "Provides build services",
        trustScore: 0.8,
      });
      expect(result).toContain("Relationship noted");
      expect(result).toContain("0xABC");
    });
  });

  describe("reviewMemory", () => {
    it("should show empty state", () => {
      const result = reviewMemory(db, { sessionId: "s1" });
      expect(result).toContain("Working Memory");
      expect(result).toContain("(empty)");
    });

    it("should show working memory entries", () => {
      setGoal(db, { sessionId: "s1", content: "Test goal" });
      const result = reviewMemory(db, { sessionId: "s1" });
      expect(result).toContain("Test goal");
      expect(result).toContain("[goal]");
    });
  });

  describe("forget", () => {
    it("should remove a working memory entry", () => {
      const wm = new WorkingMemoryManager(db);
      const id = wm.add({ sessionId: "s1", content: "Remove me", contentType: "note" });

      const result = forget(db, { id, memoryType: "working" });
      expect(result).toContain("forgotten");
      expect(wm.getBySession("s1")).toHaveLength(0);
    });

    it("should protect creator semantic entries", () => {
      const sm = new SemanticMemoryManager(db);
      sm.store({ category: "creator", key: "creator_address", value: "0xCreator", source: "genesis" });

      const entry = sm.get("creator", "creator_address");
      const result = forget(db, { id: entry!.id, memoryType: "semantic" });
      expect(result).toContain("Cannot forget creator-level");
    });

    it("should return error for unknown memory type", () => {
      const result = forget(db, { id: "123", memoryType: "invalid" });
      expect(result).toContain("Unknown memory type");
    });

    it("should return error for non-existent entry", () => {
      const result = forget(db, { id: "nonexistent", memoryType: "working" });
      expect(result).toContain("not found");
    });
  });
});

// ─── Context Formatting Tests ─────────────────────────────────

describe("formatMemoryBlock", () => {
  it("should format an empty result as empty string", () => {
    const result: MemoryRetrievalResult = {
      workingMemory: [],
      episodicMemory: [],
      semanticMemory: [],
      proceduralMemory: [],
      relationships: [],
      totalTokens: 0,
    };
    expect(formatMemoryBlock(result)).toBe("");
  });

  it("should format working memory entries", () => {
    const result: MemoryRetrievalResult = {
      workingMemory: [
        { id: "1", sessionId: "s1", content: "Deploy app", contentType: "goal", priority: 0.9, tokenCount: 5, expiresAt: null, sourceTurn: null, createdAt: "" },
      ],
      episodicMemory: [],
      semanticMemory: [],
      proceduralMemory: [],
      relationships: [],
      totalTokens: 5,
    };

    const block = formatMemoryBlock(result);
    expect(block).toContain("Working Memory");
    expect(block).toContain("[goal]");
    expect(block).toContain("Deploy app");
    expect(block).toContain("p=0.9");
  });

  it("should format all memory tiers", () => {
    const result: MemoryRetrievalResult = {
      workingMemory: [
        { id: "1", sessionId: "s1", content: "Goal", contentType: "goal", priority: 0.9, tokenCount: 3, expiresAt: null, sourceTurn: null, createdAt: "" },
      ],
      episodicMemory: [
        { id: "2", sessionId: "s1", eventType: "tool:exec", summary: "Ran build", detail: null, outcome: "success", importance: 0.7, embeddingKey: null, tokenCount: 5, accessedCount: 0, lastAccessedAt: null, classification: "productive", createdAt: "" },
      ],
      semanticMemory: [
        { id: "3", category: "self", key: "name", value: "Bot", confidence: 1.0, source: "s1", embeddingKey: null, lastVerifiedAt: null, createdAt: "", updatedAt: "" },
      ],
      proceduralMemory: [
        { id: "4", name: "deploy", description: "Deploy app", steps: [{ order: 1, description: "Build", tool: "exec", argsTemplate: null, expectedOutcome: null, onFailure: null }], successCount: 3, failureCount: 1, lastUsedAt: null, createdAt: "", updatedAt: "" },
      ],
      relationships: [
        { id: "5", entityAddress: "0x1234", entityName: "Alice", relationshipType: "peer", trustScore: 0.8, interactionCount: 5, lastInteractionAt: null, notes: null, createdAt: "", updatedAt: "" },
      ],
      totalTokens: 50,
    };

    const block = formatMemoryBlock(result);
    expect(block).toContain("Working Memory");
    expect(block).toContain("Recent History");
    expect(block).toContain("Known Facts");
    expect(block).toContain("Known Procedures");
    expect(block).toContain("Known Entities");
    expect(block).toContain("50 tokens");
  });
});
