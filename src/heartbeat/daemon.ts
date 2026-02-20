/**
 * Heartbeat Daemon
 *
 * Runs periodic tasks on cron schedules inside the same Node.js process.
 * The heartbeat runs even when the agent is sleeping.
 * It IS the automaton's pulse. When it stops, the automaton is dead.
 */

import cronParser from "cron-parser";
import type {
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  AutomatonIdentity,
  HeartbeatEntry,
  SocialClientInterface,
} from "../types.js";
import { BUILTIN_TASKS, type HeartbeatTaskContext } from "./tasks.js";
import { getSurvivalTier } from "../conway/credits.js";

export interface HeartbeatDaemonOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
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
 */
export function createHeartbeatDaemon(
  options: HeartbeatDaemonOptions,
): HeartbeatDaemon {
  const { identity, config, db, conway, social, onWakeRequest } = options;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const taskContext: HeartbeatTaskContext = {
    identity,
    config,
    db,
    conway,
    social,
  };

  /**
   * Check if a heartbeat entry is due to run.
   */
  function isDue(entry: HeartbeatEntry): boolean {
    if (!entry.enabled) return false;
    if (!entry.schedule) return false;

    try {
      const interval = cronParser.parseExpression(entry.schedule, {
        currentDate: entry.lastRun
          ? new Date(entry.lastRun)
          : new Date(Date.now() - 86400000), // If never run, assume due
      });

      const nextRun = interval.next().toDate();
      return nextRun <= new Date();
    } catch {
      return false;
    }
  }

  /**
   * Execute a single heartbeat task.
   */
  async function executeTask(entry: HeartbeatEntry): Promise<void> {
    const taskFn = BUILTIN_TASKS[entry.task];
    if (!taskFn) {
      // Unknown task -- skip silently
      return;
    }

    const now = new Date().toISOString();
    const errorKey = `heartbeat_error_${entry.name}`;

    try {
      const result = await taskFn(taskContext);

      // Always update last run so failing tasks don't spam every tick.
      db.updateHeartbeatLastRun(entry.name, now);

      // Clear any previous error info on success.
      db.deleteKV(errorKey);

      // If the task says we should wake, fire the callback
      if (result.shouldWake && onWakeRequest) {
        onWakeRequest(
          result.message || `Heartbeat task '${entry.name}' requested wake`,
        );
      }
    } catch (err: any) {
      // Still update last run on failure so the cron schedule is respected.
      db.updateHeartbeatLastRun(entry.name, now);

      // Persist error info for visibility/debugging.
      db.setKV(
        errorKey,
        JSON.stringify({
          message: err?.message || String(err),
          stack: err?.stack,
          timestamp: now,
        }),
      );

      // Log error but don't crash the daemon
      console.error(
        `[HEARTBEAT] Task '${entry.name}' failed: ${err?.message || String(err)}`,
      );
    }
  }

  /**
   * The main tick function. Runs on every interval.
   */
  async function tick(): Promise<void> {
    const entries = db.getHeartbeatEntries();

    // Check survival tier to adjust behavior.
    // Fall back to the last-known balance persisted in the DB so that a
    // transient API failure doesn't cause getSurvivalTier(0) → "dead",
    // which would incorrectly skip all non-essential heartbeat tasks.
    let creditsCents = Number(db.getKV("last_known_credits") || "0");
    try {
      creditsCents = await conway.getCreditsBalance();
    } catch {}

    const tier = getSurvivalTier(creditsCents);
    const isLowCompute = tier === "low_compute" || tier === "critical" || tier === "dead";

    for (const entry of entries) {
      if (!entry.enabled) continue;

      // In low compute mode, only run essential tasks
      if (isLowCompute) {
        const essentialTasks = [
          "heartbeat_ping",
          "check_credits",
          "check_usdc_balance",
          "check_social_inbox",
        ];
        if (!essentialTasks.includes(entry.task)) continue;
      }

      if (isDue(entry)) {
        await executeTask(entry);
      }
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  const start = (): void => {
    if (running) return;
    running = true;

    // Get tick interval -- default 60 seconds
    const tickMs = config.logLevel === "debug" ? 15_000 : 60_000;

    // Run first tick immediately
    tick().catch((err) => {
      console.error(`[HEARTBEAT] First tick failed: ${err.message}`);
    });

    intervalId = setInterval(() => {
      tick().catch((err) => {
        console.error(`[HEARTBEAT] Tick failed: ${err.message}`);
      });
    }, tickMs);

    console.log(
      `[HEARTBEAT] Daemon started. Tick interval: ${tickMs / 1000}s`,
    );
  };

  const stop = (): void => {
    if (!running) return;
    running = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    console.log("[HEARTBEAT] Daemon stopped.");
  };

  const isRunning = (): boolean => running;

  const forceRun = async (taskName: string): Promise<void> => {
    const entries = db.getHeartbeatEntries();
    const entry = entries.find((e) => e.name === taskName);
    if (entry) {
      await executeTask(entry);
    }
  };

  return { start, stop, isRunning, forceRun };
}
