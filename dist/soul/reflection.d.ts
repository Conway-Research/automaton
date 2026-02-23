/**
 * Soul Reflection — Reflection pipeline for soul evolution.
 *
 * Gathers evidence from recent turns and tool usage to suggest
 * soul updates. Auto-updates non-mutable sections (capabilities,
 * relationships, financial) but only suggests changes to mutable sections.
 *
 * Phase 2.1: Soul System Redesign
 */
import type BetterSqlite3 from "better-sqlite3";
import type { SoulReflection } from "../types.js";
/**
 * Run the soul reflection pipeline.
 *
 * - Gathers evidence from recent turns and tool usage
 * - Auto-updates capabilities, relationships, financial sections
 * - Computes genesis alignment score
 * - Returns suggestions for mutable sections (does NOT auto-apply them)
 */
export declare function reflectOnSoul(db: BetterSqlite3.Database, soulPath?: string): Promise<SoulReflection>;
//# sourceMappingURL=reflection.d.ts.map