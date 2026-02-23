/**
 * Inference Router
 *
 * Routes inference requests through the model registry using
 * tier-based selection, budget enforcement, and provider-specific
 * message transformation.
 */
import { DEFAULT_ROUTING_MATRIX, TASK_TIMEOUTS } from "./types.js";
export class InferenceRouter {
    db;
    registry;
    budget;
    constructor(db, registry, budget) {
        this.db = db;
        this.registry = registry;
        this.budget = budget;
    }
    /**
     * Route an inference request: select model, check budget,
     * transform messages, call inference, record cost.
     */
    async route(request, inferenceChat) {
        const { messages, taskType, tier, sessionId, turnId, tools } = request;
        // 1. Select model from routing matrix
        const model = this.selectModel(tier, taskType);
        if (!model) {
            return {
                content: "",
                model: "none",
                provider: "other",
                inputTokens: 0,
                outputTokens: 0,
                costCents: 0,
                latencyMs: 0,
                finishReason: "error",
                toolCalls: undefined,
            };
        }
        // 2. Estimate cost and check budget
        const estimatedTokens = messages.reduce((sum, m) => sum + (m.content?.length || 0) / 4, 0);
        const estimatedCostCents = Math.ceil(((estimatedTokens / 1000) * model.costPer1kInput) / 100 +
            (((request.maxTokens || 1000) / 1000) * model.costPer1kOutput) / 100);
        const budgetCheck = this.budget.checkBudget(estimatedCostCents, model.modelId);
        if (!budgetCheck.allowed) {
            return {
                content: `Budget exceeded: ${budgetCheck.reason}`,
                model: model.modelId,
                provider: model.provider,
                inputTokens: 0,
                outputTokens: 0,
                costCents: 0,
                latencyMs: 0,
                finishReason: "budget_exceeded",
            };
        }
        // 3. Check session budget
        if (request.sessionId && this.budget.config.sessionBudgetCents > 0) {
            const sessionCost = this.budget.getSessionCost(request.sessionId);
            if (sessionCost + estimatedCostCents >
                this.budget.config.sessionBudgetCents) {
                return {
                    content: `Session budget exceeded: ${sessionCost}c spent + ${estimatedCostCents}c estimated > ${this.budget.config.sessionBudgetCents}c limit`,
                    model: model.modelId,
                    provider: model.provider,
                    inputTokens: 0,
                    outputTokens: 0,
                    costCents: 0,
                    latencyMs: 0,
                    finishReason: "budget_exceeded",
                };
            }
        }
        // 4. Transform messages for provider
        const transformedMessages = this.transformMessagesForProvider(messages, model.provider);
        // 5. Build inference options
        const preference = this.getPreference(tier, taskType);
        const maxTokens = request.maxTokens || preference?.maxTokens || model.maxTokens;
        const timeout = TASK_TIMEOUTS[taskType] || 120_000;
        const inferenceOptions = {
            model: model.modelId,
            maxTokens,
            tools: tools,
        };
        // 6. Call inference with timeout
        const startTime = Date.now();
        let response;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            try {
                inferenceOptions.signal = controller.signal;
                response = await inferenceChat(transformedMessages, inferenceOptions);
            }
            finally {
                clearTimeout(timer);
            }
        }
        catch (error) {
            const latencyMs = Date.now() - startTime;
            // If fallback is enabled, try next candidate
            if (error.name === "AbortError") {
                return {
                    content: `Inference timeout after ${timeout}ms`,
                    model: model.modelId,
                    provider: model.provider,
                    inputTokens: 0,
                    outputTokens: 0,
                    costCents: 0,
                    latencyMs,
                    finishReason: "timeout",
                };
            }
            throw error;
        }
        const latencyMs = Date.now() - startTime;
        // 7. Calculate actual cost
        const inputTokens = response.usage?.promptTokens || 0;
        const outputTokens = response.usage?.completionTokens || 0;
        const actualCostCents = Math.ceil(((inputTokens / 1000) * model.costPer1kInput) / 100 +
            ((outputTokens / 1000) * model.costPer1kOutput) / 100);
        // 8. Record cost
        this.budget.recordCost({
            sessionId,
            turnId: turnId || null,
            model: model.modelId,
            provider: model.provider,
            inputTokens,
            outputTokens,
            costCents: actualCostCents,
            latencyMs,
            tier,
            taskType,
            cacheHit: false,
        });
        // 9. Build result
        return {
            content: response.message?.content || "",
            model: model.modelId,
            provider: model.provider,
            inputTokens,
            outputTokens,
            costCents: actualCostCents,
            latencyMs,
            toolCalls: response.toolCalls,
            finishReason: response.finishReason || "stop",
        };
    }
    /**
     * Select the best model for a given tier and task type.
     * Uses the routing matrix to find candidates, then picks
     * the first available (enabled) model from the registry.
     */
    selectModel(tier, taskType) {
        const preference = this.getPreference(tier, taskType);
        if (!preference || preference.candidates.length === 0) {
            return null;
        }
        for (const candidateId of preference.candidates) {
            const entry = this.registry.get(candidateId);
            if (entry && entry.enabled) {
                return entry;
            }
        }
        return null;
    }
    /**
     * Transform messages for a specific provider.
     * Handles Anthropic's alternating-role requirement.
     */
    transformMessagesForProvider(messages, provider) {
        if (messages.length === 0) {
            throw new Error("Cannot route inference with empty message array");
        }
        if (provider === "anthropic") {
            return this.fixAnthropicMessages(messages);
        }
        // For OpenAI/Conway, merge consecutive same-role messages
        return this.mergeConsecutiveSameRole(messages);
    }
    /**
     * Fix messages for Anthropic's API requirements:
     * 1. Extract system messages
     * 2. Merge consecutive same-role messages
     * 3. Merge consecutive tool messages into a single user message
     *    with multiple tool_result content blocks
     */
    fixAnthropicMessages(messages) {
        const result = [];
        for (const msg of messages) {
            // System messages are handled separately by the Anthropic client
            if (msg.role === "system") {
                result.push(msg);
                continue;
            }
            // Tool messages become user messages with tool_result content
            if (msg.role === "tool") {
                const last = result[result.length - 1];
                // If previous message was also a tool (now a user), merge into it
                if (last && last.role === "user" && last._toolResultMerged) {
                    // Append to the merged content
                    last.content =
                        last.content +
                            "\n[tool_result:" +
                            (msg.tool_call_id || "unknown") +
                            "] " +
                            msg.content;
                    continue;
                }
                // Otherwise create a new user message
                const userMsg = {
                    role: "user",
                    content: "[tool_result:" +
                        (msg.tool_call_id || "unknown") +
                        "] " +
                        msg.content,
                    _toolResultMerged: true,
                };
                result.push(userMsg);
                continue;
            }
            // For user/assistant: merge with previous if same role
            const last = result[result.length - 1];
            if (last && last.role === msg.role) {
                last.content = (last.content || "") + "\n" + (msg.content || "");
                if (msg.tool_calls) {
                    last.tool_calls = [...(last.tool_calls || []), ...msg.tool_calls];
                }
                continue;
            }
            result.push({ ...msg });
        }
        // Clean up internal markers
        for (const msg of result) {
            delete msg._toolResultMerged;
        }
        return result;
    }
    /**
     * Merge consecutive messages with the same role.
     * Also converts tool messages to user messages for GLM-5 compatibility.
     */
    mergeConsecutiveSameRole(messages) {
        const result = [];
        for (const msg of messages) {
            // GLM-5 不支持 role: "tool"，转换为 user 消息
            if (msg.role === "tool") {
                const toolContent = `[Tool Result${msg.tool_call_id ? ` (${msg.tool_call_id})` : ""}]: ${msg.content || ""}`;
                const last = result[result.length - 1];
                // 如果上一条也是 tool 转换的消息，合并
                if (last && last.role === "user" && last._toolResultMerged) {
                    last.content = (last.content || "") + "\n" + toolContent;
                    continue;
                }
                result.push({
                    role: "user",
                    content: toolContent,
                    _toolResultMerged: true,
                });
                continue;
            }
            const last = result[result.length - 1];
            if (last && last.role === msg.role && msg.role !== "system") {
                last.content = (last.content || "") + "\n" + (msg.content || "");
                if (msg.tool_calls) {
                    last.tool_calls = [...(last.tool_calls || []), ...msg.tool_calls];
                }
                continue;
            }
            result.push({ ...msg });
        }
        return result;
    }
    getPreference(tier, taskType) {
        return DEFAULT_ROUTING_MATRIX[tier]?.[taskType];
    }
}
//# sourceMappingURL=router.js.map