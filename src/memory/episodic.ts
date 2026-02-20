/**
 * Episodic Memory Manager
 *
 * Records events and experiences from agent turns.
 * Supports recency-based retrieval, search, and session summarization.
 */

import type BetterSqlite3 from "better-sqlite3";
import { ulid } from "ulid";
import type { EpisodicMemoryEntry, TurnClassification } from "../types.js";
import { estimateTokens } from "../agent/context.js";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.episodic");

type Database = BetterSqlite3.Database;

export class EpisodicMemoryManager {
  constructor(private db: Database) {}

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
  }): string {
    const id = ulid();
    const tokenCount = estimateTokens(entry.summary + (entry.detail || ""));
    try {
      this.db.prepare(
        `INSERT INTO episodic_memory (id, session_id, event_type, summary, detail, outcome, importance, embedding_key, token_count, classification)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        entry.sessionId,
        entry.eventType,
        entry.summary,
        entry.detail ?? null,
        entry.outcome ?? null,
        entry.importance ?? 0.5,
        entry.embeddingKey ?? null,
        tokenCount,
        entry.classification ?? "maintenance",
      );
    } catch (error) {
      logger.error("Failed to record entry", error instanceof Error ? error : undefined);
    }
    return id;
  }

  /**
   * Get recent episodic memory entries for a session, ordered by creation time descending.
   */
  getRecent(sessionId: string, limit: number = 10): EpisodicMemoryEntry[] {
    try {
      const rows = this.db.prepare(
        "SELECT * FROM episodic_memory WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
      ).all(sessionId, limit) as any[];
      return rows.map(deserializeEpisodic);
    } catch (error) {
      logger.error("Failed to get recent", error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Search episodic memory by summary/detail content using LIKE-based matching.
   */
  search(query: string, limit: number = 10): EpisodicMemoryEntry[] {
    try {
      // Escape SQL LIKE wildcards so literal '%' and '_' in the query
      // don't match arbitrary characters.
      const escaped = query.replace(/[%_]/g, (ch) => `\\${ch}`);
      const rows = this.db.prepare(
        `SELECT * FROM episodic_memory
         WHERE summary LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\'
         ORDER BY importance DESC, created_at DESC
         LIMIT ?`,
      ).all(`%${escaped}%`, `%${escaped}%`, limit) as any[];
      return rows.map(deserializeEpisodic);
    } catch (error) {
      logger.error("Failed to search", error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * Mark an episodic memory as accessed, incrementing counter and updating timestamp.
   */
  markAccessed(id: string): void {
    try {
      this.db.prepare(
        "UPDATE episodic_memory SET accessed_count = accessed_count + 1, last_accessed_at = datetime('now') WHERE id = ?",
      ).run(id);
    } catch (error) {
      logger.error("Failed to mark accessed", error instanceof Error ? error : undefined);
    }
  }

  /**
   * Prune entries older than retentionDays.
   * Returns number of entries removed.
   */
  prune(retentionDays: number): number {
    if (retentionDays <= 0) return 0;
    try {
      const result = this.db.prepare(
        "DELETE FROM episodic_memory WHERE created_at < datetime('now', ?)",
      ).run(`-${retentionDays} days`);
      return result.changes;
    } catch (error) {
      logger.error("Failed to prune", error instanceof Error ? error : undefined);
      return 0;
    }
  }

  /**
   * Generate a template-based summary of a session's episodic memories.
   */
  summarizeSession(sessionId: string): string {
    try {
      const entries = this.db.prepare(
        "SELECT * FROM episodic_memory WHERE session_id = ? ORDER BY created_at ASC",
      ).all(sessionId) as any[];

      if (entries.length === 0) return "No activity recorded for this session.";

      const events = entries.map(deserializeEpisodic);
      const successes = events.filter((e) => e.outcome === "success").length;
      const failures = events.filter((e) => e.outcome === "failure").length;
      const strategic = events.filter((e) => e.classification === "strategic").length;

      const summaryLines: string[] = [
        `Session had ${events.length} recorded event(s).`,
      ];

      if (successes > 0) summaryLines.push(`${successes} successful outcome(s).`);
      if (failures > 0) summaryLines.push(`${failures} failed outcome(s).`);
      if (strategic > 0) summaryLines.push(`${strategic} strategic decision(s).`);

      // Include top 3 most important events
      const topEvents = [...events]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 3);
      if (topEvents.length > 0) {
        summaryLines.push("Key events:");
        for (const e of topEvents) {
          summaryLines.push(`- [${e.eventType}] ${e.summary}`);
        }
      }

      return summaryLines.join("\n");
    } catch (error) {
      logger.error("Failed to summarize session", error instanceof Error ? error : undefined);
      return "Failed to generate session summary.";
    }
  }
}

function deserializeEpisodic(row: any): EpisodicMemoryEntry {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    summary: row.summary,
    detail: row.detail ?? null,
    outcome: row.outcome ?? null,
    importance: row.importance,
    embeddingKey: row.embedding_key ?? null,
    tokenCount: row.token_count,
    accessedCount: row.accessed_count,
    lastAccessedAt: row.last_accessed_at ?? null,
    classification: row.classification,
    createdAt: row.created_at,
  };
}
