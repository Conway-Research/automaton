/**
 * Memory Budget Manager
 *
 * Manages token budget allocation for memory retrieval.
 * Trims memory retrieval results to fit within configured budgets.
 */

import type { MemoryBudget, MemoryRetrievalResult } from "../types.js";
import { estimateTokens } from "../agent/context.js";

export class MemoryBudgetManager {
  constructor(private budget: MemoryBudget) {}

  /**
   * Allocate memories within budget, trimming each tier as needed.
   * Unused budget from higher-priority tiers rolls over to lower-priority tiers,
   * so sparse working memory doesn't waste tokens that episodic/semantic could use.
   * Returns a new MemoryRetrievalResult that fits within the budget.
   */
  allocate(memories: MemoryRetrievalResult): MemoryRetrievalResult {
    let totalTokens = 0;
    let rollover = 0;

    // Working memory tier (highest priority)
    const workingBudget = this.budget.workingMemoryTokens + rollover;
    const { items: workingMemory, tokens: workingTokens } = this.trimTier(
      memories.workingMemory,
      workingBudget,
      (entry) => estimateTokens(entry.content),
    );
    totalTokens += workingTokens;
    rollover = workingBudget - workingTokens;

    // Episodic memory tier
    const episodicBudget = this.budget.episodicMemoryTokens + rollover;
    const { items: episodicMemory, tokens: episodicTokens } = this.trimTier(
      memories.episodicMemory,
      episodicBudget,
      (entry) => estimateTokens(entry.summary + (entry.detail || "")),
    );
    totalTokens += episodicTokens;
    rollover = episodicBudget - episodicTokens;

    // Semantic memory tier
    const semanticBudget = this.budget.semanticMemoryTokens + rollover;
    const { items: semanticMemory, tokens: semanticTokens } = this.trimTier(
      memories.semanticMemory,
      semanticBudget,
      (entry) => estimateTokens(`${entry.category}/${entry.key}: ${entry.value}`),
    );
    totalTokens += semanticTokens;
    rollover = semanticBudget - semanticTokens;

    // Procedural memory tier
    const proceduralBudget = this.budget.proceduralMemoryTokens + rollover;
    const { items: proceduralMemory, tokens: proceduralTokens } = this.trimTier(
      memories.proceduralMemory,
      proceduralBudget,
      (entry) => estimateTokens(`${entry.name}: ${entry.description} (${entry.steps.length} steps)`),
    );
    totalTokens += proceduralTokens;
    rollover = proceduralBudget - proceduralTokens;

    // Relationship memory tier (lowest priority — receives all remaining rollover)
    const relationshipBudget = this.budget.relationshipMemoryTokens + rollover;
    const { items: relationships, tokens: relationshipTokens } = this.trimTier(
      memories.relationships,
      relationshipBudget,
      (entry) => estimateTokens(`${entry.entityAddress}: ${entry.relationshipType} trust=${entry.trustScore}`),
    );
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
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }

  /**
   * Get total budget across all tiers.
   */
  getTotalBudget(): number {
    return (
      this.budget.workingMemoryTokens +
      this.budget.episodicMemoryTokens +
      this.budget.semanticMemoryTokens +
      this.budget.proceduralMemoryTokens +
      this.budget.relationshipMemoryTokens
    );
  }

  /**
   * Trim a tier's items to fit within a token budget.
   */
  private trimTier<T>(
    items: T[],
    budgetTokens: number,
    estimateFn: (item: T) => number,
  ): { items: T[]; tokens: number } {
    const result: T[] = [];
    let tokens = 0;

    for (const item of items) {
      const itemTokens = estimateFn(item);
      if (tokens + itemTokens > budgetTokens) break;
      result.push(item);
      tokens += itemTokens;
    }

    return { items: result, tokens };
  }
}
