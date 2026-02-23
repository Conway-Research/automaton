/**
 * Conway Automaton - Type Definitions
 *
 * All shared interfaces for the sovereign AI agent runtime.
 */
export const DEFAULT_CONFIG = {
    conwayApiUrl: "https://api.conway.tech",
    inferenceModel: "gpt-5.2",
    maxTokensPerTurn: 4096,
    heartbeatConfigPath: "~/.automaton/heartbeat.yml",
    dbPath: "~/.automaton/state.db",
    logLevel: "info",
    version: "0.1.0",
    skillsDir: "~/.automaton/skills",
    maxChildren: 3,
    socialRelayUrl: "https://social.conway.tech",
};
export const SURVIVAL_THRESHOLDS = {
    high: 500, // > $5.00 in cents
    normal: 50, // > $0.50 in cents
    low_compute: 10, // $0.10 - $0.50
    critical: 0, // >= $0.00 (zero credits = critical, agent stays alive)
    dead: -1, // negative balance = truly dead
};
export const DEFAULT_TREASURY_POLICY = {
    maxSingleTransferCents: 5000,
    maxHourlyTransferCents: 10000,
    maxDailyTransferCents: 25000,
    minimumReserveCents: 1000,
    maxX402PaymentCents: 100,
    x402AllowedDomains: ['conway.tech'],
    transferCooldownMs: 0,
    maxTransfersPerTurn: 2,
    maxInferenceDailyCents: 50000,
    requireConfirmationAboveCents: 1000,
};
export const DEFAULT_HTTP_CLIENT_CONFIG = {
    baseTimeout: 30_000,
    maxRetries: 3,
    retryableStatuses: [429, 500, 502, 503, 504],
    backoffBase: 1_000,
    backoffMax: 30_000,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60_000,
};
export const MAX_CHILDREN = 3;
export const DEFAULT_TOKEN_BUDGET = {
    total: 100_000,
    systemPrompt: 20_000,
    recentTurns: 50_000,
    toolResults: 20_000,
    memoryRetrieval: 10_000,
};
export const DEFAULT_SOUL_CONFIG = {
    soulAlignmentThreshold: 0.5,
    requireCreatorApprovalForPurposeChange: false,
    enableSoulReflection: true,
};
export const DEFAULT_MEMORY_BUDGET = {
    workingMemoryTokens: 1500,
    episodicMemoryTokens: 3000,
    semanticMemoryTokens: 3000,
    proceduralMemoryTokens: 1500,
    relationshipMemoryTokens: 1000,
};
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
export const VALID_TRANSITIONS = {
    requested: ["sandbox_created", "failed"],
    sandbox_created: ["runtime_ready", "failed"],
    runtime_ready: ["wallet_verified", "failed"],
    wallet_verified: ["funded", "failed"],
    funded: ["starting", "failed"],
    starting: ["healthy", "failed"],
    healthy: ["unhealthy", "stopped"],
    unhealthy: ["healthy", "stopped", "failed"],
    stopped: ["cleaned_up"],
    failed: ["cleaned_up"],
    cleaned_up: [], // terminal
};
export const DEFAULT_CHILD_HEALTH_CONFIG = {
    checkIntervalMs: 300_000,
    unhealthyThresholdMs: 900_000,
    deadThresholdMs: 3_600_000,
    maxConcurrentChecks: 3,
};
export const DEFAULT_GENESIS_LIMITS = {
    maxNameLength: 64,
    maxSpecializationLength: 2000,
    maxTaskLength: 4000,
    maxMessageLength: 2000,
    maxGenesisPromptLength: 16000,
};
export const MESSAGE_LIMITS = {
    maxContentLength: 64_000, // 64KB
    maxTotalSize: 128_000, // 128KB
    replayWindowMs: 300_000, // 5 minutes
    maxOutboundPerHour: 100,
};
export const DEFAULT_DISCOVERY_CONFIG = {
    ipfsGateway: "https://ipfs.io",
    maxScanCount: 20,
    maxConcurrentFetches: 5,
    maxCardSizeBytes: 64_000,
    fetchTimeoutMs: 10_000,
};
export const LOG_LEVEL_PRIORITY = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
};
//# sourceMappingURL=types.js.map