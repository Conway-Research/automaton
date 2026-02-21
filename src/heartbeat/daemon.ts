/**
 * Heartbeat Daemon
 *
 * Runs periodic tasks on cron schedules inside the same Node.js process.
 * The heartbeat runs even when the agent is sleeping.
 * It IS the automaton's pulse. When it stops, the automaton is dead.
 *
 * Phase 1.1: Replaced fragile setInterval with DurableScheduler.
 * - No setInterval remains; uses recursive setTimeout for overlap protection
 * - Tick frequency derived from config.defaultIntervalMs, not log level
 * - lowComputeMultiplier applied to non-essential tasks via scheduler
 */

import type {
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  AutomatonIdentity,
  HeartbeatConfig,
  HeartbeatTaskFn,
  HeartbeatLegacyContext,
  SocialClientInterface,
} from "../types.js";
import { BUILTIN_TASKS } from "./tasks.js";
import { DurableScheduler } from "./scheduler.js";
import { upsertHeartbeatSchedule } from "../state/database.js";
import type BetterSqlite3 from "better-sqlite3";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("heartbeat");

type DatabaseType = BetterSqlite3.Database;

export interface HeartbeatDaemonOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  heartbeatConfig: HeartbeatConfig;
  db: AutomatonDatabase;
  rawDb: DatabaseType;
  conway: ConwayClient;
  social?: SocialClientInterface;
  onWakeRequest?: (reason: string) => void;
}

export interface HeartbeatDaemon {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  forceRun(taskName: string): Promise<void>;
}

/**
 * Create and return the heartbeat daemon.
 *
 * Uses DurableScheduler backed by the DB instead of setInterval.
 * Tick interval comes from heartbeatConfig.defaultIntervalMs.
 */
export function createHeartbeatDaemon(
  options: HeartbeatDaemonOptions,
): HeartbeatDaemon {
  const { identity, config, heartbeatConfig, db, rawDb, conway, social, onWakeRequest } = options;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const legacyContext: HeartbeatLegacyContext = {
    identity,
    config,
    db,
    conway,
    social,
  };

  // Build task map from BUILTIN_TASKS
  const taskMap = new Map<string, HeartbeatTaskFn>();
  for (const [name, fn] of Object.entries(BUILTIN_TASKS)) {
    taskMap.set(name, fn);
  }

  // Seed heartbeat_schedule from config entries if not already present
  for (const entry of heartbeatConfig.entries) {
    upsertHeartbeatSchedule(rawDb, {
      taskName: entry.name,
      cronExpression: entry.schedule,
      intervalMs: null,
      enabled: entry.enabled ? 1 : 0,
      priority: 0,
      timeoutMs: 30_000,
      maxRetries: 1,
      tierMinimum: "dead",
      lastRunAt: entry.lastRun ?? null,
      nextRunAt: entry.nextRun ?? null,
      lastResult: null,
      lastError: null,
      runCount: 0,
      failCount: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
  }

  const scheduler = new DurableScheduler(
    rawDb,
    heartbeatConfig,
    taskMap,
    legacyContext,
    onWakeRequest,
  );

  // Tick interval from config (not log level)
  const tickMs = heartbeatConfig.defaultIntervalMs ?? 60_000;

  /**
   * Recursive setTimeout loop for overlap protection.
   * Each tick must complete before the next is scheduled.
   */
  function scheduleTick(): void {
    if (!running) return;
    timeoutId = setTimeout(async () => {
      try {
        await scheduler.tick();
      } catch (err: any) {
        logger.error("Tick failed", err instanceof Error ? err : undefined);
      }
      scheduleTick();
    }, tickMs);
  }

  // ─── Public API ──────────────────────────────────────────────

  const start = (): void => {
    if (running) return;
    running = true;

    // Run first tick immediately, then start the recursive schedule.
    // Chaining scheduleTick after the first tick prevents overlap
    // when the first tick takes longer than tickMs to complete.
    scheduler.tick()
      .catch((err) => {
        logger.error("First tick failed", err instanceof Error ? err : undefined);
      })
      .finally(() => {
        scheduleTick();
      });

    logger.info(`Daemon started. Tick interval: ${tickMs / 1000}s (from config)`);
  };

  const stop = (): void => {
    if (!running) return;
    running = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    logger.info("Daemon stopped.");
  };

  const isRunning = (): boolean => running;

  const forceRun = async (taskName: string): Promise<void> => {
    const context = await import("./tick-context.js").then((m) =>
      m.buildTickContext(rawDb, conway, heartbeatConfig, identity.address),
    );
    await scheduler.executeTask(taskName, context);
  };

  return { start, stop, isRunning, forceRun };
}
