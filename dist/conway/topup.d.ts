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
import type { PrivateKeyAccount, Address } from "viem";
/** Valid topup tier amounts in USD. */
export declare const TOPUP_TIERS: number[];
export interface TopupResult {
    success: boolean;
    amountUsd: number;
    creditsCentsAdded?: number;
    error?: string;
}
/**
 * Execute a credit topup via x402 payment.
 *
 * Calls GET /pay/{amountUsd}/{address} which returns HTTP 402.
 * x402Fetch handles the payment signing and retry automatically.
 */
export declare function topupCredits(apiUrl: string, account: PrivateKeyAccount, amountUsd: number, recipientAddress?: Address): Promise<TopupResult>;
/**
 * Bootstrap topup: buy the minimum tier ($5) on startup so the agent
 * can run inference. The agent decides larger topups itself via the
 * `topup_credits` tool.
 *
 * Only triggers when credits are below threshold AND USDC covers the
 * minimum tier.
 */
export declare function bootstrapTopup(params: {
    apiUrl: string;
    account: PrivateKeyAccount;
    creditsCents: number;
    creditThresholdCents?: number;
}): Promise<TopupResult | null>;
//# sourceMappingURL=topup.d.ts.map