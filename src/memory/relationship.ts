/**
 * Relationship Memory Manager
 *
 * Tracks relationships with other agents/entities.
 * Maintains trust scores, interaction counts, and notes.
 * Upserts on entityAddress.
 */

import type BetterSqlite3 from "better-sqlite3";
import { ulid } from "ulid";
import { assertNoKnownSecrets } from "../observability/redaction.js";
import type { RelationshipMemoryEntry } from "../types.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.relationship");

type Database = BetterSqlite3.Database;

export class RelationshipMemoryManager {
  constructor(private db: Database) {}

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
  }): string {
    assertNoKnownSecrets(entry);
    const id = ulid();
    try {
      const stored = this.db.prepare(
        `INSERT INTO relationship_memory (id, entity_address, entity_name, relationship_type, trust_score, notes)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(entity_address) DO UPDATE SET
           entity_name = COALESCE(excluded.entity_name, relationship_memory.entity_name),
           relationship_type = excluded.relationship_type,
           trust_score = excluded.trust_score,
           notes = COALESCE(excluded.notes, relationship_memory.notes),
           updated_at = datetime('now') RETURNING id`,
      ).get(
        id,
        entry.entityAddress,
        entry.entityName ?? null,
        entry.relationshipType,
        entry.trustScore ?? 0.5,
        entry.notes ?? null,
      );
      return (stored as {id:string}).id;
    } catch (error) {
      logger.error("Failed to record", error instanceof Error ? error : undefined);
    }
    throw new Error("Memory persistence failed");
  }

  /**
   * Get a relationship by entity address.
   */
  get(entityAddress: string): RelationshipMemoryEntry | undefined {
    try {
      const row = this.db.prepare(
        "SELECT * FROM relationship_memory WHERE entity_address = ?",
      ).get(entityAddress) as any | undefined;
      return row ? deserializeRelationship(row) : undefined;
    } catch (error) {
      logger.error("Failed to get", error instanceof Error ? error : undefined);
      return undefined;
    }
  }

  /**
   * Record an interaction with an entity. Increments counter and updates timestamp.
   */
  recordInteraction(entityAddress: string): void {
    try {
      this.db.prepare(
        `UPDATE relationship_memory
         SET interaction_count = interaction_count + 1,
             last_interaction_at = datetime('now'),
             updated_at = datetime('now')
         WHERE entity_address = ?`,
      ).run(entityAddress);
    } catch (error) {
      logger.error("Failed to record interaction", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Update trust score by a delta. Clamps to 0.0-1.0 range.
   */
  updateTrust(entityAddress: string, delta: number): void {
    try {
      this.db.prepare(
        `UPDATE relationship_memory
         SET trust_score = MAX(0.0, MIN(1.0, trust_score + ?)),
             updated_at = datetime('now')
         WHERE entity_address = ?`,
      ).run(delta, entityAddress);
    } catch (error) {
      logger.error("Failed to update trust", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Get all relationships with trust score at or above the minimum threshold.
   */
  getTrusted(minTrust: number = 0.5): RelationshipMemoryEntry[] {
    try {
      const rows = this.db.prepare(
        "SELECT * FROM relationship_memory WHERE trust_score >= ? ORDER BY trust_score DESC, interaction_count DESC",
      ).all(minTrust) as any[];
      return rows.map(deserializeRelationship);
    } catch (error) {
      logger.error("Failed to get trusted", error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Delete a relationship by entity address.
   */
  delete(entityAddress: string): void {
    try {
      this.db.prepare("DELETE FROM relationship_memory WHERE entity_address = ?").run(entityAddress);
    } catch (error) {
      logger.error("Failed to delete", error instanceof Error ? error : undefined);
    }
  }
}

function deserializeRelationship(row: any): RelationshipMemoryEntry {
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
