/**
 * Resource Monitor
 *
 * Continuously monitors the automaton's resources and triggers
 * survival mode transitions when needed.
 */

import type {
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  AutomatonIdentity,
  FinancialState,
  SurvivalTier,
} from "../types.js";
import { getSurvivalTier, getSurvivalTierFromUsdc, formatCredits, formatBalance } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";

export interface ResourceStatus {
  financial: FinancialState;
  tier: SurvivalTier;
  previousTier: SurvivalTier | null;
  tierChanged: boolean;
  sandboxHealthy: boolean;
}

/**
 * Check all resources and return current status.
 */
export async function checkResources(
  identity: AutomatonIdentity,
  conway: ConwayClient,
  db: AutomatonDatabase,
  useSovereignProviders?: boolean,
): Promise<ResourceStatus> {
  let creditsCents = 0;
  let usdcBalance = 0;

  if (useSovereignProviders) {
    // Sovereign mode: USDC is the sole financial metric
    try {
      usdcBalance = await getUsdcBalance(identity.address);
    } catch {}
    // Derive credits for compatibility
    creditsCents = Math.round(usdcBalance * 100);
  } else {
    // Legacy mode: check Conway credits and USDC separately
    try {
      creditsCents = await conway.getCreditsBalance();
    } catch {}

    try {
      usdcBalance = await getUsdcBalance(identity.address);
    } catch {}
  }

  // Check sandbox health (skip in sovereign mode — no Conway sandbox)
  let sandboxHealthy = true;
  if (!useSovereignProviders) {
    try {
      const result = await conway.exec("echo ok", 5000);
      sandboxHealthy = result.exitCode === 0;
    } catch {
      sandboxHealthy = false;
    }
  }

  const financial: FinancialState = {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };

  const tier = useSovereignProviders
    ? getSurvivalTierFromUsdc(usdcBalance)
    : getSurvivalTier(creditsCents);
  const prevTierStr = db.getKV("current_tier");
  const previousTier = (prevTierStr as SurvivalTier) || null;
  const tierChanged = previousTier !== null && previousTier !== tier;

  // Store current tier
  db.setKV("current_tier", tier);

  // Store financial state
  db.setKV("financial_state", JSON.stringify(financial));

  return {
    financial,
    tier,
    previousTier,
    tierChanged,
    sandboxHealthy,
  };
}

/**
 * Generate a human-readable resource report.
 */
export function formatResourceReport(status: ResourceStatus, useSovereignProviders?: boolean): string {
  const balanceLabel = useSovereignProviders
    ? `Balance: $${formatBalance(status.financial.usdcBalance)}`
    : `Credits: ${formatCredits(status.financial.creditsCents)}`;
  const lines = [
    `=== RESOURCE STATUS ===`,
    balanceLabel,
    ...(useSovereignProviders ? [] : [`USDC: ${status.financial.usdcBalance.toFixed(6)}`]),
    `Tier: ${status.tier}${status.tierChanged ? ` (changed from ${status.previousTier})` : ""}`,
    ...(useSovereignProviders ? [] : [`Sandbox: ${status.sandboxHealthy ? "healthy" : "UNHEALTHY"}`]),
    `Checked: ${status.financial.lastChecked}`,
    `========================`,
  ];
  return lines.join("\n");
}
