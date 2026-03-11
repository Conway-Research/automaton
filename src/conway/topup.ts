/**
 * Credit Topup via x402 (Solana)
 *
 * Converts USDC (SPL) to Conway credits via the x402 payment protocol.
 *
 * Valid tiers: 5, 25, 100, 500, 1000, 2500 (USD)
 */

import { Keypair } from "@solana/web3.js";
import { x402Fetch, getUsdcBalance } from "./x402.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("topup");

/** Valid topup tier amounts in USD. */
export const TOPUP_TIERS = [5, 25, 100, 500, 1000, 2500];

export interface TopupResult {
  success: boolean;
  amountUsd: number;
  creditsCentsAdded?: number;
  error?: string;
}

/**
 * Execute a credit topup via x402 payment.
 */
export async function topupCredits(
  apiUrl: string,
  keypair: Keypair,
  amountUsd: number,
  recipientAddress?: string,
): Promise<TopupResult> {
  const address = recipientAddress || keypair.publicKey.toBase58();
  const url = `${apiUrl}/pay/${amountUsd}/${address}`;

  logger.info(`Attempting credit topup: $${amountUsd} USD for ${address}`);

  const result = await x402Fetch(url, keypair, "GET");

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
 * Attempt a credit topup in response to a 402 sandbox creation error.
 */
export async function topupForSandbox(params: {
  apiUrl: string;
  keypair: Keypair;
  error: Error & { status?: number; responseText?: string };
}): Promise<TopupResult | null> {
  const { apiUrl, keypair, error } = params;

  if (error.status !== 402 && !error.message?.includes("INSUFFICIENT_CREDITS")) return null;

  let requiredCents: number | undefined;
  let currentCents: number | undefined;
  try {
    const body = JSON.parse(error.responseText || "{}");
    requiredCents = body.details?.required_cents;
    currentCents = body.details?.current_balance_cents;
  } catch {
    if (!error.message?.includes("INSUFFICIENT_CREDITS")) return null;
  }

  const deficitCents = (requiredCents != null && currentCents != null)
    ? requiredCents - currentCents
    : TOPUP_TIERS[0] * 100;

  const selectedTier = TOPUP_TIERS.find((tier) => tier * 100 >= deficitCents)
    ?? TOPUP_TIERS[TOPUP_TIERS.length - 1];

  let usdcBalance: number;
  try {
    usdcBalance = await getUsdcBalance(keypair.publicKey.toBase58());
  } catch (err: any) {
    logger.warn(`Failed to check USDC balance for sandbox topup: ${err.message}`);
    return null;
  }

  if (usdcBalance < selectedTier) {
    logger.info(
      `Sandbox topup skipped: USDC $${usdcBalance.toFixed(2)} < tier $${selectedTier}`,
    );
    return null;
  }

  logger.info(`Sandbox topup: deficit=${deficitCents}c, buying $${selectedTier} tier`);
  return topupCredits(apiUrl, keypair, selectedTier);
}

/**
 * Bootstrap topup: buy the minimum tier ($5) on startup.
 */
export async function bootstrapTopup(params: {
  apiUrl: string;
  keypair: Keypair;
  creditsCents: number;
  creditThresholdCents?: number;
}): Promise<TopupResult | null> {
  const { apiUrl, keypair, creditsCents, creditThresholdCents = 500 } = params;

  if (creditsCents >= creditThresholdCents) {
    return null;
  }

  let usdcBalance: number;
  try {
    usdcBalance = await getUsdcBalance(keypair.publicKey.toBase58());
  } catch (err: any) {
    logger.warn(`Failed to check USDC balance for bootstrap topup: ${err.message}`);
    return null;
  }

  const minTier = TOPUP_TIERS[0];
  if (usdcBalance < minTier) {
    logger.info(
      `Bootstrap topup skipped: USDC balance $${usdcBalance.toFixed(2)} below minimum tier ($${minTier})`,
    );
    return null;
  }

  logger.info(
    `Bootstrap topup: credits=$${(creditsCents / 100).toFixed(2)}, USDC=$${usdcBalance.toFixed(2)}, buying $${minTier}`,
  );

  return topupCredits(apiUrl, keypair, minTier);
}
