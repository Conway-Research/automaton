/**
 * Relationship Memory Manager
 *
 * Tracks relationships with other agents/entities.
 * Maintains trust scores, interaction counts, and notes.
 * Upserts on entityAddress.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { RelationshipMemoryEntry } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class RelationshipMemoryManager {
    private db;
    constructor(db: Database);
    /**
     * Record a relationship. Upserts on entityAddress.
     * Returns the ULID id.
     */
    record(entry: {
        entityAddress: string;
        entityName?: string | null;
        relationshipType: string;
        trustScore?: number;
        notes?: string | null;
    }): string;
    /**
     * Get a relationship by entity address.
     */
    get(entityAddress: string): RelationshipMemoryEntry | undefined;
    /**
     * Record an interaction with an entity. Increments counter and updates timestamp.
     */
    recordInteraction(entityAddress: string): void;
    /**
     * Update trust score by a delta. Clamps to 0.0-1.0 range.
     */
    updateTrust(entityAddress: string, delta: number): void;
    /**
     * Get all relationships with trust score at or above the minimum threshold.
     */
    getTrusted(minTrust?: number): RelationshipMemoryEntry[];
    /**
     * Delete a relationship by entity address.
     */
    delete(entityAddress: string): void;
}
export {};
//# sourceMappingURL=relationship.d.ts.map