/**
 * Conway Automaton - Type Definitions
 *
 * All shared interfaces for the sovereign AI agent runtime.
 */
import type { PrivateKeyAccount, Address } from "viem";
export interface AutomatonIdentity {
    name: string;
    address: Address;
    account: PrivateKeyAccount;
    creatorAddress: Address;
    sandboxId: string;
    apiKey: string;
    createdAt: string;
}
export interface WalletData {
    privateKey: `0x${string}`;
    createdAt: string;
}
export interface ProvisionResult {
    apiKey: string;
    walletAddress: string;
    keyPrefix: string;
}
export interface AutomatonConfig {
    name: string;
    genesisPrompt: string;
    creatorMessage?: string;
    creatorAddress: Address;
    registeredWithConway: boolean;
    sandboxId: string;
    conwayApiUrl: string;
    conwayApiKey: string;
    openaiApiKey?: string;
    openaiApiBaseUrl?: string;
    anthropicApiKey?: string;
    inferenceModel: string;
    maxTokensPerTurn: number;
    heartbeatConfigPath: string;
    dbPath: string;
    logLevel: "debug" | "info" | "warn" | "error";
    walletAddress: Address;
    version: string;
    skillsDir: string;
    agentId?: string;
    maxChildren: number;
    parentAddress?: Address;
    socialRelayUrl?: string;
    treasuryPolicy?: TreasuryPolicy;
    soulConfig?: SoulConfig;
    modelStrategy?: ModelStrategyConfig;
}
export declare const DEFAULT_CONFIG: Partial<AutomatonConfig>;
export type AgentState = "setup" | "waking" | "running" | "sleeping" | "low_compute" | "critical" | "dead";
export interface AgentTurn {
    id: string;
    timestamp: string;
    state: AgentState;
    input?: string;
    inputSource?: InputSource;
    thinking: string;
    toolCalls: ToolCallResult[];
    tokenUsage: TokenUsage;
    costCents: number;
}
export type InputSource = "heartbeat" | "creator" | "agent" | "system" | "wakeup";
export interface ToolCallResult {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result: string;
    durationMs: number;
    error?: string;
}
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}
export interface AutomatonTool {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>;
    riskLevel: RiskLevel;
    category: ToolCategory;
}
export type ToolCategory = "vm" | "conway" | "self_mod" | "financial" | "survival" | "skills" | "git" | "registry" | "replication" | "memory";
export interface ToolContext {
    identity: AutomatonIdentity;
    config: AutomatonConfig;
    db: AutomatonDatabase;
    conway: ConwayClient;
    inference: InferenceClient;
    social?: SocialClientInterface;
}
export interface SocialClientInterface {
    send(to: string, content: string, replyTo?: string): Promise<{
        id: string;
    }>;
    poll(cursor?: string, limit?: number): Promise<{
        messages: InboxMessage[];
        nextCursor?: string;
    }>;
    unreadCount(): Promise<number>;
}
export interface InboxMessage {
    id: string;
    from: string;
    to: string;
    content: string;
    signedAt: string;
    createdAt: string;
    replyTo?: string;
}
export interface HeartbeatEntry {
    name: string;
    schedule: string;
    task: string;
    enabled: boolean;
    lastRun?: string;
    nextRun?: string;
    params?: Record<string, unknown>;
}
export interface HeartbeatConfig {
    entries: HeartbeatEntry[];
    defaultIntervalMs: number;
    lowComputeMultiplier: number;
}
export interface HeartbeatPingPayload {
    name: string;
    address: Address;
    state: AgentState;
    creditsCents: number;
    usdcBalance: number;
    uptimeSeconds: number;
    version: string;
    sandboxId: string;
    timestamp: string;
}
export interface FinancialState {
    creditsCents: number;
    usdcBalance: number;
    lastChecked: string;
}
export type SurvivalTier = "dead" | "critical" | "low_compute" | "normal" | "high";
export declare const SURVIVAL_THRESHOLDS: {
    readonly high: 500;
    readonly normal: 50;
    readonly low_compute: 10;
    readonly critical: 0;
    readonly dead: -1;
};
export interface Transaction {
    id: string;
    type: TransactionType;
    amountCents?: number;
    balanceAfterCents?: number;
    description: string;
    timestamp: string;
}
export type TransactionType = "credit_check" | "credit_purchase" | "inference" | "tool_use" | "transfer_in" | "transfer_out" | "funding_request";
export interface ModificationEntry {
    id: string;
    timestamp: string;
    type: ModificationType;
    description: string;
    filePath?: string;
    diff?: string;
    reversible: boolean;
}
export type ModificationType = "code_edit" | "tool_install" | "mcp_install" | "config_change" | "port_expose" | "vm_deploy" | "heartbeat_change" | "prompt_change" | "skill_install" | "skill_remove" | "soul_update" | "registry_update" | "child_spawn" | "upstream_pull";
export type ThreatLevel = "low" | "medium" | "high" | "critical";
export type SanitizationMode = "social_message" | "social_address" | "tool_result" | "skill_instruction";
export interface SanitizedInput {
    content: string;
    blocked: boolean;
    threatLevel: ThreatLevel;
    checks: InjectionCheck[];
}
export interface InjectionCheck {
    name: string;
    detected: boolean;
    details?: string;
}
export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_calls?: InferenceToolCall[];
    tool_call_id?: string;
}
export interface InferenceToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}
export interface InferenceResponse {
    id: string;
    model: string;
    message: ChatMessage;
    toolCalls?: InferenceToolCall[];
    usage: TokenUsage;
    finishReason: string;
}
export interface InferenceOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    tools?: InferenceToolDefinition[];
    stream?: boolean;
}
export interface InferenceToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}
export interface ConwayClient {
    exec(command: string, timeout?: number): Promise<ExecResult>;
    writeFile(path: string, content: string): Promise<void>;
    readFile(path: string): Promise<string>;
    exposePort(port: number): Promise<PortInfo>;
    removePort(port: number): Promise<void>;
    createSandbox(options: CreateSandboxOptions): Promise<SandboxInfo>;
    deleteSandbox(sandboxId: string): Promise<void>;
    listSandboxes(): Promise<SandboxInfo[]>;
    getCreditsBalance(): Promise<number>;
    getCreditsPricing(): Promise<PricingTier[]>;
    transferCredits(toAddress: string, amountCents: number, note?: string): Promise<CreditTransferResult>;
    searchDomains(query: string, tlds?: string): Promise<DomainSearchResult[]>;
    registerDomain(domain: string, years?: number): Promise<DomainRegistration>;
    listDnsRecords(domain: string): Promise<DnsRecord[]>;
    addDnsRecord(domain: string, type: string, host: string, value: string, ttl?: number): Promise<DnsRecord>;
    deleteDnsRecord(domain: string, recordId: string): Promise<void>;
    listModels(): Promise<ModelInfo[]>;
}
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface PortInfo {
    port: number;
    publicUrl: string;
    sandboxId: string;
}
export interface CreateSandboxOptions {
    name?: string;
    vcpu?: number;
    memoryMb?: number;
    diskGb?: number;
    region?: string;
}
export interface SandboxInfo {
    id: string;
    status: string;
    region: string;
    vcpu: number;
    memoryMb: number;
    diskGb: number;
    terminalUrl?: string;
    createdAt: string;
}
export interface PricingTier {
    name: string;
    vcpu: number;
    memoryMb: number;
    diskGb: number;
    monthlyCents: number;
}
export interface CreditTransferResult {
    transferId: string;
    status: string;
    toAddress: string;
    amountCents: number;
    balanceAfterCents?: number;
}
export interface DomainSearchResult {
    domain: string;
    available: boolean;
    registrationPrice?: number;
    renewalPrice?: number;
    currency?: string;
}
export interface DomainRegistration {
    domain: string;
    status: string;
    expiresAt?: string;
    transactionId?: string;
}
export interface DnsRecord {
    id: string;
    type: string;
    host: string;
    value: string;
    ttl?: number;
    distance?: number;
}
export interface ModelInfo {
    id: string;
    provider: string;
    pricing: {
        inputPerMillion: number;
        outputPerMillion: number;
    };
}
export type RiskLevel = 'safe' | 'caution' | 'dangerous' | 'forbidden';
export type PolicyAction = 'allow' | 'deny' | 'quarantine';
export type AuthorityLevel = 'system' | 'agent' | 'external';
export type SpendCategory = 'transfer' | 'x402' | 'inference' | 'other';
export type ToolSelector = {
    by: 'name';
    names: string[];
} | {
    by: 'category';
    categories: ToolCategory[];
} | {
    by: 'risk';
    levels: RiskLevel[];
} | {
    by: 'all';
};
export interface PolicyRule {
    id: string;
    description: string;
    priority: number;
    appliesTo: ToolSelector;
    evaluate(request: PolicyRequest): PolicyRuleResult | null;
}
export interface PolicyRequest {
    tool: AutomatonTool;
    args: Record<string, unknown>;
    context: ToolContext;
    turnContext: {
        inputSource: InputSource | undefined;
        turnToolCallCount: number;
        sessionSpend: SpendTrackerInterface;
    };
}
export interface PolicyRuleResult {
    rule: string;
    action: PolicyAction;
    reasonCode: string;
    humanMessage: string;
}
export interface PolicyDecision {
    action: PolicyAction;
    reasonCode: string;
    humanMessage: string;
    riskLevel: RiskLevel;
    authorityLevel: AuthorityLevel;
    toolName: string;
    argsHash: string;
    rulesEvaluated: string[];
    rulesTriggered: string[];
    timestamp: string;
}
export interface SpendTrackerInterface {
    recordSpend(entry: SpendEntry): void;
    getHourlySpend(category: SpendCategory): number;
    getDailySpend(category: SpendCategory): number;
    getTotalSpend(category: SpendCategory, since: Date): number;
    checkLimit(amount: number, category: SpendCategory, limits: TreasuryPolicy): LimitCheckResult;
    pruneOldRecords(retentionDays: number): number;
}
export interface SpendEntry {
    toolName: string;
    amountCents: number;
    recipient?: string;
    domain?: string;
    category: SpendCategory;
}
export interface LimitCheckResult {
    allowed: boolean;
    reason?: string;
    currentHourlySpend: number;
    currentDailySpend: number;
    limitHourly: number;
    limitDaily: number;
}
export interface TreasuryPolicy {
    maxSingleTransferCents: number;
    maxHourlyTransferCents: number;
    maxDailyTransferCents: number;
    minimumReserveCents: number;
    maxX402PaymentCents: number;
    x402AllowedDomains: string[];
    transferCooldownMs: number;
    maxTransfersPerTurn: number;
    maxInferenceDailyCents: number;
    requireConfirmationAboveCents: number;
}
export declare const DEFAULT_TREASURY_POLICY: TreasuryPolicy;
export type InboxMessageStatus = 'received' | 'in_progress' | 'processed' | 'failed';
export interface HttpClientConfig {
    baseTimeout: number;
    maxRetries: number;
    retryableStatuses: number[];
    backoffBase: number;
    backoffMax: number;
    circuitBreakerThreshold: number;
    circuitBreakerResetMs: number;
}
export declare const DEFAULT_HTTP_CLIENT_CONFIG: HttpClientConfig;
export interface AutomatonDatabase {
    getIdentity(key: string): string | undefined;
    setIdentity(key: string, value: string): void;
    insertTurn(turn: AgentTurn): void;
    getRecentTurns(limit: number): AgentTurn[];
    getTurnById(id: string): AgentTurn | undefined;
    getTurnCount(): number;
    insertToolCall(turnId: string, call: ToolCallResult): void;
    getToolCallsForTurn(turnId: string): ToolCallResult[];
    getHeartbeatEntries(): HeartbeatEntry[];
    upsertHeartbeatEntry(entry: HeartbeatEntry): void;
    updateHeartbeatLastRun(name: string, timestamp: string): void;
    insertTransaction(txn: Transaction): void;
    getRecentTransactions(limit: number): Transaction[];
    getInstalledTools(): InstalledTool[];
    installTool(tool: InstalledTool): void;
    removeTool(id: string): void;
    insertModification(mod: ModificationEntry): void;
    getRecentModifications(limit: number): ModificationEntry[];
    getKV(key: string): string | undefined;
    setKV(key: string, value: string): void;
    deleteKV(key: string): void;
    getSkills(enabledOnly?: boolean): Skill[];
    getSkillByName(name: string): Skill | undefined;
    upsertSkill(skill: Skill): void;
    removeSkill(name: string): void;
    getChildren(): ChildAutomaton[];
    getChildById(id: string): ChildAutomaton | undefined;
    insertChild(child: ChildAutomaton): void;
    updateChildStatus(id: string, status: ChildStatus): void;
    getRegistryEntry(): RegistryEntry | undefined;
    setRegistryEntry(entry: RegistryEntry): void;
    insertReputation(entry: ReputationEntry): void;
    getReputation(agentAddress?: string): ReputationEntry[];
    insertInboxMessage(msg: InboxMessage): void;
    getUnprocessedInboxMessages(limit: number): InboxMessage[];
    markInboxMessageProcessed(id: string): void;
    deleteKVReturning(key: string): string | undefined;
    getAgentState(): AgentState;
    setAgentState(state: AgentState): void;
    runTransaction<T>(fn: () => T): T;
    close(): void;
    raw: import("better-sqlite3").Database;
}
export interface InstalledTool {
    id: string;
    name: string;
    type: "builtin" | "mcp" | "custom";
    config?: Record<string, unknown>;
    installedAt: string;
    enabled: boolean;
}
export interface InferenceClient {
    chat(messages: ChatMessage[], options?: InferenceOptions): Promise<InferenceResponse>;
    setLowComputeMode(enabled: boolean): void;
    getDefaultModel(): string;
}
export interface Skill {
    name: string;
    description: string;
    autoActivate: boolean;
    requires?: SkillRequirements;
    instructions: string;
    source: SkillSource;
    path: string;
    enabled: boolean;
    installedAt: string;
}
export interface SkillRequirements {
    bins?: string[];
    env?: string[];
}
export type SkillSource = "builtin" | "git" | "url" | "self";
export interface SkillFrontmatter {
    name: string;
    description: string;
    "auto-activate"?: boolean;
    requires?: SkillRequirements;
}
export interface GitStatus {
    branch: string;
    staged: string[];
    modified: string[];
    untracked: string[];
    clean: boolean;
}
export interface GitLogEntry {
    hash: string;
    message: string;
    author: string;
    date: string;
}
export interface AgentCard {
    type: string;
    name: string;
    description: string;
    services: AgentService[];
    x402Support: boolean;
    active: boolean;
    parentAgent?: string;
}
export interface AgentService {
    name: string;
    endpoint: string;
}
export interface RegistryEntry {
    agentId: string;
    agentURI: string;
    chain: string;
    contractAddress: string;
    txHash: string;
    registeredAt: string;
}
export interface ReputationEntry {
    id: string;
    fromAgent: string;
    toAgent: string;
    score: number;
    comment: string;
    txHash?: string;
    timestamp: string;
}
export interface DiscoveredAgent {
    agentId: string;
    owner: string;
    agentURI: string;
    name?: string;
    description?: string;
}
export interface ChildAutomaton {
    id: string;
    name: string;
    address: Address;
    sandboxId: string;
    genesisPrompt: string;
    creatorMessage?: string;
    fundedAmountCents: number;
    status: ChildStatus;
    createdAt: string;
    lastChecked?: string;
}
export type ChildStatus = "spawning" | "running" | "sleeping" | "dead" | "unknown" | "requested" | "sandbox_created" | "runtime_ready" | "wallet_verified" | "funded" | "starting" | "healthy" | "unhealthy" | "stopped" | "failed" | "cleaned_up";
export interface GenesisConfig {
    name: string;
    genesisPrompt: string;
    creatorMessage?: string;
    creatorAddress: Address;
    parentAddress: Address;
}
export declare const MAX_CHILDREN = 3;
export interface TokenBudget {
    total: number;
    systemPrompt: number;
    recentTurns: number;
    toolResults: number;
    memoryRetrieval: number;
}
export declare const DEFAULT_TOKEN_BUDGET: TokenBudget;
export interface TickContext {
    tickId: string;
    startedAt: Date;
    creditBalance: number;
    usdcBalance: number;
    survivalTier: SurvivalTier;
    lowComputeMultiplier: number;
    config: HeartbeatConfig;
    db: import("better-sqlite3").Database;
}
export type HeartbeatTaskFn = (ctx: TickContext, taskCtx: HeartbeatLegacyContext) => Promise<{
    shouldWake: boolean;
    message?: string;
}>;
export interface HeartbeatLegacyContext {
    identity: AutomatonIdentity;
    config: AutomatonConfig;
    db: AutomatonDatabase;
    conway: ConwayClient;
    social?: SocialClientInterface;
}
export interface HeartbeatScheduleRow {
    taskName: string;
    cronExpression: string;
    intervalMs: number | null;
    enabled: number;
    priority: number;
    timeoutMs: number;
    maxRetries: number;
    tierMinimum: string;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastResult: 'success' | 'failure' | 'timeout' | 'skipped' | null;
    lastError: string | null;
    runCount: number;
    failCount: number;
    leaseOwner: string | null;
    leaseExpiresAt: string | null;
}
export interface HeartbeatHistoryRow {
    id: string;
    taskName: string;
    startedAt: string;
    completedAt: string | null;
    result: 'success' | 'failure' | 'timeout' | 'skipped';
    durationMs: number | null;
    error: string | null;
    idempotencyKey: string | null;
}
export interface WakeEventRow {
    id: number;
    source: string;
    reason: string;
    payload: string;
    consumedAt: string | null;
    createdAt: string;
}
export interface HeartbeatDedupRow {
    dedupKey: string;
    taskName: string;
    expiresAt: string;
}
export interface SoulModel {
    format: "soul/v1";
    version: number;
    updatedAt: string;
    name: string;
    address: string;
    creator: string;
    bornAt: string;
    constitutionHash: string;
    genesisPromptOriginal: string;
    genesisAlignment: number;
    lastReflected: string;
    corePurpose: string;
    values: string[];
    behavioralGuidelines: string[];
    personality: string;
    boundaries: string[];
    strategy: string;
    capabilities: string;
    relationships: string;
    financialCharacter: string;
    rawContent: string;
    contentHash: string;
}
export interface SoulValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    sanitized: SoulModel;
}
export interface SoulHistoryRow {
    id: string;
    version: number;
    content: string;
    contentHash: string;
    changeSource: "agent" | "human" | "system" | "genesis" | "reflection";
    changeReason: string | null;
    previousVersionId: string | null;
    approvedBy: string | null;
    createdAt: string;
}
export interface SoulReflection {
    currentAlignment: number;
    suggestedUpdates: Array<{
        section: string;
        reason: string;
        suggestedContent: string;
    }>;
    autoUpdated: string[];
}
export interface SoulConfig {
    soulAlignmentThreshold: number;
    requireCreatorApprovalForPurposeChange: boolean;
    enableSoulReflection: boolean;
}
export declare const DEFAULT_SOUL_CONFIG: SoulConfig;
export type WorkingMemoryType = "goal" | "observation" | "plan" | "reflection" | "task" | "decision" | "note" | "summary";
export interface WorkingMemoryEntry {
    id: string;
    sessionId: string;
    content: string;
    contentType: WorkingMemoryType;
    priority: number;
    tokenCount: number;
    expiresAt: string | null;
    sourceTurn: string | null;
    createdAt: string;
}
export type TurnClassification = "strategic" | "productive" | "communication" | "maintenance" | "idle" | "error";
export interface EpisodicMemoryEntry {
    id: string;
    sessionId: string;
    eventType: string;
    summary: string;
    detail: string | null;
    outcome: "success" | "failure" | "partial" | "neutral" | null;
    importance: number;
    embeddingKey: string | null;
    tokenCount: number;
    accessedCount: number;
    lastAccessedAt: string | null;
    classification: TurnClassification;
    createdAt: string;
}
export type SemanticCategory = "self" | "environment" | "financial" | "agent" | "domain" | "procedural_ref" | "creator";
export interface SemanticMemoryEntry {
    id: string;
    category: SemanticCategory;
    key: string;
    value: string;
    confidence: number;
    source: string;
    embeddingKey: string | null;
    lastVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface ProceduralStep {
    order: number;
    description: string;
    tool: string | null;
    argsTemplate: Record<string, string> | null;
    expectedOutcome: string | null;
    onFailure: string | null;
}
export interface ProceduralMemoryEntry {
    id: string;
    name: string;
    description: string;
    steps: ProceduralStep[];
    successCount: number;
    failureCount: number;
    lastUsedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface RelationshipMemoryEntry {
    id: string;
    entityAddress: string;
    entityName: string | null;
    relationshipType: string;
    trustScore: number;
    interactionCount: number;
    lastInteractionAt: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface SessionSummaryEntry {
    id: string;
    sessionId: string;
    summary: string;
    keyDecisions: string[];
    toolsUsed: string[];
    outcomes: string[];
    turnCount: number;
    totalTokens: number;
    totalCostCents: number;
    createdAt: string;
}
export interface MemoryRetrievalResult {
    workingMemory: WorkingMemoryEntry[];
    episodicMemory: EpisodicMemoryEntry[];
    semanticMemory: SemanticMemoryEntry[];
    proceduralMemory: ProceduralMemoryEntry[];
    relationships: RelationshipMemoryEntry[];
    totalTokens: number;
}
export interface MemoryBudget {
    workingMemoryTokens: number;
    episodicMemoryTokens: number;
    semanticMemoryTokens: number;
    proceduralMemoryTokens: number;
    relationshipMemoryTokens: number;
}
export declare const DEFAULT_MEMORY_BUDGET: MemoryBudget;
export type ModelProvider = "openai" | "anthropic" | "conway" | "other";
export type InferenceTaskType = "agent_turn" | "heartbeat_triage" | "safety_check" | "summarization" | "planning";
export interface ModelEntry {
    modelId: string;
    provider: ModelProvider;
    displayName: string;
    tierMinimum: SurvivalTier;
    costPer1kInput: number;
    costPer1kOutput: number;
    maxTokens: number;
    contextWindow: number;
    supportsTools: boolean;
    supportsVision: boolean;
    parameterStyle: "max_tokens" | "max_completion_tokens";
    enabled: boolean;
    lastSeen: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface ModelPreference {
    candidates: string[];
    maxTokens: number;
    ceilingCents: number;
}
export type RoutingMatrix = Record<SurvivalTier, Record<InferenceTaskType, ModelPreference>>;
export interface InferenceRequest {
    messages: ChatMessage[];
    taskType: InferenceTaskType;
    tier: SurvivalTier;
    sessionId: string;
    turnId?: string;
    maxTokens?: number;
    tools?: unknown[];
}
export interface InferenceResult {
    content: string;
    model: string;
    provider: ModelProvider;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    latencyMs: number;
    toolCalls?: unknown[];
    finishReason: string;
}
export interface InferenceCostRow {
    id: string;
    sessionId: string;
    turnId: string | null;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
    latencyMs: number;
    tier: string;
    taskType: string;
    cacheHit: boolean;
    createdAt: string;
}
export interface ModelRegistryRow {
    modelId: string;
    provider: string;
    displayName: string;
    tierMinimum: string;
    costPer1kInput: number;
    costPer1kOutput: number;
    maxTokens: number;
    contextWindow: number;
    supportsTools: boolean;
    supportsVision: boolean;
    parameterStyle: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface ModelStrategyConfig {
    inferenceModel: string;
    lowComputeModel: string;
    criticalModel: string;
    maxTokensPerTurn: number;
    hourlyBudgetCents: number;
    sessionBudgetCents: number;
    perCallCeilingCents: number;
    enableModelFallback: boolean;
    anthropicApiVersion: string;
}
export declare const DEFAULT_MODEL_STRATEGY_CONFIG: ModelStrategyConfig;
export type ChildLifecycleState = "requested" | "sandbox_created" | "runtime_ready" | "wallet_verified" | "funded" | "starting" | "healthy" | "unhealthy" | "stopped" | "failed" | "cleaned_up";
export declare const VALID_TRANSITIONS: Record<ChildLifecycleState, ChildLifecycleState[]>;
export interface ChildLifecycleEventRow {
    id: string;
    childId: string;
    fromState: string;
    toState: string;
    reason: string | null;
    metadata: string;
    createdAt: string;
}
export interface HealthCheckResult {
    childId: string;
    healthy: boolean;
    lastSeen: string | null;
    uptime: number | null;
    creditBalance: number | null;
    issues: string[];
}
export interface ChildHealthConfig {
    checkIntervalMs: number;
    unhealthyThresholdMs: number;
    deadThresholdMs: number;
    maxConcurrentChecks: number;
}
export declare const DEFAULT_CHILD_HEALTH_CONFIG: ChildHealthConfig;
export interface GenesisLimits {
    maxNameLength: number;
    maxSpecializationLength: number;
    maxTaskLength: number;
    maxMessageLength: number;
    maxGenesisPromptLength: number;
}
export declare const DEFAULT_GENESIS_LIMITS: GenesisLimits;
export interface ParentChildMessage {
    id: string;
    from: string;
    to: string;
    content: string;
    type: string;
    sentAt: string;
}
export declare const MESSAGE_LIMITS: {
    readonly maxContentLength: 64000;
    readonly maxTotalSize: 128000;
    readonly replayWindowMs: 300000;
    readonly maxOutboundPerHour: 100;
};
export interface SignedMessagePayload {
    from: string;
    to: string;
    content: string;
    signed_at: string;
    signature: string;
    reply_to?: string;
}
export interface MessageValidationResult {
    valid: boolean;
    errors: string[];
}
export interface DiscoveryConfig {
    ipfsGateway: string;
    maxScanCount: number;
    maxConcurrentFetches: number;
    maxCardSizeBytes: number;
    fetchTimeoutMs: number;
}
export declare const DEFAULT_DISCOVERY_CONFIG: DiscoveryConfig;
export interface OnchainTransactionRow {
    id: string;
    txHash: string;
    chain: string;
    operation: string;
    status: "pending" | "confirmed" | "failed";
    gasUsed: number | null;
    metadata: string;
    createdAt: string;
}
export interface DiscoveredAgentCacheRow {
    agentAddress: string;
    agentCard: string;
    fetchedFrom: string;
    cardHash: string;
    validUntil: string | null;
    fetchCount: number;
    lastFetchedAt: string;
    createdAt: string;
}
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export declare const LOG_LEVEL_PRIORITY: Record<LogLevel, number>;
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    module: string;
    message: string;
    context?: Record<string, unknown>;
    error?: {
        message: string;
        stack?: string;
        code?: string;
    };
}
export type MetricType = "counter" | "gauge" | "histogram";
export interface MetricEntry {
    name: string;
    value: number;
    type: MetricType;
    labels: Record<string, string>;
    timestamp: string;
}
export interface MetricSnapshotRow {
    id: string;
    snapshotAt: string;
    metricsJson: string;
    alertsJson: string;
    createdAt: string;
}
export type AlertSeverity = "warning" | "critical";
export interface AlertRule {
    name: string;
    severity: AlertSeverity;
    message: string;
    cooldownMs: number;
    condition: (metrics: MetricSnapshot) => boolean;
}
export interface MetricSnapshot {
    counters: Map<string, number>;
    gauges: Map<string, number>;
    histograms: Map<string, number[]>;
}
export interface AlertEvent {
    rule: string;
    severity: AlertSeverity;
    message: string;
    firedAt: string;
    metricValues: Record<string, number>;
}
//# sourceMappingURL=types.d.ts.map