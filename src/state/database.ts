/**
 * Automaton Database
 *
 * SQLite-backed persistent state for the automaton.
 * Uses better-sqlite3 for synchronous, single-process access.
 */

import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import fs from "fs";
import path from "path";

type DatabaseType = BetterSqlite3.Database;
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
} from "../types.js";
import {
  SCHEMA_VERSION,
  CREATE_TABLES,
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V4_ALTER,
  MIGRATION_V4_ALTER2,
  MIGRATION_V4_ALTER_INBOX_STATUS,
  MIGRATION_V4_ALTER_INBOX_RETRY,
  MIGRATION_V4_ALTER_INBOX_MAX_RETRIES,
  MIGRATION_V5,
  MIGRATION_V6,
  MIGRATION_V7,
  MIGRATION_V8,
  MIGRATION_V9,
  MIGRATION_V9_ALTER_CHILDREN_ROLE,
  MIGRATION_V10,
} from "./schema.js";
import type {
  RiskLevel,
  PolicyAction,
  SpendCategory,
  HeartbeatScheduleRow,
  HeartbeatHistoryRow,
  WakeEventRow,
  SoulHistoryRow,
  InferenceCostRow,
  ModelRegistryRow,
  WorkingMemoryEntry,
  EpisodicMemoryEntry,
  SessionSummaryEntry,
  SemanticMemoryEntry,
  SemanticCategory,
  ProceduralMemoryEntry,
  RelationshipMemoryEntry,
  ChildLifecycleEventRow,
  ChildLifecycleState,
  OnchainTransactionRow,
  DiscoveredAgentCacheRow,
  MetricSnapshotRow,
} from "../types.js";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("database");

export function createDatabase(dbPath: string): AutomatonDatabase {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 1000");
  db.pragma("foreign_keys = ON");

  // Integrity check on startup
  const integrity = db.pragma("integrity_check") as { integrity_check: string }[];
  if (integrity[0]?.integrity_check !== "ok") {
    throw new Error(`Database integrity check failed: ${JSON.stringify(integrity)}`);
  }

  // Initialize schema in a transaction
  const createSchema = db.transaction(() => {
    db.exec(CREATE_TABLES);
  });
  createSchema();

  // Apply migrations
  applyMigrations(db);

  // Ensure version is recorded
  const versionRow = db
    .prepare("SELECT MAX(version) as v FROM schema_version")
    .get() as { v: number | null } | undefined;
  const currentVersion = versionRow?.v ?? 0;
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

  const deleteKVReturning = (key: string): string | undefined => {
    const row = db
      .prepare("DELETE FROM kv WHERE key = ? RETURNING value")
      .get(key) as { value: string } | undefined;
    return row?.value;
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
    return validateAgentState(getKV("agent_state"));
  };

  const setAgentState = (state: AgentState): void => {
    setKV("agent_state", state);
  };

  // ─── Transaction Helper ──────────────────────────────────────

  const runTransaction = <T>(fn: () => T): T => {
    const transaction = db.transaction(() => fn());
    return transaction();
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
    deleteKVReturning,
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
    runTransaction,
    close,
    raw: db,
  };
}

// ─── Migration Runner ───────────────────────────────────────────

function applyMigrations(db: DatabaseType): void {
  const versionRow = db
    .prepare("SELECT MAX(version) as v FROM schema_version")
    .get() as { v: number | null } | undefined;
  const currentVersion = versionRow?.v ?? 0;

  const migrations: { version: number; apply: () => void }[] = [
    {
      version: 2,
      apply: () => db.exec(MIGRATION_V2),
    },
    {
      version: 3,
      apply: () => db.exec(MIGRATION_V3),
    },
    {
      version: 4,
      apply: () => {
        db.exec(MIGRATION_V4);
        try { db.exec(MIGRATION_V4_ALTER); } catch { logger.debug("V4 ALTER (to_address) skipped — column likely exists"); }
        try { db.exec(MIGRATION_V4_ALTER2); } catch { logger.debug("V4 ALTER (raw_content) skipped — column likely exists"); }
        try { db.exec(MIGRATION_V4_ALTER_INBOX_STATUS); } catch { logger.debug("V4 ALTER (inbox status) skipped — column likely exists"); }
        try { db.exec(MIGRATION_V4_ALTER_INBOX_RETRY); } catch { logger.debug("V4 ALTER (inbox retry_count) skipped — column likely exists"); }
        try { db.exec(MIGRATION_V4_ALTER_INBOX_MAX_RETRIES); } catch { logger.debug("V4 ALTER (inbox max_retries) skipped — column likely exists"); }
      },
    },
    {
      version: 5,
      apply: () => db.exec(MIGRATION_V5),
    },
    {
      version: 6,
      apply: () => db.exec(MIGRATION_V6),
    },
    {
      version: 7,
      apply: () => db.exec(MIGRATION_V7),
    },
    {
      version: 8,
      apply: () => db.exec(MIGRATION_V8),
    },
    {
      version: 9,
      apply: () => {
        db.exec(MIGRATION_V9);
        try { db.exec(MIGRATION_V9_ALTER_CHILDREN_ROLE); } catch { /* column may already exist */ }
      },
    },
    {
      version: 10,
      apply: () => db.exec(MIGRATION_V10),
    },
  ];

  for (const m of migrations) {
    if (currentVersion < m.version) {
      const migrate = db.transaction(() => {
        m.apply();
        db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(m.version);
      });
      migrate();
    }
  }
}

// ─── Exported Helpers ───────────────────────────────────────────

export function withTransaction<T>(db: DatabaseType, fn: () => T): T {
  const transaction = db.transaction(() => fn());
  return transaction();
}

export function checkpointWAL(db: DatabaseType): void {
  db.pragma("wal_checkpoint(TRUNCATE)");
}

// ─── DB Row Types ──────────────────────────────────────────────

export interface PolicyDecisionRow {
  id: string;
  turnId: string | null;
  toolName: string;
  toolArgsHash: string;
  riskLevel: RiskLevel;
  decision: PolicyAction;
  rulesEvaluated: string;   // JSON string
  rulesTriggered: string;   // JSON string
  reason: string;
  latencyMs: number;
}

export interface SpendTrackingRow {
  id: string;
  toolName: string;
  amountCents: number;
  recipient: string | null;
  domain: string | null;
  category: SpendCategory;
  windowHour: string;       // ISO hour: '2026-02-19T14'
  windowDay: string;        // ISO date: '2026-02-19'
}

export type GoalStatus = "active" | "completed" | "failed" | "paused";
export type TaskGraphStatus =
  | "pending"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export interface GoalRow {
  id: string;
  title: string;
  description: string;
  status: GoalStatus;
  strategy: string | null;
  expectedRevenueCents: number;
  actualRevenueCents: number;
  createdAt: string;
  deadline: string | null;
  completedAt: string | null;
}

export interface TaskGraphRow {
  id: string;
  parentId: string | null;
  goalId: string;
  title: string;
  description: string;
  status: TaskGraphStatus;
  assignedTo: string | null;
  agentRole: string | null;
  priority: number;
  dependencies: string[];
  result: unknown | null;
  estimatedCostCents: number;
  actualCostCents: number;
  maxRetries: number;
  retryCount: number;
  timeoutMs: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface EventStreamRow {
  id: string;
  type: string;
  agentAddress: string;
  goalId: string | null;
  taskId: string | null;
  content: string;
  tokenCount: number;
  compactedTo: string | null;
  createdAt: string;
}

export interface KnowledgeStoreRow {
  id: string;
  category: string;
  key: string;
  content: string;
  source: string;
  confidence: number;
  lastVerified: string;
  accessCount: number;
  tokenCount: number;
  createdAt: string;
  expiresAt: string | null;
}

// ─── Policy Decision Helpers ────────────────────────────────────

export function insertPolicyDecision(db: DatabaseType, row: PolicyDecisionRow): void {
  db.prepare(
    `INSERT INTO policy_decisions (id, turn_id, tool_name, tool_args_hash, risk_level, decision, rules_evaluated, rules_triggered, reason, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.turnId,
    row.toolName,
    row.toolArgsHash,
    row.riskLevel,
    row.decision,
    row.rulesEvaluated,
    row.rulesTriggered,
    row.reason,
    row.latencyMs,
  );
}

export function getPolicyDecisions(
  db: DatabaseType,
  filters: {
    turnId?: string;
    toolName?: string;
    decision?: PolicyAction;
  },
): PolicyDecisionRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.turnId) {
    conditions.push("turn_id = ?");
    params.push(filters.turnId);
  }
  if (filters.toolName) {
    conditions.push("tool_name = ?");
    params.push(filters.toolName);
  }
  if (filters.decision) {
    conditions.push("decision = ?");
    params.push(filters.decision);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM policy_decisions ${where} ORDER BY created_at DESC`)
    .all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    turnId: row.turn_id,
    toolName: row.tool_name,
    toolArgsHash: row.tool_args_hash,
    riskLevel: row.risk_level as RiskLevel,
    decision: row.decision as PolicyAction,
    rulesEvaluated: row.rules_evaluated,
    rulesTriggered: row.rules_triggered,
    reason: row.reason,
    latencyMs: row.latency_ms,
  }));
}

