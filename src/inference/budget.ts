/**
 * Inference Budget Tracker
 *
 * Tracks inference costs and enforces budget limits per call,
 * per hour, per session, and per day.
 */

import type BetterSqlite3 from "better-sqlite3";
import { policyFromConfig, readBudgetPolicy, registerBudgetPolicy } from "./budget-policy.js";
import { pendingInferenceCost } from "./reservations.js";
import { checkCapitalBudget } from "../revenue/capital-budget.js";
import type { InferenceCostRow, ModelStrategyConfig } from "../types.js";
import {
  inferenceInsertCost,
  inferenceGetSessionCost,
  inferenceGetDailyCost,
  inferenceGetHourlyCost,
  inferenceGetModelCosts,
  inferenceGetExperimentCost,
} from "../state/database.js";

type Database = BetterSqlite3.Database;

export class InferenceBudgetTracker {
  private db: Database;
  readonly config: ModelStrategyConfig;

  constructor(db: Database, config: ModelStrategyConfig, private readonly dailyLimitCents?: number) {
    this.db = db;
    this.config = config;
    // Invalid configuration is rejected by checkBudget, before provider access.
    try { registerBudgetPolicy(db, policyFromConfig(config, dailyLimitCents)); }
    catch (error) {
      if (!(error instanceof Error) || error.message !== "Invalid inference budget limits") throw error;
    }
  }

  /**
   * Check whether a call with estimated cost is within budget.
   * Returns { allowed: true } or { allowed: false, reason: "..." }.
   */
  checkBudget(
    estimatedCostCents: number,
    model: string,
  ): { allowed: boolean; reason?: string } {
    if (!Number.isSafeInteger(estimatedCostCents) || estimatedCostCents < 0) {
      return { allowed: false, reason: "Invalid estimated inference cost" };
    }
    let policy;
    try { policy = registerBudgetPolicy(this.db, policyFromConfig(this.config, this.dailyLimitCents)); }
    catch (error) {
      if (error instanceof Error && error.message === "Invalid inference budget limits") return { allowed: false, reason: error.message };
      throw error;
    }
    if (policy.halted) return { allowed: false, reason: "Inference budget halted: operator reconciliation required" };
    const capital = checkCapitalBudget(this.db, estimatedCostCents);
    if (!capital.allowed) return capital;
    // Treasury limits apply to the actual router path, not only tool policies.
    // Unlike optional strategy limits, an explicit treasury limit of 0 is zero.
    if (policy.daily_cents !== null) {
      if (this.getDailyCost() + pendingInferenceCost(this.db) + estimatedCostCents > policy.daily_cents) {
        return { allowed: false, reason: `Daily inference budget exhausted (${policy.daily_cents}c limit)` };
      }
    }
    // Per-call ceiling check
    if (policy.call_cents !== null && estimatedCostCents > policy.call_cents) {
      return {
        allowed: false,
        reason: `Per-call cost ${estimatedCostCents}c exceeds ceiling of ${policy.call_cents}c`,
      };
    }

    // Hourly budget check
    if (policy.hourly_cents !== null) {
      const hourlyCost = this.getHourlyCost() + pendingInferenceCost(this.db);
      if (hourlyCost + estimatedCostCents > policy.hourly_cents) {
        return {
          allowed: false,
          reason: `Hourly budget exhausted: ${hourlyCost}c spent + ${estimatedCostCents}c estimated > ${policy.hourly_cents}c limit`,
        };
      }
    }

    // Session budget check
    if (this.config.sessionBudgetCents > 0) {
      // Session budget is enforced via getSessionCost when sessionId is known
      // This is a guard for the overall session â€” enforced in router.route()
    }

    return { allowed: true };
  }

  /**
   * Record a completed inference cost.
   */
  recordCost(cost: Omit<InferenceCostRow, "id" | "createdAt">): void {
    inferenceInsertCost(this.db, cost);
  }

  /**
   * Get total cost for the current hour.
   */
  getHourlyCost(): number {
    return inferenceGetHourlyCost(this.db);
  }

  /**
   * Get total cost for today (or a specific date).
   */
  getDailyCost(date?: string): number {
    return inferenceGetDailyCost(this.db, date);
  }

  /**
   * Get total cost for a specific session.
   */
  getSessionCost(sessionId: string): number {
    return inferenceGetSessionCost(this.db, sessionId);
  }

  getSessionLimit(): number | null { return readBudgetPolicy(this.db)?.session_cents ?? null; }


  getExperimentCost(experimentId: string): number {
    return inferenceGetExperimentCost(this.db, experimentId);
  }
  /**
   * Get cost breakdown for a specific model.
   */
  getModelCosts(model: string, days?: number): { totalCents: number; callCount: number } {
    return inferenceGetModelCosts(this.db, model, days);
  }
}
