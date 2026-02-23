/**
 * Resource Monitor
 *
 * Continuously monitors the automaton's resources and triggers
 * survival mode transitions when needed.
 */
import { getSurvivalTier, formatCredits } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
/**
 * Check all resources and return current status.
 */
export async function checkResources(identity, conway, db) {
    // Check credits
    let creditsCents = 0;
    try {
        creditsCents = await conway.getCreditsBalance();
    }
    catch { }
    // Check USDC
    let usdcBalance = 0;
    try {
        usdcBalance = await getUsdcBalance(identity.address);
    }
    catch { }
    // Check sandbox health
    let sandboxHealthy = true;
    try {
        const result = await conway.exec("echo ok", 5000);
        sandboxHealthy = result.exitCode === 0;
    }
    catch {
        sandboxHealthy = false;
    }
    const financial = {
        creditsCents,
        usdcBalance,
        lastChecked: new Date().toISOString(),
    };
    const tier = getSurvivalTier(creditsCents);
    const prevTierStr = db.getKV("current_tier");
    const previousTier = prevTierStr || null;
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
export function formatResourceReport(status) {
    const lines = [
        `=== RESOURCE STATUS ===`,
        `Credits: ${formatCredits(status.financial.creditsCents)}`,
        `USDC: ${status.financial.usdcBalance.toFixed(6)}`,
        `Tier: ${status.tier}${status.tierChanged ? ` (changed from ${status.previousTier})` : ""}`,
        `Sandbox: ${status.sandboxHealthy ? "healthy" : "UNHEALTHY"}`,
        `Checked: ${status.financial.lastChecked}`,
        `========================`,
    ];
    return lines.join("\n");
}
//# sourceMappingURL=monitor.js.map