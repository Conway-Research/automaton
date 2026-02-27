/**
 * Knowledge Store
 *
 * Shared cross-agent knowledge base backed by the knowledge_store table.
 */

import type BetterSqlite3 from "better-sqlite3";
import {
  deleteKnowledge,
  getKnowledgeByCategory,
  insertKnowledge,
  searchKnowledge,
  updateKnowledge,
  type KnowledgeStoreRow,
} from "../state/database.js";

type Database = BetterSqlite3.Database;

export type KnowledgeCategory =
  | "market"
  | "technical"
  | "social"
  | "financial"
  | "operational";

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  key: string;
  content: string;
  source: string;
  confidence: number;
  lastVerified: string;
  accessCount: number;
  tokenCount: number;
  createdAt: string;
  expiresAt: string | null;
}

export interface KnowledgeStats {
  total: number;
  byCategory: Record<KnowledgeCategory, number>;
  totalTokens: number;
}

const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  "market",
  "technical",
  "social",
  "financial",
  "operational",
];

function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as string[]).includes(value);
}

function toKnowledgeEntry(row: KnowledgeStoreRow): KnowledgeEntry {
  if (!isKnowledgeCategory(row.category)) {
    throw new Error(`Invalid knowledge category: ${row.category}`);
  }

  return {
    id: row.id,
    category: row.category,
    key: row.key,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    lastVerified: row.lastVerified,
    accessCount: row.accessCount,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

function toKnowledgeUpdate(
  updates: Partial<KnowledgeEntry>,
): Partial<{
  category: string;
  key: string;
  content: string;
  source: string;
  confidence: number;
  lastVerified: string;
  accessCount: number;
  tokenCount: number;
  expiresAt: string | null;
}> {
  const mapped: Partial<{
    category: string;
    key: string;
    content: string;
    source: string;
    confidence: number;
    lastVerified: string;
    accessCount: number;
    tokenCount: number;
    expiresAt: string | null;
  }> = {};

  if (updates.category !== undefined) mapped.category = updates.category;
  if (updates.key !== undefined) mapped.key = updates.key;
  if (updates.content !== undefined) mapped.content = updates.content;
  if (updates.source !== undefined) mapped.source = updates.source;
  if (updates.confidence !== undefined) mapped.confidence = updates.confidence;
  if (updates.lastVerified !== undefined) mapped.lastVerified = updates.lastVerified;
  if (updates.accessCount !== undefined) mapped.accessCount = updates.accessCount;
  if (updates.tokenCount !== undefined) mapped.tokenCount = updates.tokenCount;
  if (updates.expiresAt !== undefined) mapped.expiresAt = updates.expiresAt;

  return mapped;
}

export class KnowledgeStore {
  constructor(private readonly db: Database) {}

  add(entry: Omit<KnowledgeEntry, "id" | "accessCount" | "createdAt">): string {
    return insertKnowledge(this.db, {
      category: entry.category,
      key: entry.key,
      content: entry.content,
      source: entry.source,
      confidence: entry.confidence,
      lastVerified: entry.lastVerified,
      tokenCount: entry.tokenCount,
      expiresAt: entry.expiresAt,
    });
  }

  get(id: string): KnowledgeEntry | null {
    const now = new Date().toISOString();
    const row = this.db
      .prepare(
        `SELECT
           id,
           category,
           key,
           content,
           source,
           confidence,
           last_verified AS lastVerified,
           access_count AS accessCount,
           token_count AS tokenCount,
           created_at AS createdAt,
           expires_at AS expiresAt
         FROM knowledge_store
         WHERE id = ?
           AND (expires_at IS NULL OR expires_at >= ?)`,
      )
      .get(id, now) as KnowledgeStoreRow | undefined;

    if (!row) return null;

    this.db
      .prepare("UPDATE knowledge_store SET access_count = access_count + 1 WHERE id = ?")
      .run(id);

    return toKnowledgeEntry({
      ...row,
      accessCount: row.accessCount + 1,
    });
  }

  search(
    query: string,
    category?: KnowledgeCategory,
    limit: number = 100,
  ): KnowledgeEntry[] {
    const rows = searchKnowledge(this.db, query, category, limit);
    return rows.map(toKnowledgeEntry);
  }

  update(id: string, updates: Partial<KnowledgeEntry>): void {
    updateKnowledge(this.db, id, toKnowledgeUpdate(updates));
  }

  remove(id: string): void {
    deleteKnowledge(this.db, id);
  }

  prune(): number {
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(
      Date.now() - (7 * 24 * 60 * 60 * 1000),
    ).toISOString();

    const result = this.db.prepare(
      `DELETE FROM knowledge_store
       WHERE (expires_at IS NOT NULL AND expires_at < ?)
          OR (confidence < ? AND last_verified < ?)`,
    ).run(now, 0.3, sevenDaysAgo);

    return result.changes;
  }

  getByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
    const rows = getKnowledgeByCategory(this.db, category);
    return rows.map(toKnowledgeEntry);
  }

  getStats(): KnowledgeStats {
    const byCategory: Record<KnowledgeCategory, number> = {
      market: 0,
      technical: 0,
      social: 0,
      financial: 0,
      operational: 0,
    };

    const counts = this.db
      .prepare(
        "SELECT category, COUNT(*) AS count FROM knowledge_store GROUP BY category",
      )
      .all() as { category: string; count: number }[];

    for (const row of counts) {
      if (isKnowledgeCategory(row.category)) {
        byCategory[row.category] = row.count;
      }
    }

    const totals = this.db
      .prepare(
        "SELECT COUNT(*) AS total, COALESCE(SUM(token_count), 0) AS totalTokens FROM knowledge_store",
      )
      .get() as { total: number; totalTokens: number };

    return {
      total: totals.total,
      byCategory,
      totalTokens: totals.totalTokens,
    };
  }
}
