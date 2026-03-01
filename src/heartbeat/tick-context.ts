/**
 * Tick Context
 *
 * Builds a shared context for each heartbeat tick.
 * Fetches balance ONCE per tick, derives survival tier,
 * and shares across all tasks to avoid redundant API calls.
 *
 * Supports both legacy Conway credits and sovereign USDC mode.
 */

import type BetterSqlite3 from "better-sqlite3";
import type { Address } from "viem";
import type {
  ConwayClient,
  HeartbeatConfig,
  TickContext,
} from "../types.js";
import { getSurvivalTier, getSurvivalTierFromUsdc } from "../conway/credits.js";
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
 * - In sovereign mode: fetches USDC balance ONLY, derives tier from USDC
 * - In legacy mode: fetches both credits and USDC, derives tier from credits
 * - Reads lowComputeMultiplier from config
 */
export async function buildTickContext(
  db: DatabaseType,
  conway: ConwayClient,
  config: HeartbeatConfig,
  walletAddress?: Address,
  useSovereignProviders?: boolean,
): Promise<TickContext> {
  const tickId = generateTickId();
  const startedAt = new Date();

  let creditBalance = 0;
  let usdcBalance = 0;

  if (useSovereignProviders) {
    // Sovereign mode: USDC is the sole financial metric
    if (walletAddress) {
      try {
        usdcBalance = await getUsdcBalance(walletAddress);
      } catch (err: any) {
        logger.error("Failed to fetch USDC balance", err instanceof Error ? err : undefined);
      }
    }
    // Convert USDC to cents for creditBalance compatibility
    creditBalance = Math.round(usdcBalance * 100);
  } else {
    // Legacy mode: fetch both
    try {
      creditBalance = await conway.getCreditsBalance();
    } catch (err: any) {
      logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);
    }

    if (walletAddress) {
      try {
        usdcBalance = await getUsdcBalance(walletAddress);
      } catch (err: any) {
        logger.error("Failed to fetch USDC balance", err instanceof Error ? err : undefined);
      }
    }
  }

  const survivalTier = useSovereignProviders
    ? getSurvivalTierFromUsdc(usdcBalance)
    : getSurvivalTier(creditBalance);
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
