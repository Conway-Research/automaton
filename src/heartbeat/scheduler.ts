/**
 * Durable Scheduler
 *
 * DB-backed heartbeat scheduler with tick overlap guard,
 * task leases, timeouts, and retry logic.
 *
 * Replaces the fragile setInterval-based heartbeat.
 */

import type BetterSqlite3 from "better-sqlite3";
import cronParser from "cron-parser";
import type {
  HeartbeatConfig,
  HeartbeatTaskFn,
  HeartbeatLegacyContext,
  HeartbeatScheduleRow,
  TickContext,
} from "../types.js";
import { buildTickContext } from "./tick-context.js";
import {
  getHeartbeatSchedule,
  updateHeartbeatSchedule,
  insertHeartbeatHistory,
  acquireTaskLease,
  releaseTaskLease,
  clearExpiredLeases,
  pruneExpiredDedupKeys,
  insertWakeEvent,
} from "../state/database.js";
import { createLogger } from "../observability/logger.js";

type DatabaseType = BetterSqlite3.Database;
const logger = createLogger("heartbeat.scheduler");

const DEFAULT_TASK_TIMEOUT_MS = 30_000;
const LEASE_TTL_MS = 60_000;
const HISTORY_ID_COUNTER = { value: 0 };

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  HISTORY_ID_COUNTER.value++;
  return `${timestamp}-${random}-${HISTORY_ID_COUNTER.value.toString(36)}`;
}

function timeoutPromise(ms: number): { promise: Promise<never>; clear: () => void } {
  let timerId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms);
  });
  return { promise, clear: () => clearTimeout(timerId!) };
}

// Survival tier ordering for tier minimum checks
const TIER_ORDER: Record<string, number> = {
  dead: 0,
  critical: 1,
  low_compute: 2,
  normal: 3,
  high: 4,
};

function tierMeetsMinimum(currentTier: string, minimumTier: string): boolean {
  return (TIER_ORDER[currentTier] ?? 0) >= (TIER_ORDER[minimumTier] ?? 0);
}

export class DurableScheduler {
  private tickInProgress = false;
  private readonly ownerId: string;

  constructor(
    private readonly db: DatabaseType,
    private readonly config: HeartbeatConfig,
    private readonly tasks: Map<string, HeartbeatTaskFn>,
    private readonly legacyContext: HeartbeatLegacyContext,
    private readonly onWakeRequest?: (reason: string) => void,
  ) {
    this.ownerId = `scheduler-${Date.now().toString(36)}`;
  }

  /**
   * Called on interval -- guards against overlap.
   */
  async tick(): Promise<void> {
    if (this.tickInProgress) return;
    this.tickInProgress = true;

    try {
      // Clear any expired leases first
      clearExpiredLeases(this.db);

      // Build shared context (single API call for balance)
      const context = await buildTickContext(
        this.db,
        this.legacyContext.conway,
        this.config,
        this.legacyContext.identity.address,
        this.legacyContext.config.useSovereignProviders,
      );

      // Get tasks that are due
      const dueTasks = this.getDueTasks(context);

      for (const task of dueTasks) {
        await this.executeTask(task.taskName, context);
      }

      // Periodic cleanup
      pruneExpiredDedupKeys(this.db);
    } catch (err: any) {
      logger.error("Tick failed", err instanceof Error ? err : undefined);
    } finally {
      this.tickInProgress = false;
    }
  }

  /**
   * Check which tasks are due based on DB schedule.
   */
  getDueTasks(context: TickContext): HeartbeatScheduleRow[] {
    const schedule = getHeartbeatSchedule(this.db);
    const now = new Date();

    return schedule.filter((row) => {
      // Skip disabled tasks
      if (!row.enabled) return false;

      // Skip tasks that require a higher survival tier
      if (!tierMeetsMinimum(context.survivalTier, row.tierMinimum)) return false;

      // Skip if lease is held by someone else
      if (row.leaseOwner && row.leaseOwner !== this.ownerId) {
        if (row.leaseExpiresAt && new Date(row.leaseExpiresAt) > now) {
          return false;
        }
      }

      // Check if a retry was explicitly scheduled via nextRunAt
      if (row.nextRunAt && new Date(row.nextRunAt) <= now) {
        return true;
      }

      // Check if task is due based on cron expression
      if (row.cronExpression) {
        try {
          const currentDate = row.lastRunAt
            ? new Date(row.lastRunAt)
            : new Date(Date.now() - 86400000); // If never run, assume due

          const interval = cronParser.parseExpression(row.cronExpression, {
            currentDate,
          });
          const nextRun = interval.next().toDate();
          return nextRun <= now;
        } catch {
          return false;
        }
      }

      // Check if task is due based on intervalMs
      if (row.intervalMs) {
        if (!row.lastRunAt) return true;
        const elapsed = now.getTime() - new Date(row.lastRunAt).getTime();
        return elapsed >= row.intervalMs;
      }

      return false;
    });
  }

