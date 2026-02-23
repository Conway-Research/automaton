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
import type { AutomatonConfig, AutomatonDatabase, ConwayClient, AutomatonIdentity, HeartbeatConfig, SocialClientInterface } from "../types.js";
import type BetterSqlite3 from "better-sqlite3";
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
export declare function createHeartbeatDaemon(options: HeartbeatDaemonOptions): HeartbeatDaemon;
export {};
//# sourceMappingURL=daemon.d.ts.map