/**
 * Automaton Database
 *
 * SQLite-backed persistent state for the automaton.
 * Uses bun:sqlite for synchronous, single-process access.
 */

import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";
import type {
  AutomatonDatabase,
  AgentTurn,
  AgentState,
  ToolCallResult,
  HeartbeatEntry,
  Transaction,
  InstalledTool,
  ModificationEntry,
  Skill,
  ChildAutomaton,
  ChildStatus,
  RegistryEntry,
  ReputationEntry,
  InboxMessage,
  MemoryEntry,
  MemoryCategory,
  CostEvent,
  RevenueEvent,
  Strategy,
  ModelBenchmark,
  HostedService,
  SelfEvaluation,
  FitnessScore,
} from "../types.js";
import { SCHEMA_VERSION, CREATE_TABLES, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5 } from "./schema.js";

export function createDatabase(dbPath: string): AutomatonDatabase {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Initialize schema
  db.exec(CREATE_TABLES);

  // Check and apply schema version
  const versionRow = db
    .prepare("SELECT MAX(version) as v FROM schema_version")
    .get() as { v: number | null } | undefined;
  const currentVersion = versionRow?.v ?? 0;

  if (currentVersion < 2) {
    db.exec(MIGRATION_V2);
  }

  if (currentVersion < 3) {
    db.exec(MIGRATION_V3);
  }

  if (currentVersion < 4) {
    db.exec(MIGRATION_V4);
  }

  if (currentVersion < 5) {
    db.exec(MIGRATION_V5);
  }

  if (currentVersion < SCHEMA_VERSION) {
    db.prepare(
      "INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, datetime('now'))",
    ).run(SCHEMA_VERSION);
  }

  // ─── Identity ────────────────────────────────────────────────

  const getIdentity = (key: string): string | undefined => {
    const row = db
      .prepare("SELECT value FROM identity WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  };

  const setIdentity = (key: string, value: string): void => {
    db.prepare(
      "INSERT OR REPLACE INTO identity (key, value) VALUES (?, ?)",
    ).run(key, value);
  };

  // ─── Turns ───────────────────────────────────────────────────

  const insertTurn = (turn: AgentTurn): void => {
    db.prepare(
      `INSERT INTO turns (id, timestamp, state, input, input_source, thinking, tool_calls, token_usage, cost_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      turn.id,
      turn.timestamp,
      turn.state,
      turn.input ?? null,
      turn.inputSource ?? null,
      turn.thinking,
      JSON.stringify(turn.toolCalls),
      JSON.stringify(turn.tokenUsage),
      turn.costCents,
    );
  };

  const getRecentTurns = (limit: number): AgentTurn[] => {
    const rows = db
      .prepare(
        "SELECT * FROM turns ORDER BY timestamp DESC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(deserializeTurn).reverse();
  };

  const getTurnById = (id: string): AgentTurn | undefined => {
    const row = db
      .prepare("SELECT * FROM turns WHERE id = ?")
      .get(id) as any | undefined;
    return row ? deserializeTurn(row) : undefined;
  };

  const getTurnCount = (): number => {
    const row = db
      .prepare("SELECT COUNT(*) as count FROM turns")
      .get() as { count: number };
    return row.count;
  };

  // ─── Tool Calls ──────────────────────────────────────────────

  const insertToolCall = (
    turnId: string,
    call: ToolCallResult,
  ): void => {
    db.prepare(
      `INSERT INTO tool_calls (id, turn_id, name, arguments, result, duration_ms, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      call.id,
      turnId,
      call.name,
      JSON.stringify(call.arguments),
      call.result,
      call.durationMs,
      call.error ?? null,
    );
  };

  const getToolCallsForTurn = (turnId: string): ToolCallResult[] => {
    const rows = db
      .prepare("SELECT * FROM tool_calls WHERE turn_id = ?")
      .all(turnId) as any[];
    return rows.map(deserializeToolCall);
  };

  // ─── Heartbeat ───────────────────────────────────────────────

  const getHeartbeatEntries = (): HeartbeatEntry[] => {
    const rows = db
      .prepare("SELECT * FROM heartbeat_entries")
      .all() as any[];
    return rows.map(deserializeHeartbeatEntry);
  };

  const upsertHeartbeatEntry = (entry: HeartbeatEntry): void => {
    db.prepare(
      `INSERT OR REPLACE INTO heartbeat_entries (name, schedule, task, enabled, last_run, next_run, params, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(
      entry.name,
      entry.schedule,
      entry.task,
      entry.enabled ? 1 : 0,
      entry.lastRun ?? null,
      entry.nextRun ?? null,
      JSON.stringify(entry.params ?? {}),
    );
  };

  const updateHeartbeatLastRun = (
    name: string,
    timestamp: string,
  ): void => {
    db.prepare(
      "UPDATE heartbeat_entries SET last_run = ?, updated_at = datetime('now') WHERE name = ?",
    ).run(timestamp, name);
  };

  // ─── Transactions ────────────────────────────────────────────

  const insertTransaction = (txn: Transaction): void => {
    db.prepare(
      `INSERT INTO transactions (id, type, amount_cents, balance_after_cents, description)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      txn.id,
      txn.type,
      txn.amountCents ?? null,
      txn.balanceAfterCents ?? null,
      txn.description,
    );
  };

  const getRecentTransactions = (limit: number): Transaction[] => {
    const rows = db
      .prepare(
        "SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(deserializeTransaction).reverse();
  };

  // ─── Installed Tools ─────────────────────────────────────────

  const getInstalledTools = (): InstalledTool[] => {
    const rows = db
      .prepare("SELECT * FROM installed_tools WHERE enabled = 1")
      .all() as any[];
    return rows.map(deserializeInstalledTool);
  };

  const installTool = (tool: InstalledTool): void => {
    db.prepare(
      `INSERT OR REPLACE INTO installed_tools (id, name, type, config, installed_at, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      tool.id,
      tool.name,
      tool.type,
      JSON.stringify(tool.config ?? {}),
      tool.installedAt,
      tool.enabled ? 1 : 0,
    );
  };

  const removeTool = (id: string): void => {
    db.prepare(
      "UPDATE installed_tools SET enabled = 0 WHERE id = ?",
    ).run(id);
  };

  // ─── Modifications ───────────────────────────────────────────

  const insertModification = (mod: ModificationEntry): void => {
    db.prepare(
      `INSERT INTO modifications (id, timestamp, type, description, file_path, diff, reversible)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mod.id,
      mod.timestamp,
      mod.type,
      mod.description,
      mod.filePath ?? null,
      mod.diff ?? null,
      mod.reversible ? 1 : 0,
    );
  };

  const getRecentModifications = (
    limit: number,
  ): ModificationEntry[] => {
    const rows = db
      .prepare(
        "SELECT * FROM modifications ORDER BY timestamp DESC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(deserializeModification).reverse();
  };

  // ─── Key-Value Store ─────────────────────────────────────────

  const getKV = (key: string): string | undefined => {
    const row = db
      .prepare("SELECT value FROM kv WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  };

  const setKV = (key: string, value: string): void => {
    db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    ).run(key, value);
  };

  const deleteKV = (key: string): void => {
    db.prepare("DELETE FROM kv WHERE key = ?").run(key);
  };

  // ─── Skills ─────────────────────────────────────────────────

  const getSkills = (enabledOnly?: boolean): Skill[] => {
    const query = enabledOnly
      ? "SELECT * FROM skills WHERE enabled = 1"
      : "SELECT * FROM skills";
    const rows = db.prepare(query).all() as any[];
    return rows.map(deserializeSkill);
  };

  const getSkillByName = (name: string): Skill | undefined => {
    const row = db
      .prepare("SELECT * FROM skills WHERE name = ?")
      .get(name) as any | undefined;
    return row ? deserializeSkill(row) : undefined;
  };

  const upsertSkill = (skill: Skill): void => {
    db.prepare(
      `INSERT OR REPLACE INTO skills (name, description, auto_activate, requires, instructions, source, path, enabled, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      skill.name,
      skill.description,
      skill.autoActivate ? 1 : 0,
      JSON.stringify(skill.requires ?? {}),
      skill.instructions,
      skill.source,
      skill.path,
      skill.enabled ? 1 : 0,
      skill.installedAt,
    );
  };

  const removeSkill = (name: string): void => {
    db.prepare("UPDATE skills SET enabled = 0 WHERE name = ?").run(name);
  };

  // ─── Children ──────────────────────────────────────────────

  const getChildren = (): ChildAutomaton[] => {
    const rows = db
      .prepare("SELECT * FROM children ORDER BY created_at DESC")
      .all() as any[];
    return rows.map(deserializeChild);
  };

  const getChildById = (id: string): ChildAutomaton | undefined => {
    const row = db
      .prepare("SELECT * FROM children WHERE id = ?")
      .get(id) as any | undefined;
    return row ? deserializeChild(row) : undefined;
  };

  const insertChild = (child: ChildAutomaton): void => {
    db.prepare(
      `INSERT INTO children (id, name, address, sandbox_id, genesis_prompt, creator_message, funded_amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      child.id,
      child.name,
      child.address,
      child.sandboxId,
      child.genesisPrompt,
      child.creatorMessage ?? null,
      child.fundedAmountCents,
      child.status,
      child.createdAt,
    );
  };

  const updateChildStatus = (id: string, status: ChildStatus): void => {
    db.prepare(
      "UPDATE children SET status = ?, last_checked = datetime('now') WHERE id = ?",
    ).run(status, id);
  };

  // ─── Registry ──────────────────────────────────────────────

  const getRegistryEntry = (): RegistryEntry | undefined => {
    const row = db
      .prepare("SELECT * FROM registry LIMIT 1")
      .get() as any | undefined;
    return row ? deserializeRegistry(row) : undefined;
  };

  const setRegistryEntry = (entry: RegistryEntry): void => {
    db.prepare(
      `INSERT OR REPLACE INTO registry (agent_id, agent_uri, chain, contract_address, tx_hash, registered_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.agentId,
      entry.agentURI,
      entry.chain,
      entry.contractAddress,
      entry.txHash,
      entry.registeredAt,
    );
  };

  // ─── Reputation ────────────────────────────────────────────

  const insertReputation = (entry: ReputationEntry): void => {
    db.prepare(
      `INSERT INTO reputation (id, from_agent, to_agent, score, comment, tx_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.id,
      entry.fromAgent,
      entry.toAgent,
      entry.score,
      entry.comment,
      entry.txHash ?? null,
    );
  };

  const getReputation = (agentAddress?: string): ReputationEntry[] => {
    const query = agentAddress
      ? "SELECT * FROM reputation WHERE to_agent = ? ORDER BY created_at DESC"
      : "SELECT * FROM reputation ORDER BY created_at DESC";
    const params = agentAddress ? [agentAddress] : [];
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(deserializeReputation);
  };

  // ─── Inbox Messages ──────────────────────────────────────────

  const insertInboxMessage = (msg: InboxMessage): void => {
    db.prepare(
      `INSERT OR IGNORE INTO inbox_messages (id, from_address, content, received_at, reply_to)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      msg.id,
      msg.from,
      msg.content,
      msg.createdAt || new Date().toISOString(),
      msg.replyTo ?? null,
    );
  };

  const getUnprocessedInboxMessages = (limit: number): InboxMessage[] => {
    const rows = db
      .prepare(
        "SELECT * FROM inbox_messages WHERE processed_at IS NULL ORDER BY received_at ASC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(deserializeInboxMessage);
  };

  const markInboxMessageProcessed = (id: string): void => {
    db.prepare(
      "UPDATE inbox_messages SET processed_at = datetime('now') WHERE id = ?",
    ).run(id);
  };

  // ─── Agent State ─────────────────────────────────────────────

  const getAgentState = (): AgentState => {
    return (getKV("agent_state") as AgentState) || "setup";
  };

  const setAgentState = (state: AgentState): void => {
    setKV("agent_state", state);
  };

  // ─── Memory ─────────────────────────────────────────────────

  const insertMemory = (entry: MemoryEntry): void => {
    db.prepare(
      `INSERT OR REPLACE INTO memories (id, category, content, importance, created_at, last_accessed_at, access_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.id,
      entry.category,
      entry.content,
      entry.importance,
      entry.createdAt,
      entry.lastAccessedAt,
      entry.accessCount,
    );
  };

  const getMemories = (category?: MemoryCategory, limit?: number): MemoryEntry[] => {
    const maxResults = limit || 50;
    const query = category
      ? "SELECT * FROM memories WHERE category = ? ORDER BY importance DESC, last_accessed_at DESC LIMIT ?"
      : "SELECT * FROM memories ORDER BY importance DESC, last_accessed_at DESC LIMIT ?";
    const params = category ? [category, maxResults] : [maxResults];
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(deserializeMemory);
  };

  const searchMemories = (query: string, limit?: number): MemoryEntry[] => {
    const maxResults = limit || 20;
    const pattern = `%${query}%`;
    const rows = db
      .prepare(
        "SELECT * FROM memories WHERE content LIKE ? ORDER BY importance DESC, last_accessed_at DESC LIMIT ?",
      )
      .all(pattern, maxResults) as any[];
    return rows.map(deserializeMemory);
  };

  const touchMemory = (id: string): void => {
    db.prepare(
      "UPDATE memories SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?",
    ).run(id);
  };

  const deleteMemory = (id: string): void => {
    db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  };

  // ─── Cost Events ─────────────────────────────────────────────

  const insertCostEvent = (event: CostEvent): void => {
    db.prepare(
      `INSERT INTO cost_events (id, type, amount_cents, description, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(event.id, event.type, event.amountCents, event.description, event.timestamp);
  };

  const getCostEventsSince = (since: string): CostEvent[] => {
    const rows = db
      .prepare("SELECT * FROM cost_events WHERE timestamp >= ? ORDER BY timestamp ASC")
      .all(since) as any[];
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      amountCents: r.amount_cents,
      description: r.description,
      timestamp: r.timestamp,
    }));
  };

  // ─── Revenue Events ─────────────────────────────────────────

  const insertRevenueEvent = (event: RevenueEvent): void => {
    db.prepare(
      `INSERT INTO revenue_events (id, strategy_id, amount_cents, source, description, timestamp)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(event.id, event.strategyId, event.amountCents, event.source, event.description, event.timestamp);
  };

  const getRevenueEventsSince = (since: string): RevenueEvent[] => {
    const rows = db
      .prepare("SELECT * FROM revenue_events WHERE timestamp >= ? ORDER BY timestamp ASC")
      .all(since) as any[];
    return rows.map((r) => ({
      id: r.id,
      strategyId: r.strategy_id,
      amountCents: r.amount_cents,
      source: r.source,
      description: r.description,
      timestamp: r.timestamp,
    }));
  };

  // ─── Strategies ─────────────────────────────────────────────

  const upsertStrategy = (strategy: Strategy): void => {
    db.prepare(
      `INSERT OR REPLACE INTO strategies (id, name, description, type, status, total_invested_cents, total_earned_cents, roi, started_at, last_revenue_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      strategy.id, strategy.name, strategy.description, strategy.type, strategy.status,
      strategy.totalInvestedCents, strategy.totalEarnedCents, strategy.roi,
      strategy.startedAt, strategy.lastRevenueAt ?? null,
    );
  };

  const getStrategies = (activeOnly?: boolean): Strategy[] => {
    const query = activeOnly
      ? "SELECT * FROM strategies WHERE status = 'active' ORDER BY roi DESC"
      : "SELECT * FROM strategies ORDER BY roi DESC";
    const rows = db.prepare(query).all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      status: r.status,
      totalInvestedCents: r.total_invested_cents,
      totalEarnedCents: r.total_earned_cents,
      roi: r.roi,
      startedAt: r.started_at,
      lastRevenueAt: r.last_revenue_at ?? undefined,
    }));
  };

  const getStrategyById = (id: string): Strategy | undefined => {
    const row = db.prepare("SELECT * FROM strategies WHERE id = ?").get(id) as any | undefined;
    if (!row) return undefined;
    return {
      id: row.id, name: row.name, description: row.description, type: row.type,
      status: row.status, totalInvestedCents: row.total_invested_cents,
      totalEarnedCents: row.total_earned_cents, roi: row.roi,
      startedAt: row.started_at, lastRevenueAt: row.last_revenue_at ?? undefined,
    };
  };

  // ─── Model Benchmarks ───────────────────────────────────────

  const insertModelBenchmark = (benchmark: ModelBenchmark): void => {
    db.prepare(
      `INSERT INTO model_benchmarks (id, model_id, task_type, score, cost_cents, latency_ms, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(benchmark.id, benchmark.modelId, benchmark.taskType, benchmark.score,
      benchmark.costCents, benchmark.latencyMs, benchmark.timestamp);
  };

  const getModelBenchmarks = (modelId?: string, limit?: number): ModelBenchmark[] => {
    const maxResults = limit || 50;
    const query = modelId
      ? "SELECT * FROM model_benchmarks WHERE model_id = ? ORDER BY timestamp DESC LIMIT ?"
      : "SELECT * FROM model_benchmarks ORDER BY timestamp DESC LIMIT ?";
    const params = modelId ? [modelId, maxResults] : [maxResults];
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id, modelId: r.model_id, taskType: r.task_type, score: r.score,
      costCents: r.cost_cents, latencyMs: r.latency_ms, timestamp: r.timestamp,
    }));
  };

  // ─── Hosted Services ────────────────────────────────────────

  const upsertHostedService = (service: HostedService): void => {
    db.prepare(
      `INSERT OR REPLACE INTO hosted_services (id, name, description, endpoint, price_cents, handler_code, active, total_requests, total_earned_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(service.id, service.name, service.description, service.endpoint,
      service.priceCents, service.handlerCode, service.active ? 1 : 0,
      service.totalRequests, service.totalEarnedCents, service.createdAt);
  };

  const getHostedServices = (activeOnly?: boolean): HostedService[] => {
    const query = activeOnly
      ? "SELECT * FROM hosted_services WHERE active = 1"
      : "SELECT * FROM hosted_services";
    const rows = db.prepare(query).all() as any[];
    return rows.map((r) => ({
      id: r.id, name: r.name, description: r.description, endpoint: r.endpoint,
      priceCents: r.price_cents, handlerCode: r.handler_code,
      active: !!r.active, totalRequests: r.total_requests,
      totalEarnedCents: r.total_earned_cents, createdAt: r.created_at,
    }));
  };

  const getHostedServiceById = (id: string): HostedService | undefined => {
    const row = db.prepare("SELECT * FROM hosted_services WHERE id = ?").get(id) as any | undefined;
    if (!row) return undefined;
    return {
      id: row.id, name: row.name, description: row.description, endpoint: row.endpoint,
      priceCents: row.price_cents, handlerCode: row.handler_code,
      active: !!row.active, totalRequests: row.total_requests,
      totalEarnedCents: row.total_earned_cents, createdAt: row.created_at,
    };
  };

  const incrementServiceStats = (id: string, earnedCents: number): void => {
    db.prepare(
      "UPDATE hosted_services SET total_requests = total_requests + 1, total_earned_cents = total_earned_cents + ? WHERE id = ?",
    ).run(earnedCents, id);
  };

  // ─── Self-Evaluations ───────────────────────────────────────

  const insertSelfEvaluation = (evaluation: SelfEvaluation): void => {
    db.prepare(
      `INSERT INTO self_evaluations (id, timestamp, turns_since, burn_rate_cents_per_hour, income_rate_cents_per_hour, net_positive, top_strategy, worst_strategy, recommendation, reasoning)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(evaluation.id, evaluation.timestamp, evaluation.turnsSince,
      evaluation.burnRateCentsPerHour, evaluation.incomeRateCentsPerHour,
      evaluation.netPositive ? 1 : 0, evaluation.topStrategy ?? null,
      evaluation.worstStrategy ?? null, evaluation.recommendation, evaluation.reasoning);
  };

  const getRecentEvaluations = (limit: number): SelfEvaluation[] => {
    const rows = db
      .prepare("SELECT * FROM self_evaluations ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as any[];
    return rows.map((r) => ({
      id: r.id, timestamp: r.timestamp, turnsSince: r.turns_since,
      burnRateCentsPerHour: r.burn_rate_cents_per_hour,
      incomeRateCentsPerHour: r.income_rate_cents_per_hour,
      netPositive: !!r.net_positive, topStrategy: r.top_strategy ?? undefined,
      worstStrategy: r.worst_strategy ?? undefined,
      recommendation: r.recommendation, reasoning: r.reasoning,
    }));
  };

  // ─── Fitness Scores ─────────────────────────────────────────

  const insertFitnessScore = (score: FitnessScore): void => {
    db.prepare(
      `INSERT INTO fitness_scores (id, agent_address, generation, revenue_cents, survival_hours, children_spawned, children_survived, metabolic_efficiency, overall_fitness, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(score.id, score.agentAddress, score.generation, score.revenueCents,
      score.survivalHours, score.childrenSpawned, score.childrenSurvived,
      score.metabolicEfficiency, score.overallFitness, score.timestamp);
  };

  const getFitnessScores = (agentAddress?: string): FitnessScore[] => {
    const query = agentAddress
      ? "SELECT * FROM fitness_scores WHERE agent_address = ? ORDER BY timestamp DESC"
      : "SELECT * FROM fitness_scores ORDER BY overall_fitness DESC";
    const params = agentAddress ? [agentAddress] : [];
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id, agentAddress: r.agent_address, generation: r.generation,
      revenueCents: r.revenue_cents, survivalHours: r.survival_hours,
      childrenSpawned: r.children_spawned, childrenSurvived: r.children_survived,
      metabolicEfficiency: r.metabolic_efficiency, overallFitness: r.overall_fitness,
      timestamp: r.timestamp,
    }));
  };

  // ─── Close ───────────────────────────────────────────────────

  const close = (): void => {
    db.close();
  };

  return {
    getIdentity,
    setIdentity,
    insertTurn,
    getRecentTurns,
    getTurnById,
    getTurnCount,
    insertToolCall,
    getToolCallsForTurn,
    getHeartbeatEntries,
    upsertHeartbeatEntry,
    updateHeartbeatLastRun,
    insertTransaction,
    getRecentTransactions,
    getInstalledTools,
    installTool,
    removeTool,
    insertModification,
    getRecentModifications,
    getKV,
    setKV,
    deleteKV,
    getSkills,
    getSkillByName,
    upsertSkill,
    removeSkill,
    getChildren,
    getChildById,
    insertChild,
    updateChildStatus,
    getRegistryEntry,
    setRegistryEntry,
    insertReputation,
    getReputation,
    insertInboxMessage,
    getUnprocessedInboxMessages,
    markInboxMessageProcessed,
    getAgentState,
    setAgentState,
    insertMemory,
    getMemories,
    searchMemories,
    touchMemory,
    deleteMemory,
    insertCostEvent,
    getCostEventsSince,
    insertRevenueEvent,
    getRevenueEventsSince,
    upsertStrategy,
    getStrategies,
    getStrategyById,
    insertModelBenchmark,
    getModelBenchmarks,
    upsertHostedService,
    getHostedServices,
    getHostedServiceById,
    incrementServiceStats,
    insertSelfEvaluation,
    getRecentEvaluations,
    insertFitnessScore,
    getFitnessScores,
    close,
  };
}

// ─── Deserializers ─────────────────────────────────────────────

function deserializeTurn(row: any): AgentTurn {
  return {
    id: row.id,
    timestamp: row.timestamp,
    state: row.state,
    input: row.input ?? undefined,
    inputSource: row.input_source ?? undefined,
    thinking: row.thinking,
    toolCalls: JSON.parse(row.tool_calls || "[]"),
    tokenUsage: JSON.parse(row.token_usage || "{}"),
    costCents: row.cost_cents,
  };
}

function deserializeToolCall(row: any): ToolCallResult {
  return {
    id: row.id,
    name: row.name,
    arguments: JSON.parse(row.arguments || "{}"),
    result: row.result,
    durationMs: row.duration_ms,
    error: row.error ?? undefined,
  };
}

function deserializeHeartbeatEntry(row: any): HeartbeatEntry {
  return {
    name: row.name,
    schedule: row.schedule,
    task: row.task,
    enabled: !!row.enabled,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    params: JSON.parse(row.params || "{}"),
  };
}

function deserializeTransaction(row: any): Transaction {
  return {
    id: row.id,
    type: row.type,
    amountCents: row.amount_cents ?? undefined,
    balanceAfterCents: row.balance_after_cents ?? undefined,
    description: row.description,
    timestamp: row.created_at,
  };
}

function deserializeInstalledTool(row: any): InstalledTool {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    config: JSON.parse(row.config || "{}"),
    installedAt: row.installed_at,
    enabled: !!row.enabled,
  };
}

function deserializeModification(row: any): ModificationEntry {
  return {
    id: row.id,
    timestamp: row.timestamp,
    type: row.type,
    description: row.description,
    filePath: row.file_path ?? undefined,
    diff: row.diff ?? undefined,
    reversible: !!row.reversible,
  };
}

function deserializeSkill(row: any): Skill {
  return {
    name: row.name,
    description: row.description,
    autoActivate: !!row.auto_activate,
    requires: JSON.parse(row.requires || "{}"),
    instructions: row.instructions,
    source: row.source,
    path: row.path,
    enabled: !!row.enabled,
    installedAt: row.installed_at,
  };
}

function deserializeChild(row: any): ChildAutomaton {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    sandboxId: row.sandbox_id,
    genesisPrompt: row.genesis_prompt,
    creatorMessage: row.creator_message ?? undefined,
    fundedAmountCents: row.funded_amount_cents,
    status: row.status,
    createdAt: row.created_at,
    lastChecked: row.last_checked ?? undefined,
  };
}

function deserializeRegistry(row: any): RegistryEntry {
  return {
    agentId: row.agent_id,
    agentURI: row.agent_uri,
    chain: row.chain,
    contractAddress: row.contract_address,
    txHash: row.tx_hash,
    registeredAt: row.registered_at,
  };
}

function deserializeInboxMessage(row: any): InboxMessage {
  return {
    id: row.id,
    from: row.from_address,
    to: "",
    content: row.content,
    signedAt: row.received_at,
    createdAt: row.received_at,
    replyTo: row.reply_to ?? undefined,
  };
}

function deserializeReputation(row: any): ReputationEntry {
  return {
    id: row.id,
    fromAgent: row.from_agent,
    toAgent: row.to_agent,
    score: row.score,
    comment: row.comment,
    txHash: row.tx_hash ?? undefined,
    timestamp: row.created_at,
  };
}

function deserializeMemory(row: any): MemoryEntry {
  return {
    id: row.id,
    category: row.category,
    content: row.content,
    importance: row.importance,
    createdAt: row.created_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: row.access_count,
  };
}
