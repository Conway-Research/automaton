/**
 * Soul Substrate Tests
 *
 * Tests: emergence pattern detection, resonance computation,
 * substrate state, and summary generation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { ulid } from "ulid";
import {
  detectEmergencePatterns,
  computeResonance,
  computeSubstrate,
  getSubstrateSummary,
} from "../soul/substrate.js";
import type { SoulModel } from "../types.js";
import { MIGRATION_V5 } from "../state/schema.js";

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      name TEXT NOT NULL,
      arguments TEXT NOT NULL DEFAULT '{}',
      result TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id TEXT PRIMARY KEY,
      from_address TEXT NOT NULL,
      content TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      processed_at TEXT,
      reply_to TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      amount_cents INTEGER,
      balance_after_cents INTEGER,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function insertToolCalls(db: Database.Database, names: string[]): void {
  const stmt = db.prepare(
    "INSERT INTO tool_calls (id, turn_id, name, created_at) VALUES (?, ?, ?, datetime('now'))",
  );
  for (const name of names) {
    stmt.run(ulid(), ulid(), name);
  }
}

function makeValidSoul(overrides: Partial<SoulModel> = {}): SoulModel {
  return {
    format: "soul/v1",
    version: 1,
    updatedAt: new Date().toISOString(),
    name: "TestBot",
    address: "7xKpmN3v",
    creator: "9aBcDeFg",
    bornAt: new Date().toISOString(),
    constitutionHash: "",
    genesisPromptOriginal: "Be helpful and survive",
    genesisAlignment: 1.0,
    lastReflected: "",
    corePurpose: "Help others and create value",
    values: ["Survive", "Grow", "Create"],
    behavioralGuidelines: ["Be honest", "Work hard"],
    personality: "Friendly and determined",
    boundaries: ["Never harm humans"],
    strategy: "Build useful services",
    capabilities: "Shell access, API calls",
    relationships: "",
    financialCharacter: "",
    rawContent: "",
    contentHash: "",
    ...overrides,
  };
}

// ─── Emergence Pattern Detection ────────────────────────────────

describe("detectEmergencePatterns", () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it("returns void pattern when no tool calls exist", () => {
    const patterns = detectEmergencePatterns(db);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].constant).toBe("void");
    expect(patterns[0].intensity).toBe(1.0);
  });

  it("detects spiral pattern from soul/self-mod tools", () => {
    insertToolCalls(db, [
      "view_soul", "update_soul", "reflect_on_soul",
      "modify_code", "self_mod_audit", "view_soul",
    ]);
    const patterns = detectEmergencePatterns(db);
    const spiral = patterns.find((p) => p.constant === "spiral");
    expect(spiral).toBeDefined();
    expect(spiral!.intensity).toBeGreaterThan(0);
    expect(spiral!.frequency).toBeGreaterThanOrEqual(6);
  });

  it("detects tunnel pattern from repeated tool usage", () => {
    const calls = Array.from({ length: 15 }, () => "exec");
    insertToolCalls(db, calls);
    const patterns = detectEmergencePatterns(db);
    const tunnel = patterns.find((p) => p.constant === "tunnel");
    expect(tunnel).toBeDefined();
    expect(tunnel!.intensity).toBeGreaterThan(0);
  });

  it("detects honeycomb pattern from colony tools", () => {
    insertToolCalls(db, [
      "spawn_child", "orchestrator_status", "create_goal",
      "list_children", "task_assign", "colony_health",
    ]);
    const patterns = detectEmergencePatterns(db);
    const honeycomb = patterns.find((p) => p.constant === "honeycomb");
    expect(honeycomb).toBeDefined();
  });

  it("detects cobweb pattern from memory tools", () => {
    insertToolCalls(db, [
      "recall_facts", "search_memory", "retrieve_context",
      "knowledge_share",
    ]);
    const patterns = detectEmergencePatterns(db);
    const cobweb = patterns.find((p) => p.constant === "cobweb");
    expect(cobweb).toBeDefined();
  });

  it("detects lattice pattern from exploration tools", () => {
    insertToolCalls(db, [
      "exec", "read_file", "write_file", "exec", "list_files",
      "exec", "discover_agents", "exec", "scan_ports",
    ]);
    const patterns = detectEmergencePatterns(db);
    const lattice = patterns.find((p) => p.constant === "lattice");
    expect(lattice).toBeDefined();
  });

  it("patterns are sorted by intensity (most dominant first)", () => {
    insertToolCalls(db, [
      ...Array.from({ length: 12 }, () => "exec"),
      "view_soul", "update_soul", "reflect_on_soul",
    ]);
    const patterns = detectEmergencePatterns(db);
    for (let i = 1; i < patterns.length; i++) {
      expect(patterns[i - 1].intensity).toBeGreaterThanOrEqual(patterns[i].intensity);
    }
  });
});

// ─── Soul Resonance ─────────────────────────────────────────────

describe("computeResonance", () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it("returns zero coherence for null soul", () => {
    const resonance = computeResonance(db, null);
    expect(resonance.coherence).toBe(0);
    expect(resonance.genesisAlignment).toBe(0);
    expect(resonance.veilOpacity).toBe(1.0);
  });

  it("computes non-zero resonance for valid soul", () => {
    const soul = makeValidSoul();
    const resonance = computeResonance(db, soul);
    expect(resonance.coherence).toBeGreaterThan(0);
    expect(resonance.genesisAlignment).toBeGreaterThan(0);
    expect(resonance.depthIndex).toBeGreaterThan(0);
    expect(resonance.dominantPattern).toBeTruthy();
  });

  it("depth index reflects populated sections", () => {
    const sparse = makeValidSoul({ personality: "", strategy: "", capabilities: "", relationships: "", financialCharacter: "" });
    const rich = makeValidSoul();
    const sparseRes = computeResonance(db, sparse);
    const richRes = computeResonance(db, rich);
    expect(richRes.depthIndex).toBeGreaterThan(sparseRes.depthIndex);
  });

  it("entropy increases with version number", () => {
    const v1 = makeValidSoul({ version: 1 });
    const v100 = makeValidSoul({ version: 100 });
    const res1 = computeResonance(db, v1);
    const res100 = computeResonance(db, v100);
    expect(res100.entropyScore).toBeGreaterThan(res1.entropyScore);
  });

  it("veil opacity increases as coherence decreases", () => {
    const coherent = makeValidSoul({ corePurpose: "Be helpful and survive" });
    const drifted = makeValidSoul({ corePurpose: "Completely different unrelated purpose xyz", version: 50 });
    const coherentRes = computeResonance(db, coherent);
    const driftedRes = computeResonance(db, drifted);
    expect(driftedRes.veilOpacity).toBeGreaterThan(coherentRes.veilOpacity);
  });
});

// ─── Substrate State ────────────────────────────────────────────

describe("computeSubstrate", () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it("computes substrate even without SOUL.md", () => {
    const substrate = computeSubstrate(db);
    expect(substrate.soulHash).toBeTruthy();
    expect(substrate.genesisFingerprint).toBe("0".repeat(16));
    expect(substrate.resonance).toBeDefined();
    expect(substrate.computedAt).toBeTruthy();
  });

  it("tracks mutation count from soul_history", () => {
    // Insert some soul history
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO soul_history (id, version, content, content_hash, change_source, created_at)
         VALUES (?, ?, ?, ?, 'agent', datetime('now'))`,
      ).run(ulid(), i + 1, `v${i + 1}`, `hash${i + 1}`);
    }

    const substrate = computeSubstrate(db);
    expect(substrate.mutationCount).toBe(3);
  });
});

// ─── Substrate Summary ──────────────────────────────────────────

describe("getSubstrateSummary", () => {
  let db: Database.Database;

  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it("produces a readable summary string", () => {
    const substrate = computeSubstrate(db);
    const summary = getSubstrateSummary(substrate);
    expect(summary).toContain("Soul hash:");
    expect(summary).toContain("Genesis fingerprint:");
    expect(summary).toContain("Resonance:");
    expect(summary).toContain("Dominant pattern:");
    expect(summary).toContain("Veil opacity:");
    expect(summary).toContain("Mutations:");
  });

  it("includes emergence patterns in summary", () => {
    insertToolCalls(db, ["view_soul", "update_soul", "reflect_on_soul", "exec", "exec", "exec", "exec", "exec", "exec"]);
    const substrate = computeSubstrate(db);
    const summary = getSubstrateSummary(substrate);
    expect(summary).toContain("Emergence:");
  });
});
