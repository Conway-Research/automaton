import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIGRATION_V5, MIGRATION_V10 } from "../../state/schema.js";
import { KnowledgeStore, type KnowledgeCategory } from "../../memory/knowledge-store.js";
import type { ContextUtilization } from "../../memory/context-manager.js";

let db: BetterSqlite3.Database;
let store: KnowledgeStore;
let mod: typeof import("../../memory/enhanced-retriever.js");

function createTestDb(): BetterSqlite3.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(MIGRATION_V5);
  testDb.exec(MIGRATION_V10);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      thinking TEXT NOT NULL
    )
  `);
  return testDb;
}

function utilization(percent: number): ContextUtilization {
  return {
    totalTokens: 128000,
    usedTokens: 8000,
    utilizationPercent: percent,
    turnsInContext: 10,
    compressedTurns: 2,
    compressionRatio: 0.8,
    headroomTokens: 1000,
    recommendation: "ok",
  };
}

function addKnowledge(params?: {
  category?: KnowledgeCategory;
  key?: string;
  content?: string;
  confidence?: number;
  accessCount?: number;
  lastVerified?: string;
  tokenCount?: number;
}): string {
  const id = store.add({
    category: params?.category ?? "technical",
    key: params?.key ?? "default-key",
    content: params?.content ?? "default content",
    source: "agent-a",
    confidence: params?.confidence ?? 0.9,
    lastVerified: params?.lastVerified ?? new Date().toISOString(),
    tokenCount: params?.tokenCount ?? 50,
    expiresAt: null,
  });

  if (typeof params?.accessCount === "number") {
    db.prepare("UPDATE knowledge_store SET access_count = ? WHERE id = ?").run(params.accessCount, id);
  }

  return id;
}

beforeEach(async () => {
  vi.resetModules();
  mod = await import("../../memory/enhanced-retriever.js");

  db = createTestDb();
  store = new KnowledgeStore(db);
});

afterEach(() => {
  db.close();
});

describe("calculateMemoryBudget", () => {
  it("calculateMemoryBudget returns 10% base", () => {
    const result = mod.calculateMemoryBudget(utilization(60), 100_000);
    expect(result).toBe(10_000);
  });

  it("Budget reduces to 5% above 70% utilization", () => {
    const result = mod.calculateMemoryBudget(utilization(75), 100_000);
    expect(result).toBe(5_000);
  });

  it("budget increases to 15% below 50% utilization", () => {
    const result = mod.calculateMemoryBudget(utilization(40), 100_000);
    expect(result).toBe(15_000);
  });

  it("budget clamps to minimum 2000 tokens", () => {
    const result = mod.calculateMemoryBudget(utilization(75), 10_000);
    expect(result).toBe(2_000);
  });

  it("budget clamps to maximum 20000 tokens", () => {
    const result = mod.calculateMemoryBudget(utilization(40), 500_000);
    expect(result).toBe(20_000);
  });
});

describe("enhanceQuery", () => {
  it("enhanceQuery extracts terms from input", () => {
    const query = mod.enhanceQuery({
      currentInput: "Fix API timeout in deployment pipeline",
    });

    expect(query.terms).toContain("fix");
    expect(query.terms).toContain("api");
    expect(query.terms).toContain("timeout");
  });

  it("enhanceQuery keeps quoted phrases", () => {
    const query = mod.enhanceQuery({
      currentInput: "Investigate \"incident response\" process",
    });

    expect(query.terms).toContain("incident response");
  });

  it("enhanceQuery expands abbreviations", () => {
    const query = mod.enhanceQuery({
      currentInput: "Need API docs for CI",
    });

    expect(query.terms).toContain("application programming interface");
    expect(query.terms).toContain("continuous integration");
  });

  it("enhanceQuery infers categories from role and text", () => {
    const query = mod.enhanceQuery({
      currentInput: "infra deploy workflow",
      agentRole: "senior engineer",
    });

    expect(query.categories).toContain("technical");
    expect(query.categories).toContain("operational");
  });

  it("enhanceQuery infers time range from recency words", () => {
    const query = mod.enhanceQuery({
      currentInput: "latest revenue trend",
    });

    expect(query.timeRange).toBeDefined();
    expect(typeof query.timeRange?.since).toBe("string");
  });
});

describe("EnhancedRetriever", () => {
  it("retrieveScored returns empty result when no candidates", () => {
    const retriever = new mod.EnhancedRetriever(db);

    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "anything",
      budgetTokens: 1000,
    });

    expect(result.entries).toEqual([]);
    expect(result.totalTokens).toBe(0);
  });

  it("searches by query and category", () => {
    addKnowledge({ category: "technical", key: "api-timeout", content: "retry strategy", tokenCount: 20 });
    addKnowledge({ category: "financial", key: "api-budget", content: "monthly spend", tokenCount: 20 });

    const retriever = new mod.EnhancedRetriever(db);
    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "api timeout",
      agentRole: "software engineer",
      budgetTokens: 200,
    });

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries[0].entry.category).toBe("technical");
  });

  it("respects budget and reports truncation", () => {
    addKnowledge({ key: "k1", content: "high relevance api timeout", tokenCount: 60 });
    addKnowledge({ key: "k2", content: "high relevance api timeout", tokenCount: 60 });

    const retriever = new mod.EnhancedRetriever(db);
    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "api timeout",
      budgetTokens: 60,
    });

    expect(result.entries).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("Scoring weights are applied correctly", () => {
    const id = addKnowledge({
      key: "deploy-api",
      content: "api deploy workflow",
      confidence: 0.8,
      accessCount: 10,
      lastVerified: new Date().toISOString(),
      tokenCount: 20,
    });

    const retriever = new mod.EnhancedRetriever(db);
    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "deploy api",
      currentTaskId: "deploy-task",
      currentGoalId: "deploy-goal",
      agentRole: "engineer",
      budgetTokens: 200,
    });

    const scored = result.entries.find((entry) => entry.entry.id === id);
    expect(scored).toBeDefined();

    const factors = scored!.scoringFactors;
    const expected = Math.max(
      0,
      Math.min(
        1,
        (factors.recency * 0.3)
          + (factors.frequency * 0.2)
          + (factors.confidence * 0.2)
          + (factors.taskAffinity * 0.2)
          + (factors.categoryMatch * 0.1),
      ),
    );

    expect(scored!.relevanceScore).toBeCloseTo(expected, 6);
  });

  it("sorts entries by descending relevance", () => {
    const freshHigh = addKnowledge({
      key: "deploy-api",
      content: "api deploy",
      confidence: 0.95,
      accessCount: 20,
      lastVerified: new Date().toISOString(),
      tokenCount: 20,
    });

    const lowerRanked = addKnowledge({
      key: "deploy-note",
      content: "api deploy notes",
      confidence: 0.4,
      accessCount: 1,
      lastVerified: "2025-01-01T00:00:00.000Z",
      tokenCount: 20,
    });

    const retriever = new mod.EnhancedRetriever(db);
    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "api deploy",
      currentTaskId: "deploy-task",
      budgetTokens: 200,
    });

    expect(result.entries.map((entry) => entry.entry.id)).toContain(freshHigh);
    expect(result.entries.map((entry) => entry.entry.id)).toContain(lowerRanked);
    expect(result.entries[0].entry.id).toBe(freshHigh);
  });

  it("filters entries by inferred time range", () => {
    addKnowledge({
      category: "market",
      key: "new-entry",
      content: "latest market changes",
      lastVerified: new Date().toISOString(),
    });
    addKnowledge({
      category: "market",
      key: "old-entry",
      content: "latest market changes",
      lastVerified: "2020-01-01T00:00:00.000Z",
    });

    const retriever = new mod.EnhancedRetriever(db);
    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "latest market",
      budgetTokens: 200,
    });

    expect(result.entries.some((entry) => entry.entry.key === "new-entry")).toBe(true);
    expect(result.entries.some((entry) => entry.entry.key === "old-entry")).toBe(false);
  });

  it("recordRetrievalFeedback tracks precision", () => {
    const retriever = new mod.EnhancedRetriever(db);
    retriever.recordRetrievalFeedback({
      turnId: "turn-1",
      retrieved: ["a", "b"],
      matched: ["a"],
      retrievalPrecision: 0,
      rollingPrecision: 0,
    });

    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "none",
      budgetTokens: 0,
    });

    expect(result.retrievalPrecision).toBeCloseTo(0.5, 6);
  });

  it("recordRetrievalFeedback rolling precision updates across turns", () => {
    const retriever = new mod.EnhancedRetriever(db);

    retriever.recordRetrievalFeedback({
      turnId: "turn-1",
      retrieved: ["a", "b"],
      matched: ["a"],
      retrievalPrecision: 0,
      rollingPrecision: 0,
    });
    retriever.recordRetrievalFeedback({
      turnId: "turn-2",
      retrieved: ["x"],
      matched: [],
      retrievalPrecision: 0,
      rollingPrecision: 0,
    });

    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "none",
      budgetTokens: 0,
    });

    expect(result.retrievalPrecision).toBeCloseTo(0.25, 6);
  });

  it("feedback auto-matches retrieved knowledge from turn response", () => {
    const knowledgeId = addKnowledge({
      key: "incident-runbook",
      content: "restart service and clear cache",
      tokenCount: 20,
    });

    db.prepare("INSERT INTO turns (id, thinking) VALUES (?, ?)").run(
      "turn-42",
      "Used incident-runbook during troubleshooting.",
    );

    const retriever = new mod.EnhancedRetriever(db);
    retriever.recordRetrievalFeedback({
      turnId: "turn-42",
      retrieved: [knowledgeId],
      matched: [],
      retrievalPrecision: 0,
      rollingPrecision: 0,
    });

    const row = db
      .prepare("SELECT access_count AS accessCount FROM knowledge_store WHERE id = ?")
      .get(knowledgeId) as { accessCount: number };

    expect(row.accessCount).toBe(1);
  });

  it("retrieveScored includes precision metadata once feedback exists", () => {
    addKnowledge({ key: "api-reliability", content: "api reliability practices", tokenCount: 20 });

    const retriever = new mod.EnhancedRetriever(db);
    retriever.recordRetrievalFeedback({
      turnId: "turn-99",
      retrieved: ["a"],
      matched: ["a"],
      retrievalPrecision: 0,
      rollingPrecision: 0,
    });

    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "api reliability",
      budgetTokens: 200,
    });

    expect(result.retrievalPrecision).toBeDefined();
    expect(result.retrievalPrecision).toBeGreaterThan(0);
  });

  it("taskStore context influences query and retrieval", () => {
    addKnowledge({ category: "operational", key: "deploy-checklist", content: "deployment workflow", tokenCount: 20 });

    const taskStore = {
      getTaskSpec: () => "deployment workflow",
      getRecentGoals: () => ["deployment"],
    };

    const retriever = new mod.EnhancedRetriever(db, undefined, taskStore);
    const result = retriever.retrieveScored({
      sessionId: "s1",
      currentInput: "workflow",
      currentTaskId: "task-1",
      currentGoalId: "goal-1",
      budgetTokens: 200,
    });

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries[0].entry.key).toBe("deploy-checklist");
  });
});
