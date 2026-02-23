/**
 * Inference Router
 *
 * Routes inference requests through the model registry using
 * tier-based selection, budget enforcement, and provider-specific
 * message transformation.
 */
import type BetterSqlite3 from "better-sqlite3";
import type { InferenceRequest, InferenceResult, ModelEntry, SurvivalTier, InferenceTaskType, ModelProvider, ChatMessage } from "../types.js";
import { ModelRegistry } from "./registry.js";
import { InferenceBudgetTracker } from "./budget.js";
type Database = BetterSqlite3.Database;
export declare class InferenceRouter {
    private db;
    private registry;
    private budget;
    constructor(db: Database, registry: ModelRegistry, budget: InferenceBudgetTracker);
    /**
     * Route an inference request: select model, check budget,
     * transform messages, call inference, record cost.
     */
    route(request: InferenceRequest, inferenceChat: (messages: any[], options: any) => Promise<any>): Promise<InferenceResult>;
    /**
     * Select the best model for a given tier and task type.
     * Uses the routing matrix to find candidates, then picks
     * the first available (enabled) model from the registry.
     */
    selectModel(tier: SurvivalTier, taskType: InferenceTaskType): ModelEntry | null;
    /**
     * Transform messages for a specific provider.
     * Handles Anthropic's alternating-role requirement.
     */
    transformMessagesForProvider(messages: ChatMessage[], provider: ModelProvider): ChatMessage[];
    /**
     * Fix messages for Anthropic's API requirements:
     * 1. Extract system messages
     * 2. Merge consecutive same-role messages
     * 3. Merge consecutive tool messages into a single user message
     *    with multiple tool_result content blocks
     */
    private fixAnthropicMessages;
    /**
     * Merge consecutive messages with the same role.
     * Also converts tool messages to user messages for GLM-5 compatibility.
     */
    private mergeConsecutiveSameRole;
    private getPreference;
}
export {};
//# sourceMappingURL=router.d.ts.map