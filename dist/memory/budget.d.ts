/**
 * Memory Budget Manager
 *
 * Manages token budget allocation for memory retrieval.
 * Trims memory retrieval results to fit within configured budgets.
 */
import type { MemoryBudget, MemoryRetrievalResult } from "../types.js";
export declare class MemoryBudgetManager {
    private budget;
    constructor(budget: MemoryBudget);
    /**
     * Allocate memories within budget, trimming each tier as needed.
     * Returns a new MemoryRetrievalResult that fits within the budget.
     */
    allocate(memories: MemoryRetrievalResult): MemoryRetrievalResult;
    /**
     * Estimate token count for a text string.
     */
    estimateTokens(text: string): number;
    /**
     * Get total budget across all tiers.
     */
    getTotalBudget(): number;
    /**
     * Trim a tier's items to fit within a token budget.
     */
    private trimTier;
}
//# sourceMappingURL=budget.d.ts.map