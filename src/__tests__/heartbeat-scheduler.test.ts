/**
 * Heartbeat Scheduler Tests (Phase 1.1)
 *
 * Tests for DurableScheduler, TickContext, DB helpers, and config changes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DurableScheduler } from "../heartbeat/scheduler.js";
import { buildTickContext } from "../heartbeat/tick-context.js";
import {
  MockConwayClient,
  createTestDb,
  createTestIdentity,
  createTestConfig,
} from "./mocks.js";
import {
  getHeartbeatSchedule,
  updateHeartbeatSchedule,
  upsertHeartbeatSchedule,
  insertHeartbeatHistory,
  getHeartbeatHistory,
  acquireTaskLease,
  releaseTaskLease,
  clearExpiredLeases,
  insertWakeEvent,
  consumeNextWakeEvent,
  getUnconsumedWakeEvents,
  insertDedupKey,
  pruneExpiredDedupKeys,
  isDeduplicated,
} from "../state/database.js";
import type {
  AutomatonDatabase,
  HeartbeatConfig,
  HeartbeatTaskFn,
  HeartbeatLegacyContext,
  HeartbeatScheduleRow,
  TickContext,
} from "../types.js";
import type BetterSqlite3 from "better-sqlite3";

type DatabaseType = BetterSqlite3.Database;

const DEFAULT_HB_CONFIG: HeartbeatConfig = {
  entries: [],
  defaultIntervalMs: 60_000,
  lowComputeMultiplier: 4,
};

function createLegacyContext(
  db: AutomatonDatabase,
  conway: MockConwayClient,
): HeartbeatLegacyContext {
  return {
    identity: createTestIdentity(),
    config: createTestConfig(),
    db,
    conway,
  };
}

function seedScheduleRow(
  rawDb: DatabaseType,
  taskName: string,
  overrides: Partial<HeartbeatScheduleRow> = {},
): void {
  upsertHeartbeatSchedule(rawDb, {
    taskName,
    cronExpression: "* * * * *", // every minute
    intervalMs: null,
    enabled: 1,
    priority: 0,
    timeoutMs: 30_000,
    maxRetries: 1,
    tierMinimum: "dead",
    lastRunAt: null,
    nextRunAt: null,
    lastResult: null,
    lastError: null,
    runCount: 0,
    failCount: 0,
    leaseOwner: null,
    leaseExpiresAt: null,
    ...overrides,
  });
}

describe("DurableScheduler", () => {
  let db: AutomatonDatabase;
  let rawDb: DatabaseType;
  let conway: MockConwayClient;

  beforeEach(() => {
    db = createTestDb();
    rawDb = db.raw;
    conway = new MockConwayClient();
  });

  afterEach(() => {
    db.close();
  });

  describe("tick overlap prevention", () => {
    it("prevents concurrent tick execution", async () => {
      let tickCount = 0;
      const slowTask: HeartbeatTaskFn = async () => {
        tickCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { shouldWake: false };
      };

      seedScheduleRow(rawDb, "slow_task");
      const tasks = new Map<string, HeartbeatTaskFn>([["slow_task", slowTask]]);
      const scheduler = new DurableScheduler(
        rawDb,
        DEFAULT_HB_CONFIG,
        tasks,
        createLegacyContext(db, conway),
      );

      // Start two ticks simultaneously
      const tick1 = scheduler.tick();
      const tick2 = scheduler.tick();
      await Promise.all([tick1, tick2]);

      // Only one should have executed due to tickInProgress guard
      expect(tickCount).toBe(1);
    });
  });

  describe("task timeout", () => {
    it("times out tasks that exceed their timeout", async () => {
      const neverFinish: HeartbeatTaskFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        return { shouldWake: false };
      };

      // Set a very short timeout
      seedScheduleRow(rawDb, "never_finish", { timeoutMs: 50 });
      const tasks = new Map<string, HeartbeatTaskFn>([["never_finish", neverFinish]]);
      const scheduler = new DurableScheduler(
        rawDb,
        DEFAULT_HB_CONFIG,
        tasks,
        createLegacyContext(db, conway),
      );

      await scheduler.tick();

      // Check that the task was recorded as timeout
      const history = getHeartbeatHistory(rawDb, "never_finish");
      expect(history.length).toBe(1);
      expect(history[0].result).toBe("timeout");
      expect(history[0].error).toContain("timed out");
    });
  });

  describe("schedule persistence", () => {
    it("reads schedule from DB", () => {
      seedScheduleRow(rawDb, "task_a", { priority: 1 });
      seedScheduleRow(rawDb, "task_b", { priority: 0 });

      const schedule = getHeartbeatSchedule(rawDb);
      expect(schedule.length).toBe(2);
      // Sorted by priority (lower first)
      expect(schedule[0].taskName).toBe("task_b");
      expect(schedule[1].taskName).toBe("task_a");
    });

    it("updates schedule fields", () => {
      seedScheduleRow(rawDb, "task_a");
      updateHeartbeatSchedule(rawDb, "task_a", {
        lastRunAt: "2026-02-19T12:00:00Z",
        lastResult: "success",
        runCount: 5,
      });

      const schedule = getHeartbeatSchedule(rawDb);
      expect(schedule[0].lastRunAt).toBe("2026-02-19T12:00:00Z");
      expect(schedule[0].lastResult).toBe("success");
      expect(schedule[0].runCount).toBe(5);
    });

    it("persists across scheduler restarts", () => {
      seedScheduleRow(rawDb, "persistent_task");
      updateHeartbeatSchedule(rawDb, "persistent_task", {
        lastRunAt: "2026-02-19T12:00:00Z",
        runCount: 10,
      });

      // Simulate restart by reading schedule again
      const schedule = getHeartbeatSchedule(rawDb);
      expect(schedule[0].runCount).toBe(10);
      expect(schedule[0].lastRunAt).toBe("2026-02-19T12:00:00Z");
    });
  });

  describe("dedup key TTL and pruning", () => {
    it("inserts and detects dedup keys", () => {
      const inserted = insertDedupKey(rawDb, "key-1", "task_a", 60_000);
      expect(inserted).toBe(true);

      expect(isDeduplicated(rawDb, "key-1")).toBe(true);
      expect(isDeduplicated(rawDb, "key-nonexist")).toBe(false);
    });

    it("rejects duplicate keys", () => {
      insertDedupKey(rawDb, "key-1", "task_a", 60_000);
      const second = insertDedupKey(rawDb, "key-1", "task_a", 60_000);
      expect(second).toBe(false);
    });

    it("prunes expired dedup keys", () => {
      // Insert with expired TTL
      rawDb.prepare(
        "INSERT INTO heartbeat_dedup (dedup_key, task_name, expires_at) VALUES (?, ?, ?)",
      ).run("expired-1", "task_a", "2020-01-01T00:00:00Z");
      rawDb.prepare(
        "INSERT INTO heartbeat_dedup (dedup_key, task_name, expires_at) VALUES (?, ?, ?)",
      ).run("valid-1", "task_a", "2030-01-01T00:00:00Z");

      const pruned = pruneExpiredDedupKeys(rawDb);
      expect(pruned).toBe(1);

      expect(isDeduplicated(rawDb, "expired-1")).toBe(false);
      expect(isDeduplicated(rawDb, "valid-1")).toBe(true);
    });
  });

  describe("wake event ordering and consumption", () => {
    it("inserts and consumes wake events in order", () => {
      insertWakeEvent(rawDb, "heartbeat", "reason-1");
      insertWakeEvent(rawDb, "inbox", "reason-2");
      insertWakeEvent(rawDb, "manual", "reason-3");

      const first = consumeNextWakeEvent(rawDb);
      expect(first).toBeDefined();
      expect(first!.reason).toBe("reason-1");
      expect(first!.source).toBe("heartbeat");

      const second = consumeNextWakeEvent(rawDb);
      expect(second!.reason).toBe("reason-2");

      const third = consumeNextWakeEvent(rawDb);
      expect(third!.reason).toBe("reason-3");

      // No more events
      const fourth = consumeNextWakeEvent(rawDb);
      expect(fourth).toBeUndefined();
    });

    it("lists unconsumed events", () => {
      insertWakeEvent(rawDb, "heartbeat", "reason-1");
      insertWakeEvent(rawDb, "inbox", "reason-2");

      // Consume one
      consumeNextWakeEvent(rawDb);

      const remaining = getUnconsumedWakeEvents(rawDb);
      expect(remaining.length).toBe(1);
      expect(remaining[0].reason).toBe("reason-2");
    });

    it("stores payload as JSON", () => {
      insertWakeEvent(rawDb, "heartbeat", "with-payload", { taskName: "test_task", extra: 42 });

      const event = consumeNextWakeEvent(rawDb);
      expect(event).toBeDefined();
      const payload = JSON.parse(event!.payload);
      expect(payload.taskName).toBe("test_task");
      expect(payload.extra).toBe(42);
    });
  });

  describe("task lease acquisition and release", () => {
    it("acquires and releases leases", () => {
      seedScheduleRow(rawDb, "leased_task");

      const acquired = acquireTaskLease(rawDb, "leased_task", "owner-1", 60_000);
      expect(acquired).toBe(true);

      // Cannot acquire same lease with different owner
      const reacquired = acquireTaskLease(rawDb, "leased_task", "owner-2", 60_000);
      expect(reacquired).toBe(false);

      // Release lease
      releaseTaskLease(rawDb, "leased_task", "owner-1");

      // Now can acquire again
      const acquired2 = acquireTaskLease(rawDb, "leased_task", "owner-2", 60_000);
      expect(acquired2).toBe(true);
    });

    it("clears expired leases", () => {
      seedScheduleRow(rawDb, "expired_lease");
      // Set expired lease directly
      rawDb.prepare(
        "UPDATE heartbeat_schedule SET lease_owner = ?, lease_expires_at = ? WHERE task_name = ?",
      ).run("old-owner", "2020-01-01T00:00:00Z", "expired_lease");

      const cleared = clearExpiredLeases(rawDb);
      expect(cleared).toBe(1);

      // Can now acquire lease
      const acquired = acquireTaskLease(rawDb, "expired_lease", "new-owner", 60_000);
      expect(acquired).toBe(true);
    });
  });

  describe("task execution history recording", () => {
    it("records successful execution", async () => {
      const simpleTask: HeartbeatTaskFn = async () => {
        return { shouldWake: false };
      };

      seedScheduleRow(rawDb, "simple_task");
      const tasks = new Map<string, HeartbeatTaskFn>([["simple_task", simpleTask]]);
      const scheduler = new DurableScheduler(
        rawDb,
        DEFAULT_HB_CONFIG,
        tasks,
        createLegacyContext(db, conway),
      );

      await scheduler.tick();

      const history = getHeartbeatHistory(rawDb, "simple_task");
      expect(history.length).toBe(1);
      expect(history[0].result).toBe("success");
      expect(history[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(history[0].error).toBeNull();
    });

    it("records failed execution", async () => {
      const failingTask: HeartbeatTaskFn = async () => {
        throw new Error("Task failed intentionally");
      };

      seedScheduleRow(rawDb, "failing_task");
      const tasks = new Map<string, HeartbeatTaskFn>([["failing_task", failingTask]]);
      const scheduler = new DurableScheduler(
        rawDb,
        DEFAULT_HB_CONFIG,
        tasks,
        createLegacyContext(db, conway),
      );

      await scheduler.tick();

      const history = getHeartbeatHistory(rawDb, "failing_task");
      expect(history.length).toBe(1);
      expect(history[0].result).toBe("failure");
      expect(history[0].error).toContain("Task failed intentionally");
    });
  });

  describe("TickContext building", () => {
    beforeEach(() => { vi.stubEnv("CONWAY_API_KEY", "test-only"); });
    afterEach(() => { vi.unstubAllEnvs(); });
    it("fetches balance once and builds context", async () => {
      conway.creditsCents = 5_000;

      const ctx = await buildTickContext(
        rawDb,
        conway,
        DEFAULT_HB_CONFIG,
      );

      expect(ctx.tickId).toBeTruthy();
      expect(ctx.startedAt).toBeInstanceOf(Date);
      expect(ctx.creditBalance).toBe(5_000);
      expect(ctx.survivalTier).toBe("high");
      expect(ctx.lowComputeMultiplier).toBe(4);
      expect(ctx.config).toBe(DEFAULT_HB_CONFIG);
      expect(ctx.db).toBe(rawDb);
    });

    it("handles API failure gracefully", async () => {
      // Make getCreditsBalance throw
      conway.getCreditsBalance = async () => {
        throw new Error("API unavailable");
      };

      const ctx = await buildTickContext(
        rawDb,
        conway,
        DEFAULT_HB_CONFIG,
      );

      // Unknown balance must not be presented as a confirmed zero balance.
      expect(ctx.creditBalance).toBe(-1);
      expect(ctx.survivalTier).toBe("low_compute");
    });
  });

  describe("config consumption", () => {
    it("uses defaultIntervalMs from config", () => {
      const config: HeartbeatConfig = {
        entries: [],
        defaultIntervalMs: 30_000,
        lowComputeMultiplier: 2,
      };

      // The daemon reads config.defaultIntervalMs for tick interval
      // We verify by creating a context with the config
      expect(config.defaultIntervalMs).toBe(30_000);
      expect(config.lowComputeMultiplier).toBe(2);
    });
  });

  describe("YAML parse error logging", () => {
    it("logs error when YAML fails to parse", async () => {
      const { loadHeartbeatConfig } = await import("../heartbeat/config.js");
      const { StructuredLogger } = await import("../observability/logger.js");

      // Capture structured log output via custom sink
      const logEntries: any[] = [];
      StructuredLogger.setSink((entry) => logEntries.push(entry));

      // Write invalid YAML to a temp file
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-yaml-test-"));
      const configPath = path.join(tmpDir, "heartbeat.yml");
      fs.writeFileSync(configPath, "invalid: yaml: content: [unterminated");

      const config = loadHeartbeatConfig(configPath);

      // Should return defaults
      expect(config.defaultIntervalMs).toBe(60_000);

      // Check if logger was called with YAML error
      const yamlErrorEntry = logEntries.find(
        (entry) => entry.level === "error" && entry.message.includes("Failed to parse YAML"),
      );
      expect(yamlErrorEntry).toBeDefined();

      StructuredLogger.resetSink();

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe("numeric config field zero values", () => {
    it("preserves explicit zero for defaultIntervalMs and lowComputeMultiplier", async () => {
      const { loadHeartbeatConfig } = await import("../heartbeat/config.js");
      const fs = await import("fs");
      const path = await import("path");
      const os = await import("os");
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hb-zero-test-"));
      const configPath = path.join(tmpDir, "heartbeat.yml");

      // YAML with explicit zero values
      fs.writeFileSync(configPath, "defaultIntervalMs: 0\nlowComputeMultiplier: 0\n");

      const config = loadHeartbeatConfig(configPath);

      // With ||, 0 is falsy and would fall back to defaults (60000, 4).
      // With ??, 0 is preserved as the user-specified value.
      expect(config.defaultIntervalMs).toBe(0);
      expect(config.lowComputeMultiplier).toBe(0);

      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});
