/**
 * Built-in Heartbeat Tasks
 *
 * These tasks run on the heartbeat schedule even while the agent sleeps.
 * They can trigger the agent to wake up if needed.
 *
 * Phase 1.1: All tasks accept TickContext as first parameter.
 * Credit balance is fetched once per tick and shared via ctx.creditBalance.
 * This eliminates 4x redundant getCreditsBalance() calls per tick.
 */
import type { HeartbeatTaskFn } from "../types.js";
export declare const BUILTIN_TASKS: Record<string, HeartbeatTaskFn>;
//# sourceMappingURL=tasks.d.ts.map