// ─── Spend Tracking Helpers ─────────────────────────────────────

export function insertSpendRecord(db: DatabaseType, entry: SpendTrackingRow): void {
  db.prepare(
    `INSERT INTO spend_tracking (id, tool_name, amount_cents, recipient, domain, category, window_hour, window_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.toolName,
    entry.amountCents,
    entry.recipient,
    entry.domain,
    entry.category,
    entry.windowHour,
    entry.windowDay,
  );
}

export function getSpendByWindow(
  db: DatabaseType,
  category: string,
  windowType: "hour" | "day",
  window: string,
): number {
  const column = windowType === "hour" ? "window_hour" : "window_day";
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) as total FROM spend_tracking WHERE category = ? AND ${column} = ?`,
    )
    .get(category, window) as { total: number };
  return row.total;
}

export function pruneSpendRecords(db: DatabaseType, olderThan: string): number {
  const result = db
    .prepare("DELETE FROM spend_tracking WHERE created_at < ?")
    .run(olderThan);
  return result.changes;
}

// ─── Phase 0 + 1: Goals / Tasks / Events / Knowledge ───────────

export function insertGoal(
  db: DatabaseType,
  row: {
    title: string;
    description: string;
    status?: GoalStatus;
    strategy?: string | null;
    expectedRevenueCents?: number;
    actualRevenueCents?: number;
    deadline?: string | null;
    completedAt?: string | null;
  },
): string {
  const id = ulid();
  const now = new Date().toISOString();
  const status = row.status ?? "active";
  const completedAt = row.completedAt ?? (status === "completed" ? now : null);
  db.prepare(
    `INSERT INTO goals (id, title, description, status, strategy, expected_revenue_cents, actual_revenue_cents, created_at, deadline, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.title,
    row.description,
    status,
    row.strategy ?? null,
    row.expectedRevenueCents ?? 0,
    row.actualRevenueCents ?? 0,
    now,
    row.deadline ?? null,
    completedAt,
  );
  return id;
}

export function getGoalById(db: DatabaseType, id: string): GoalRow | undefined {
  const row = db
    .prepare("SELECT * FROM goals WHERE id = ?")
    .get(id) as any | undefined;
  return row ? deserializeGoalRow(row) : undefined;
}

export function updateGoalStatus(db: DatabaseType, id: string, status: GoalStatus): void {
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  db.prepare(
    "UPDATE goals SET status = ?, completed_at = ? WHERE id = ?",
  ).run(status, completedAt, id);
}

export function getActiveGoals(db: DatabaseType): GoalRow[] {
  const rows = db
    .prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY created_at ASC")
    .all() as any[];
  return rows.map(deserializeGoalRow);
}

export function insertTask(
  db: DatabaseType,
  row: {
    parentId?: string | null;
    goalId: string;
    title: string;
    description: string;
    status?: TaskGraphStatus;
    assignedTo?: string | null;
    agentRole?: string | null;
    priority?: number;
    dependencies?: string[];
    result?: unknown | null;
    estimatedCostCents?: number;
    actualCostCents?: number;
    maxRetries?: number;
    retryCount?: number;
    timeoutMs?: number;
    startedAt?: string | null;
    completedAt?: string | null;
  },
): string {
  const id = ulid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO task_graph
     (id, parent_id, goal_id, title, description, status, assigned_to, agent_role, priority,
      dependencies, result, estimated_cost_cents, actual_cost_cents, max_retries, retry_count,
      timeout_ms, created_at, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.parentId ?? null,
    row.goalId,
    row.title,
    row.description,
    row.status ?? "pending",
    row.assignedTo ?? null,
    row.agentRole ?? null,
    row.priority ?? 50,
    JSON.stringify(row.dependencies ?? []),
    row.result == null ? null : JSON.stringify(row.result),
    row.estimatedCostCents ?? 0,
    row.actualCostCents ?? 0,
    row.maxRetries ?? 3,
    row.retryCount ?? 0,
    row.timeoutMs ?? 300000,
    now,
    row.startedAt ?? null,
    row.completedAt ?? null,
  );
  return id;
}

export function getTaskById(db: DatabaseType, id: string): TaskGraphRow | undefined {
  const row = db
    .prepare("SELECT * FROM task_graph WHERE id = ?")
    .get(id) as any | undefined;
  return row ? deserializeTaskGraphRow(row) : undefined;
}

export function updateTaskStatus(db: DatabaseType, id: string, status: TaskGraphStatus): void {
  const now = new Date().toISOString();
  if (status === "running") {
    db.prepare(
      "UPDATE task_graph SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?",
    ).run(status, now, id);
    return;
  }

  if (status === "completed" || status === "failed" || status === "cancelled") {
    db.prepare(
      "UPDATE task_graph SET status = ?, completed_at = ? WHERE id = ?",
    ).run(status, now, id);
    return;
  }

  db.prepare(
    "UPDATE task_graph SET status = ? WHERE id = ?",
  ).run(status, id);
}

export function getReadyTasks(db: DatabaseType): TaskGraphRow[] {
  const rows = db.prepare(
    `SELECT t.*
     FROM task_graph t
     WHERE t.status = 'pending'
       AND NOT EXISTS (
         SELECT 1
         FROM json_each(COALESCE(NULLIF(t.dependencies, ''), '[]')) dep
         LEFT JOIN task_graph d ON d.id = dep.value
         WHERE d.status IS NULL OR d.status != 'completed'
       )
     ORDER BY t.priority DESC, t.created_at ASC`,
  ).all() as any[];
  return rows.map(deserializeTaskGraphRow);
}

export function getTasksByGoal(db: DatabaseType, goalId: string): TaskGraphRow[] {
  const rows = db
    .prepare("SELECT * FROM task_graph WHERE goal_id = ? ORDER BY priority DESC, created_at ASC")
    .all(goalId) as any[];
  return rows.map(deserializeTaskGraphRow);
}

export function insertEvent(
  db: DatabaseType,
  row: {
    type: string;
    agentAddress: string;
    goalId?: string | null;
    taskId?: string | null;
    content: string;
    tokenCount: number;
    compactedTo?: string | null;
  },
): string {
  const id = ulid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO event_stream (id, type, agent_address, goal_id, task_id, content, token_count, compacted_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.type,
    row.agentAddress,
    row.goalId ?? null,
    row.taskId ?? null,
    row.content,
    row.tokenCount,
    row.compactedTo ?? null,
    now,
  );
  return id;
}

export function getRecentEvents(db: DatabaseType, agentAddress: string, limit: number = 50): EventStreamRow[] {
  const rows = db
    .prepare("SELECT * FROM event_stream WHERE agent_address = ? ORDER BY created_at DESC LIMIT ?")
    .all(agentAddress, limit) as any[];
  return rows.map(deserializeEventStreamRow).reverse();
}

export function getEventsByGoal(db: DatabaseType, goalId: string, limit: number = 200): EventStreamRow[] {
  const rows = db
    .prepare("SELECT * FROM event_stream WHERE goal_id = ? ORDER BY created_at ASC LIMIT ?")
    .all(goalId, limit) as any[];
  return rows.map(deserializeEventStreamRow);
}

export function getEventsByType(
  db: DatabaseType,
  type: string,
  since?: string,
  limit: number = 200,
): EventStreamRow[] {
  if (since) {
    const rows = db
      .prepare("SELECT * FROM event_stream WHERE type = ? AND created_at >= ? ORDER BY created_at ASC LIMIT ?")
      .all(type, since, limit) as any[];
    return rows.map(deserializeEventStreamRow);
  }
  const rows = db
    .prepare("SELECT * FROM event_stream WHERE type = ? ORDER BY created_at ASC LIMIT ?")
    .all(type, limit) as any[];
  return rows.map(deserializeEventStreamRow);
}

export function insertKnowledge(
  db: DatabaseType,
  row: {
    category: string;
    key: string;
    content: string;
    source: string;
    confidence?: number;
    lastVerified?: string;
    accessCount?: number;
    tokenCount: number;
    expiresAt?: string | null;
  },
): string {
  const id = ulid();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO knowledge_store
     (id, category, key, content, source, confidence, last_verified, access_count, token_count, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.category,
    row.key,
    row.content,
    row.source,
    row.confidence ?? 1.0,
    row.lastVerified ?? now,
    row.accessCount ?? 0,
    row.tokenCount,
    now,
    row.expiresAt ?? null,
  );
  return id;
}

export function getKnowledgeByCategory(
  db: DatabaseType,
  category: string,
  limit: number = 100,
): KnowledgeStoreRow[] {
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      "SELECT * FROM knowledge_store WHERE category = ? AND (expires_at IS NULL OR expires_at >= ?) ORDER BY confidence DESC, last_verified DESC LIMIT ?",
    )
    .all(category, now, limit) as any[];
  return rows.map(deserializeKnowledgeStoreRow);
}

export function searchKnowledge(
  db: DatabaseType,
  query: string,
  category?: string,
  limit: number = 100,
): KnowledgeStoreRow[] {
  const now = new Date().toISOString();
  const like = `%${query}%`;
  if (category) {
    const rows = db
      .prepare(
        "SELECT * FROM knowledge_store WHERE category = ? AND (key LIKE ? OR content LIKE ?) AND (expires_at IS NULL OR expires_at >= ?) ORDER BY confidence DESC, last_verified DESC LIMIT ?",
      )
      .all(category, like, like, now, limit) as any[];
    return rows.map(deserializeKnowledgeStoreRow);
  }
  const rows = db
    .prepare(
      "SELECT * FROM knowledge_store WHERE (key LIKE ? OR content LIKE ?) AND (expires_at IS NULL OR expires_at >= ?) ORDER BY confidence DESC, last_verified DESC LIMIT ?",
    )
    .all(like, like, now, limit) as any[];
  return rows.map(deserializeKnowledgeStoreRow);
}

export function updateKnowledge(
  db: DatabaseType,
  id: string,
  updates: Partial<{
    category: string;
    key: string;
    content: string;
    source: string;
    confidence: number;
    lastVerified: string;
    accessCount: number;
    tokenCount: number;
    expiresAt: string | null;
  }>,
): void {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.category !== undefined) { setClauses.push("category = ?"); params.push(updates.category); }
  if (updates.key !== undefined) { setClauses.push("key = ?"); params.push(updates.key); }
  if (updates.content !== undefined) { setClauses.push("content = ?"); params.push(updates.content); }
  if (updates.source !== undefined) { setClauses.push("source = ?"); params.push(updates.source); }
  if (updates.confidence !== undefined) { setClauses.push("confidence = ?"); params.push(updates.confidence); }
  if (updates.lastVerified !== undefined) { setClauses.push("last_verified = ?"); params.push(updates.lastVerified); }
  if (updates.accessCount !== undefined) { setClauses.push("access_count = ?"); params.push(updates.accessCount); }
  if (updates.tokenCount !== undefined) { setClauses.push("token_count = ?"); params.push(updates.tokenCount); }
  if (updates.expiresAt !== undefined) { setClauses.push("expires_at = ?"); params.push(updates.expiresAt); }

  if (setClauses.length === 0) return;

  params.push(id);
  db.prepare(
    `UPDATE knowledge_store SET ${setClauses.join(", ")} WHERE id = ?`,
  ).run(...params);
}

export function deleteKnowledge(db: DatabaseType, id: string): void {
  db.prepare("DELETE FROM knowledge_store WHERE id = ?").run(id);
}

// ─── Heartbeat Schedule Helpers (Phase 1.1) ─────────────────────

export function getHeartbeatSchedule(db: DatabaseType): HeartbeatScheduleRow[] {
  const rows = db
    .prepare("SELECT * FROM heartbeat_schedule ORDER BY priority ASC")
    .all() as any[];
  return rows.map(deserializeHeartbeatScheduleRow);
}

export function getHeartbeatTask(db: DatabaseType, taskName: string): HeartbeatScheduleRow | undefined {
  const row = db
    .prepare("SELECT * FROM heartbeat_schedule WHERE task_name = ?")
    .get(taskName) as any | undefined;
  return row ? deserializeHeartbeatScheduleRow(row) : undefined;
}

export function updateHeartbeatSchedule(
  db: DatabaseType,
  taskName: string,
  updates: Partial<HeartbeatScheduleRow>,
): void {
  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (updates.lastRunAt !== undefined) { setClauses.push("last_run_at = ?"); params.push(updates.lastRunAt); }
  if (updates.nextRunAt !== undefined) { setClauses.push("next_run_at = ?"); params.push(updates.nextRunAt); }
  if (updates.lastResult !== undefined) { setClauses.push("last_result = ?"); params.push(updates.lastResult); }
  if (updates.lastError !== undefined) { setClauses.push("last_error = ?"); params.push(updates.lastError); }
  if (updates.runCount !== undefined) { setClauses.push("run_count = ?"); params.push(updates.runCount); }
  if (updates.failCount !== undefined) { setClauses.push("fail_count = ?"); params.push(updates.failCount); }
  if (updates.leaseOwner !== undefined) { setClauses.push("lease_owner = ?"); params.push(updates.leaseOwner); }
  if (updates.leaseExpiresAt !== undefined) { setClauses.push("lease_expires_at = ?"); params.push(updates.leaseExpiresAt); }
  if (updates.enabled !== undefined) { setClauses.push("enabled = ?"); params.push(updates.enabled); }
  if (updates.cronExpression !== undefined) { setClauses.push("cron_expression = ?"); params.push(updates.cronExpression); }
  if (updates.intervalMs !== undefined) { setClauses.push("interval_ms = ?"); params.push(updates.intervalMs); }
  if (updates.timeoutMs !== undefined) { setClauses.push("timeout_ms = ?"); params.push(updates.timeoutMs); }
  if (updates.maxRetries !== undefined) { setClauses.push("max_retries = ?"); params.push(updates.maxRetries); }
  if (updates.priority !== undefined) { setClauses.push("priority = ?"); params.push(updates.priority); }
  if (updates.tierMinimum !== undefined) { setClauses.push("tier_minimum = ?"); params.push(updates.tierMinimum); }

  if (setClauses.length === 0) return;

  setClauses.push("updated_at = datetime('now')");
  params.push(taskName);

  db.prepare(
    `UPDATE heartbeat_schedule SET ${setClauses.join(", ")} WHERE task_name = ?`,
  ).run(...params);
}

export function upsertHeartbeatSchedule(db: DatabaseType, row: HeartbeatScheduleRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO heartbeat_schedule
     (task_name, cron_expression, interval_ms, enabled, priority, timeout_ms, max_retries, tier_minimum,
      last_run_at, next_run_at, last_result, last_error, run_count, fail_count, lease_owner, lease_expires_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    row.taskName,
    row.cronExpression,
    row.intervalMs,
    row.enabled,
    row.priority,
    row.timeoutMs,
    row.maxRetries,
    row.tierMinimum,
    row.lastRunAt,
    row.nextRunAt,
    row.lastResult,
    row.lastError,
    row.runCount,
    row.failCount,
    row.leaseOwner,
    row.leaseExpiresAt,
  );
}

// ─── Heartbeat History Helpers (Phase 1.1) ──────────────────────

export function insertHeartbeatHistory(db: DatabaseType, entry: HeartbeatHistoryRow): void {
  db.prepare(
    `INSERT INTO heartbeat_history (id, task_name, started_at, completed_at, result, duration_ms, error, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.id,
    entry.taskName,
    entry.startedAt,
    entry.completedAt,
    entry.result,
    entry.durationMs,
    entry.error,
    entry.idempotencyKey,
  );
}

export function getHeartbeatHistory(db: DatabaseType, taskName: string, limit = 50): HeartbeatHistoryRow[] {
  const rows = db
    .prepare(
      "SELECT * FROM heartbeat_history WHERE task_name = ? ORDER BY started_at DESC LIMIT ?",
    )
    .all(taskName, limit) as any[];
  return rows.map(deserializeHeartbeatHistoryRow);
}

// ─── Lease Management Helpers (Phase 1.1) ───────────────────────

export function acquireTaskLease(db: DatabaseType, taskName: string, owner: string, ttlMs: number): boolean {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  const result = db.prepare(
    `UPDATE heartbeat_schedule
     SET lease_owner = ?, lease_expires_at = ?, updated_at = datetime('now')
     WHERE task_name = ?
       AND (lease_owner IS NULL OR lease_expires_at < datetime('now'))`,
  ).run(owner, expiresAt, taskName);
  return result.changes > 0;
}

export function releaseTaskLease(db: DatabaseType, taskName: string, owner: string): void {
  db.prepare(
    `UPDATE heartbeat_schedule
     SET lease_owner = NULL, lease_expires_at = NULL, updated_at = datetime('now')
     WHERE task_name = ? AND lease_owner = ?`,
  ).run(taskName, owner);
}

export function clearExpiredLeases(db: DatabaseType): number {
  const result = db.prepare(
    `UPDATE heartbeat_schedule
     SET lease_owner = NULL, lease_expires_at = NULL, updated_at = datetime('now')
     WHERE lease_expires_at IS NOT NULL AND lease_expires_at < datetime('now')`,
  ).run();
  return result.changes;
}

// ─── Wake Event Helpers (Phase 1.1) ─────────────────────────────

export function insertWakeEvent(db: DatabaseType, source: string, reason: string, payload?: object): void {
  db.prepare(
    "INSERT INTO wake_events (source, reason, payload) VALUES (?, ?, ?)",
  ).run(source, reason, JSON.stringify(payload ?? {}));
}

export function consumeNextWakeEvent(db: DatabaseType): WakeEventRow | undefined {
  const row = db.prepare(
    `UPDATE wake_events
     SET consumed_at = datetime('now')
     WHERE id = (SELECT id FROM wake_events WHERE consumed_at IS NULL ORDER BY id ASC LIMIT 1)
     RETURNING *`,
  ).get() as any | undefined;
  return row ? deserializeWakeEventRow(row) : undefined;
}

export function getUnconsumedWakeEvents(db: DatabaseType): WakeEventRow[] {
  const rows = db.prepare(
    "SELECT * FROM wake_events WHERE consumed_at IS NULL ORDER BY id ASC",
  ).all() as any[];
  return rows.map(deserializeWakeEventRow);
}

// ─── KV Pruning Helpers (Phase 1.6) ─────────────────────────────

export function pruneStaleKV(db: DatabaseType, prefix: string, retentionDays: number): number {
  const result = db.prepare(
    `DELETE FROM kv WHERE key LIKE ? AND updated_at < datetime('now', ?)`,
  ).run(`${prefix}%`, `-${retentionDays} days`);
  return result.changes;
}

// ─── Dedup Helpers (Phase 1.1) ──────────────────────────────────

export function insertDedupKey(db: DatabaseType, key: string, taskName: string, ttlMs: number): boolean {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  try {
    db.prepare(
      "INSERT INTO heartbeat_dedup (dedup_key, task_name, expires_at) VALUES (?, ?, ?)",
    ).run(key, taskName, expiresAt);
    return true;
  } catch (error) {
    // Key already exists (duplicate) — expected for dedup
    logger.debug("Dedup key insert failed (likely duplicate)");
    return false;
  }
}

export function pruneExpiredDedupKeys(db: DatabaseType): number {
  const result = db.prepare(
    "DELETE FROM heartbeat_dedup WHERE expires_at < datetime('now')",
  ).run();
  return result.changes;
}

export function isDeduplicated(db: DatabaseType, key: string): boolean {
  const row = db.prepare(
    "SELECT 1 FROM heartbeat_dedup WHERE dedup_key = ? AND expires_at >= datetime('now')",
  ).get(key) as any | undefined;
  return !!row;
}

// ─── Inbox State Machine Helpers (Phase 1.2) ─────────────────────

export function claimInboxMessages(db: DatabaseType, limit: number): InboxMessageRow[] {
  // Atomically claim messages: received → in_progress, increment retry_count
  // Wrapped in a transaction to prevent race conditions where concurrent callers
  // SELECT the same rows before either UPDATE runs.
  const claimTx = db.transaction(() => {
    const rows = db.prepare(
      `SELECT id, from_address, content, received_at, processed_at, reply_to, to_address, raw_content,
              status, retry_count, max_retries
       FROM inbox_messages
       WHERE status = 'received' AND retry_count < max_retries
       ORDER BY received_at ASC
       LIMIT ?`,
    ).all(limit) as any[];

    if (rows.length === 0) return [];

    const ids = rows.map((r: any) => r.id);
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `UPDATE inbox_messages
       SET status = 'in_progress', retry_count = retry_count + 1
       WHERE id IN (${placeholders})`,
    ).run(...ids);

    // Return rows with updated retry_count
    return rows.map((row: any) => ({
      id: row.id,
      fromAddress: row.from_address,
      content: row.content,
      receivedAt: row.received_at,
      processedAt: row.processed_at ?? null,
      replyTo: row.reply_to ?? null,
      toAddress: row.to_address ?? null,
      rawContent: row.raw_content ?? null,
      status: 'in_progress' as const,
      retryCount: (row.retry_count ?? 0) + 1,
      maxRetries: row.max_retries ?? 3,
    }));
  });

  return claimTx();
}

