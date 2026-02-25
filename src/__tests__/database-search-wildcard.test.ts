/**
 * Database Search Wildcard Escaping Tests
 *
 * Verifies that episodicSearch, semanticSearch, and proceduralSearch
 * properly escape SQL LIKE wildcards (%, _, \) in user-supplied queries.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  episodicSearch,
  episodicInsert,
  semanticSearch,
  semanticUpsert,
  proceduralSearch,
  proceduralUpsert,
} from "../state/database.js";
import { createDatabase } from "../state/database.js";
import Database from "better-sqlite3";

let dbPath: string;
let db: ReturnType<typeof Database>;
let automatonDb: ReturnType<typeof createDatabase>;

function makeTmpDbPath(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "automaton-wildcard-test-"));
  return path.join(tmpDir, "test.db");
}

beforeEach(() => {
  dbPath = makeTmpDbPath();
  automatonDb = createDatabase(dbPath);
  db = automatonDb.raw;
});

afterEach(() => {
  automatonDb.close();
  try { fs.unlinkSync(dbPath); } catch {}
});

describe("episodicSearch wildcard escaping", () => {
  it("does not treat % in query as LIKE wildcard", () => {
    episodicInsert(db, {
      sessionId: "s1",
      eventType: "test",
      summary: "normal event",
      detail: "nothing special",
      outcome: "success",
      importance: 5,
      embeddingKey: null,
      tokenCount: 10,
      classification: "productive",
    });
    episodicInsert(db, {
      sessionId: "s1",
      eventType: "test",
      summary: "event with 100% completion",
      detail: "has percent",
      outcome: "success",
      importance: 5,
      embeddingKey: null,
      tokenCount: 10,
      classification: "productive",
    });

    // Search for literal "100%" — should only match the second entry
    const results = episodicSearch(db, "100%");
    expect(results.length).toBe(1);
    expect(results[0].summary).toContain("100%");
  });

  it("does not treat _ in query as LIKE single-char wildcard", () => {
    episodicInsert(db, {
      sessionId: "s1",
      eventType: "test",
      summary: "file_name found",
      detail: null,
      outcome: null,
      importance: 5,
      embeddingKey: null,
      tokenCount: 10,
      classification: "productive",
    });
    episodicInsert(db, {
      sessionId: "s1",
      eventType: "test",
      summary: "filename found",
      detail: null,
      outcome: null,
      importance: 5,
      embeddingKey: null,
      tokenCount: 10,
      classification: "productive",
    });

    // Search for "file_name" — should match only the underscore entry, not "filename"
    const results = episodicSearch(db, "file_name");
    expect(results.length).toBe(1);
    expect(results[0].summary).toBe("file_name found");
  });
});

describe("semanticSearch wildcard escaping", () => {
  it("does not treat % in query as LIKE wildcard", () => {
    semanticUpsert(db, {
      category: "self",
      key: "cpu_usage",
      value: "CPU at 95% utilization",
      confidence: 0.9,
      source: "test",
      embeddingKey: null,
      lastVerifiedAt: null,
    });
    semanticUpsert(db, {
      category: "self",
      key: "memory_usage",
      value: "Memory at 50GB",
      confidence: 0.9,
      source: "test",
      embeddingKey: null,
      lastVerifiedAt: null,
    });

    // Search for literal "95%" — should only match the first entry
    const results = semanticSearch(db, "95%");
    expect(results.length).toBe(1);
    expect(results[0].value).toContain("95%");
  });

  it("does not treat _ in query as LIKE single-char wildcard", () => {
    semanticUpsert(db, {
      category: "self",
      key: "var_name",
      value: "Variable var_name is important",
      confidence: 0.9,
      source: "test",
      embeddingKey: null,
      lastVerifiedAt: null,
    });
    semanticUpsert(db, {
      category: "self",
      key: "varXname",
      value: "Variable varXname is different",
      confidence: 0.9,
      source: "test",
      embeddingKey: null,
      lastVerifiedAt: null,
    });

    // Search for "var_name" — _ should NOT match arbitrary character
    const results = semanticSearch(db, "var_name");
    expect(results.length).toBe(1);
    expect(results[0].key).toBe("var_name");
  });

  it("filters by category when provided", () => {
    semanticUpsert(db, {
      category: "self",
      key: "test_key",
      value: "100% match",
      confidence: 0.9,
      source: "test",
      embeddingKey: null,
      lastVerifiedAt: null,
    });
    semanticUpsert(db, {
      category: "environment",
      key: "other_key",
      value: "100% different",
      confidence: 0.9,
      source: "test",
      embeddingKey: null,
      lastVerifiedAt: null,
    });

    const results = semanticSearch(db, "100%", "self");
    expect(results.length).toBe(1);
    expect(results[0].category).toBe("self");
  });
});

describe("proceduralSearch wildcard escaping", () => {
  it("does not treat % in query as LIKE wildcard", () => {
    proceduralUpsert(db, {
      name: "deploy_100pct_coverage",
      description: "Deploy with 100% coverage",
      steps: ["test", "deploy"],
    });
    proceduralUpsert(db, {
      name: "deploy_basic",
      description: "Basic deployment",
      steps: ["deploy"],
    });

    // Search for "100%" — should only match the first
    const results = proceduralSearch(db, "100%");
    expect(results.length).toBe(1);
    expect(results[0].description).toContain("100%");
  });

  it("does not treat _ in query as LIKE single-char wildcard", () => {
    proceduralUpsert(db, {
      name: "run_tests",
      description: "Run test suite with run_tests command",
      steps: ["run"],
    });
    proceduralUpsert(db, {
      name: "runXtests",
      description: "Run X tests",
      steps: ["run"],
    });

    // Search for "run_tests" — _ should NOT match arbitrary character
    const results = proceduralSearch(db, "run_tests");
    expect(results.length).toBe(1);
    expect(results[0].name).toBe("run_tests");
  });
});
