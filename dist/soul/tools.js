/**
 * Soul Tools — Tool implementations for soul management.
 *
 * Provides updateSoul, reflectOnSoul (trigger), viewSoul, and viewSoulHistory.
 * All operations validate before saving and log to soul_history.
 *
 * Phase 2.1: Soul System Redesign
 */
import fs from "fs";
import path from "path";
import { loadCurrentSoul, writeSoulMd, createHash, createDefaultSoul } from "./model.js";
import { validateSoul } from "./validator.js";
import { insertSoulHistory, getCurrentSoulVersion, getLatestSoulHistory, getSoulHistory } from "../state/database.js";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("soul");
/**
 * Update the soul with new content. Validates, versions, saves to file, and logs.
 */
export async function updateSoul(db, updates, source, reason, soulPath) {
    try {
        const home = process.env.HOME || "/root";
        const resolvedPath = soulPath || path.join(home, ".automaton", "SOUL.md");
        // Load current soul or create default
        let current = loadCurrentSoul(db, resolvedPath);
        if (!current) {
            current = createDefaultSoul(updates.corePurpose || "No purpose set.", updates.name || "", updates.address || "", updates.creator || "");
        }
        // Merge updates into current soul
        const merged = {
            ...current,
            ...updates,
            format: "soul/v1",
            updatedAt: new Date().toISOString(),
        };
        // Validate
        const validation = validateSoul(merged);
        if (!validation.valid) {
            return {
                success: false,
                version: current.version,
                errors: validation.errors,
            };
        }
        // Increment version
        const currentVersion = getCurrentSoulVersion(db);
        const newVersion = Math.max(currentVersion, current.version) + 1;
        const newSoul = {
            ...validation.sanitized,
            version: newVersion,
            updatedAt: new Date().toISOString(),
        };
        // Write to file
        const content = writeSoulMd(newSoul);
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(resolvedPath, content, "utf-8");
        // Get previous version ID
        const latestHistory = getLatestSoulHistory(db);
        const previousVersionId = latestHistory?.id || null;
        // Log to soul_history
        insertSoulHistory(db, {
            id: ulid(),
            version: newVersion,
            content,
            contentHash: createHash(content),
            changeSource: source,
            changeReason: reason || null,
            previousVersionId,
            approvedBy: null,
            createdAt: new Date().toISOString(),
        });
        return { success: true, version: newVersion };
    }
    catch (error) {
        logger.error("updateSoul failed", error instanceof Error ? error : undefined);
        return {
            success: false,
            version: 0,
            errors: [error instanceof Error ? error.message : "Unknown error"],
        };
    }
}
// ─── View Soul ──────────────────────────────────────────────────
/**
 * View the current soul model.
 */
export function viewSoul(db, soulPath) {
    return loadCurrentSoul(db, soulPath);
}
// ─── View Soul History ──────────────────────────────────────────
/**
 * View soul change history.
 */
export function viewSoulHistory(db, limit) {
    return getSoulHistory(db, limit);
}
//# sourceMappingURL=tools.js.map