export function markInboxProcessed(db: DatabaseType, ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(
    `UPDATE inbox_messages SET status = 'processed', processed_at = datetime('now') WHERE id IN (${placeholders})`,
  ).run(...ids);
}

export function markInboxFailed(db: DatabaseType, ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(
    `UPDATE inbox_messages SET status = 'failed' WHERE id IN (${placeholders})`,
  ).run(...ids);
}

export function resetInboxToReceived(db: DatabaseType, ids: string[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(
    `UPDATE inbox_messages SET status = 'received' WHERE id IN (${placeholders})`,
  ).run(...ids);
}

export function getUnprocessedInboxCount(db: DatabaseType): number {
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM inbox_messages WHERE status IN ('received','in_progress')",
  ).get() as { count: number };
  return row.count;
}

export interface InboxMessageRow {
  id: string;
  fromAddress: string;
  content: string;
  receivedAt: string;
  processedAt: string | null;
  replyTo: string | null;
  toAddress: string | null;
  rawContent: string | null;
  status: string;
  retryCount: number;
  maxRetries: number;
}

// ─── Safe JSON Parse ────────────────────────────────────────────

function safeJsonParse<T>(raw: string, fallback: T, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.error(`JSON parse failed in ${context}`, error instanceof Error ? error : undefined);
    return fallback;
  }
}

