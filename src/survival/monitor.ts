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
import { getSurvivalTier, formatCredits } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";

export interface ResourceStatus {
  financial: FinancialState;
  tier: SurvivalTier;
  previousTier: SurvivalTier | null;
  tierChanged: boolean;
  /** null means Conway sandbox health is not applicable, never a health pass. */
  sandboxHealthy: boolean | null;
  creditStatus?: 'available' | 'unavailable_local' | 'unverified';
}

/**
 * Check all resources and return current status.
 */
export async function checkResources(
  identity: AutomatonIdentity,
  conway: ConwayClient,
  db: AutomatonDatabase,
): Promise<ResourceStatus> {
  // Check credits
  const local = conway.isLocal === true;
  let creditStatus: ResourceStatus['creditStatus'] = local ? 'unavailable_local' : 'unverified';
  let creditsCents = local ? -1 : 0;
  if (!local) try {
    creditsCents = await conway.getCreditsBalance();
    creditStatus = 'available';
  } catch {}

  // Check USDC
  let usdcBalance = 0;
  try {
    usdcBalance = await getUsdcBalance(identity.address);
  } catch {}

  // Check sandbox health
  let sandboxHealthy: boolean | null = local ? null : true;
  if (!local) try {
    const result = await conway.exec("echo ok", 5000);
    sandboxHealthy = result.exitCode === 0;
  } catch {
    sandboxHealthy = false;
  }

  const financial: FinancialState = {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };

  // The same conservative scheduling tier as local heartbeat ticks. This is
  // neither a capital balance nor permission to spend on direct inference.
  const tier = local ? 'low_compute' : getSurvivalTier(creditsCents);
  const prevTierStr = db.getKV("current_tier");
  const previousTier = (prevTierStr as SurvivalTier) || null;
  const tierChanged = previousTier !== null && previousTier !== tier;

  // Store current tier
  db.setKV("current_tier", tier);

  // Store financial state
  db.setKV("financial_state", JSON.stringify({...financial, creditStatus}));

  return {
    financial,
    tier,
    previousTier,
    tierChanged,
    sandboxHealthy,
    creditStatus,
  };
}

/**
 * Generate a human-readable resource report.
 */
export function formatResourceReport(status: ResourceStatus): string {
  const lines = [
    `=== RESOURCE STATUS ===`,
    `Credits: ${status.creditStatus === 'unavailable_local' ? 'unavailable in local mode' : status.creditStatus === 'unverified' ? 'unverified' : formatCredits(status.financial.creditsCents)}`,
    `USDC: ${status.financial.usdcBalance.toFixed(6)}`,
    `Tier: ${status.tier}${status.tierChanged ? ` (changed from ${status.previousTier})` : ""}`,
    `Sandbox: ${status.sandboxHealthy === null ? 'unavailable in local mode' : status.sandboxHealthy ? "healthy" : "UNHEALTHY"}`,
    `Checked: ${status.financial.lastChecked}`,
    `========================`,
  ];
  return lines.join("\n");
}
