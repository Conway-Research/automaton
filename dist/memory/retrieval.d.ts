/**
 * Memory Retriever
 *
 * Retrieves relevant memories across all tiers within a token budget.
 * Priority order: working > episodic > semantic > procedural > relationships.
 * Unused budget from one tier rolls to the next.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { MemoryBudget, MemoryRetrievalResult } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class MemoryRetriever {
    private working;
    private episodic;
    private semantic;
    private procedural;
    private relationships;
    private budgetManager;
    constructor(db: Database, budget?: MemoryBudget);
    /**
     * Retrieve relevant memories for a session, within token budget.
     * Priority: working > episodic > semantic > procedural > relationships.
     * Unused tokens from a tier roll to the next tier.
     */
    retrieve(sessionId: string, currentInput?: string): MemoryRetrievalResult;
}
export {};
//# sourceMappingURL=retrieval.d.ts.map