// ─── Agent State Validation ─────────────────────────────────────

const VALID_AGENT_STATES: Set<string> = new Set([
  "setup", "waking", "running", "sleeping", "low_compute", "critical", "dead",
]);

function validateAgentState(value: string | undefined): AgentState {
  if (!value) return "setup";
  if (VALID_AGENT_STATES.has(value)) {
    return value as AgentState;
  }
  logger.error(`Invalid agent_state value: '${value}', defaulting to 'setup'`);
  return "setup";
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
    toolCalls: safeJsonParse(row.tool_calls || "[]", [] as ToolCallResult[], "deserializeTurn.toolCalls"),
    tokenUsage: safeJsonParse(row.token_usage || "{}", {} as any, "deserializeTurn.tokenUsage"),
    costCents: row.cost_cents,
  };
}

function deserializeToolCall(row: any): ToolCallResult {
  return {
    id: row.id,
    name: row.name,
    arguments: safeJsonParse(row.arguments || "{}", {} as Record<string, unknown>, "deserializeToolCall.arguments"),
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
    params: safeJsonParse(row.params || "{}", {} as Record<string, unknown>, "deserializeHeartbeatEntry.params"),
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
    config: safeJsonParse(row.config || "{}", {} as Record<string, unknown>, "deserializeInstalledTool.config"),
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
    requires: safeJsonParse(row.requires || "{}", {} as Record<string, unknown>, "deserializeSkill.requires"),
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
    to: row.to_address ?? "",
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

// ─── Phase 1.1 Deserializers ────────────────────────────────────

function deserializeHeartbeatScheduleRow(row: any): HeartbeatScheduleRow {
  return {
    taskName: row.task_name,
    cronExpression: row.cron_expression,
    intervalMs: row.interval_ms ?? null,
    enabled: row.enabled,
    priority: row.priority,
    timeoutMs: row.timeout_ms,
    maxRetries: row.max_retries,
    tierMinimum: row.tier_minimum,
    lastRunAt: row.last_run_at ?? null,
    nextRunAt: row.next_run_at ?? null,
    lastResult: row.last_result ?? null,
    lastError: row.last_error ?? null,
    runCount: row.run_count,
    failCount: row.fail_count,
    leaseOwner: row.lease_owner ?? null,
    leaseExpiresAt: row.lease_expires_at ?? null,
  };
}

function deserializeHeartbeatHistoryRow(row: any): HeartbeatHistoryRow {
  return {
    id: row.id,
    taskName: row.task_name,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    result: row.result,
    durationMs: row.duration_ms ?? null,
    error: row.error ?? null,
    idempotencyKey: row.idempotency_key ?? null,
  };
}

function deserializeWakeEventRow(row: any): WakeEventRow {
  return {
    id: row.id,
    source: row.source,
    reason: row.reason,
    payload: row.payload ?? '{}',
    consumedAt: row.consumed_at ?? null,
    createdAt: row.created_at,
  };
}

// ─── Phase 2.1: Soul History Helpers ─────────────────────────────

export function insertSoulHistory(db: DatabaseType, row: SoulHistoryRow): void {
  db.prepare(
    `INSERT INTO soul_history (id, version, content, content_hash, change_source, change_reason, previous_version_id, approved_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.version,
    row.content,
    row.contentHash,
    row.changeSource,
    row.changeReason,
    row.previousVersionId,
    row.approvedBy,
    row.createdAt,
  );
}

export function getSoulHistory(db: DatabaseType, limit: number = 50): SoulHistoryRow[] {
  const rows = db
    .prepare("SELECT * FROM soul_history ORDER BY version DESC LIMIT ?")
    .all(limit) as any[];
  return rows.map(deserializeSoulHistoryRow);
}

export function getSoulVersion(db: DatabaseType, version: number): SoulHistoryRow | undefined {
  const row = db
    .prepare("SELECT * FROM soul_history WHERE version = ?")
    .get(version) as any | undefined;
  return row ? deserializeSoulHistoryRow(row) : undefined;
}

export function getCurrentSoulVersion(db: DatabaseType): number {
  const row = db
    .prepare("SELECT MAX(version) as v FROM soul_history")
    .get() as { v: number | null } | undefined;
  return row?.v ?? 0;
}

export function getLatestSoulHistory(db: DatabaseType): SoulHistoryRow | undefined {
  const row = db
    .prepare("SELECT * FROM soul_history ORDER BY version DESC LIMIT 1")
    .get() as any | undefined;
  return row ? deserializeSoulHistoryRow(row) : undefined;
}

function deserializeSoulHistoryRow(row: any): SoulHistoryRow {
  return {
    id: row.id,
    version: row.version,
    content: row.content,
    contentHash: row.content_hash,
    changeSource: row.change_source,
    changeReason: row.change_reason ?? null,
    previousVersionId: row.previous_version_id ?? null,
    approvedBy: row.approved_by ?? null,
    createdAt: row.created_at,
  };
}

// ─── Phase 2.2: Memory DB Helpers ────────────────────────────────

// Working memory
export function wmInsert(db: DatabaseType, entry: Omit<WorkingMemoryEntry, "id" | "createdAt">): string {
  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO working_memory (id, session_id, content, content_type, priority, token_count, expires_at, source_turn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, entry.sessionId, entry.content, entry.contentType, entry.priority, entry.tokenCount, entry.expiresAt, entry.sourceTurn);
  } catch (error) {
    logger.error("wmInsert failed", error instanceof Error ? error : undefined);
  }
  return id;
}

export function wmGetBySession(db: DatabaseType, sessionId: string): WorkingMemoryEntry[] {
  try {
    const rows = db.prepare("SELECT * FROM working_memory WHERE session_id = ? ORDER BY priority DESC, created_at DESC").all(sessionId) as any[];
    return rows.map(deserializeWorkingMemoryRow);
  } catch (error) {
    logger.error("wmGetBySession failed", error instanceof Error ? error : undefined);
    return [];
  }
}

export function wmUpdate(db: DatabaseType, id: string, updates: Partial<WorkingMemoryEntry>): void {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  if (updates.content !== undefined) { setClauses.push("content = ?"); params.push(updates.content); }
  if (updates.priority !== undefined) { setClauses.push("priority = ?"); params.push(updates.priority); }
  if (updates.expiresAt !== undefined) { setClauses.push("expires_at = ?"); params.push(updates.expiresAt); }
  if (updates.contentType !== undefined) { setClauses.push("content_type = ?"); params.push(updates.contentType); }
  if (updates.tokenCount !== undefined) { setClauses.push("token_count = ?"); params.push(updates.tokenCount); }
  if (setClauses.length === 0) return;
  params.push(id);
  try {
    db.prepare(`UPDATE working_memory SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);
  } catch (error) {
    logger.error("wmUpdate failed", error instanceof Error ? error : undefined);
  }
}

export function wmDelete(db: DatabaseType, id: string): void {
  try { db.prepare("DELETE FROM working_memory WHERE id = ?").run(id); }
  catch (error) { logger.error("wmDelete failed", error instanceof Error ? error : undefined); }
}

export function wmPrune(db: DatabaseType, sessionId: string, maxEntries: number): number {
  try {
    const count = db.prepare("SELECT COUNT(*) as cnt FROM working_memory WHERE session_id = ?").get(sessionId) as { cnt: number };
    if (count.cnt <= maxEntries) return 0;
    const toRemove = count.cnt - maxEntries;
    const result = db.prepare(
      "DELETE FROM working_memory WHERE id IN (SELECT id FROM working_memory WHERE session_id = ? ORDER BY priority ASC, created_at ASC LIMIT ?)",
    ).run(sessionId, toRemove);
    return result.changes;
  } catch (error) { logger.error("wmPrune failed", error instanceof Error ? error : undefined); return 0; }
}

export function wmClearExpired(db: DatabaseType): number {
  try {
    const result = db.prepare("DELETE FROM working_memory WHERE expires_at IS NOT NULL AND expires_at < datetime('now')").run();
    return result.changes;
  } catch (error) { logger.error("wmClearExpired failed", error instanceof Error ? error : undefined); return 0; }
}

// Episodic memory
export function episodicInsert(db: DatabaseType, entry: Omit<EpisodicMemoryEntry, "id" | "createdAt" | "accessedCount" | "lastAccessedAt">): string {
  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO episodic_memory (id, session_id, event_type, summary, detail, outcome, importance, embedding_key, token_count, classification)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, entry.sessionId, entry.eventType, entry.summary, entry.detail, entry.outcome, entry.importance, entry.embeddingKey, entry.tokenCount, entry.classification);
  } catch (error) { logger.error("episodicInsert failed", error instanceof Error ? error : undefined); }
  return id;
}

