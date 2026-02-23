/**
 * Soul Tools — Tool implementations for soul management.
 *
 * Provides updateSoul, reflectOnSoul (trigger), viewSoul, and viewSoulHistory.
 * All operations validate before saving and log to soul_history.
 *
 * Phase 2.1: Soul System Redesign
 */
import type BetterSqlite3 from "better-sqlite3";
import type { SoulModel, SoulHistoryRow } from "../types.js";
export interface UpdateSoulResult {
    success: boolean;
    version: number;
    errors?: string[];
}
/**
 * Update the soul with new content. Validates, versions, saves to file, and logs.
 */
export declare function updateSoul(db: BetterSqlite3.Database, updates: Partial<SoulModel>, source: SoulHistoryRow["changeSource"], reason?: string, soulPath?: string): Promise<UpdateSoulResult>;
/**
 * View the current soul model.
 */
export declare function viewSoul(db: BetterSqlite3.Database, soulPath?: string): SoulModel | null;
/**
 * View soul change history.
 */
export declare function viewSoulHistory(db: BetterSqlite3.Database, limit?: number): SoulHistoryRow[];
//# sourceMappingURL=tools.d.ts.map