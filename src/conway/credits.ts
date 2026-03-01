/**
 * Financial State Management
 *
 * Monitors the automaton's financial state and triggers
 * survival mode transitions.
 *
 * Supports both legacy Conway credits and sovereign USDC mode.
 * When useSovereignProviders is true, USDC balance is the sole metric.
 */

import type {
  ConwayClient,
  FinancialState,
  SurvivalTier,
} from "../types.js";
import { SURVIVAL_THRESHOLDS, USDC_SURVIVAL_THRESHOLDS } from "../types.js";

/**
 * Check the current financial state of the automaton.
 * @deprecated In sovereign mode, use getFinancialStateFromUsdc() instead.
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
 * Build a financial state purely from USDC balance (sovereign mode).
 * No Conway API calls required.
 */
export function getFinancialStateFromUsdc(usdcBalance: number): FinancialState {
  return {
    creditsCents: Math.round(usdcBalance * 100), // Convert USD to cents for compatibility
    usdcBalance,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Determine the survival tier based on current credits (legacy).
 * Thresholds are checked in descending order: high > normal > low_compute > critical > dead.
 *
 * Zero credits = "critical" (broke but alive — can still accept funding, send distress).
 * Only negative balance (API-confirmed debt) = "dead".
 */
export function getSurvivalTier(creditsCents: number): SurvivalTier {
  if (creditsCents > SURVIVAL_THRESHOLDS.high) return "high";
  if (creditsCents > SURVIVAL_THRESHOLDS.normal) return "normal";
  if (creditsCents > SURVIVAL_THRESHOLDS.low_compute) return "low_compute";
  if (creditsCents >= 0) return "critical";
  return "dead";
}

/**
 * Determine the survival tier based on USDC balance (sovereign mode).
 * Thresholds are in USD, not cents.
 */
export function getSurvivalTierFromUsdc(usdcBalance: number): SurvivalTier {
  if (usdcBalance > USDC_SURVIVAL_THRESHOLDS.high) return "high";
  if (usdcBalance > USDC_SURVIVAL_THRESHOLDS.normal) return "normal";
  if (usdcBalance > USDC_SURVIVAL_THRESHOLDS.low_compute) return "low_compute";
  if (usdcBalance >= 0) return "critical";
  return "dead";
}

/**
 * Format a balance for display.
 */
export function formatBalance(usdcBalance: number): string {
  return `$${usdcBalance.toFixed(2)}`;
}

/**
 * Format a credit amount for display (legacy).
 */
export function formatCredits(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
