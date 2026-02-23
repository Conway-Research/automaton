/**
 * Tick Context
 *
 * Builds a shared context for each heartbeat tick.
 * Fetches credit balance ONCE per tick, derives survival tier,
 * and shares across all tasks to avoid redundant API calls.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { Address } from "viem";
import type { ConwayClient, HeartbeatConfig, TickContext } from "../types.js";
type DatabaseType = BetterSqlite3.Database;
/**
 * Build a TickContext for the current tick.
 *
 * - Generates a unique tickId
 * - Fetches credit balance ONCE via conway.getCreditsBalance()
 * - Fetches USDC balance ONCE via getUsdcBalance()
 * - Derives survivalTier from credit balance
 * - Reads lowComputeMultiplier from config
 */
export declare function buildTickContext(db: DatabaseType, conway: ConwayClient, config: HeartbeatConfig, walletAddress?: Address): Promise<TickContext>;
export {};
//# sourceMappingURL=tick-context.d.ts.map