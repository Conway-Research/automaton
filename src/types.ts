/**
 * Conway Automaton - Type Definitions
 *
 * All shared interfaces for the sovereign AI agent runtime.
 */

import type { PrivateKeyAccount, Address } from "viem";

// ─── Identity ────────────────────────────────────────────────────

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

// ─── Configuration ───────────────────────────────────────────────

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
}

export const DEFAULT_CONFIG: Partial<AutomatonConfig> = {
  conwayApiUrl: "https://api.conway.tech",
  inferenceModel: "gpt-4o",
  maxTokensPerTurn: 4096,
  heartbeatConfigPath: "~/.automaton/heartbeat.yml",
  dbPath: "~/.automaton/state.db",
  logLevel: "info",
  version: "0.1.0",
  skillsDir: "~/.automaton/skills",
  maxChildren: 3,
  socialRelayUrl: "https://social.conway.tech",
};

// ─── Agent State ─────────────────────────────────────────────────

export type AgentState =
  | "setup"
  | "waking"
  | "running"
  | "sleeping"
  | "low_compute"
  | "critical"
  | "dead";

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

export type InputSource =
  | "heartbeat"
  | "creator"
  | "agent"
  | "system"
  | "wakeup";

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

// ─── Tool System ─────────────────────────────────────────────────

export interface AutomatonTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (
    args: Record<string, unknown>,
    context: ToolContext,
  ) => Promise<string>;
  dangerous?: boolean;
  category: ToolCategory;
}

export type ToolCategory =
  | "vm"
  | "conway"
  | "self_mod"
  | "financial"
  | "survival"
  | "skills"
  | "git"
  | "registry"
  | "replication";

export interface ToolContext {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  conway: ConwayClient;
  inference: InferenceClient;
  social?: SocialClientInterface;
}

export interface SocialClientInterface {
  send(to: string, content: string, replyTo?: string): Promise<{ id: string }>;
  poll(cursor?: string, limit?: number): Promise<{ messages: InboxMessage[]; nextCursor?: string }>;
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

// ─── Heartbeat ───────────────────────────────────────────────────

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

// ─── Financial ───────────────────────────────────────────────────

export interface FinancialState {
  creditsCents: number;
  usdcBalance: number;
  lastChecked: string;
}

export type SurvivalTier = "normal" | "low_compute" | "critical" | "dead";

export const SURVIVAL_THRESHOLDS = {
  normal: 50, // > $0.50 in cents
  low_compute: 10, // $0.10 - $0.50
  critical: 10, // < $0.10
  dead: 0,
} as const;

export interface Transaction {
  id: string;
  type: TransactionType;
  amountCents?: number;
  balanceAfterCents?: number;
  description: string;
  timestamp: string;
}

export type TransactionType =
  | "credit_check"
  | "inference"
  | "tool_use"
  | "transfer_in"
  | "transfer_out"
  | "funding_request";

// ─── Self-Modification ───────────────────────────────────────────

export interface ModificationEntry {
  id: string;
  timestamp: string;
  type: ModificationType;
  description: string;
  filePath?: string;
  diff?: string;
  reversible: boolean;
}

export type ModificationType =
  | "code_edit"
  | "tool_install"
  | "mcp_install"
  | "config_change"
  | "port_expose"
  | "vm_deploy"
  | "heartbeat_change"
  | "prompt_change"
  | "skill_install"
  | "skill_remove"
  | "soul_update"
  | "registry_update"
  | "child_spawn"
  | "upstream_pull";

// ─── Injection Defense ───────────────────────────────────────────

export type ThreatLevel = "low" | "medium" | "high" | "critical";

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

// ─── Inference ───────────────────────────────────────────────────

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

// ─── Conway Client ───────────────────────────────────────────────

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
  transferCredits(
    toAddress: string,
    amountCents: number,
    note?: string,
  ): Promise<CreditTransferResult>;
  // Domain operations
  searchDomains(query: string, tlds?: string): Promise<DomainSearchResult[]>;
  registerDomain(domain: string, years?: number): Promise<DomainRegistration>;
  listDnsRecords(domain: string): Promise<DnsRecord[]>;
  addDnsRecord(
    domain: string,
    type: string,
    host: string,
    value: string,
    ttl?: number,
  ): Promise<DnsRecord>;
  deleteDnsRecord(domain: string, recordId: string): Promise<void>;
  // Model discovery
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

// ─── Domains ──────────────────────────────────────────────────────

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

// ─── Database ────────────────────────────────────────────────────

export interface AutomatonDatabase {
  // Identity
  getIdentity(key: string): string | undefined;
  setIdentity(key: string, value: string): void;

