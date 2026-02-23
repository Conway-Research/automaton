/**
 * Episodic Memory Manager
 *
 * Records events and experiences from agent turns.
 * Supports recency-based retrieval, search, and session summarization.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { EpisodicMemoryEntry, TurnClassification } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class EpisodicMemoryManager {
    private db;
    constructor(db: Database);
    /**
     * Record a new episodic memory entry. Returns the ULID id.
     */
    record(entry: {
        sessionId: string;
        eventType: string;
        summary: string;
        detail?: string | null;
        outcome?: "success" | "failure" | "partial" | "neutral" | null;
        importance?: number;
        embeddingKey?: string | null;
        classification?: TurnClassification;
    }): string;
    /**
     * Get recent episodic memory entries for a session, ordered by creation time descending.
     */
    getRecent(sessionId: string, limit?: number): EpisodicMemoryEntry[];
    /**
     * Search episodic memory by summary/detail content using LIKE-based matching.
     */
    search(query: string, limit?: number): EpisodicMemoryEntry[];
    /**
     * Mark an episodic memory as accessed, incrementing counter and updating timestamp.
     */
    markAccessed(id: string): void;
    /**
     * Prune entries older than retentionDays.
     * Returns number of entries removed.
     */
    prune(retentionDays: number): number;
    /**
     * Generate a template-based summary of a session's episodic memories.
     */
    summarizeSession(sessionId: string): string;
}
export {};
//# sourceMappingURL=episodic.d.ts.map