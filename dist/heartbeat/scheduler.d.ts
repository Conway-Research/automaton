/**
 * Durable Scheduler
 *
 * DB-backed heartbeat scheduler with tick overlap guard,
 * task leases, timeouts, and retry logic.
 *
 * Replaces the fragile setInterval-based heartbeat.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { HeartbeatConfig, HeartbeatTaskFn, HeartbeatLegacyContext, HeartbeatScheduleRow, TickContext } from "../types.js";
type DatabaseType = BetterSqlite3.Database;
export declare class DurableScheduler {
    private readonly db;
    private readonly config;
    private readonly tasks;
    private readonly legacyContext;
    private readonly onWakeRequest?;
    private tickInProgress;
    private readonly ownerId;
    constructor(db: DatabaseType, config: HeartbeatConfig, tasks: Map<string, HeartbeatTaskFn>, legacyContext: HeartbeatLegacyContext, onWakeRequest?: ((reason: string) => void) | undefined);
    /**
     * Called on interval -- guards against overlap.
     */
    tick(): Promise<void>;
    /**
     * Check which tasks are due based on DB schedule.
     */
    getDueTasks(context: TickContext): HeartbeatScheduleRow[];
    /**
     * Execute a single task with timeout and lease.
     */
    executeTask(taskName: string, ctx: TickContext): Promise<void>;
    /**
     * Acquire a lease for a task.
     */
    acquireLease(taskName: string): boolean;
    /**
     * Release a lease for a task.
     */
    releaseLease(taskName: string): void;
    /**
     * Record a successful task execution.
     */
    recordSuccess(taskName: string, durationMs: number, startedAt: string): void;
    /**
     * Record a failed task execution.
     */
    recordFailure(taskName: string, error: Error, durationMs: number, startedAt: string, result?: "failure" | "timeout"): void;
    /**
     * Prune old history entries.
     */
    pruneHistory(retentionDays: number): number;
    /**
     * Prune expired dedup keys.
     */
    pruneExpiredDedupKeys(): number;
    private getRunCount;
    private getFailCount;
    private getRecentFailures;
    private scheduleRetry;
}
export {};
//# sourceMappingURL=scheduler.d.ts.map