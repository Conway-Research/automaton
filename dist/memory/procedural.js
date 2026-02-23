/**
 * Procedural Memory Manager
 *
 * Stores learned procedures (step-by-step instructions) with success/failure tracking.
 * Upserts on procedure name.
 */
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("memory.procedural");
export class ProceduralMemoryManager {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Save a procedure. Upserts on name.
     * Returns the ULID id.
     */
    save(entry) {
        const id = ulid();
        try {
            this.db.prepare(`INSERT INTO procedural_memory (id, name, description, steps)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           description = excluded.description,
           steps = excluded.steps,
           updated_at = datetime('now')`).run(id, entry.name, entry.description, JSON.stringify(entry.steps));
        }
        catch (error) {
            logger.error("Failed to save", error instanceof Error ? error : undefined);
        }
        return id;
    }
    /**
     * Get a procedure by name.
     */
    get(name) {
        try {
            const row = this.db.prepare("SELECT * FROM procedural_memory WHERE name = ?").get(name);
            return row ? deserializeProcedural(row) : undefined;
        }
        catch (error) {
            logger.error("Failed to get", error instanceof Error ? error : undefined);
            return undefined;
        }
    }
    /**
     * Record a success or failure outcome for a named procedure.
     */
    recordOutcome(name, success) {
        try {
            const column = success ? "success_count" : "failure_count";
            this.db.prepare(`UPDATE procedural_memory SET ${column} = ${column} + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE name = ?`).run(name);
        }
        catch (error) {
            logger.error("Failed to record outcome", error instanceof Error ? error : undefined);
        }
    }
    /**
     * Search procedures by name or description.
     */
    search(query) {
        try {
            // Escape SQL LIKE wildcards so literal '%' and '_' in the query
            // don't match arbitrary characters.
            const escaped = query.replace(/[%_]/g, (ch) => `\\${ch}`);
            const rows = this.db.prepare(`SELECT * FROM procedural_memory
         WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\'
         ORDER BY success_count DESC, updated_at DESC`).all(`%${escaped}%`, `%${escaped}%`);
            return rows.map(deserializeProcedural);
        }
        catch (error) {
            logger.error("Failed to search", error instanceof Error ? error : undefined);
            return [];
        }
    }
    /**
     * Delete a procedure by name.
     */
    delete(name) {
        try {
            this.db.prepare("DELETE FROM procedural_memory WHERE name = ?").run(name);
        }
        catch (error) {
            logger.error("Failed to delete", error instanceof Error ? error : undefined);
        }
    }
}
function deserializeProcedural(row) {
    let steps = [];
    try {
        steps = JSON.parse(row.steps || "[]");
    }
    catch {
        logger.error("Failed to parse steps for: " + row.name);
    }
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        steps,
        successCount: row.success_count,
        failureCount: row.failure_count,
        lastUsedAt: row.last_used_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
//# sourceMappingURL=procedural.js.map