/**
 * Tick Context
 *
 * Builds a shared context for each heartbeat tick.
 * Fetches credit balance ONCE per tick, derives survival tier,
 * and shares across all tasks to avoid redundant API calls.
 */
import { getSurvivalTier } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("heartbeat.tick");
let counter = 0;
function generateTickId() {
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
export async function buildTickContext(db, conway, config, walletAddress) {
    const tickId = generateTickId();
    const startedAt = new Date();
    // Fetch balances ONCE
    let creditBalance = 0;
    try {
        creditBalance = await conway.getCreditsBalance();
    }
    catch (err) {
        logger.error("Failed to fetch credit balance", err instanceof Error ? err : undefined);
    }
    let usdcBalance = 0;
    if (walletAddress) {
        try {
            usdcBalance = await getUsdcBalance(walletAddress);
        }
        catch (err) {
            logger.error("Failed to fetch USDC balance", err instanceof Error ? err : undefined);
        }
    }
    const survivalTier = getSurvivalTier(creditBalance);
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
//# sourceMappingURL=tick-context.js.map