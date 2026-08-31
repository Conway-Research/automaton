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
  sandboxHealthy: boolean;
  diagnostics: ResourceDiagnostics;
}

export interface ResourceDiagnostics {
  creditsError?: string;
  usdcError?: string;
  sandboxError?: string;
}

/**
 * Check all resources and return current status.
 */
export async function checkResources(
  identity: AutomatonIdentity,
  conway: ConwayClient,
  db: AutomatonDatabase,
): Promise<ResourceStatus> {
  const diagnostics: ResourceDiagnostics = {};

  // Check credits
  let creditsCents = 0;
  try {
    creditsCents = await conway.getCreditsBalance();
  } catch (error) {
    diagnostics.creditsError = toDiagnosticMessage(error);
  }

  // Check USDC
  let usdcBalance = 0;
  try {
    usdcBalance = await getUsdcBalance(identity.address);
  } catch (error) {
    diagnostics.usdcError = toDiagnosticMessage(error);
  }

  // Check sandbox health
  let sandboxHealthy = true;
  try {
    const result = await conway.exec("echo ok", 5000);
    sandboxHealthy = result.exitCode === 0;
    if (!sandboxHealthy) {
      diagnostics.sandboxError = `health command exited ${result.exitCode}`;
    }
  } catch (error) {
    sandboxHealthy = false;
    diagnostics.sandboxError = toDiagnosticMessage(error);
  }

  const financial: FinancialState = {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };

  const tier = getSurvivalTier(creditsCents);
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
    diagnostics,
  };
}

/**
 * Generate a human-readable resource report.
 */
export function formatResourceReport(status: ResourceStatus): string {
  const diagnostics = status.diagnostics || {};
  const creditsLine = diagnostics.creditsError
    ? `Credits: unknown (${diagnostics.creditsError})`
    : `Credits: ${formatCredits(status.financial.creditsCents)}`;
  const usdcLine = diagnostics.usdcError
    ? `USDC: unknown (${diagnostics.usdcError})`
    : `USDC: ${status.financial.usdcBalance.toFixed(6)}`;
  const sandboxLine = diagnostics.sandboxError
    ? `Sandbox: UNHEALTHY (${diagnostics.sandboxError})`
    : `Sandbox: ${status.sandboxHealthy ? "healthy" : "UNHEALTHY"}`;

  const lines = [
    `=== RESOURCE STATUS ===`,
    creditsLine,
    usdcLine,
    `Tier: ${status.tier}${status.tierChanged ? ` (changed from ${status.previousTier})` : ""}`,
    sandboxLine,
    `Checked: ${status.financial.lastChecked}`,
    `========================`,
  ];
  return lines.join("\n");
}

function toDiagnosticMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown error";
}
