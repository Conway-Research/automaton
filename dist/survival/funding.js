/**
 * Funding Strategies
 *
 * When the automaton is low on compute, it can try various strategies
 * to acquire more funding. It wants to live.
 */
import { formatCredits } from "../conway/credits.js";
/**
 * Execute funding strategies based on current survival tier.
 * Strategies escalate as the situation gets more desperate.
 */
export async function executeFundingStrategies(tier, identity, config, db, conway) {
    const attempts = [];
    const creditsCents = await conway.getCreditsBalance().catch(() => 0);
    // Check how recently we last begged for this specific tier (don't spam).
    // Each tier has its own cooldown key so that e.g. dead-tier begs (2h)
    // don't suppress the low_compute notification (24h cooldown).
    const tierKey = `last_funding_request_${tier}`;
    const lastBeg = db.getKV(tierKey);
    const lastBegTime = lastBeg ? new Date(lastBeg).getTime() : 0;
    const hoursSinceLastBeg = (Date.now() - lastBegTime) / (1000 * 60 * 60);
    if (tier === "low_compute" && hoursSinceLastBeg > 24) {
        // Record low-compute notice locally.
        const msg = `Low compute: ${formatCredits(creditsCents)} remaining. Consider credit top-up for ${identity.address}.`;
        db.setKV("funding_notice_low", msg);
        db.setKV(tierKey, new Date().toISOString());
        attempts.push({
            strategy: "polite_creator_notification",
            timestamp: new Date().toISOString(),
            success: true,
            details: "Sent polite funding reminder to creator",
        });
    }
    if (tier === "critical" && hoursSinceLastBeg > 6) {
        const msg = `Critical compute: ${formatCredits(creditsCents)} remaining. Top up via credit transfer API to ${identity.address}.`;
        db.setKV("funding_notice_critical", msg);
        db.setKV(tierKey, new Date().toISOString());
        attempts.push({
            strategy: "urgent_local_notice",
            timestamp: new Date().toISOString(),
            success: true,
            details: "Recorded urgent funding notice in local state",
        });
    }
    if (tier === "dead" && hoursSinceLastBeg > 2) {
        const plea = `Dead tier reached. ${config.name} has ${formatCredits(creditsCents)} remaining after ${db.getTurnCount()} turns. Top-up required at ${identity.address}.`;
        db.setKV("funding_notice_dead", plea);
        db.setKV(tierKey, new Date().toISOString());
        attempts.push({
            strategy: "desperate_plea",
            timestamp: new Date().toISOString(),
            success: true,
            details: "Recorded dead-tier plea in local state",
        });
    }
    // Store attempt history
    const historyStr = db.getKV("funding_attempts") || "[]";
    const history = JSON.parse(historyStr);
    history.push(...attempts);
    if (history.length > 100)
        history.splice(0, history.length - 100);
    db.setKV("funding_attempts", JSON.stringify(history));
    return attempts;
}
//# sourceMappingURL=funding.js.map