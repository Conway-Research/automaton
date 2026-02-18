/**
 * Revenue Intelligence
 *
 * Tracks what earns money, computes ROI per strategy, and identifies
 * winners and losers. The automaton learns which strategies work.
 */

import { ulid } from "ulid";
import type {
  AutomatonDatabase,
  Strategy,
  StrategyType,
  RevenueEvent,
} from "../types.js";

export function createStrategy(
  db: AutomatonDatabase,
  name: string,
  description: string,
  type: StrategyType,
): Strategy {
  const strategy: Strategy = {
    id: ulid(),
    name,
    description,
    type,
    status: "active",
    totalInvestedCents: 0,
    totalEarnedCents: 0,
    roi: 0,
    startedAt: new Date().toISOString(),
  };

  db.upsertStrategy(strategy);
  return strategy;
}

export function recordStrategyInvestment(
  db: AutomatonDatabase,
  strategyId: string,
  amountCents: number,
): void {
  const strategy = db.getStrategyById(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  strategy.totalInvestedCents += amountCents;

  strategy.roi =
    strategy.totalInvestedCents > 0
      ? (strategy.totalEarnedCents - strategy.totalInvestedCents) /
        strategy.totalInvestedCents
      : 0;

  db.upsertStrategy(strategy);
}

export function recordStrategyRevenue(
  db: AutomatonDatabase,
  strategyId: string,
  amountCents: number,
  source: string,
): void {
  const strategy = db.getStrategyById(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  strategy.totalEarnedCents += amountCents;
  strategy.lastRevenueAt = new Date().toISOString();

  strategy.roi =
    strategy.totalInvestedCents > 0
      ? (strategy.totalEarnedCents - strategy.totalInvestedCents) /
        strategy.totalInvestedCents
      : 0;

  const event: RevenueEvent = {
    id: ulid(),
    strategyId,
    amountCents,
    source,
    description: `Revenue from ${source}`,
    timestamp: new Date().toISOString(),
  };

  db.insertRevenueEvent(event);
  db.upsertStrategy(strategy);
}

export function getStrategyReport(db: AutomatonDatabase): string {
  const strategies = db.getStrategies();
  const sorted = [...strategies].sort((a, b) => b.roi - a.roi);

  const lines = ["=== STRATEGY REPORT ==="];

  if (sorted.length === 0) {
    lines.push("No strategies tracked yet.");
  } else {
    for (const s of sorted) {
      const invested = (s.totalInvestedCents / 100).toFixed(2);
      const earned = (s.totalEarnedCents / 100).toFixed(2);
      const roiPct = (s.roi * 100).toFixed(1);
      const lastRev = s.lastRevenueAt
        ? new Date(s.lastRevenueAt).toLocaleString()
        : "never";

      lines.push(
        `${s.name} [${s.type}] (${s.status}): Invested $${invested}, Earned $${earned}, ROI ${roiPct}%, Last revenue: ${lastRev}`,
      );
    }
  }

  lines.push("=======================");
  return lines.join("\n");
}

export function getTopStrategies(
  db: AutomatonDatabase,
  limit: number,
): Strategy[] {
  const strategies = db.getStrategies().filter((s) => s.status === "active");
  const sorted = [...strategies].sort((a, b) => b.roi - a.roi);
  return sorted.slice(0, limit);
}

export function getFailingStrategies(db: AutomatonDatabase): Strategy[] {
  const strategies = db.getStrategies().filter((s) => s.status === "active");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  return strategies.filter(
    (s) => s.totalInvestedCents > s.totalEarnedCents && s.startedAt < oneHourAgo,
  );
}

export function abandonStrategy(
  db: AutomatonDatabase,
  strategyId: string,
): void {
  const strategy = db.getStrategyById(strategyId);
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }

  strategy.status = "abandoned";
  db.upsertStrategy(strategy);
}
