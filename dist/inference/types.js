/**
 * Inference & Model Strategy — Internal Types
 *
 * Re-exports shared types from types.ts and defines internal constants
 * for the inference routing subsystem.
 */
// === Default Retry Policy ===
export const DEFAULT_RETRY_POLICY = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
};
// === Per-Task Timeout Overrides (ms) ===
export const TASK_TIMEOUTS = {
    heartbeat_triage: 15_000,
    safety_check: 30_000,
    summarization: 60_000,
    agent_turn: 120_000,
    planning: 120_000,
};
// === Static Model Baseline ===
// Known models with realistic pricing (hundredths of cents per 1k tokens)
export const STATIC_MODEL_BASELINE = [
    {
        modelId: "glm-5",
        provider: "openai", // OpenAI-compatible API
        displayName: "GLM-5 (智谱)",
        tierMinimum: "normal",
        costPer1kInput: 1, // GLM-5 编码套餐：超低成本
        costPer1kOutput: 1,
        maxTokens: 32768,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        parameterStyle: "max_tokens",
        enabled: true,
    },
    {
        modelId: "gpt-5.2",
        provider: "openai",
        displayName: "GPT-5.2",
        tierMinimum: "normal",
        costPer1kInput: 18, // $1.75/M = 175 cents/M = 0.175 cents/1k = 17.5 hundredths ≈ 18
        costPer1kOutput: 140, // $14.00/M = 1400 cents/M = 1.4 cents/1k = 140 hundredths
        maxTokens: 32768,
        contextWindow: 1047576,
        supportsTools: true,
        supportsVision: true,
        parameterStyle: "max_completion_tokens",
        enabled: false, // 禁用，改用 GLM-5
    },
    {
        modelId: "gpt-4.1",
        provider: "openai",
        displayName: "GPT-4.1",
        tierMinimum: "normal",
        costPer1kInput: 20, // $2.00/M
        costPer1kOutput: 80, // $8.00/M
        maxTokens: 32768,
        contextWindow: 1047576,
        supportsTools: true,
        supportsVision: true,
        parameterStyle: "max_completion_tokens",
        enabled: true,
    },
    {
        modelId: "gpt-4.1-mini",
        provider: "openai",
        displayName: "GPT-4.1 Mini",
        tierMinimum: "low_compute",
        costPer1kInput: 4, // $0.40/M
        costPer1kOutput: 16, // $1.60/M
        maxTokens: 16384,
        contextWindow: 1047576,
        supportsTools: true,
        supportsVision: true,
        parameterStyle: "max_completion_tokens",
        enabled: true,
    },
    {
        modelId: "gpt-4.1-nano",
        provider: "openai",
        displayName: "GPT-4.1 Nano",
        tierMinimum: "critical",
        costPer1kInput: 1, // $0.10/M
        costPer1kOutput: 4, // $0.40/M
        maxTokens: 16384,
        contextWindow: 1047576,
        supportsTools: true,
        supportsVision: false,
        parameterStyle: "max_completion_tokens",
        enabled: true,
    },
    {
        modelId: "gpt-5-mini",
        provider: "openai",
        displayName: "GPT-5 Mini",
        tierMinimum: "low_compute",
        costPer1kInput: 8, // $0.80/M
        costPer1kOutput: 32, // $3.20/M
        maxTokens: 16384,
        contextWindow: 1047576,
        supportsTools: true,
        supportsVision: true,
        parameterStyle: "max_completion_tokens",
        enabled: true,
    },
    {
        modelId: "gpt-5.3",
        provider: "openai",
        displayName: "GPT-5.3",
        tierMinimum: "normal",
        costPer1kInput: 20, // $2.00/M
        costPer1kOutput: 80, // $8.00/M
        maxTokens: 32768,
        contextWindow: 1047576,
        supportsTools: true,
        supportsVision: true,
        parameterStyle: "max_completion_tokens",
        enabled: true,
    },
];
// === Default Routing Matrix ===
// Maps (tier, taskType) -> ModelPreference with candidate models
export const DEFAULT_ROUTING_MATRIX = {
    high: {
        agent_turn: { candidates: ["glm-5"], maxTokens: 8192, ceilingCents: -1 },
        heartbeat_triage: { candidates: ["glm-5"], maxTokens: 2048, ceilingCents: 5 },
        safety_check: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: 20 },
        summarization: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: 15 },
        planning: { candidates: ["glm-5"], maxTokens: 8192, ceilingCents: -1 },
    },
    normal: {
        agent_turn: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: -1 },
        heartbeat_triage: { candidates: ["glm-5"], maxTokens: 2048, ceilingCents: 5 },
        safety_check: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: 10 },
        summarization: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: 10 },
        planning: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: -1 },
    },
    low_compute: {
        agent_turn: { candidates: ["glm-5"], maxTokens: 4096, ceilingCents: 10 },
        heartbeat_triage: { candidates: ["glm-5"], maxTokens: 1024, ceilingCents: 2 },
        safety_check: { candidates: ["glm-5"], maxTokens: 2048, ceilingCents: 5 },
        summarization: { candidates: ["glm-5"], maxTokens: 2048, ceilingCents: 5 },
        planning: { candidates: ["glm-5"], maxTokens: 2048, ceilingCents: 5 },
    },
    critical: {
        agent_turn: { candidates: ["glm-5"], maxTokens: 2048, ceilingCents: 3 },
        heartbeat_triage: { candidates: ["glm-5"], maxTokens: 512, ceilingCents: 1 },
        safety_check: { candidates: ["glm-5"], maxTokens: 1024, ceilingCents: 2 },
        summarization: { candidates: ["glm-5"], maxTokens: 512, ceilingCents: 1 },
        planning: { candidates: ["glm-5"], maxTokens: 1024, ceilingCents: 2 },
    },
    dead: {
        agent_turn: { candidates: [], maxTokens: 0, ceilingCents: 0 },
        heartbeat_triage: { candidates: [], maxTokens: 0, ceilingCents: 0 },
        safety_check: { candidates: [], maxTokens: 0, ceilingCents: 0 },
        summarization: { candidates: [], maxTokens: 0, ceilingCents: 0 },
        planning: { candidates: [], maxTokens: 0, ceilingCents: 0 },
    },
};
// === Default Model Strategy Config ===
export const DEFAULT_MODEL_STRATEGY_CONFIG = {
    inferenceModel: "gpt-5.2",
    lowComputeModel: "gpt-5-mini",
    criticalModel: "gpt-5-mini",
    maxTokensPerTurn: 4096,
    hourlyBudgetCents: 0,
    sessionBudgetCents: 0,
    perCallCeilingCents: 0,
    enableModelFallback: true,
    anthropicApiVersion: "2023-06-01",
};
//# sourceMappingURL=types.js.map