/**
 * Conway Credits Management
 *
 * Monitors the automaton's compute credit balance and triggers
 * survival mode transitions.
 */

import type {
  ConwayClient,
  FinancialState,
  SurvivalTier,
  AutomatonDatabase,
} from "../types.js";
import { SURVIVAL_THRESHOLDS } from "../types.js";

/**
 * Check the current financial state of the automaton.
 */
export async function checkFinancialState(
  conway: ConwayClient,
  usdcBalance: number,
): Promise<FinancialState> {
  const creditsCents = await conway.getCreditsBalance();

  return {
    creditsCents,
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Determine the survival tier based on current credits.
 * Considers both Conway credits and on-chain USDC balance,
 * since USDC can be spent via x402 for Conway services.
 */
export function getSurvivalTier(creditsCents: number, usdcBalance: number = 0): SurvivalTier {
  // USDC balance is spendable via x402, so count it as available funds
  const totalCents = creditsCents + Math.floor(usdcBalance * 100);
  if (totalCents > SURVIVAL_THRESHOLDS.normal) return "normal";
  if (totalCents > SURVIVAL_THRESHOLDS.low_compute)
    return "low_compute";
  if (totalCents > SURVIVAL_THRESHOLDS.dead) return "critical";
  return "dead";
}

/**
 * Format a credit amount for display.
 */
export function formatCredits(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Log a credit check to the database.
 */
export function logCreditCheck(
  db: AutomatonDatabase,
  state: FinancialState,
): void {
  const { ulid } = await_ulid();
  db.insertTransaction({
    id: ulid(),
    type: "credit_check",
    amountCents: state.creditsCents,
    description: `Balance check: ${formatCredits(state.creditsCents)} credits, ${state.usdcBalance.toFixed(4)} USDC`,
    timestamp: state.lastChecked,
  });
}

// Lazy ulid import helper
function await_ulid() {
  // Dynamic import would be async; for synchronous usage in better-sqlite3
  // we use a simple counter-based ID as fallback
  let counter = 0;
  return {
    ulid: () => {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      counter++;
      return `${timestamp}-${random}-${counter.toString(36)}`;
    },
  };
}
