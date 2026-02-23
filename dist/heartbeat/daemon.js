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
import { BUILTIN_TASKS } from "./tasks.js";
import { DurableScheduler } from "./scheduler.js";
import { upsertHeartbeatSchedule } from "../state/database.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("heartbeat");
/**
 * Create and return the heartbeat daemon.
 *
 * Uses DurableScheduler backed by the DB instead of setInterval.
 * Tick interval comes from heartbeatConfig.defaultIntervalMs.
 */
export function createHeartbeatDaemon(options) {
    const { identity, config, heartbeatConfig, db, rawDb, conway, social, onWakeRequest } = options;
    let timeoutId = null;
    let running = false;
    const legacyContext = {
        identity,
        config,
        db,
        conway,
        social,
    };
    // Build task map from BUILTIN_TASKS
    const taskMap = new Map();
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
    const scheduler = new DurableScheduler(rawDb, heartbeatConfig, taskMap, legacyContext, onWakeRequest);
    // Tick interval from config (not log level)
    const tickMs = heartbeatConfig.defaultIntervalMs ?? 60_000;
    /**
     * Recursive setTimeout loop for overlap protection.
     * Each tick must complete before the next is scheduled.
     */
    function scheduleTick() {
        if (!running)
            return;
        timeoutId = setTimeout(async () => {
            try {
                await scheduler.tick();
            }
            catch (err) {
                logger.error("Tick failed", err instanceof Error ? err : undefined);
            }
            scheduleTick();
        }, tickMs);
    }
    // ─── Public API ──────────────────────────────────────────────
    const start = () => {
        if (running)
            return;
        running = true;
        // Run first tick immediately
        scheduler.tick().catch((err) => {
            logger.error("First tick failed", err instanceof Error ? err : undefined);
        });
        // Schedule subsequent ticks
        scheduleTick();
        logger.info(`Daemon started. Tick interval: ${tickMs / 1000}s (from config)`);
    };
    const stop = () => {
        if (!running)
            return;
        running = false;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        logger.info("Daemon stopped.");
    };
    const isRunning = () => running;
    const forceRun = async (taskName) => {
        const context = await import("./tick-context.js").then((m) => m.buildTickContext(rawDb, conway, heartbeatConfig, identity.address));
        await scheduler.executeTask(taskName, context);
    };
    return { start, stop, isRunning, forceRun };
}
//# sourceMappingURL=daemon.js.map