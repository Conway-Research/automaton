/**
 * Model Registry
 *
 * DB-backed registry of available models with capabilities and pricing.
 * Seeded from a static baseline, updatable at runtime from Conway API.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { ModelEntry } from "../types.js";
type Database = BetterSqlite3.Database;
export declare class ModelRegistry {
    private db;
    constructor(db: Database);
    /**
     * Upsert the static model baseline into the registry on every startup.
     * New models are added, existing models get updated pricing/capabilities,
     * and models removed from the baseline are disabled.
     */
    initialize(): void;
    /**
     * Get a single model by ID.
     */
    get(modelId: string): ModelEntry | undefined;
    /**
     * Get all registered models.
     */
    getAll(): ModelEntry[];
    /**
     * Get available (enabled) models, optionally filtering by tier minimum.
     */
    getAvailable(tierMinimum?: string): ModelEntry[];
    /**
     * Insert or update a model entry.
     */
    upsert(entry: ModelEntry): void;
    /**
     * Enable or disable a model.
     */
    setEnabled(modelId: string, enabled: boolean): void;
    /**
     * Refresh registry from Conway /v1/models API response.
     */
    refreshFromApi(models: any[]): void;
    /**
     * Get cost per 1k tokens for a model.
     */
    getCostPer1k(modelId: string): {
        input: number;
        output: number;
    };
    private rowToEntry;
}
export {};
//# sourceMappingURL=registry.d.ts.map