  /**
   * Execute a single task with timeout and lease.
   */
  async executeTask(taskName: string, ctx: TickContext): Promise<void> {
    const taskFn = this.tasks.get(taskName);
    if (!taskFn) return;

    const schedule = getHeartbeatSchedule(this.db).find(
      (r) => r.taskName === taskName,
    );
    const timeoutMs = schedule?.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;

    // Acquire lease
    if (!this.acquireLease(taskName)) return;

    const startedAt = new Date().toISOString();
    const startMs = Date.now();
    const timeout = timeoutPromise(timeoutMs);

    try {
      const result = await Promise.race([
        taskFn(ctx, this.legacyContext),
        timeout.promise,
      ]);

      const durationMs = Date.now() - startMs;
      this.recordSuccess(taskName, durationMs, startedAt);

      // If the task says we should wake, fire the callback
      if (result.shouldWake && this.onWakeRequest) {
        const reason = result.message || `Heartbeat task '${taskName}' requested wake`;
        this.onWakeRequest(reason);
        insertWakeEvent(this.db, 'heartbeat', reason, { taskName });
      }
    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      const isTimeout = err.message?.includes("timed out");
      this.recordFailure(
        taskName,
        err,
        durationMs,
        startedAt,
        isTimeout ? "timeout" : "failure",
      );

      // Check if we should retry
      if (schedule && schedule.maxRetries > 0) {
        const history = this.getRecentFailures(taskName);
        if (history < schedule.maxRetries) {
          this.scheduleRetry(taskName);
        }
      }
    } finally {
      timeout.clear();
      this.releaseLease(taskName);
    }
  }

  /**
   * Acquire a lease for a task.
   */
  acquireLease(taskName: string): boolean {
    return acquireTaskLease(this.db, taskName, this.ownerId, LEASE_TTL_MS);
  }

  /**
   * Release a lease for a task.
   */
  releaseLease(taskName: string): void {
    releaseTaskLease(this.db, taskName, this.ownerId);
  }

  /**
   * Record a successful task execution.
   */
  recordSuccess(taskName: string, durationMs: number, startedAt: string): void {
    const now = new Date().toISOString();

    insertHeartbeatHistory(this.db, {
      id: generateId(),
      taskName,
      startedAt,
      completedAt: now,
      result: "success",
      durationMs,
      error: null,
      idempotencyKey: null,
    });

    updateHeartbeatSchedule(this.db, taskName, {
      lastRunAt: now,
      nextRunAt: null, // Clear any pending retry
      lastResult: "success",
      lastError: null,
      runCount: (this.getRunCount(taskName) ?? 0) + 1,
    });
  }

  /**
   * Record a failed task execution.
   */
  recordFailure(
    taskName: string,
    error: Error,
    durationMs: number,
    startedAt: string,
    result: "failure" | "timeout" = "failure",
  ): void {
    const now = new Date().toISOString();
    const errorMessage = error.message || String(error);

    insertHeartbeatHistory(this.db, {
      id: generateId(),
      taskName,
      startedAt,
      completedAt: now,
      result,
      durationMs,
      error: errorMessage,
      idempotencyKey: null,
    });

    updateHeartbeatSchedule(this.db, taskName, {
      lastRunAt: now,
      lastResult: result,
      lastError: errorMessage,
      failCount: (this.getFailCount(taskName) ?? 0) + 1,
      runCount: (this.getRunCount(taskName) ?? 0) + 1,
    });

    logger.error(`Task '${taskName}' ${result}: ${errorMessage}`);
  }

  /**
   * Prune old history entries.
   */
  pruneHistory(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const result = this.db.prepare(
      "DELETE FROM heartbeat_history WHERE started_at < ?",
    ).run(cutoff);
    return result.changes;
  }

  /**
   * Prune expired dedup keys.
   */
  pruneExpiredDedupKeys(): number {
    return pruneExpiredDedupKeys(this.db);
  }

  // ─── Private helpers ──────────────────────────────────────────

  private getRunCount(taskName: string): number {
    const row = this.db.prepare(
      "SELECT run_count FROM heartbeat_schedule WHERE task_name = ?",
    ).get(taskName) as { run_count: number } | undefined;
    return row?.run_count ?? 0;
  }

  private getFailCount(taskName: string): number {
    const row = this.db.prepare(
      "SELECT fail_count FROM heartbeat_schedule WHERE task_name = ?",
    ).get(taskName) as { fail_count: number } | undefined;
    return row?.fail_count ?? 0;
  }

  private getRecentFailures(taskName: string): number {
    // Count consecutive recent failures (since last success)
    const rows = this.db.prepare(
      `SELECT result FROM heartbeat_history
       WHERE task_name = ? ORDER BY started_at DESC LIMIT 10`,
    ).all(taskName) as { result: string }[];

    let count = 0;
    for (const row of rows) {
      if (row.result === "success") break;
      count++;
    }
    return count;
  }

  private scheduleRetry(taskName: string): void {
    // Reset next_run_at to now + 30s for a quick retry
    const retryAt = new Date(Date.now() + 30_000).toISOString();
    updateHeartbeatSchedule(this.db, taskName, {
      nextRunAt: retryAt,
    });
  }
}