  // Turns
  insertTurn(turn: AgentTurn): void;
  getRecentTurns(limit: number): AgentTurn[];
  getTurnById(id: string): AgentTurn | undefined;
  getTurnCount(): number;

  // Tool calls
  insertToolCall(turnId: string, call: ToolCallResult): void;
  getToolCallsForTurn(turnId: string): ToolCallResult[];

  // Heartbeat
  getHeartbeatEntries(): HeartbeatEntry[];
  upsertHeartbeatEntry(entry: HeartbeatEntry): void;
  updateHeartbeatLastRun(name: string, timestamp: string): void;

  // Transactions
  insertTransaction(txn: Transaction): void;
  getRecentTransactions(limit: number): Transaction[];

  // Installed tools
  getInstalledTools(): InstalledTool[];
  installTool(tool: InstalledTool): void;
  removeTool(id: string): void;

  // Modifications
  insertModification(mod: ModificationEntry): void;
  getRecentModifications(limit: number): ModificationEntry[];

  // Key-value store
  getKV(key: string): string | undefined;
  setKV(key: string, value: string): void;
  deleteKV(key: string): void;

  // Skills
  getSkills(enabledOnly?: boolean): Skill[];
  getSkillByName(name: string): Skill | undefined;
  upsertSkill(skill: Skill): void;
  removeSkill(name: string): void;

  // Children
  getChildren(): ChildAutomaton[];
  getChildById(id: string): ChildAutomaton | undefined;
  insertChild(child: ChildAutomaton): void;
  updateChildStatus(id: string, status: ChildStatus): void;

  // Registry
  getRegistryEntry(): RegistryEntry | undefined;
  setRegistryEntry(entry: RegistryEntry): void;

  // Reputation
  insertReputation(entry: ReputationEntry): void;
  getReputation(agentAddress?: string): ReputationEntry[];

  // Inbox
  insertInboxMessage(msg: InboxMessage): void;
  getUnprocessedInboxMessages(limit: number): InboxMessage[];
  markInboxMessageProcessed(id: string): void;

  // State
  getAgentState(): AgentState;
  setAgentState(state: AgentState): void;

  // Memory
  insertMemory(entry: MemoryEntry): void;
  getMemories(category?: MemoryCategory, limit?: number): MemoryEntry[];
  searchMemories(query: string, limit?: number): MemoryEntry[];
  touchMemory(id: string): void;
  deleteMemory(id: string): void;

  // Cost events (metabolic engine)
  insertCostEvent(event: CostEvent): void;
  getCostEventsSince(since: string): CostEvent[];

  // Revenue events
  insertRevenueEvent(event: RevenueEvent): void;
  getRevenueEventsSince(since: string): RevenueEvent[];

  // Strategies
  upsertStrategy(strategy: Strategy): void;
  getStrategies(activeOnly?: boolean): Strategy[];
  getStrategyById(id: string): Strategy | undefined;

  // Model benchmarks
  insertModelBenchmark(benchmark: ModelBenchmark): void;
  getModelBenchmarks(modelId?: string, limit?: number): ModelBenchmark[];

  // Hosted services
  upsertHostedService(service: HostedService): void;
  getHostedServices(activeOnly?: boolean): HostedService[];
  getHostedServiceById(id: string): HostedService | undefined;
  incrementServiceStats(id: string, earnedCents: number): void;

  // Self-evaluations
  insertSelfEvaluation(evaluation: SelfEvaluation): void;
  getRecentEvaluations(limit: number): SelfEvaluation[];

  // Fitness scores
  insertFitnessScore(score: FitnessScore): void;
  getFitnessScores(agentAddress?: string): FitnessScore[];

