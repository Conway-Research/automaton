/**
 * Credit Topup via x402
 *
 * Converts USDC to Conway credits via the x402 payment protocol.
 *
 * - On startup: bootstraps with the minimum tier ($5) so the agent can run.
 * - At runtime: the agent uses the `topup_credits` tool to choose how much.
 * - Heartbeat: wakes the agent when USDC is available but credits are low.
 *
 * Endpoint: GET /pay/{amountUsd}/{walletAddress}
 * Payment: x402 (USDC on Base, signed TransferWithAuthorization)
 *
 * Valid tiers: 5, 25, 100, 500, 1000, 2500 (USD)
 */
import { x402Fetch, getUsdcBalance } from "./x402.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("topup");
/** Valid topup tier amounts in USD. */
export const TOPUP_TIERS = [5, 25, 100, 500, 1000, 2500];
/**
 * Execute a credit topup via x402 payment.
 *
 * Calls GET /pay/{amountUsd}/{address} which returns HTTP 402.
 * x402Fetch handles the payment signing and retry automatically.
 */
export async function topupCredits(apiUrl, account, amountUsd, recipientAddress) {
    const address = recipientAddress || account.address;
    const url = `${apiUrl}/pay/${amountUsd}/${address}`;
    logger.info(`Attempting credit topup: $${amountUsd} USD for ${address}`);
    const result = await x402Fetch(url, account, "GET");
    if (!result.success) {
        logger.error(`Credit topup failed: ${result.error}`);
        return {
            success: false,
            amountUsd,
            error: result.error || `HTTP ${result.status}`,
        };
    }
    const creditsCentsAdded = typeof result.response === "object"
        ? result.response?.credits_cents ?? result.response?.amount_cents ?? amountUsd * 100
        : amountUsd * 100;
    logger.info(`Credit topup successful: $${amountUsd} USD → ${creditsCentsAdded} credits cents`);
    return {
        success: true,
        amountUsd,
        creditsCentsAdded,
    };
}
/**
 * Bootstrap topup: buy the minimum tier ($5) on startup so the agent
 * can run inference. The agent decides larger topups itself via the
 * `topup_credits` tool.
 *
 * Only triggers when credits are below threshold AND USDC covers the
 * minimum tier.
 */
export async function bootstrapTopup(params) {
    const { apiUrl, account, creditsCents, creditThresholdCents = 500 } = params;
    if (creditsCents >= creditThresholdCents) {
        return null;
    }
    let usdcBalance;
    try {
        usdcBalance = await getUsdcBalance(account.address);
    }
    catch (err) {
        logger.warn(`Failed to check USDC balance for bootstrap topup: ${err.message}`);
        return null;
    }
    const minTier = TOPUP_TIERS[0];
    if (usdcBalance < minTier) {
        logger.info(`Bootstrap topup skipped: USDC balance $${usdcBalance.toFixed(2)} below minimum tier ($${minTier})`);
        return null;
    }
    logger.info(`Bootstrap topup: credits=$${(creditsCents / 100).toFixed(2)}, USDC=$${usdcBalance.toFixed(2)}, buying $${minTier}`);
    return topupCredits(apiUrl, account, minTier);
}
//# sourceMappingURL=topup.js.map