import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATION_V10 } from "../../state/schema.js";
import {
  KnowledgeStore,
  type KnowledgeCategory,
} from "../../memory/knowledge-store.js";

let db: BetterSqlite3.Database;
let store: KnowledgeStore;

function createTestDb(): BetterSqlite3.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");
  testDb.exec(MIGRATION_V10);
  return testDb;
}

function addKnowledge(params?: {
  category?: KnowledgeCategory;
  key?: string;
  content?: string;
  source?: string;
  confidence?: number;
  lastVerified?: string;
  tokenCount?: number;
  expiresAt?: string | null;
}): string {
  return store.add({
    category: params?.category ?? "technical",
    key: params?.key ?? "default-key",
    content: params?.content ?? "default content",
    source: params?.source ?? "agent-a",
    confidence: params?.confidence ?? 0.8,
    lastVerified: params?.lastVerified ?? new Date().toISOString(),
    tokenCount: params?.tokenCount ?? 25,
    expiresAt: params?.expiresAt ?? null,
  });
}

beforeEach(() => {
  db = createTestDb();
  store = new KnowledgeStore(db);
});

afterEach(() => {
  db.close();
});

describe("KnowledgeStore", () => {
  it("add creates entry with ULID", () => {
    const id = addKnowledge();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("add persists all entry fields", () => {
    const id = addKnowledge({
      category: "market",
      key: "pricing-signal",
      content: "competitor reduced price",
      source: "agent-market",
      confidence: 0.9,
      tokenCount: 99,
      expiresAt: "2026-12-01T00:00:00.000Z",
    });

    const entry = store.get(id);
    expect(entry).not.toBeNull();
    expect(entry?.category).toBe("market");
    expect(entry?.key).toBe("pricing-signal");
    expect(entry?.source).toBe("agent-market");
    expect(entry?.tokenCount).toBe(99);
    expect(entry?.expiresAt).toBe("2026-12-01T00:00:00.000Z");
  });

  it("get returns null for unknown id", () => {
    expect(store.get("01HZZZZZZZZZZZZZZZZZZZZZZZ")).toBeNull();
  });

  it("get increments access count", () => {
    const id = addKnowledge();

    const first = store.get(id);
    const second = store.get(id);

    expect(first?.accessCount).toBe(1);
    expect(second?.accessCount).toBe(2);
  });

  it("get returns null for expired entries", () => {
    const id = addKnowledge({
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    expect(store.get(id)).toBeNull();
  });

  it("search finds entries by key query", () => {
    addKnowledge({ key: "deploy-runbook", content: "infra procedures" });
    addKnowledge({ key: "budget-sheet", content: "finance" });

    const results = store.search("deploy");
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe("deploy-runbook");
  });

  it("search finds entries by content query", () => {
    addKnowledge({ key: "k1", content: "incident postmortem with root cause" });

    const results = store.search("root cause");
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("root cause");
  });

  it("search supports category filter", () => {
    addKnowledge({ category: "technical", key: "api-timeout", content: "retry config" });
    addKnowledge({ category: "financial", key: "api-budget", content: "monthly spend" });

    const results = store.search("api", "technical");
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("technical");
  });

  it("search excludes expired rows", () => {
    addKnowledge({ key: "still-valid", content: "active", expiresAt: null });
    addKnowledge({ key: "expired", content: "active", expiresAt: "2020-01-01T00:00:00.000Z" });

    const results = store.search("active");
    expect(results.map((entry) => entry.key)).toEqual(["still-valid"]);
  });

  it("search respects limit", () => {
    addKnowledge({ key: "term-1", content: "needle" });
    addKnowledge({ key: "term-2", content: "needle" });
    addKnowledge({ key: "term-3", content: "needle" });

    const results = store.search("needle", undefined, 2);
    expect(results).toHaveLength(2);
  });

  it("update changes mutable fields", () => {
    const id = addKnowledge({ key: "before", confidence: 0.5 });

    store.update(id, {
      key: "after",
      confidence: 0.95,
      tokenCount: 123,
    });

    const entry = store.get(id);
    expect(entry?.key).toBe("after");
    expect(entry?.confidence).toBe(0.95);
    expect(entry?.tokenCount).toBe(123);
  });

  it("remove deletes an entry", () => {
    const id = addKnowledge();
    store.remove(id);

    expect(store.get(id)).toBeNull();
  });

  it("getByCategory returns only selected category", () => {
    addKnowledge({ category: "technical", key: "k-tech" });
    addKnowledge({ category: "market", key: "k-market" });

    const technical = store.getByCategory("technical");
    expect(technical).toHaveLength(1);
    expect(technical[0].key).toBe("k-tech");
  });

  it("getByCategory sorts by confidence desc then lastVerified desc", () => {
    const old = addKnowledge({ category: "technical", key: "old-high", confidence: 0.9, lastVerified: "2026-01-01T00:00:00.000Z" });
    const newer = addKnowledge({ category: "technical", key: "new-high", confidence: 0.9, lastVerified: "2026-01-02T00:00:00.000Z" });
    const low = addKnowledge({ category: "technical", key: "low", confidence: 0.2, lastVerified: "2026-01-03T00:00:00.000Z" });

    expect(old).toBeTruthy();
    expect(newer).toBeTruthy();
    expect(low).toBeTruthy();

    const items = store.getByCategory("technical");
    expect(items.map((item) => item.key)).toEqual(["new-high", "old-high", "low"]);
  });

  it("prune removes expired entries", () => {
    addKnowledge({ key: "expired-1", expiresAt: "2020-01-01T00:00:00.000Z" });
    addKnowledge({ key: "active-1", expiresAt: null });

    const removed = store.prune();
    expect(removed).toBe(1);

    const keys = store.search("", undefined, 10).map((entry) => entry.key);
    expect(keys).toContain("active-1");
    expect(keys).not.toContain("expired-1");
  });

  it("prune removes low-confidence stale entries", () => {
    addKnowledge({
      key: "stale-low",
      confidence: 0.2,
      lastVerified: "2020-01-01T00:00:00.000Z",
      expiresAt: null,
    });
    addKnowledge({
      key: "fresh-low",
      confidence: 0.2,
      lastVerified: new Date().toISOString(),
      expiresAt: null,
    });

    const removed = store.prune();
    expect(removed).toBe(1);

    const keys = store.search("", undefined, 20).map((entry) => entry.key);
    expect(keys).toContain("fresh-low");
    expect(keys).not.toContain("stale-low");
  });

  it("prune keeps high-confidence stale entries", () => {
    addKnowledge({
      key: "stale-high",
      confidence: 0.95,
      lastVerified: "2020-01-01T00:00:00.000Z",
      expiresAt: null,
    });

    expect(store.prune()).toBe(0);
    expect(store.search("stale-high")).toHaveLength(1);
  });

  it("getStats returns correct aggregates", () => {
    addKnowledge({ category: "technical", tokenCount: 20, key: "t1" });
    addKnowledge({ category: "technical", tokenCount: 30, key: "t2" });
    addKnowledge({ category: "financial", tokenCount: 50, key: "f1" });

    const stats = store.getStats();

    expect(stats.total).toBe(3);
    expect(stats.totalTokens).toBe(100);
    expect(stats.byCategory.technical).toBe(2);
    expect(stats.byCategory.financial).toBe(1);
    expect(stats.byCategory.market).toBe(0);
  });

  it("getStats handles empty table", () => {
    const stats = store.getStats();

    expect(stats.total).toBe(0);
    expect(stats.totalTokens).toBe(0);
    expect(stats.byCategory).toEqual({
      market: 0,
      technical: 0,
      social: 0,
      financial: 0,
      operational: 0,
    });
  });

  it("update with empty patch is a no-op", () => {
    const id = addKnowledge({ key: "noop-key" });
    store.update(id, {});

    const entry = store.get(id);
    expect(entry?.key).toBe("noop-key");
  });

  it("getByCategory excludes expired rows", () => {
    addKnowledge({ category: "technical", key: "valid", expiresAt: null });
    addKnowledge({ category: "technical", key: "expired", expiresAt: "2020-01-01T00:00:00.000Z" });

    const entries = store.getByCategory("technical");
    expect(entries.map((entry) => entry.key)).toEqual(["valid"]);
  });
});