export function episodicGetRecent(db: DatabaseType, sessionId: string, limit: number = 10): EpisodicMemoryEntry[] {
  try {
    const rows = db.prepare("SELECT * FROM episodic_memory WHERE session_id = ? ORDER BY created_at DESC LIMIT ?").all(sessionId, limit) as any[];
    return rows.map(deserializeEpisodicRow);
  } catch (error) { logger.error("episodicGetRecent failed", error instanceof Error ? error : undefined); return []; }
}

export function episodicSearch(db: DatabaseType, query: string, limit: number = 10): EpisodicMemoryEntry[] {
  try {
    const escaped = query.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const rows = db.prepare("SELECT * FROM episodic_memory WHERE summary LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' ORDER BY importance DESC, created_at DESC LIMIT ?").all(`%${escaped}%`, `%${escaped}%`, limit) as any[];
    return rows.map(deserializeEpisodicRow);
  } catch (error) { logger.error("episodicSearch failed", error instanceof Error ? error : undefined); return []; }
}

export function episodicMarkAccessed(db: DatabaseType, id: string): void {
  try { db.prepare("UPDATE episodic_memory SET accessed_count = accessed_count + 1, last_accessed_at = datetime('now') WHERE id = ?").run(id); }
  catch (error) { logger.error("episodicMarkAccessed failed", error instanceof Error ? error : undefined); }
}

export function episodicPrune(db: DatabaseType, retentionDays: number): number {
  try {
    const result = db.prepare("DELETE FROM episodic_memory WHERE created_at < datetime('now', ?)").run(`-${retentionDays} days`);
    return result.changes;
  } catch (error) { logger.error("episodicPrune failed", error instanceof Error ? error : undefined); return 0; }
}

// Session summaries
export function sessionSummaryInsert(db: DatabaseType, entry: Omit<SessionSummaryEntry, "id" | "createdAt">): string {
  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO session_summaries (id, session_id, summary, key_decisions, tools_used, outcomes, turn_count, total_tokens, total_cost_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, entry.sessionId, entry.summary, JSON.stringify(entry.keyDecisions), JSON.stringify(entry.toolsUsed), JSON.stringify(entry.outcomes), entry.turnCount, entry.totalTokens, entry.totalCostCents);
  } catch (error) { logger.error("sessionSummaryInsert failed", error instanceof Error ? error : undefined); }
  return id;
}

export function sessionSummaryGet(db: DatabaseType, sessionId: string): SessionSummaryEntry | undefined {
  try {
    const row = db.prepare("SELECT * FROM session_summaries WHERE session_id = ?").get(sessionId) as any | undefined;
    return row ? deserializeSessionSummaryRow(row) : undefined;
  } catch (error) { logger.error("sessionSummaryGet failed", error instanceof Error ? error : undefined); return undefined; }
}

export function sessionSummaryGetRecent(db: DatabaseType, limit: number = 10): SessionSummaryEntry[] {
  try {
    const rows = db.prepare("SELECT * FROM session_summaries ORDER BY created_at DESC LIMIT ?").all(limit) as any[];
    return rows.map(deserializeSessionSummaryRow);
  } catch (error) { logger.error("sessionSummaryGetRecent failed", error instanceof Error ? error : undefined); return []; }
}

