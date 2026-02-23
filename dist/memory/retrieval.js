/**
 * Memory Retriever
 *
 * Retrieves relevant memories across all tiers within a token budget.
 * Priority order: working > episodic > semantic > procedural > relationships.
 * Unused budget from one tier rolls to the next.
 */
import { DEFAULT_MEMORY_BUDGET } from "../types.js";
import { WorkingMemoryManager } from "./working.js";
import { EpisodicMemoryManager } from "./episodic.js";
import { SemanticMemoryManager } from "./semantic.js";
import { ProceduralMemoryManager } from "./procedural.js";
import { RelationshipMemoryManager } from "./relationship.js";
import { MemoryBudgetManager } from "./budget.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.retrieval");
export class MemoryRetriever {
    working;
    episodic;
    semantic;
    procedural;
    relationships;
    budgetManager;
    constructor(db, budget) {
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
    retrieve(sessionId, currentInput) {
        try {
            // Fetch raw memories from each tier
            const workingEntries = this.working.getBySession(sessionId);
            const episodicEntries = this.episodic.getRecent(sessionId, 20);
            // For semantic and procedural, use current input as search query if available
            const semanticEntries = currentInput
                ? this.semantic.search(currentInput)
                : this.semantic.getByCategory("self");
            const proceduralEntries = currentInput
                ? this.procedural.search(currentInput)
                : [];
            const relationshipEntries = this.relationships.getTrusted(0.3);
            // Build raw result
            const raw = {
                workingMemory: workingEntries,
                episodicMemory: episodicEntries,
                semanticMemory: semanticEntries,
                proceduralMemory: proceduralEntries,
                relationships: relationshipEntries,
                totalTokens: 0,
            };
            // Apply budget allocation
            return this.budgetManager.allocate(raw);
        }
        catch (error) {
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
//# sourceMappingURL=retrieval.js.map