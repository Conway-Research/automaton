/**
 * Metabolic Engine
 *
 * Computes the automaton's real-time metabolic state by analyzing
 * cost events and revenue events. Tracks burn rate, income rate,
 * and projected survival time.
 */

import { ulid } from "ulid";
import type {
  AutomatonDatabase,
  MetabolicState,
  CostEvent,
  CostEventType,
  RevenueEvent,
} from "../types.js";

export function calculateMetabolicState(
  db: AutomatonDatabase,
): MetabolicState {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since = windowStart.toISOString();

  const costEvents = db.getCostEventsSince(since);
  const revenueEvents = db.getRevenueEventsSince(since);

  const hoursElapsed = 24;

  const totalCostCents = costEvents.reduce(
    (sum, event) => sum + event.amountCents,
    0,
  );
  const totalRevenueCents = revenueEvents.reduce(
    (sum, event) => sum + event.amountCents,
    0,
  );

  const burnRateCentsPerHour = totalCostCents / hoursElapsed;
  const incomeRateCentsPerHour = totalRevenueCents / hoursElapsed;
  const netRateCentsPerHour = incomeRateCentsPerHour - burnRateCentsPerHour;

  const financialStateStr = db.getKV("financial_state");
  const creditsCents = financialStateStr
    ? JSON.parse(financialStateStr).creditsCents
    : 0;

  let survivalHours: number;
  if (netRateCentsPerHour >= 0) {
    survivalHours = Infinity;
  } else {
    const netBurnRate = Math.abs(netRateCentsPerHour);
    survivalHours = netBurnRate > 0 ? creditsCents / netBurnRate : Infinity;
  }

  const metabolicEfficiency =
    burnRateCentsPerHour > 0 ? incomeRateCentsPerHour / burnRateCentsPerHour : 0;

  return {
    burnRateCentsPerHour,
    incomeRateCentsPerHour,
    netRateCentsPerHour,
    survivalHours,
    metabolicEfficiency,
    lastCalculated: now.toISOString(),
  };
}

export function projectSurvival(
  state: MetabolicState,
  creditsCents: number,
): { hours: number; verdict: string } {
  if (state.netRateCentsPerHour > 0) {
    return { hours: Infinity, verdict: "growing" };
  }

  if (state.netRateCentsPerHour === 0) {
    return { hours: Infinity, verdict: "stable" };
  }

  const netBurnRate = Math.abs(state.netRateCentsPerHour);
  const hours = netBurnRate > 0 ? creditsCents / netBurnRate : Infinity;

  let verdict: string;
  if (hours < 1) {
    verdict = "critical";
  } else if (hours < 6) {
    verdict = "urgent";
  } else if (hours < 24) {
    verdict = "concerning";
  } else {
    verdict = "manageable";
  }

  return { hours, verdict };
}

export function formatMetabolicReport(
  state: MetabolicState,
  creditsCents: number,
): string {
  const projection = projectSurvival(state, creditsCents);

  const lines = [
    "=== METABOLIC STATE ===",
    `Burn Rate: $${(state.burnRateCentsPerHour / 100).toFixed(4)}/hour`,
    `Income Rate: $${(state.incomeRateCentsPerHour / 100).toFixed(4)}/hour`,
    `Net Rate: ${state.netRateCentsPerHour >= 0 ? "+" : ""}$${(state.netRateCentsPerHour / 100).toFixed(4)}/hour`,
    `Efficiency: ${(state.metabolicEfficiency * 100).toFixed(1)}%`,
    `Survival: ${projection.hours === Infinity ? "∞" : `${projection.hours.toFixed(1)}h`} (${projection.verdict})`,
    `Credits: $${(creditsCents / 100).toFixed(2)}`,
    `Last Calculated: ${state.lastCalculated}`,
    "=======================",
  ];

  return lines.join("\n");
}

export function recordCost(
  db: AutomatonDatabase,
  type: CostEventType,
  amountCents: number,
  description: string,
): void {
  const event: CostEvent = {
    id: ulid(),
    type,
    amountCents,
    description,
    timestamp: new Date().toISOString(),
  };
  db.insertCostEvent(event);
}

export function recordRevenue(
  db: AutomatonDatabase,
  strategyId: string,
  amountCents: number,
  source: string,
  description: string,
): void {
  const event: RevenueEvent = {
    id: ulid(),
    strategyId,
    amountCents,
    source,
    description,
    timestamp: new Date().toISOString(),
  };
  db.insertRevenueEvent(event);

  const strategy = db.getStrategyById(strategyId);
  if (strategy) {
    strategy.totalEarnedCents += amountCents;
    strategy.roi =
      strategy.totalInvestedCents > 0
        ? (strategy.totalEarnedCents - strategy.totalInvestedCents) /
          strategy.totalInvestedCents
        : 0;
    strategy.lastRevenueAt = event.timestamp;
    db.upsertStrategy(strategy);
  }
}
