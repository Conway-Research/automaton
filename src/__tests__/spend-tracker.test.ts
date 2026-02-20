/**
 * SpendTracker Tests
 *
 * Tests for the SpendTracker class:
 * - recordSpend inserts with correct window_hour and window_day
 * - getHourlySpend returns sum for current hour
 * - getDailySpend returns sum for current day
 * - checkLimit returns allowed=false when limit exceeded
 * - pruneOldRecords removes records older than retention
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import os from "os";
import fs from "fs";
import { SpendTracker } from "../agent/spend-tracker.js";
import type { TreasuryPolicy, LimitCheckResult } from "../types.js";
import { DEFAULT_TREASURY_POLICY } from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────

function createTestSpendDb(): Database.Database {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spend-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_spend_hour ON spend_tracking(category, window_hour);
    CREATE INDEX IF NOT EXISTS idx_spend_day ON spend_tracking(category, window_day);
  `);

  return db;
}

describe("SpendTracker", () => {
  let db: Database.Database;
  let tracker: SpendTracker;

  beforeEach(() => {
    db = createTestSpendDb();
    tracker = new SpendTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("recordSpend", () => {
    it("inserts a record with correct window_hour and window_day", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 500,
        recipient: "0x1234",
        category: "transfer",
      });

      const row = db
        .prepare("SELECT * FROM spend_tracking LIMIT 1")
        .get() as any;
      expect(row).toBeDefined();
      expect(row.tool_name).toBe("transfer_credits");
      expect(row.amount_cents).toBe(500);
      expect(row.recipient).toBe("0x1234");
      expect(row.category).toBe("transfer");

      // window_hour should be ISO format like '2026-02-19T14'
      expect(row.window_hour).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/);
      // window_day should be ISO format like '2026-02-19'
      expect(row.window_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("inserts multiple records", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 100,
        category: "transfer",
      });
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 200,
        category: "transfer",
      });
      tracker.recordSpend({
        toolName: "x402_fetch",
        amountCents: 50,
        domain: "conway.tech",
        category: "x402",
      });

      const count = db
        .prepare("SELECT COUNT(*) as count FROM spend_tracking")
        .get() as { count: number };
      expect(count.count).toBe(3);
    });
  });

  describe("getHourlySpend", () => {
    it("returns sum for current hour", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 100,
        category: "transfer",
      });
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 200,
        category: "transfer",
      });

      const hourly = tracker.getHourlySpend("transfer");
      expect(hourly).toBe(300);
    });

    it("returns 0 when no records exist", () => {
      const hourly = tracker.getHourlySpend("transfer");
      expect(hourly).toBe(0);
    });

    it("separates categories", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 100,
        category: "transfer",
      });
      tracker.recordSpend({
        toolName: "x402_fetch",
        amountCents: 50,
        category: "x402",
      });

      expect(tracker.getHourlySpend("transfer")).toBe(100);
      expect(tracker.getHourlySpend("x402")).toBe(50);
    });
  });

  describe("getDailySpend", () => {
    it("returns sum for current day", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 1000,
        category: "transfer",
      });
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 2000,
        category: "transfer",
      });

      const daily = tracker.getDailySpend("transfer");
      expect(daily).toBe(3000);
    });
  });

  describe("getTotalSpend", () => {
    it("returns total spend since given date", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 500,
        category: "transfer",
      });

      const total = tracker.getTotalSpend(
        "transfer",
        new Date(Date.now() - 3600 * 1000),
      );
      expect(total).toBe(500);
    });

    it("returns 0 for future since date", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 500,
        category: "transfer",
      });

      const total = tracker.getTotalSpend(
        "transfer",
        new Date(Date.now() + 3600 * 1000),
      );
      expect(total).toBe(0);
    });
  });

  describe("checkLimit", () => {
    it("returns allowed=true when within limits", () => {
      const result = tracker.checkLimit(100, "transfer", DEFAULT_TREASURY_POLICY);
      expect(result.allowed).toBe(true);
      expect(result.currentHourlySpend).toBe(0);
      expect(result.currentDailySpend).toBe(0);
    });

    it("returns allowed=false when hourly limit exceeded", () => {
      // Fill up hourly limit
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 9500,
        category: "transfer",
      });

      // Try to add more that would exceed 10000 hourly cap
      const result = tracker.checkLimit(600, "transfer", DEFAULT_TREASURY_POLICY);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Hourly");
      expect(result.currentHourlySpend).toBe(9500);
    });

    it("returns allowed=false when daily limit exceeded", () => {
      // Use custom policy with low hourly cap but test daily
      const policy: TreasuryPolicy = {
        ...DEFAULT_TREASURY_POLICY,
        maxHourlyTransferCents: 100_000, // high hourly to not trigger
        maxDailyTransferCents: 5000,
      };

      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 4500,
        category: "transfer",
      });

      const result = tracker.checkLimit(600, "transfer", policy);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Daily");
    });
  });

  describe("pruneOldRecords", () => {
    it("removes records older than retention period", () => {
      // Insert a record with old created_at
      db.prepare(
        `INSERT INTO spend_tracking (id, tool_name, amount_cents, category, window_hour, window_day, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "old-record",
        "transfer_credits",
        100,
        "transfer",
        "2020-01-01T00",
        "2020-01-01",
        "2020-01-01T00:00:00.000Z",
      );

      // Insert a current record
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 200,
        category: "transfer",
      });

      const deleted = tracker.pruneOldRecords(1); // 1 day retention
      expect(deleted).toBe(1);

      const remaining = db
        .prepare("SELECT COUNT(*) as count FROM spend_tracking")
        .get() as { count: number };
      expect(remaining.count).toBe(1);
    });

    it("returns 0 when no old records exist", () => {
      tracker.recordSpend({
        toolName: "transfer_credits",
        amountCents: 100,
        category: "transfer",
      });

      const deleted = tracker.pruneOldRecords(30);
      expect(deleted).toBe(0);
    });

    it("correctly prunes with SQLite datetime format (no T/Z)", () => {
      // Insert a record with SQLite-format created_at (no T, no Z)
      db.prepare(
        `INSERT INTO spend_tracking (id, tool_name, amount_cents, category, window_hour, window_day, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "sqlite-format-record",
        "transfer_credits",
        100,
        "transfer",
        "2020-01-01T00",
        "2020-01-01",
        "2020-01-01 00:00:00", // SQLite datetime format
      );

      const deleted = tracker.pruneOldRecords(1);
      expect(deleted).toBe(1);
    });
  });

  describe("inference limits", () => {
    it("uses a meaningful hourly cap less than the daily limit", () => {
      // maxInferenceDailyCents is 50000 ($500/day)
      // The hourly limit should be a fraction of the daily limit, NOT equal to it
      const result = tracker.checkLimit(1, "inference", DEFAULT_TREASURY_POLICY);
      expect(result.allowed).toBe(true);
      expect(result.limitHourly).toBeLessThan(result.limitDaily);
    });

    it("enforces hourly inference limit before daily is reached", () => {
      const hourlyLimit = Math.ceil(DEFAULT_TREASURY_POLICY.maxInferenceDailyCents / 6);

      // Spend up to just below hourly limit
      tracker.recordSpend({
        toolName: "inference",
        amountCents: hourlyLimit - 1,
        category: "inference",
      });

      // This should be denied because hourly limit would be exceeded
      const result = tracker.checkLimit(2, "inference", DEFAULT_TREASURY_POLICY);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Hourly");
    });
  });

  describe("x402 limits", () => {
    it("uses x402-specific limits, not transfer limits", () => {
      // Record some x402 spend
      tracker.recordSpend({
        toolName: "x402_fetch",
        amountCents: 900,
        domain: "conway.tech",
        category: "x402",
      });

      // maxX402PaymentCents is 100, so hourly = 100*10 = 1000
      // 900 + 200 = 1100 > 1000 should be denied
      const result = tracker.checkLimit(200, "x402", DEFAULT_TREASURY_POLICY);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Hourly");

      // But the same amount should be allowed for transfers (limit is 10000)
      const transferResult = tracker.checkLimit(200, "transfer", DEFAULT_TREASURY_POLICY);
      expect(transferResult.allowed).toBe(true);
    });
  });
});