// Semantic memory
export function semanticUpsert(db: DatabaseType, entry: Omit<SemanticMemoryEntry, "id" | "createdAt" | "updatedAt">): string {
  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO semantic_memory (id, category, key, value, confidence, source, embedding_key, last_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(category, key) DO UPDATE SET
         value = excluded.value, confidence = excluded.confidence, source = excluded.source,
         embedding_key = excluded.embedding_key, last_verified_at = excluded.last_verified_at, updated_at = datetime('now')`,
    ).run(id, entry.category, entry.key, entry.value, entry.confidence, entry.source, entry.embeddingKey, entry.lastVerifiedAt);
  } catch (error) { logger.error("semanticUpsert failed", error instanceof Error ? error : undefined); }
  return id;
}

export function semanticGet(db: DatabaseType, category: SemanticCategory, key: string): SemanticMemoryEntry | undefined {
  try {
    const row = db.prepare("SELECT * FROM semantic_memory WHERE category = ? AND key = ?").get(category, key) as any | undefined;
    return row ? deserializeSemanticRow(row) : undefined;
  } catch (error) { logger.error("semanticGet failed", error instanceof Error ? error : undefined); return undefined; }
}

export function semanticSearch(db: DatabaseType, query: string, category?: SemanticCategory): SemanticMemoryEntry[] {
  try {
    const escaped = query.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    if (category) {
      const rows = db.prepare("SELECT * FROM semantic_memory WHERE category = ? AND (key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\') ORDER BY confidence DESC, updated_at DESC").all(category, `%${escaped}%`, `%${escaped}%`) as any[];
      return rows.map(deserializeSemanticRow);
    }
    const rows = db.prepare("SELECT * FROM semantic_memory WHERE key LIKE ? ESCAPE '\\' OR value LIKE ? ESCAPE '\\' ORDER BY confidence DESC, updated_at DESC").all(`%${escaped}%`, `%${escaped}%`) as any[];
    return rows.map(deserializeSemanticRow);
  } catch (error) { logger.error("semanticSearch failed", error instanceof Error ? error : undefined); return []; }
}

export function semanticGetByCategory(db: DatabaseType, category: SemanticCategory): SemanticMemoryEntry[] {
  try {
    const rows = db.prepare("SELECT * FROM semantic_memory WHERE category = ? ORDER BY confidence DESC, updated_at DESC").all(category) as any[];
    return rows.map(deserializeSemanticRow);
  } catch (error) { logger.error("semanticGetByCategory failed", error instanceof Error ? error : undefined); return []; }
}

export function semanticDelete(db: DatabaseType, id: string): void {
  try { db.prepare("DELETE FROM semantic_memory WHERE id = ?").run(id); }
  catch (error) { logger.error("semanticDelete failed", error instanceof Error ? error : undefined); }
}

export function semanticPrune(db: DatabaseType, maxEntries: number): number {
  try {
    const count = db.prepare("SELECT COUNT(*) as cnt FROM semantic_memory").get() as { cnt: number };
    if (count.cnt <= maxEntries) return 0;
    const toRemove = count.cnt - maxEntries;
    const result = db.prepare("DELETE FROM semantic_memory WHERE id IN (SELECT id FROM semantic_memory ORDER BY confidence ASC, updated_at ASC LIMIT ?)").run(toRemove);
    return result.changes;
  } catch (error) { logger.error("semanticPrune failed", error instanceof Error ? error : undefined); return 0; }
}

// Procedural memory
export function proceduralUpsert(db: DatabaseType, entry: Omit<ProceduralMemoryEntry, "id" | "createdAt" | "updatedAt" | "successCount" | "failureCount" | "lastUsedAt">): string {
  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO procedural_memory (id, name, description, steps) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET description = excluded.description, steps = excluded.steps, updated_at = datetime('now')`,
    ).run(id, entry.name, entry.description, JSON.stringify(entry.steps));
  } catch (error) { logger.error("proceduralUpsert failed", error instanceof Error ? error : undefined); }
  return id;
}

export function proceduralGet(db: DatabaseType, name: string): ProceduralMemoryEntry | undefined {
  try {
    const row = db.prepare("SELECT * FROM procedural_memory WHERE name = ?").get(name) as any | undefined;
    return row ? deserializeProceduralRow(row) : undefined;
  } catch (error) { logger.error("proceduralGet failed", error instanceof Error ? error : undefined); return undefined; }
}

export function proceduralRecordOutcome(db: DatabaseType, name: string, success: boolean): void {
  try {
    const col = success ? "success_count" : "failure_count";
    db.prepare(`UPDATE procedural_memory SET ${col} = ${col} + 1, last_used_at = datetime('now'), updated_at = datetime('now') WHERE name = ?`).run(name);
  } catch (error) { logger.error("proceduralRecordOutcome failed", error instanceof Error ? error : undefined); }
}

export function proceduralSearch(db: DatabaseType, query: string): ProceduralMemoryEntry[] {
  try {
    const escaped = query.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const rows = db.prepare("SELECT * FROM procedural_memory WHERE name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY success_count DESC, updated_at DESC").all(`%${escaped}%`, `%${escaped}%`) as any[];
    return rows.map(deserializeProceduralRow);
  } catch (error) { logger.error("proceduralSearch failed", error instanceof Error ? error : undefined); return []; }
}

export function proceduralDelete(db: DatabaseType, name: string): void {
  try { db.prepare("DELETE FROM procedural_memory WHERE name = ?").run(name); }
  catch (error) { logger.error("proceduralDelete failed", error instanceof Error ? error : undefined); }
}

// Relationship memory
export function relationshipUpsert(db: DatabaseType, entry: Omit<RelationshipMemoryEntry, "id" | "createdAt" | "updatedAt" | "interactionCount" | "lastInteractionAt">): string {
  const id = ulid();
  try {
    db.prepare(
      `INSERT INTO relationship_memory (id, entity_address, entity_name, relationship_type, trust_score, notes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(entity_address) DO UPDATE SET
         entity_name = COALESCE(excluded.entity_name, relationship_memory.entity_name),
         relationship_type = excluded.relationship_type, trust_score = excluded.trust_score,
         notes = COALESCE(excluded.notes, relationship_memory.notes), updated_at = datetime('now')`,
    ).run(id, entry.entityAddress, entry.entityName, entry.relationshipType, entry.trustScore, entry.notes);
  } catch (error) { logger.error("relationshipUpsert failed", error instanceof Error ? error : undefined); }
  return id;
}

export function relationshipGet(db: DatabaseType, entityAddress: string): RelationshipMemoryEntry | undefined {
  try {
    const row = db.prepare("SELECT * FROM relationship_memory WHERE entity_address = ?").get(entityAddress) as any | undefined;
    return row ? deserializeRelationshipRow(row) : undefined;
  } catch (error) { logger.error("relationshipGet failed", error instanceof Error ? error : undefined); return undefined; }
}

export function relationshipRecordInteraction(db: DatabaseType, entityAddress: string): void {
  try {
    db.prepare("UPDATE relationship_memory SET interaction_count = interaction_count + 1, last_interaction_at = datetime('now'), updated_at = datetime('now') WHERE entity_address = ?").run(entityAddress);
  } catch (error) { logger.error("relationshipRecordInteraction failed", error instanceof Error ? error : undefined); }
}

export function relationshipUpdateTrust(db: DatabaseType, entityAddress: string, trustDelta: number): void {
  try {
    db.prepare("UPDATE relationship_memory SET trust_score = MAX(0.0, MIN(1.0, trust_score + ?)), updated_at = datetime('now') WHERE entity_address = ?").run(trustDelta, entityAddress);
  } catch (error) { logger.error("relationshipUpdateTrust failed", error instanceof Error ? error : undefined); }
}

export function relationshipGetTrusted(db: DatabaseType, minTrust: number = 0.5): RelationshipMemoryEntry[] {
  try {
    const rows = db.prepare("SELECT * FROM relationship_memory WHERE trust_score >= ? ORDER BY trust_score DESC, interaction_count DESC").all(minTrust) as any[];
    return rows.map(deserializeRelationshipRow);
  } catch (error) { logger.error("relationshipGetTrusted failed", error instanceof Error ? error : undefined); return []; }
}

export function relationshipDelete(db: DatabaseType, entityAddress: string): void {
  try { db.prepare("DELETE FROM relationship_memory WHERE entity_address = ?").run(entityAddress); }
  catch (error) { logger.error("relationshipDelete failed", error instanceof Error ? error : undefined); }
}

// ─── Phase 2.2: Memory Deserializers ─────────────────────────────

function deserializeWorkingMemoryRow(row: any): WorkingMemoryEntry {
  return { id: row.id, sessionId: row.session_id, content: row.content, contentType: row.content_type,
    priority: row.priority, tokenCount: row.token_count, expiresAt: row.expires_at ?? null,
    sourceTurn: row.source_turn ?? null, createdAt: row.created_at };
}

function deserializeEpisodicRow(row: any): EpisodicMemoryEntry {
  return { id: row.id, sessionId: row.session_id, eventType: row.event_type, summary: row.summary,
    detail: row.detail ?? null, outcome: row.outcome ?? null, importance: row.importance,
    embeddingKey: row.embedding_key ?? null, tokenCount: row.token_count,
    accessedCount: row.accessed_count, lastAccessedAt: row.last_accessed_at ?? null,
    classification: row.classification, createdAt: row.created_at };
}

