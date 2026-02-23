/**
 * Procedural Memory Manager
 *
 * Stores learned procedures (step-by-step instructions) with success/failure tracking.
 * Upserts on procedure name.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { ProceduralMemoryEntry, ProceduralStep } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class ProceduralMemoryManager {
    private db;
    constructor(db: Database);
    /**
     * Save a procedure. Upserts on name.
     * Returns the ULID id.
     */
    save(entry: {
        name: string;
        description: string;
        steps: ProceduralStep[];
    }): string;
    /**
     * Get a procedure by name.
     */
    get(name: string): ProceduralMemoryEntry | undefined;
    /**
     * Record a success or failure outcome for a named procedure.
     */
    recordOutcome(name: string, success: boolean): void;
    /**
     * Search procedures by name or description.
     */
    search(query: string): ProceduralMemoryEntry[];
    /**
     * Delete a procedure by name.
     */
    delete(name: string): void;
}
export {};
//# sourceMappingURL=procedural.d.ts.map