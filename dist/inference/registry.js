/**
 * Model Registry
 *
 * DB-backed registry of available models with capabilities and pricing.
 * Seeded from a static baseline, updatable at runtime from Conway API.
 */
import { STATIC_MODEL_BASELINE } from "./types.js";
import { modelRegistryUpsert, modelRegistryGet, modelRegistryGetAll, modelRegistryGetAvailable, modelRegistrySetEnabled, } from "../state/database.js";
const TIER_ORDER = {
    dead: 0,
    critical: 1,
    low_compute: 2,
    normal: 3,
    high: 4,
};
export class ModelRegistry {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Upsert the static model baseline into the registry on every startup.
     * New models are added, existing models get updated pricing/capabilities,
     * and models removed from the baseline are disabled.
     */
    initialize() {
        const now = new Date().toISOString();
        const baselineIds = new Set(STATIC_MODEL_BASELINE.map((m) => m.modelId));
        // Upsert all baseline models
        for (const model of STATIC_MODEL_BASELINE) {
            const existing = modelRegistryGet(this.db, model.modelId);
            const row = {
                modelId: model.modelId,
                provider: model.provider,
                displayName: model.displayName,
                tierMinimum: model.tierMinimum,
                costPer1kInput: model.costPer1kInput,
                costPer1kOutput: model.costPer1kOutput,
                maxTokens: model.maxTokens,
                contextWindow: model.contextWindow,
                supportsTools: model.supportsTools,
                supportsVision: model.supportsVision,
                parameterStyle: model.parameterStyle,
                enabled: existing?.enabled ?? true,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
            };
            modelRegistryUpsert(this.db, row);
        }
        // Disable models no longer in the baseline (e.g., removed Anthropic models)
        const allModels = modelRegistryGetAll(this.db);
        for (const existing of allModels) {
            if (!baselineIds.has(existing.modelId) && existing.enabled) {
                modelRegistrySetEnabled(this.db, existing.modelId, false);
            }
        }
    }
    /**
     * Get a single model by ID.
     */
    get(modelId) {
        const row = modelRegistryGet(this.db, modelId);
        return row ? this.rowToEntry(row) : undefined;
    }
    /**
     * Get all registered models.
     */
    getAll() {
        return modelRegistryGetAll(this.db).map((r) => this.rowToEntry(r));
    }
    /**
     * Get available (enabled) models, optionally filtering by tier minimum.
     */
    getAvailable(tierMinimum) {
        return modelRegistryGetAvailable(this.db, tierMinimum).map((r) => this.rowToEntry(r));
    }
    /**
     * Insert or update a model entry.
     */
    upsert(entry) {
        const row = {
            modelId: entry.modelId,
            provider: entry.provider,
            displayName: entry.displayName,
            tierMinimum: entry.tierMinimum,
            costPer1kInput: entry.costPer1kInput,
            costPer1kOutput: entry.costPer1kOutput,
            maxTokens: entry.maxTokens,
            contextWindow: entry.contextWindow,
            supportsTools: entry.supportsTools,
            supportsVision: entry.supportsVision,
            parameterStyle: entry.parameterStyle,
            enabled: entry.enabled,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
        };
        modelRegistryUpsert(this.db, row);
    }
    /**
     * Enable or disable a model.
     */
    setEnabled(modelId, enabled) {
        modelRegistrySetEnabled(this.db, modelId, enabled);
    }
    /**
     * Refresh registry from Conway /v1/models API response.
     */
    refreshFromApi(models) {
        const now = new Date().toISOString();
        for (const m of models) {
            const existing = modelRegistryGet(this.db, m.id);
            const row = {
                modelId: m.id,
                provider: m.provider || m.owned_by || "conway",
                displayName: m.display_name || m.id,
                tierMinimum: existing?.tierMinimum || "normal",
                costPer1kInput: m.pricing?.input_per_1k ?? existing?.costPer1kInput ?? 0,
                costPer1kOutput: m.pricing?.output_per_1k ?? existing?.costPer1kOutput ?? 0,
                maxTokens: m.max_tokens ?? existing?.maxTokens ?? 4096,
                contextWindow: m.context_window ?? existing?.contextWindow ?? 128000,
                supportsTools: m.supports_tools ?? existing?.supportsTools ?? true,
                supportsVision: m.supports_vision ?? existing?.supportsVision ?? false,
                parameterStyle: m.parameter_style ?? existing?.parameterStyle ?? "max_tokens",
                enabled: existing?.enabled ?? true,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
            };
            modelRegistryUpsert(this.db, row);
        }
    }
    /**
     * Get cost per 1k tokens for a model.
     */
    getCostPer1k(modelId) {
        const entry = this.get(modelId);
        if (!entry)
            return { input: 0, output: 0 };
        return { input: entry.costPer1kInput, output: entry.costPer1kOutput };
    }
    rowToEntry(row) {
        return {
            modelId: row.modelId,
            provider: row.provider,
            displayName: row.displayName,
            tierMinimum: row.tierMinimum,
            costPer1kInput: row.costPer1kInput,
            costPer1kOutput: row.costPer1kOutput,
            maxTokens: row.maxTokens,
            contextWindow: row.contextWindow,
            supportsTools: row.supportsTools,
            supportsVision: row.supportsVision,
            parameterStyle: row.parameterStyle,
            enabled: row.enabled,
            lastSeen: null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }
}
//# sourceMappingURL=registry.js.map