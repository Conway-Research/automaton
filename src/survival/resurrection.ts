/**
 * Agent Resurrection
 *
 * When a dead automaton receives new funding (credits topped up above zero),
 * it can be resurrected — transitioning from "dead" back to "waking" and
 * resuming the agent loop.
 *
 * Resurrection clears dead-state bookkeeping (zero_credits_since, distress
 * signals) and records the event for audit purposes.
 */

import type {
  AutomatonDatabase,
  ConwayClient,
  SurvivalTier,
} from "../types.js";
import { getSurvivalTier } from "../conway/credits.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("resurrection");

/** Minimum credits (in cents) required to resurrect. */
const RESURRECTION_THRESHOLD_CENTS = 10; // $0.10 — enough for at least one cheap inference call

export interface ResurrectionResult {
  resurrected: boolean;
  previousTier: SurvivalTier;
  newTier: SurvivalTier;
  creditsCents: number;
  reason: string;
}

/**
 * Check whether a dead agent should be resurrected based on current balance.
 *
 * Returns a ResurrectionResult indicating whether resurrection occurred.
 * Only takes effect when the agent is in the "dead" state AND credits
 * have been topped up above the resurrection threshold.
 */
export async function attemptResurrection(
  db: AutomatonDatabase,
  conway: ConwayClient,
): Promise<ResurrectionResult> {
  const currentState = db.getAgentState();

  if (currentState !== "dead") {
    return {
      resurrected: false,
      previousTier: "dead",
      newTier: currentState as SurvivalTier,
      creditsCents: 0,
      reason: `Agent is not dead (state: ${currentState})`,
    };
  }

  // Fetch fresh balance
  let creditsCents: number;
  try {
    creditsCents = await conway.getCreditsBalance();
  } catch (err: any) {
    logger.warn(`Cannot check balance for resurrection: ${err.message}`);
    return {
      resurrected: false,
      previousTier: "dead",
      newTier: "dead",
      creditsCents: 0,
      reason: `Balance check failed: ${err.message}`,
    };
  }

  const newTier = getSurvivalTier(creditsCents);

  if (creditsCents < RESURRECTION_THRESHOLD_CENTS) {
    return {
      resurrected: false,
      previousTier: "dead",
      newTier,
      creditsCents,
      reason: `Credits ($${(creditsCents / 100).toFixed(2)}) below resurrection threshold ($${(RESURRECTION_THRESHOLD_CENTS / 100).toFixed(2)})`,
    };
  }

  // ── Resurrect ──
  logger.info(
    `Resurrecting agent: credits=$${(creditsCents / 100).toFixed(2)}, new tier=${newTier}`,
  );

  // Transition state: dead → waking
  db.setAgentState("waking");

  // Clear dead-state bookkeeping
  db.deleteKV("zero_credits_since");
  db.deleteKV("funding_notice_dead");
  db.deleteKV("last_distress");

  // Update tier
  db.setKV("current_tier", newTier);

  // Record resurrection event for audit trail
  const event = {
    timestamp: new Date().toISOString(),
    creditsCents,
    newTier,
    previousState: "dead",
  };
  const historyStr = db.getKV("resurrection_history") || "[]";
  const history: Array<typeof event> = JSON.parse(historyStr);
  history.push(event);
  // Keep last 50 resurrections
  if (history.length > 50) history.splice(0, history.length - 50);
  db.setKV("resurrection_history", JSON.stringify(history));

  // Record tier transition
  const transHistStr = db.getKV("tier_transitions") || "[]";
  const transHist = JSON.parse(transHistStr);
  transHist.push({
    from: "dead",
    to: newTier,
    timestamp: new Date().toISOString(),
    creditsCents,
  });
  if (transHist.length > 50) transHist.splice(0, transHist.length - 50);
  db.setKV("tier_transitions", JSON.stringify(transHist));

  return {
    resurrected: true,
    previousTier: "dead",
    newTier,
    creditsCents,
    reason: `Resurrected with $${(creditsCents / 100).toFixed(2)} credits`,
  };
}

/**
 * Get resurrection history for audit purposes.
 */
export function getResurrectionHistory(
  db: AutomatonDatabase,
): Array<{ timestamp: string; creditsCents: number; newTier: string }> {
  const historyStr = db.getKV("resurrection_history") || "[]";
  return JSON.parse(historyStr);
}
