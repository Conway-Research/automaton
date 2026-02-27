/**
 * Semantic Memory Manager
 *
 * Stores factual knowledge indexed by category and key.
 * Supports upsert semantics (category+key is unique), confidence scoring,
 * and LRU-based pruning.
 */

import type BetterSqlite3 from "better-sqlite3";
import { ulid } from "ulid";
import type { SemanticMemoryEntry, SemanticCategory } from "../types.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.semantic");

type Database = BetterSqlite3.Database;

export class SemanticMemoryManager {
  constructor(private db: Database) {}

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
  }): string {
    const id = ulid();
    try {
      this.db.prepare(
        `INSERT INTO semantic_memory (id, category, key, value, confidence, source, embedding_key)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(category, key) DO UPDATE SET
           value = excluded.value,
           confidence = excluded.confidence,
           source = excluded.source,
           embedding_key = excluded.embedding_key,
           updated_at = datetime('now')`,
      ).run(
        id,
        entry.category,
        entry.key,
        entry.value,
        entry.confidence ?? 1.0,
        entry.source,
        entry.embeddingKey ?? null,
      );

      // On upsert conflict, the DB keeps the original row's id, not the new one.
      // Query for the actual id to return the correct value.
      const row = this.db.prepare(
        "SELECT id FROM semantic_memory WHERE category = ? AND key = ?",
      ).get(entry.category, entry.key) as { id: string } | undefined;
      if (row) return row.id;
    } catch (error) {
      logger.error("Failed to store entry", error instanceof Error ? error : undefined);
    }
    return id;
  }

  /**
   * Get a specific semantic memory by category and key.
   */
  get(category: SemanticCategory, key: string): SemanticMemoryEntry | undefined {
    try {
      const row = this.db.prepare(
        "SELECT * FROM semantic_memory WHERE category = ? AND key = ?",
      ).get(category, key) as any | undefined;
      return row ? deserializeSemantic(row) : undefined;
    } catch (error) {
      logger.error("Failed to get entry", error instanceof Error ? error : undefined);
      return undefined;
    }
  }

  /**
   * Search semantic memory by value content, optionally filtered by category.
   */
  search(query: string, category?: SemanticCategory): SemanticMemoryEntry[] {
    try {
      // Escape SQL LIKE wildcards so literal '%' and '_' in the query
      // don't match arbitrary characters.
      const escaped = query.replace(/[%_]/g, (ch) => `\\${ch}`);
      if (category) {
        const rows = this.db.prepare(
          `SELECT * FROM semantic_memory
           WHERE category = ? AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\')
           ORDER BY confidence DESC, updated_at DESC`,
        ).all(category, `%${escaped}%`, `%${escaped}%`) as any[];
        return rows.map(deserializeSemantic);
      }
      const rows = this.db.prepare(
        `SELECT * FROM semantic_memory
         WHERE key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\'
         ORDER BY confidence DESC, updated_at DESC`,
      ).all(`%${escaped}%`, `%${escaped}%`) as any[];
      return rows.map(deserializeSemantic);
    } catch (error) {
      logger.error("Failed to search", error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Get all semantic memory entries in a category.
   */
  getByCategory(category: SemanticCategory): SemanticMemoryEntry[] {
    try {
      const rows = this.db.prepare(
        "SELECT * FROM semantic_memory WHERE category = ? ORDER BY confidence DESC, updated_at DESC",
      ).all(category) as any[];
      return rows.map(deserializeSemantic);
    } catch (error) {
      logger.error("Failed to get by category", error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Delete a semantic memory entry by id.
   */
  delete(id: string): void {
    try {
      this.db.prepare("DELETE FROM semantic_memory WHERE id = ?").run(id);
    } catch (error) {
      logger.error("Failed to delete entry", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Prune entries when over maxEntries, removing lowest confidence + oldest first (LRU).
   * Returns number of entries removed.
   */
  prune(maxEntries: number = 500): number {
    try {
      const count = this.db.prepare(
        "SELECT COUNT(*) as cnt FROM semantic_memory",
      ).get() as { cnt: number };

      if (count.cnt <= maxEntries) return 0;

      const toRemove = count.cnt - maxEntries;
      const result = this.db.prepare(
        `DELETE FROM semantic_memory WHERE id IN (
          SELECT id FROM semantic_memory
          ORDER BY confidence ASC, updated_at ASC
          LIMIT ?
        )`,
      ).run(toRemove);
      return result.changes;
    } catch (error) {
      logger.error("Failed to prune", error instanceof Error ? error : undefined);
      return 0;
    }
  }
}

function deserializeSemantic(row: any): SemanticMemoryEntry {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    value: row.value,
    confidence: row.confidence,
    source: row.source,
    embeddingKey: row.embedding_key ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
