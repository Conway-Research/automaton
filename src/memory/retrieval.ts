/**
 * Memory Retriever
 *
 * Retrieves relevant memories across all tiers within a token budget.
 * Priority order: working > episodic > semantic > procedural > relationships.
 * Unused budget from one tier rolls to the next.
 */

import type BetterSqlite3 from "better-sqlite3";
import type { MemoryBudget, MemoryRetrievalResult } from "../types.js";
import { DEFAULT_MEMORY_BUDGET } from "../types.js";
import { WorkingMemoryManager } from "./working.js";
import { EpisodicMemoryManager } from "./episodic.js";
import { SemanticMemoryManager } from "./semantic.js";
import { ProceduralMemoryManager } from "./procedural.js";
import { RelationshipMemoryManager } from "./relationship.js";
import { MemoryBudgetManager } from "./budget.js";
import { estimateTokens } from "../agent/context.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.retrieval");

type Database = BetterSqlite3.Database;

export class MemoryRetriever {
  private working: WorkingMemoryManager;
  private episodic: EpisodicMemoryManager;
  private semantic: SemanticMemoryManager;
  private procedural: ProceduralMemoryManager;
  private relationships: RelationshipMemoryManager;
  private budgetManager: MemoryBudgetManager;

  constructor(db: Database, budget?: MemoryBudget) {
    this.working = new WorkingMemoryManager(db);
    this.episodic = new EpisodicMemoryManager(db);
    this.semantic = new SemanticMemoryManager(db);
    this.procedural = new ProceduralMemoryManager(db);
    this.relationships = new RelationshipMemoryManager(db);
    this.budgetManager = new MemoryBudgetManager(budget ?? DEFAULT_MEMORY_BUDGET);
  }

  /**
   * Retrieve relevant memories for a session, within token budget.
   * Priority: working > episodic > semantic > procedural > relationships.
   * Unused tokens from a tier roll to the next tier.
   */
  retrieve(sessionId: string, currentInput?: string): MemoryRetrievalResult {
    try {
      // Fetch raw memories from each tier
      const workingEntries = this.working.getBySession(sessionId);

      const rawEpisodicEntries = this.episodic.getRecent(sessionId, 20);
      // Filter maintenance/idle entries to prevent loop reinforcement
      const episodicEntries = rawEpisodicEntries.filter(
        (e) => e.classification !== "maintenance" && e.classification !== "idle",
      );

      // For semantic and procedural, use current input as search query if available
      const semanticEntries = currentInput
        ? this.semantic.search(currentInput)
        : this.semantic.getByCategory("self");

      const proceduralEntries = currentInput
        ? this.procedural.search(currentInput)
        : [];

      const relationshipEntries = this.relationships.getTrusted(0.3);

      // Build raw result
      const raw: MemoryRetrievalResult = {
        workingMemory: workingEntries,
        episodicMemory: episodicEntries,
        semanticMemory: semanticEntries,
        proceduralMemory: proceduralEntries,
        relationships: relationshipEntries,
        totalTokens: 0,
      };

      // Apply budget allocation
      return this.budgetManager.allocate(raw);
    } catch (error) {
      logger.error("Retrieval failed", error instanceof Error ? error : undefined);
      return {
        workingMemory: [],
        episodicMemory: [],
        semanticMemory: [],
        proceduralMemory: [],
        relationships: [],
        totalTokens: 0,
      };
    }
  }
}
