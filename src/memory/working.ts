/**
 * Working Memory Manager
 *
 * Session-scoped memory for current goals, observations, plans, and reflections.
 * Entries are prioritized and pruned when over budget.
 */

import type BetterSqlite3 from "better-sqlite3";
import { ulid } from "ulid";
import type { WorkingMemoryEntry, WorkingMemoryType } from "../types.js";
import { estimateTokens } from "../agent/context.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.working");

type Database = BetterSqlite3.Database;

export class WorkingMemoryManager {
  constructor(private db: Database) {}

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
  }): string {
    const id = ulid();
    const tokenCount = estimateTokens(entry.content);
    try {
      this.db.prepare(
        `INSERT INTO working_memory (id, session_id, content, content_type, priority, token_count, expires_at, source_turn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        entry.sessionId,
        entry.content,
        entry.contentType,
        entry.priority ?? 0.5,
        tokenCount,
        entry.expiresAt ?? null,
        entry.sourceTurn ?? null,
      );
    } catch (error) {
      logger.error("Failed to add entry", error instanceof Error ? error : undefined);
    }
    return id;
  }

  /**
   * Get all working memory entries for a session, ordered by priority descending.
   */
  getBySession(sessionId: string): WorkingMemoryEntry[] {
    try {
      const rows = this.db.prepare(
        "SELECT * FROM working_memory WHERE session_id = ? ORDER BY priority DESC, created_at DESC",
      ).all(sessionId) as any[];
      return rows.map(deserializeWorkingMemory);
    } catch (error) {
      logger.error("Failed to get entries", error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Update an existing working memory entry.
   */
  update(id: string, updates: Partial<Pick<WorkingMemoryEntry, "content" | "priority" | "expiresAt" | "contentType">>): void {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.content !== undefined) {
      setClauses.push("content = ?");
      params.push(updates.content);
      setClauses.push("token_count = ?");
      params.push(estimateTokens(updates.content));
    }
    if (updates.priority !== undefined) {
      setClauses.push("priority = ?");
      params.push(updates.priority);
    }
    if (updates.expiresAt !== undefined) {
      setClauses.push("expires_at = ?");
      params.push(updates.expiresAt);
    }
    if (updates.contentType !== undefined) {
      setClauses.push("content_type = ?");
      params.push(updates.contentType);
    }

    if (setClauses.length === 0) return;

    params.push(id);
    try {
      this.db.prepare(
        `UPDATE working_memory SET ${setClauses.join(", ")} WHERE id = ?`,
      ).run(...params);
    } catch (error) {
      logger.error("Failed to update entry", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Delete a working memory entry by id.
   */
  delete(id: string): void {
    try {
      this.db.prepare("DELETE FROM working_memory WHERE id = ?").run(id);
    } catch (error) {
      logger.error("Failed to delete entry", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Prune lowest-priority entries when a session exceeds maxEntries.
   * Returns number of entries removed.
   */
  prune(sessionId: string, maxEntries: number = 20): number {
    if (maxEntries < 0) return 0;
    try {
      const count = this.db.prepare(
        "SELECT COUNT(*) as cnt FROM working_memory WHERE session_id = ?",
      ).get(sessionId) as { cnt: number };

      if (count.cnt <= maxEntries) return 0;

      const toRemove = count.cnt - maxEntries;
      const result = this.db.prepare(
        `DELETE FROM working_memory WHERE id IN (
          SELECT id FROM working_memory WHERE session_id = ?
          ORDER BY priority ASC, created_at ASC
          LIMIT ?
        )`,
      ).run(sessionId, toRemove);
      return result.changes;
    } catch (error) {
      logger.error("Failed to prune", error instanceof Error ? error : undefined);
      return 0;
    }
  }

  /**
   * Clear all expired entries across all sessions.
   * Returns number of entries removed.
   */
  clearExpired(): number {
    try {
      const result = this.db.prepare(
        "DELETE FROM working_memory WHERE expires_at IS NOT NULL AND expires_at < datetime('now')",
      ).run();
      return result.changes;
    } catch (error) {
      logger.error("Failed to clear expired", error instanceof Error ? error : undefined);
      return 0;
    }
  }
}

function deserializeWorkingMemory(row: any): WorkingMemoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    content: row.content,
    contentType: row.content_type,
    priority: row.priority,
    tokenCount: row.token_count,
    expiresAt: row.expires_at ?? null,
    sourceTurn: row.source_turn ?? null,
    createdAt: row.created_at,
  };
}
