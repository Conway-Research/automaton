/**
 * Working Memory Manager
 *
 * Session-scoped memory for current goals, observations, plans, and reflections.
 * Entries are prioritized and pruned when over budget.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { WorkingMemoryEntry, WorkingMemoryType } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class WorkingMemoryManager {
    private db;
    constructor(db: Database);
    /**
     * Add a new working memory entry. Returns the ULID id.
     */
    add(entry: {
        sessionId: string;
        content: string;
        contentType: WorkingMemoryType;
        priority?: number;
        expiresAt?: string | null;
        sourceTurn?: string | null;
    }): string;
    /**
     * Get all working memory entries for a session, ordered by priority descending.
     */
    getBySession(sessionId: string): WorkingMemoryEntry[];
    /**
     * Update an existing working memory entry.
     */
    update(id: string, updates: Partial<Pick<WorkingMemoryEntry, "content" | "priority" | "expiresAt" | "contentType">>): void;
    /**
     * Delete a working memory entry by id.
     */
    delete(id: string): void;
    /**
     * Prune lowest-priority entries when a session exceeds maxEntries.
     * Returns number of entries removed.
     */
    prune(sessionId: string, maxEntries?: number): number;
    /**
     * Clear all expired entries across all sessions.
     * Returns number of entries removed.
     */
    clearExpired(): number;
}
export {};
//# sourceMappingURL=working.d.ts.map