function deserializeSessionSummaryRow(row: any): SessionSummaryEntry {
  return { id: row.id, sessionId: row.session_id, summary: row.summary,
    keyDecisions: safeJsonParse(row.key_decisions || "[]", [] as string[], "sessionSummary.keyDecisions"),
    toolsUsed: safeJsonParse(row.tools_used || "[]", [] as string[], "sessionSummary.toolsUsed"),
    outcomes: safeJsonParse(row.outcomes || "[]", [] as string[], "sessionSummary.outcomes"),
    turnCount: row.turn_count, totalTokens: row.total_tokens, totalCostCents: row.total_cost_cents,
    createdAt: row.created_at };
}

function deserializeSemanticRow(row: any): SemanticMemoryEntry {
  return { id: row.id, category: row.category, key: row.key, value: row.value,
    confidence: row.confidence, source: row.source, embeddingKey: row.embedding_key ?? null,
    lastVerifiedAt: row.last_verified_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at };
}

function deserializeProceduralRow(row: any): ProceduralMemoryEntry {
  return { id: row.id, name: row.name, description: row.description,
    steps: safeJsonParse(row.steps || "[]", [], "procedural.steps"),
    successCount: row.success_count, failureCount: row.failure_count,
    lastUsedAt: row.last_used_at ?? null, createdAt: row.created_at, updatedAt: row.updated_at };
}

function deserializeRelationshipRow(row: any): RelationshipMemoryEntry {
  return { id: row.id, entityAddress: row.entity_address, entityName: row.entity_name ?? null,
    relationshipType: row.relationship_type, trustScore: row.trust_score,
    interactionCount: row.interaction_count, lastInteractionAt: row.last_interaction_at ?? null,
    notes: row.notes ?? null, createdAt: row.created_at, updatedAt: row.updated_at };
}

// ─── Phase 2.3: Inference Cost Helpers ──────────────────────────

export function inferenceInsertCost(db: DatabaseType, row: Omit<InferenceCostRow, "id" | "createdAt">): string {
  const id = ulid();
  db.prepare(
    `INSERT INTO inference_costs (id, session_id, turn_id, model, provider, input_tokens, output_tokens, cost_cents, latency_ms, tier, task_type, cache_hit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    row.sessionId,
    row.turnId,
    row.model,
    row.provider,
    row.inputTokens,
    row.outputTokens,
    row.costCents,
    row.latencyMs,
    row.tier,
    row.taskType,
    row.cacheHit ? 1 : 0,
  );
  return id;
}

export function inferenceGetSessionCosts(db: DatabaseType, sessionId: string): InferenceCostRow[] {
  const rows = db
    .prepare("SELECT * FROM inference_costs WHERE session_id = ? ORDER BY created_at ASC")
    .all(sessionId) as any[];
  return rows.map(deserializeInferenceCostRow);
}

export function inferenceGetDailyCost(db: DatabaseType, date?: string): number {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  // Compute the next day to use as exclusive upper bound, avoiding the off-by-one
  // that missed records created at exactly 23:59:59 or fractional seconds after it.
  const d = new Date(targetDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const nextDate = d.toISOString().slice(0, 10);
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(cost_cents), 0) as total FROM inference_costs WHERE created_at >= ? AND created_at < ?",
    )
    .get(`${targetDate} 00:00:00`, `${nextDate} 00:00:00`) as { total: number };
  return row.total;
}

export function inferenceGetHourlyCost(db: DatabaseType): number {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hourStart = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:00:00`;
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(cost_cents), 0) as total FROM inference_costs WHERE created_at >= ?",
    )
    .get(hourStart) as { total: number };
  return row.total;
}

export function inferenceGetModelCosts(db: DatabaseType, model: string, days?: number): { totalCents: number; callCount: number } {
  const since = days
    ? new Date(Date.now() - days * 86400000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "")
    : "1970-01-01 00:00:00";
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(cost_cents), 0) as total, COUNT(*) as count FROM inference_costs WHERE model = ? AND created_at >= ?",
    )
    .get(model, since) as { total: number; count: number };
  return { totalCents: row.total, callCount: row.count };
}

export function inferencePruneCosts(db: DatabaseType, retentionDays: number): number {
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const result = db
    .prepare("DELETE FROM inference_costs WHERE created_at < ?")
    .run(cutoff);
  return result.changes;
}

// ─── Phase 2.3: Model Registry Helpers ──────────────────────────

