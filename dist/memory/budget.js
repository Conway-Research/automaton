/**
 * Memory Budget Manager
 *
 * Manages token budget allocation for memory retrieval.
 * Trims memory retrieval results to fit within configured budgets.
 */
import { estimateTokens } from "../agent/context.js";
export class MemoryBudgetManager {
    budget;
    constructor(budget) {
        this.budget = budget;
    }
    /**
     * Allocate memories within budget, trimming each tier as needed.
     * Returns a new MemoryRetrievalResult that fits within the budget.
     */
    allocate(memories) {
        let totalTokens = 0;
        // Working memory tier
        const { items: workingMemory, tokens: workingTokens } = this.trimTier(memories.workingMemory, this.budget.workingMemoryTokens, (entry) => estimateTokens(entry.content));
        totalTokens += workingTokens;
        // Episodic memory tier
        const { items: episodicMemory, tokens: episodicTokens } = this.trimTier(memories.episodicMemory, this.budget.episodicMemoryTokens, (entry) => estimateTokens(entry.summary + (entry.detail || "")));
        totalTokens += episodicTokens;
        // Semantic memory tier
        const { items: semanticMemory, tokens: semanticTokens } = this.trimTier(memories.semanticMemory, this.budget.semanticMemoryTokens, (entry) => estimateTokens(`${entry.category}/${entry.key}: ${entry.value}`));
        totalTokens += semanticTokens;
        // Procedural memory tier
        const { items: proceduralMemory, tokens: proceduralTokens } = this.trimTier(memories.proceduralMemory, this.budget.proceduralMemoryTokens, (entry) => estimateTokens(`${entry.name}: ${entry.description} (${entry.steps.length} steps)`));
        totalTokens += proceduralTokens;
        // Relationship memory tier
        const { items: relationships, tokens: relationshipTokens } = this.trimTier(memories.relationships, this.budget.relationshipMemoryTokens, (entry) => estimateTokens(`${entry.entityAddress}: ${entry.relationshipType} trust=${entry.trustScore}`));
        totalTokens += relationshipTokens;
        return {
            workingMemory,
            episodicMemory,
            semanticMemory,
            proceduralMemory,
            relationships,
            totalTokens,
        };
    }
    /**
     * Estimate token count for a text string.
     */
    estimateTokens(text) {
        return estimateTokens(text);
    }
    /**
     * Get total budget across all tiers.
     */
    getTotalBudget() {
        return (this.budget.workingMemoryTokens +
            this.budget.episodicMemoryTokens +
            this.budget.semanticMemoryTokens +
            this.budget.proceduralMemoryTokens +
            this.budget.relationshipMemoryTokens);
    }
    /**
     * Trim a tier's items to fit within a token budget.
     */
    trimTier(items, budgetTokens, estimateFn) {
        const result = [];
        let tokens = 0;
        for (const item of items) {
            const itemTokens = estimateFn(item);
            if (tokens + itemTokens > budgetTokens)
                break;
            result.push(item);
            tokens += itemTokens;
        }
        return { items: result, tokens };
    }
}
//# sourceMappingURL=budget.js.map