/**
 * Semantic Memory Manager
 *
 * Stores factual knowledge indexed by category and key.
 * Supports upsert semantics (category+key is unique), confidence scoring,
 * and LRU-based pruning.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { SemanticMemoryEntry, SemanticCategory } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class SemanticMemoryManager {
    private db;
    constructor(db: Database);
    /**
     * Store a semantic memory entry. Upserts on (category, key).
     * Returns the ULID id.
     */
    store(entry: {
        category: SemanticCategory;
        key: string;
        value: string;
        confidence?: number;
        source: string;
        embeddingKey?: string | null;
    }): string;
    /**
     * Get a specific semantic memory by category and key.
     */
    get(category: SemanticCategory, key: string): SemanticMemoryEntry | undefined;
    /**
     * Search semantic memory by value content, optionally filtered by category.
     */
    search(query: string, category?: SemanticCategory): SemanticMemoryEntry[];
    /**
     * Get all semantic memory entries in a category.
     */
    getByCategory(category: SemanticCategory): SemanticMemoryEntry[];
    /**
     * Delete a semantic memory entry by id.
     */
    delete(id: string): void;
    /**
     * Prune entries when over maxEntries, removing lowest confidence + oldest first (LRU).
     * Returns number of entries removed.
     */
    prune(maxEntries?: number): number;
}
export {};
//# sourceMappingURL=semantic.d.ts.map