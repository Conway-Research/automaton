/**
 * Memory Tool Implementations
 *
 * Provides the execute functions for agent-accessible memory tools.
 * Each function operates on the database directly via memory managers.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { ProceduralStep } from "../types.js";
type Database = BetterSqlite3.Database;
/**
 * Store a semantic memory (fact).
 */
export declare function rememberFact(db: Database, args: {
    category: string;
    key: string;
    value: string;
    confidence?: number;
    source?: string;
}): string;
/**
 * Search semantic memory by category and/or query.
 */
export declare function recallFacts(db: Database, args: {
    category?: string;
    query?: string;
}): string;
/**
 * Create or update a working memory goal.
 */
export declare function setGoal(db: Database, args: {
    sessionId: string;
    content: string;
    priority?: number;
}): string;
/**
 * Mark a goal as completed and archive to episodic memory.
 */
export declare function completeGoal(db: Database, args: {
    goalId: string;
    sessionId: string;
    outcome?: string;
}): string;
/**
 * Store a learned procedure.
 */
export declare function saveProcedure(db: Database, args: {
    name: string;
    description: string;
    steps: ProceduralStep[] | string;
}): string;
/**
 * Retrieve a stored procedure by name or search query.
 */
export declare function recallProcedure(db: Database, args: {
    name?: string;
    query?: string;
}): string;
/**
 * Record a note about another agent/entity.
 */
export declare function noteAboutAgent(db: Database, args: {
    entityAddress: string;
    entityName?: string;
    relationshipType: string;
    notes?: string;
    trustScore?: number;
}): string;
/**
 * Review current working memory and recent episodic memory.
 */
export declare function reviewMemory(db: Database, args: {
    sessionId: string;
}): string;
/**
 * Forget (remove) a memory entry by id and type.
 * Does not allow removing entries that contain creator-level data.
 */
export declare function forget(db: Database, args: {
    id: string;
    memoryType: string;
}): string;
export {};
//# sourceMappingURL=tools.d.ts.map