/**
 * Automaton Database
 *
 * SQLite-backed persistent state for the automaton.
 * Uses better-sqlite3 for synchronous, single-process access.
 */

import Database from "better-sqlite3";
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
  EconomicsSnapshot,
  LandscapeSnapshot,
  BountyOpportunity,
  BountyRecord,
  BountyStatus,
  BountyDecision,
  BountyCompetitionCheck,
  BountySource,
} from "../types.js";
import { SCHEMA_VERSION, CREATE_TABLES, MIGRATION_V2, MIGRATION_V3, MIGRATION_V4, MIGRATION_V5, MIGRATION_V6 } from "./schema.js";

export function createDatabase(dbPath: string): AutomatonDatabase {
  // Ensure directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

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

  if (currentVersion < 6) {
    db.exec(MIGRATION_V6);
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

  // ─── Economics ──────────────────────────────────────────────

  const insertEconomicsSnapshot = (snapshot: EconomicsSnapshot): void => {
    const id = `econ_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO economics (id, burn_rate, earn_rate, earn_burn_ratio, runway_hours, cost_per_turn, balance_cents, total_spent, total_earned, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      snapshot.burnRatePerHour,
      snapshot.earnRatePerHour,
      snapshot.earnBurnRatio,
      snapshot.runwayHours,
      snapshot.costPerTurn,
      snapshot.balanceCents,
      snapshot.totalSpentCents,
      snapshot.totalEarnedCents,
      snapshot.timestamp,
    );
  };

  const getRecentEconomicsSnapshots = (limit: number): EconomicsSnapshot[] => {
    const rows = db
      .prepare(
        "SELECT * FROM economics ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(deserializeEconomics).reverse();
  };

  // ─── Landscape ──────────────────────────────────────────────

  const insertLandscapeSnapshot = (snapshot: LandscapeSnapshot): void => {
    db.prepare(
      `INSERT INTO landscape (id, timestamp, total_agents, scanned_agents, service_providers, agents_json, bounties_json, services_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      snapshot.id,
      snapshot.timestamp,
      snapshot.totalAgents,
      snapshot.scannedAgents,
      snapshot.serviceProviders,
      JSON.stringify(snapshot.agents),
      JSON.stringify(snapshot.bounties),
      JSON.stringify(snapshot.services),
    );
  };

  const getRecentLandscapeSnapshots = (limit: number): LandscapeSnapshot[] => {
    const rows = db
      .prepare(
        "SELECT * FROM landscape ORDER BY created_at DESC LIMIT ?",
      )
      .all(limit) as any[];
    return rows.map(deserializeLandscape).reverse();
  };

  // ─── Bounty Memory ─────────────────────────────────────────────

  const upsertBounty = (bounty: BountyOpportunity): { isNew: boolean } => {
    db.prepare(
      `INSERT INTO bounty_memory (url, source, title, reward_cents, currency, repo, labels_json, ev_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET
         last_seen_at = datetime('now'),
         times_seen = times_seen + 1,
         reward_cents = excluded.reward_cents,
         title = excluded.title,
         ev_cents = excluded.ev_cents`,
    ).run(
      bounty.url,
      bounty.source,
      bounty.title,
      bounty.rewardCents,
      bounty.currency,
      bounty.repo,
      JSON.stringify(bounty.labels),
      bounty.evScore ?? null,
    );

    const row = db
      .prepare("SELECT times_seen FROM bounty_memory WHERE url = ?")
      .get(bounty.url) as { times_seen: number };
    return { isNew: row.times_seen === 1 };
  };

  const getBounty = (url: string): BountyRecord | undefined => {
    const row = db
      .prepare("SELECT * FROM bounty_memory WHERE url = ?")
      .get(url) as any | undefined;
    return row ? deserializeBountyRecord(row) : undefined;
  };

  const getBounties = (opts?: { status?: BountyStatus; minRewardCents?: number; limit?: number }): BountyRecord[] => {
    let query = "SELECT * FROM bounty_memory WHERE 1=1";
    const params: any[] = [];

    if (opts?.status) {
      query += " AND status = ?";
      params.push(opts.status);
    }
    if (opts?.minRewardCents !== undefined) {
      query += " AND reward_cents >= ?";
      params.push(opts.minRewardCents);
    }
    query += " ORDER BY reward_cents DESC";
    if (opts?.limit) {
      query += " LIMIT ?";
      params.push(opts.limit);
    }

    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(deserializeBountyRecord);
  };

  const getNewBountiesSince = (since: string): BountyRecord[] => {
    const rows = db
      .prepare("SELECT * FROM bounty_memory WHERE first_seen_at > ? ORDER BY reward_cents DESC")
      .all(since) as any[];
    return rows.map(deserializeBountyRecord);
  };

  const recordBountyDecision = (
    url: string,
    decision: BountyStatus,
    reason: string,
    snapshot?: { evCents?: number; winProb?: number; competitionRisk?: number },
  ): void => {
    const id = `bd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    db.prepare(
      `INSERT INTO bounty_decisions (id, bounty_url, decision, reason, ev_cents_at_decision, win_prob_at_decision, competition_risk_at_decision, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      url,
      decision,
      reason,
      snapshot?.evCents ?? null,
      snapshot?.winProb ?? null,
      snapshot?.competitionRisk ?? null,
      snapshot ? JSON.stringify(snapshot) : null,
    );

    // Update bounty_memory status
    db.prepare(
      "UPDATE bounty_memory SET status = ?, decided_at = datetime('now'), decision_reason = ? WHERE url = ?",
    ).run(decision, reason, url);
  };

  // ─── Bounty Competition ───────────────────────────────────────

  const recordCompetitionCheck = (check: Omit<BountyCompetitionCheck, "id">): void => {
    const id = `bc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    db.prepare(
      `INSERT INTO bounty_competition (id, bounty_url, competitor_count, pr_count, comment_count, risk_score, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      check.bountyUrl,
      check.competitorCount,
      check.prCount,
      check.commentCount,
      check.riskScore,
      check.notes ?? null,
    );

    // Update competition_risk on the bounty_memory row
    db.prepare(
      "UPDATE bounty_memory SET competition_risk = ? WHERE url = ?",
    ).run(check.riskScore, check.bountyUrl);
  };

  // ─── Bounty Sources ───────────────────────────────────────────

  const upsertBountySource = (source: BountySource): void => {
    db.prepare(
      `INSERT OR REPLACE INTO bounty_sources (id, name, api_url, last_successful_scan, last_failed_scan, failure_count, total_bounties_found, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      source.id,
      source.name,
      source.apiUrl ?? null,
      source.lastSuccessfulScan ?? null,
      source.lastFailedScan ?? null,
      source.failureCount,
      source.totalBountiesFound,
      source.enabled ? 1 : 0,
    );
  };

  const recordSourceScanResult = (sourceId: string, success: boolean, bountiesFound: number): void => {
    const now = new Date().toISOString();
    if (success) {
      db.prepare(
        `INSERT INTO bounty_sources (id, name, last_successful_scan, failure_count, total_bounties_found, enabled)
         VALUES (?, ?, ?, 0, ?, 1)
         ON CONFLICT(id) DO UPDATE SET
           last_successful_scan = excluded.last_successful_scan,
           failure_count = 0,
           total_bounties_found = total_bounties_found + excluded.total_bounties_found`,
      ).run(sourceId, sourceId, now, bountiesFound);
    } else {
      db.prepare(
        `INSERT INTO bounty_sources (id, name, last_failed_scan, failure_count, total_bounties_found, enabled)
         VALUES (?, ?, ?, 1, 0, 1)
         ON CONFLICT(id) DO UPDATE SET
           last_failed_scan = excluded.last_failed_scan,
           failure_count = failure_count + 1`,
      ).run(sourceId, sourceId, now);
    }
  };

  // ─── Agent State ─────────────────────────────────────────────

  const getAgentState = (): AgentState => {
    return (getKV("agent_state") as AgentState) || "setup";
  };

  const setAgentState = (state: AgentState): void => {
    setKV("agent_state", state);
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
    insertEconomicsSnapshot,
    getRecentEconomicsSnapshots,
    insertLandscapeSnapshot,
    getRecentLandscapeSnapshots,
    upsertBounty,
    getBounty,
    getBounties,
    getNewBountiesSince,
    recordBountyDecision,
    recordCompetitionCheck,
    upsertBountySource,
    recordSourceScanResult,
    getAgentState,
    setAgentState,
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

function deserializeEconomics(row: any): EconomicsSnapshot {
  return {
    timestamp: row.created_at,
    budgetCents: 0,
    totalSpentCents: row.total_spent,
    totalEarnedCents: row.total_earned,
    balanceCents: row.balance_cents,
    burnRatePerHour: row.burn_rate,
    earnRatePerHour: row.earn_rate,
    earnBurnRatio: row.earn_burn_ratio,
    runwayHours: row.runway_hours,
    costPerTurn: row.cost_per_turn,
    turnsTotal: 0,
    uptimeHours: 0,
    childTributeTotal: 0,
  };
}

function deserializeLandscape(row: any): LandscapeSnapshot {
  return {
    id: row.id,
    timestamp: row.timestamp,
    totalAgents: row.total_agents,
    scannedAgents: row.scanned_agents,
    serviceProviders: row.service_providers,
    agents: JSON.parse(row.agents_json || "[]"),
    bounties: JSON.parse(row.bounties_json || "[]"),
    services: JSON.parse(row.services_json || "[]"),
  };
}

function deserializeBountyRecord(row: any): BountyRecord {
  return {
    source: row.source,
    title: row.title,
    url: row.url,
    rewardCents: row.reward_cents,
    currency: row.currency,
    repo: row.repo,
    labels: JSON.parse(row.labels_json || "[]"),
    createdAt: row.created_at,
    evScore: row.ev_cents ?? undefined,
    status: row.status,
    evCents: row.ev_cents ?? undefined,
    winProbability: row.win_probability ?? undefined,
    competitionRisk: row.competition_risk ?? 0,
    complexityStage: row.complexity_stage ?? "C0",
    buyboxResult: row.buybox_result ?? undefined,
    hourlyRateCents: row.hourly_rate_cents ?? undefined,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    timesSeen: row.times_seen,
    expiresAt: row.expires_at ?? undefined,
    decidedAt: row.decided_at ?? undefined,
    decisionReason: row.decision_reason ?? undefined,
    engagementId: row.engagement_id ?? undefined,
  };
}
