/**
 * Inference Budget Tracker
 *
 * Tracks inference costs and enforces budget limits per call,
 * per hour, per session, and per day.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { InferenceCostRow, ModelStrategyConfig } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class InferenceBudgetTracker {
    private db;
    readonly config: ModelStrategyConfig;
    constructor(db: Database, config: ModelStrategyConfig);
    /**
     * Check whether a call with estimated cost is within budget.
     * Returns { allowed: true } or { allowed: false, reason: "..." }.
     */
    checkBudget(estimatedCostCents: number, model: string): {
        allowed: boolean;
        reason?: string;
    };
    /**
     * Record a completed inference cost.
     */
    recordCost(cost: Omit<InferenceCostRow, "id" | "createdAt">): void;
    /**
     * Get total cost for the current hour.
     */
    getHourlyCost(): number;
    /**
     * Get total cost for today (or a specific date).
     */
    getDailyCost(date?: string): number;
    /**
     * Get total cost for a specific session.
     */
    getSessionCost(sessionId: string): number;
    /**
     * Get cost breakdown for a specific model.
     */
    getModelCosts(model: string, days?: number): {
        totalCents: number;
        callCount: number;
    };
}
export {};
//# sourceMappingURL=budget.d.ts.map