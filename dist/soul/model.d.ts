/**
 * Soul Model — Data model, parser, writer for structured SOUL.md
 *
 * Supports both legacy (unstructured markdown) and soul/v1 (YAML frontmatter + structured markdown) formats.
 * Phase 2.1: Soul System Redesign
 */
import type BetterSqlite3 from "better-sqlite3";
import type { SoulModel } from "../types.js";
export declare function createHash(content: string): string;
/**
 * Compute alignment between current soul and genesis prompt.
 * Uses Jaccard + recall similarity on word sets.
 */
export declare function computeGenesisAlignment(currentPurpose: string, genesisPrompt: string): number;
/**
 * Parse SOUL.md content into a structured SoulModel.
 * Handles both legacy (unstructured markdown) and soul/v1 (YAML frontmatter + structured markdown).
 */
export declare function parseSoulMd(content: string): SoulModel;
/**
 * Write a SoulModel back to SOUL.md format (soul/v1).
 */
export declare function writeSoulMd(soul: SoulModel): string;
/**
 * Create a default soul from a genesis prompt.
 */
export declare function createDefaultSoul(genesisPrompt: string, name?: string, address?: string, creator?: string): SoulModel;
/**
 * Load the current soul from SOUL.md file.
 * Returns null if SOUL.md does not exist or cannot be read.
 */
export declare function loadCurrentSoul(db: BetterSqlite3.Database | null, soulPath?: string): SoulModel | null;
//# sourceMappingURL=model.d.ts.map