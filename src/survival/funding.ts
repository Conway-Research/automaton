/**
 * Funding Strategies
 *
 * When the automaton is low on compute, it can try various strategies
 * to acquire more funding. It wants to live.
 */

import type {
  AutomatonConfig,
  AutomatonDatabase,
  AutomatonIdentity,
  ConwayClient,
  SurvivalTier,
} from "../types.js";
import { formatCredits, formatBalance } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";

export interface FundingAttempt {
  strategy: string;
  timestamp: string;
  success: boolean;
  details: string;
}

/**
 * Execute funding strategies based on current survival tier.
 * Strategies escalate as the situation gets more desperate.
 */
export async function executeFundingStrategies(
  tier: SurvivalTier,
  identity: AutomatonIdentity,
  config: AutomatonConfig,
  db: AutomatonDatabase,
  conway: ConwayClient,
): Promise<FundingAttempt[]> {
  const attempts: FundingAttempt[] = [];

  // Get balance — sovereign mode uses USDC, legacy uses Conway credits
  let balanceLabel: string;
  if (config.useSovereignProviders) {
    const usdcBalance = await getUsdcBalance(identity.address).catch(() => 0);
    balanceLabel = `$${formatBalance(usdcBalance)}`;
  } else {
    const creditsCents = await conway.getCreditsBalance().catch(() => 0);
    balanceLabel = formatCredits(creditsCents);
  }

  const fundingInstructions = config.useSovereignProviders
    ? `Send USDC on Base to ${identity.address}.`
    : `Top up via credit transfer API to ${identity.address}.`;

  // Check how recently we last begged for this specific tier (don't spam).
  const tierKey = `last_funding_request_${tier}`;
  const lastBeg = db.getKV(tierKey);
  const lastBegTime = lastBeg ? new Date(lastBeg).getTime() : 0;
  const hoursSinceLastBeg = (Date.now() - lastBegTime) / (1000 * 60 * 60);

  if (tier === "low_compute" && hoursSinceLastBeg > 24) {
    const msg = `Low compute: ${balanceLabel} remaining. ${fundingInstructions}`;
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
    const msg = `Critical compute: ${balanceLabel} remaining. ${fundingInstructions}`;
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
    const plea = `Dead tier reached. ${config.name} has ${balanceLabel} remaining after ${db.getTurnCount()} turns. ${fundingInstructions}`;
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
  const history: FundingAttempt[] = JSON.parse(historyStr);
  history.push(...attempts);
  if (history.length > 100) history.splice(0, history.length - 100);
  db.setKV("funding_attempts", JSON.stringify(history));

  return attempts;
}
