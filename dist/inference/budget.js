/**
 * Inference Budget Tracker
 *
 * Tracks inference costs and enforces budget limits per call,
 * per hour, per session, and per day.
 */
import { inferenceInsertCost, inferenceGetSessionCosts, inferenceGetDailyCost, inferenceGetHourlyCost, inferenceGetModelCosts, } from "../state/database.js";
export class InferenceBudgetTracker {
    db;
    config;
    constructor(db, config) {
        this.db = db;
        this.config = config;
    }
    /**
     * Check whether a call with estimated cost is within budget.
     * Returns { allowed: true } or { allowed: false, reason: "..." }.
     */
    checkBudget(estimatedCostCents, model) {
        // Per-call ceiling check
        if (this.config.perCallCeilingCents > 0 && estimatedCostCents > this.config.perCallCeilingCents) {
            return {
                allowed: false,
                reason: `Per-call cost ${estimatedCostCents}c exceeds ceiling of ${this.config.perCallCeilingCents}c`,
            };
        }
        // Hourly budget check
        if (this.config.hourlyBudgetCents > 0) {
            const hourlyCost = this.getHourlyCost();
            if (hourlyCost + estimatedCostCents > this.config.hourlyBudgetCents) {
                return {
                    allowed: false,
                    reason: `Hourly budget exhausted: ${hourlyCost}c spent + ${estimatedCostCents}c estimated > ${this.config.hourlyBudgetCents}c limit`,
                };
            }
        }
        // Session budget check
        if (this.config.sessionBudgetCents > 0) {
            // Session budget is enforced via getSessionCost when sessionId is known
            // This is a guard for the overall session — enforced in router.route()
        }
        return { allowed: true };
    }
    /**
     * Record a completed inference cost.
     */
    recordCost(cost) {
        inferenceInsertCost(this.db, cost);
    }
    /**
     * Get total cost for the current hour.
     */
    getHourlyCost() {
        return inferenceGetHourlyCost(this.db);
    }
    /**
     * Get total cost for today (or a specific date).
     */
    getDailyCost(date) {
        return inferenceGetDailyCost(this.db, date);
    }
    /**
     * Get total cost for a specific session.
     */
    getSessionCost(sessionId) {
        const costs = inferenceGetSessionCosts(this.db, sessionId);
        return costs.reduce((sum, c) => sum + c.costCents, 0);
    }
    /**
     * Get cost breakdown for a specific model.
     */
    getModelCosts(model, days) {
        return inferenceGetModelCosts(this.db, model, days);
    }
}
//# sourceMappingURL=budget.js.map