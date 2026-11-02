/**
 * Tick Context
 *
 * Builds a shared context for each heartbeat tick.
 * Fetches credit balance ONCE per tick, derives survival tier,
 * and shares across all tasks to avoid redundant API calls.
 */

import type BetterSqlite3 from "better-sqlite3";

import type {
  ConwayClient,
  HeartbeatConfig,
  TickContext,
} from "../types.js";
import { getSurvivalTier } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
import { createLogger } from "../observability/logger.js";

type DatabaseType = BetterSqlite3.Database;
const logger = createLogger("heartbeat.tick");

let counter = 0;
function generateTickId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  counter++;
  return `${timestamp}-${random}-${counter.toString(36)}`;
}

/**
 * Build a TickContext for the current tick.
 *
 * - Generates a unique tickId
 * - Fetches credit balance ONCE via conway.getCreditsBalance()
 * - Fetches USDC balance ONCE via getUsdcBalance()
 * - Derives survivalTier from credit balance
 * - Reads lowComputeMultiplier from config
 */
export async function buildTickContext(
  db: DatabaseType,
  conway: ConwayClient,
  config: HeartbeatConfig,
  walletAddress?: string,
  chainType?: string,
): Promise<TickContext> {
  const tickId = generateTickId();
  const startedAt = new Date();

  // Fetch balances ONCE
  let creditBalance = -1;
  if (!conway.isLocal && process.env.CONWAY_API_KEY) {
    try {
      creditBalance = await conway.getCreditsBalance();
    } catch (err: any) {
      logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);
      creditBalance = -1;
    }
  }

  let usdcBalance = 0;
  if (walletAddress) {
    try {
      const network = chainType === "solana" ? "solana:mainnet" : "eip155:8453";
      usdcBalance = await getUsdcBalance(walletAddress, network, chainType as any);
    } catch (err: any) {
      logger.error("Failed to fetch USDC balance", err instanceof Error ? err : undefined);
    }
  }

  const survivalTier = creditBalance === -1 ? "low_compute" : getSurvivalTier(creditBalance);
  const lowComputeMultiplier = config.lowComputeMultiplier ?? 4;

  return {
    tickId,
    startedAt,
    creditBalance,
    usdcBalance,
    survivalTier,
    lowComputeMultiplier,
    config,
    db,
  };
}
