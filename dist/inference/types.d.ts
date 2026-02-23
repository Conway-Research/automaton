/**
 * Inference & Model Strategy — Internal Types
 *
 * Re-exports shared types from types.ts and defines internal constants
 * for the inference routing subsystem.
 */
export type { SurvivalTier, ModelProvider, InferenceTaskType, ModelEntry, ModelPreference, RoutingMatrix, InferenceRequest, InferenceResult, InferenceCostRow, ModelRegistryRow, ModelStrategyConfig, ChatMessage, } from "../types.js";
import type { RoutingMatrix, ModelEntry, ModelStrategyConfig } from "../types.js";
export declare const DEFAULT_RETRY_POLICY: {
    readonly maxRetries: 3;
    readonly baseDelayMs: 1000;
    readonly maxDelayMs: 30000;
};
export declare const TASK_TIMEOUTS: Record<string, number>;
export declare const STATIC_MODEL_BASELINE: Omit<ModelEntry, "lastSeen" | "createdAt" | "updatedAt">[];
export declare const DEFAULT_ROUTING_MATRIX: RoutingMatrix;
export declare const DEFAULT_MODEL_STRATEGY_CONFIG: ModelStrategyConfig;
//# sourceMappingURL=types.d.ts.map