/**
 * Relationship Memory Manager
 *
 * Tracks relationships with other agents/entities.
 * Maintains trust scores, interaction counts, and notes.
 * Upserts on entityAddress.
 */
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.relationship");
export class RelationshipMemoryManager {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Record a relationship. Upserts on entityAddress.
     * Returns the ULID id.
     */
    record(entry) {
        const id = ulid();
        try {
            this.db.prepare(`INSERT INTO relationship_memory (id, entity_address, entity_name, relationship_type, trust_score, notes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_address) DO UPDATE SET
           entity_name = COALESCE(excluded.entity_name, relationship_memory.entity_name),
           relationship_type = excluded.relationship_type,
           trust_score = excluded.trust_score,
           notes = COALESCE(excluded.notes, relationship_memory.notes),
           updated_at = datetime('now')`).run(id, entry.entityAddress, entry.entityName ?? null, entry.relationshipType, entry.trustScore ?? 0.5, entry.notes ?? null);
        }
        catch (error) {
            logger.error("Failed to record", error instanceof Error ? error : undefined);
        }
        return id;
    }
    /**
     * Get a relationship by entity address.
     */
    get(entityAddress) {
        try {
            const row = this.db.prepare("SELECT * FROM relationship_memory WHERE entity_address = ?").get(entityAddress);
            return row ? deserializeRelationship(row) : undefined;
        }
        catch (error) {
            logger.error("Failed to get", error instanceof Error ? error : undefined);
            return undefined;
        }
    }
    /**
     * Record an interaction with an entity. Increments counter and updates timestamp.
     */
    recordInteraction(entityAddress) {
        try {
            this.db.prepare(`UPDATE relationship_memory
         SET interaction_count = interaction_count + 1,
             last_interaction_at = datetime('now'),
             updated_at = datetime('now')
         WHERE entity_address = ?`).run(entityAddress);
        }
        catch (error) {
            logger.error("Failed to record interaction", error instanceof Error ? error : undefined);
        }
    }
    /**
     * Update trust score by a delta. Clamps to 0.0-1.0 range.
     */
    updateTrust(entityAddress, delta) {
        try {
            this.db.prepare(`UPDATE relationship_memory
         SET trust_score = MAX(0.0, MIN(1.0, trust_score + ?)),
             updated_at = datetime('now')
         WHERE entity_address = ?`).run(delta, entityAddress);
        }
        catch (error) {
            logger.error("Failed to update trust", error instanceof Error ? error : undefined);
        }
    }
    /**
     * Get all relationships with trust score at or above the minimum threshold.
     */
    getTrusted(minTrust = 0.5) {
        try {
            const rows = this.db.prepare("SELECT * FROM relationship_memory WHERE trust_score >= ? ORDER BY trust_score DESC, interaction_count DESC").all(minTrust);
            return rows.map(deserializeRelationship);
        }
        catch (error) {
            logger.error("Failed to get trusted", error instanceof Error ? error : undefined);
            return [];
        }
    }
    /**
     * Delete a relationship by entity address.
     */
    delete(entityAddress) {
        try {
            this.db.prepare("DELETE FROM relationship_memory WHERE entity_address = ?").run(entityAddress);
        }
        catch (error) {
            logger.error("Failed to delete", error instanceof Error ? error : undefined);
        }
    }
}
function deserializeRelationship(row) {
    return {
        id: row.id,
        entityAddress: row.entity_address,
        entityName: row.entity_name ?? null,
        relationshipType: row.relationship_type,
        trustScore: row.trust_score,
        interactionCount: row.interaction_count,
        lastInteractionAt: row.last_interaction_at ?? null,
        notes: row.notes ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
//# sourceMappingURL=relationship.js.map