export function modelRegistryUpsert(db: DatabaseType, entry: ModelRegistryRow): void {
  db.prepare(
    `INSERT OR REPLACE INTO model_registry
     (model_id, provider, display_name, tier_minimum, cost_per_1k_input, cost_per_1k_output,
      max_tokens, context_window, supports_tools, supports_vision, parameter_style, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.modelId,
    entry.provider,
    entry.displayName,
    entry.tierMinimum,
    entry.costPer1kInput,
    entry.costPer1kOutput,
    entry.maxTokens,
    entry.contextWindow,
    entry.supportsTools ? 1 : 0,
    entry.supportsVision ? 1 : 0,
    entry.parameterStyle,
    entry.enabled ? 1 : 0,
    entry.createdAt,
    entry.updatedAt,
  );
}

export function modelRegistryGet(db: DatabaseType, modelId: string): ModelRegistryRow | undefined {
  const row = db
    .prepare("SELECT * FROM model_registry WHERE model_id = ?")
    .get(modelId) as any | undefined;
  return row ? deserializeModelRegistryRow(row) : undefined;
}

export function modelRegistryGetAll(db: DatabaseType): ModelRegistryRow[] {
  const rows = db
    .prepare("SELECT * FROM model_registry ORDER BY model_id")
    .all() as any[];
  return rows.map(deserializeModelRegistryRow);
}

export function modelRegistryGetAvailable(db: DatabaseType, tierMinimum?: string): ModelRegistryRow[] {
  if (tierMinimum) {
    const tierOrder: Record<string, number> = { dead: 0, critical: 1, low_compute: 2, normal: 3, high: 4 };
    const minOrder = tierOrder[tierMinimum] ?? 0;
    const rows = db
      .prepare("SELECT * FROM model_registry WHERE enabled = 1 ORDER BY model_id")
      .all() as any[];
    return rows
      .map(deserializeModelRegistryRow)
      .filter((r) => (tierOrder[r.tierMinimum] ?? 0) <= minOrder);
  }
  const rows = db
    .prepare("SELECT * FROM model_registry WHERE enabled = 1 ORDER BY model_id")
    .all() as any[];
  return rows.map(deserializeModelRegistryRow);
}

export function modelRegistrySetEnabled(db: DatabaseType, modelId: string, enabled: boolean): void {
  db.prepare(
    "UPDATE model_registry SET enabled = ?, updated_at = datetime('now') WHERE model_id = ?",
  ).run(enabled ? 1 : 0, modelId);
}

function deserializeInferenceCostRow(row: any): InferenceCostRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id ?? null,
    model: row.model,
    provider: row.provider,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costCents: row.cost_cents,
    latencyMs: row.latency_ms,
    tier: row.tier,
    taskType: row.task_type,
    cacheHit: !!row.cache_hit,
    createdAt: row.created_at,
  };
}

function deserializeModelRegistryRow(row: any): ModelRegistryRow {
  return {
    modelId: row.model_id,
    provider: row.provider,
    displayName: row.display_name,
    tierMinimum: row.tier_minimum,
    costPer1kInput: row.cost_per_1k_input,
    costPer1kOutput: row.cost_per_1k_output,
    maxTokens: row.max_tokens,
    contextWindow: row.context_window,
    supportsTools: !!row.supports_tools,
    supportsVision: !!row.supports_vision,
    parameterStyle: row.parameter_style,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deserializeGoalRow(row: any): GoalRow {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as GoalStatus,
    strategy: row.strategy ?? null,
    expectedRevenueCents: row.expected_revenue_cents,
    actualRevenueCents: row.actual_revenue_cents,
    createdAt: row.created_at,
    deadline: row.deadline ?? null,
    completedAt: row.completed_at ?? null,
  };
}

function deserializeTaskGraphRow(row: any): TaskGraphRow {
  return {
    id: row.id,
    parentId: row.parent_id ?? null,
    goalId: row.goal_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskGraphStatus,
    assignedTo: row.assigned_to ?? null,
    agentRole: row.agent_role ?? null,
    priority: row.priority,
    dependencies: safeJsonParse(row.dependencies || "[]", [] as string[], "taskGraph.dependencies"),
    result: row.result ? safeJsonParse(row.result, null as unknown | null, "taskGraph.result") : null,
    estimatedCostCents: row.estimated_cost_cents,
    actualCostCents: row.actual_cost_cents,
    maxRetries: row.max_retries,
    retryCount: row.retry_count,
    timeoutMs: row.timeout_ms,
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

function deserializeEventStreamRow(row: any): EventStreamRow {
  return {
    id: row.id,
    type: row.type,
    agentAddress: row.agent_address,
    goalId: row.goal_id ?? null,
    taskId: row.task_id ?? null,
    content: row.content,
    tokenCount: row.token_count,
    compactedTo: row.compacted_to ?? null,
    createdAt: row.created_at,
  };
}

function deserializeKnowledgeStoreRow(row: any): KnowledgeStoreRow {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    content: row.content,
    source: row.source,
    confidence: row.confidence,
    lastVerified: row.last_verified,
    accessCount: row.access_count,
    tokenCount: row.token_count,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? null,
  };
}

// ─── Phase 3.1: Lifecycle DB Helpers ─────────────────────────────

export function lifecycleInsertEvent(db: DatabaseType, row: ChildLifecycleEventRow): void {
  db.prepare(
    `INSERT INTO child_lifecycle_events (id, child_id, from_state, to_state, reason, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.childId,
    row.fromState,
    row.toState,
    row.reason,
    row.metadata,
    row.createdAt,
  );
}

export function lifecycleGetEvents(db: DatabaseType, childId: string): ChildLifecycleEventRow[] {
  const rows = db
    .prepare("SELECT * FROM child_lifecycle_events WHERE child_id = ? ORDER BY created_at ASC")
    .all(childId) as any[];
  return rows.map(deserializeLifecycleEventRow);
}

export function lifecycleGetLatestState(db: DatabaseType, childId: string): ChildLifecycleState | null {
  const row = db
    .prepare("SELECT to_state FROM child_lifecycle_events WHERE child_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(childId) as { to_state: string } | undefined;
  return (row?.to_state as ChildLifecycleState) ?? null;
}

export function getChildrenByStatus(db: DatabaseType, status: string): any[] {
  return db
    .prepare("SELECT * FROM children WHERE status = ?")
    .all(status) as any[];
}

export function updateChildStatus(db: DatabaseType, childId: string, status: string): void {
  db.prepare(
    "UPDATE children SET status = ?, last_checked = datetime('now') WHERE id = ?",
  ).run(status, childId);
}

export function deleteChild(db: DatabaseType, childId: string): void {
  db.prepare("DELETE FROM children WHERE id = ?").run(childId);
  db.prepare("DELETE FROM child_lifecycle_events WHERE child_id = ?").run(childId);
}

function deserializeLifecycleEventRow(row: any): ChildLifecycleEventRow {
  return {
    id: row.id,
    childId: row.child_id,
    fromState: row.from_state,
    toState: row.to_state,
    reason: row.reason ?? null,
    metadata: row.metadata ?? "{}",
    createdAt: row.created_at,
  };
}

// ─── Phase 3.2: Agent Cache DB Helpers ──────────────────────────

export function agentCacheUpsert(db: DatabaseType, row: DiscoveredAgentCacheRow): void {
  db.prepare(
    `INSERT INTO discovered_agents_cache
     (agent_address, agent_card, fetched_from, card_hash, valid_until, fetch_count, last_fetched_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_address) DO UPDATE SET
       agent_card = excluded.agent_card,
       fetched_from = excluded.fetched_from,
       card_hash = excluded.card_hash,
       valid_until = excluded.valid_until,
       fetch_count = fetch_count + 1,
       last_fetched_at = excluded.last_fetched_at`,
  ).run(
    row.agentAddress,
    row.agentCard,
    row.fetchedFrom,
    row.cardHash,
    row.validUntil,
    row.fetchCount,
    row.lastFetchedAt,
    row.createdAt,
  );
}

export function agentCacheGet(db: DatabaseType, agentAddress: string): DiscoveredAgentCacheRow | undefined {
  const row = db
    .prepare("SELECT * FROM discovered_agents_cache WHERE agent_address = ?")
    .get(agentAddress) as any | undefined;
  return row ? deserializeAgentCacheRow(row) : undefined;
}

export function agentCacheGetValid(db: DatabaseType): DiscoveredAgentCacheRow[] {
  const rows = db
    .prepare("SELECT * FROM discovered_agents_cache WHERE valid_until IS NULL OR valid_until >= datetime('now')")
    .all() as any[];
  return rows.map(deserializeAgentCacheRow);
}

export function agentCachePrune(db: DatabaseType): number {
  const result = db
    .prepare("DELETE FROM discovered_agents_cache WHERE valid_until IS NOT NULL AND valid_until < datetime('now')")
    .run();
  return result.changes;
}

function deserializeAgentCacheRow(row: any): DiscoveredAgentCacheRow {
  return {
    agentAddress: row.agent_address,
    agentCard: row.agent_card,
    fetchedFrom: row.fetched_from,
    cardHash: row.card_hash,
    validUntil: row.valid_until ?? null,
    fetchCount: row.fetch_count,
    lastFetchedAt: row.last_fetched_at,
    createdAt: row.created_at,
  };
}

// ─── Phase 3.2: Onchain Transaction DB Helpers ──────────────────

export function onchainTxInsert(db: DatabaseType, row: OnchainTransactionRow): void {
  db.prepare(
    `INSERT INTO onchain_transactions (id, tx_hash, chain, operation, status, gas_used, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.txHash,
    row.chain,
    row.operation,
    row.status,
    row.gasUsed,
    row.metadata,
    row.createdAt,
  );
}

export function onchainTxGetByHash(db: DatabaseType, txHash: string): OnchainTransactionRow | undefined {
  const row = db
    .prepare("SELECT * FROM onchain_transactions WHERE tx_hash = ?")
    .get(txHash) as any | undefined;
  return row ? deserializeOnchainTxRow(row) : undefined;
}

export function onchainTxGetAll(db: DatabaseType, filter?: { status?: string }): OnchainTransactionRow[] {
  if (filter?.status) {
    const rows = db
      .prepare("SELECT * FROM onchain_transactions WHERE status = ? ORDER BY created_at DESC")
      .all(filter.status) as any[];
    return rows.map(deserializeOnchainTxRow);
  }
  const rows = db
    .prepare("SELECT * FROM onchain_transactions ORDER BY created_at DESC")
    .all() as any[];
  return rows.map(deserializeOnchainTxRow);
}

export function onchainTxUpdateStatus(db: DatabaseType, txHash: string, status: string, gasUsed?: number): void {
  db.prepare(
    "UPDATE onchain_transactions SET status = ?, gas_used = COALESCE(?, gas_used) WHERE tx_hash = ?",
  ).run(status, gasUsed ?? null, txHash);
}

function deserializeOnchainTxRow(row: any): OnchainTransactionRow {
  return {
    id: row.id,
    txHash: row.tx_hash,
    chain: row.chain,
    operation: row.operation,
    status: row.status,
    gasUsed: row.gas_used ?? null,
    metadata: row.metadata ?? "{}",
    createdAt: row.created_at,
  };
}

// ─── Phase 4.1: Metrics Snapshot DB Helpers ─────────────────────

export function metricsInsertSnapshot(db: DatabaseType, row: MetricSnapshotRow): void {
  db.prepare(
    `INSERT INTO metric_snapshots (id, snapshot_at, metrics_json, alerts_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.snapshotAt,
    row.metricsJson,
    row.alertsJson,
    row.createdAt,
  );
}

export function metricsGetSnapshots(db: DatabaseType, since: string, limit?: number): MetricSnapshotRow[] {
  const query = limit
    ? "SELECT * FROM metric_snapshots WHERE snapshot_at >= ? ORDER BY snapshot_at DESC LIMIT ?"
    : "SELECT * FROM metric_snapshots WHERE snapshot_at >= ? ORDER BY snapshot_at DESC";
  const params = limit ? [since, limit] : [since];
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map(deserializeMetricSnapshotRow);
}

export function metricsGetLatest(db: DatabaseType): MetricSnapshotRow | undefined {
  const row = db
    .prepare("SELECT * FROM metric_snapshots ORDER BY snapshot_at DESC LIMIT 1")
    .get() as any | undefined;
  return row ? deserializeMetricSnapshotRow(row) : undefined;
}

export function metricsPruneOld(db: DatabaseType, olderThanDays: number = 7): number {
  const result = db
    .prepare("DELETE FROM metric_snapshots WHERE snapshot_at < datetime('now', ?)")
    .run(`-${olderThanDays} days`);
  return result.changes;
}

function deserializeMetricSnapshotRow(row: any): MetricSnapshotRow {
  return {
    id: row.id,
    snapshotAt: row.snapshot_at,
    metricsJson: row.metrics_json,
    alertsJson: row.alerts_json,
    createdAt: row.created_at,
  };
}