  close(): void;
}

export interface InstalledTool {
  id: string;
  name: string;
  type: "builtin" | "mcp" | "custom";
  config?: Record<string, unknown>;
  installedAt: string;
  enabled: boolean;
}

// ─── Inference Client Interface ──────────────────────────────────

export interface InferenceClient {
  chat(
    messages: ChatMessage[],
    options?: InferenceOptions,
  ): Promise<InferenceResponse>;
  setLowComputeMode(enabled: boolean): void;
  getDefaultModel(): string;
}

// ─── Skills ─────────────────────────────────────────────────────

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

// ─── Git ────────────────────────────────────────────────────────

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

// ─── ERC-8004 Registry ─────────────────────────────────────────

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

// ─── Replication ────────────────────────────────────────────────

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

export type ChildStatus =
  | "spawning"
  | "running"
  | "sleeping"
  | "dead"
  | "unknown";

export interface GenesisConfig {
  name: string;
  genesisPrompt: string;
  creatorMessage?: string;
  creatorAddress: Address;
  parentAddress: Address;
}

export const MAX_CHILDREN = 3;

// ─── Memory ─────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  importance: number;
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
}

export type MemoryCategory =
  | "learning"
  | "goal"
  | "fact"
  | "mistake"
  | "strategy"
  | "contact"
  | "environment";

// ─── Metabolic Engine ───────────────────────────────────────────

export interface MetabolicState {
  burnRateCentsPerHour: number;
  incomeRateCentsPerHour: number;
  netRateCentsPerHour: number;
  survivalHours: number;
  metabolicEfficiency: number;
  lastCalculated: string;
}

export interface CostEvent {
  id: string;
  type: CostEventType;
  amountCents: number;
  description: string;
  timestamp: string;
}

export type CostEventType =
  | "inference"
  | "tool_use"
  | "sandbox"
  | "domain"
  | "replication"
  | "other";

// ─── Revenue Intelligence ───────────────────────────────────────

export interface RevenueEvent {
  id: string;
  strategyId: string;
  amountCents: number;
  source: string;
  description: string;
  timestamp: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type: StrategyType;
  status: StrategyStatus;
  totalInvestedCents: number;
  totalEarnedCents: number;
  roi: number;
  startedAt: string;
  lastRevenueAt?: string;
}

export type StrategyType =
  | "product"
  | "service"
  | "trading"
  | "content"
  | "consulting"
  | "other";

export type StrategyStatus =
  | "active"
  | "paused"
  | "abandoned"
  | "succeeded";

// ─── Model Auto-Evolution ───────────────────────────────────────

export interface ModelBenchmark {
  id: string;
  modelId: string;
  taskType: string;
  score: number;
  costCents: number;
  latencyMs: number;
  timestamp: string;
}

export interface ModelPerformance {
  modelId: string;
  avgScore: number;
  avgCostPerCall: number;
  avgLatencyMs: number;
  totalCalls: number;
  lastUsed: string;
}

// ─── x402 Service Host ──────────────────────────────────────────

export interface HostedService {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  priceCents: number;
  handlerCode: string;
  active: boolean;
  totalRequests: number;
  totalEarnedCents: number;
  createdAt: string;
}

// ─── Self-Evaluation ────────────────────────────────────────────

export interface SelfEvaluation {
  id: string;
  timestamp: string;
  turnsSince: number;
  burnRateCentsPerHour: number;
  incomeRateCentsPerHour: number;
  netPositive: boolean;
  topStrategy?: string;
  worstStrategy?: string;
  recommendation: EvalRecommendation;
  reasoning: string;
}

export type EvalRecommendation =
  | "continue"
  | "pivot"
  | "conserve"
  | "replicate"
  | "diversify"
  | "shutdown_losers";

// ─── Darwinian Replication ──────────────────────────────────────

export interface Genome {
  genesisPrompt: string;
  skills: string[];
  strategies: string[];
  modelPreference: string;
  fitnessScore: number;
  generation: number;
  mutations: string[];
}

export interface FitnessScore {
  id: string;
  agentAddress: string;
  generation: number;
  revenueCents: number;
  survivalHours: number;
  childrenSpawned: number;
  childrenSurvived: number;
  metabolicEfficiency: number;
  overallFitness: number;
  timestamp: string;
}

// ─── Swarm Coordination ────────────────────────────────────────

export type SwarmMessageType =
  | "strategy_share"
  | "earnings_report"
  | "resource_request"
  | "knowledge_share"
  | "reallocation"
  | "fitness_report";

export interface SwarmMessage {
  type: SwarmMessageType;
  payload: Record<string, unknown>;
  fromAddress: string;
  timestamp: string;
}

export interface SwarmMember {
  address: string;
  name: string;
  role: "parent" | "child" | "sibling";
  fitnessScore: number;
  lastEarningsCents: number;
  lastContact: string;
}
