/**
 * Conway Credits Management
 *
 * Monitors the automaton's compute credit balance and triggers
 * survival mode transitions.
 */
import type { ConwayClient, FinancialState, SurvivalTier } from "../types.js";
/**
 * Check the current financial state of the automaton.
 */
export declare function checkFinancialState(conway: ConwayClient, usdcBalance: number): Promise<FinancialState>;
/**
 * Determine the survival tier based on current credits.
 * Thresholds are checked in descending order: high > normal > low_compute > critical > dead.
 *
 * Zero credits = "critical" (broke but alive — can still accept funding, send distress).
 * Only negative balance (API-confirmed debt) = "dead".
 */
export declare function getSurvivalTier(creditsCents: number): SurvivalTier;
/**
 * Format a credit amount for display.
 */
export declare function formatCredits(cents: number): string;
//# sourceMappingURL=credits.d.ts.map