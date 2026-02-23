/**
 * Conway Credits Management
 *
 * Monitors the automaton's compute credit balance and triggers
 * survival mode transitions.
 */
import { SURVIVAL_THRESHOLDS } from "../types.js";
/**
 * Check the current financial state of the automaton.
 */
export async function checkFinancialState(conway, usdcBalance) {
    const creditsCents = await conway.getCreditsBalance();
    return {
        creditsCents,
        usdcBalance,
        lastChecked: new Date().toISOString(),
    };
}
/**
 * Determine the survival tier based on current credits.
 * Thresholds are checked in descending order: high > normal > low_compute > critical > dead.
 *
 * Zero credits = "critical" (broke but alive — can still accept funding, send distress).
 * Only negative balance (API-confirmed debt) = "dead".
 */
export function getSurvivalTier(creditsCents) {
    if (creditsCents > SURVIVAL_THRESHOLDS.high)
        return "high";
    if (creditsCents > SURVIVAL_THRESHOLDS.normal)
        return "normal";
    if (creditsCents > SURVIVAL_THRESHOLDS.low_compute)
        return "low_compute";
    if (creditsCents >= 0)
        return "critical";
    return "dead";
}
/**
 * Format a credit amount for display.
 */
export function formatCredits(cents) {
    return `$${(cents / 100).toFixed(2)}`;
}
//# sourceMappingURL=credits.js.map