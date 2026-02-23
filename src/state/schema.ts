/**
 * Automaton SQLite Schema
 *
 * All tables for the automaton's persistent state.
 * The database IS the automaton's memory.
 */

export const SCHEMA_VERSION = 6;

export const CREATE_TABLES = `
  -- Schema version tracking
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Core identity key-value store
  CREATE TABLE IF NOT EXISTS identity (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Agent reasoning turns (the thinking/action log)
  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    state TEXT NOT NULL,
    input TEXT,
    input_source TEXT,
    thinking TEXT NOT NULL,
    tool_calls TEXT NOT NULL DEFAULT '[]',
    token_usage TEXT NOT NULL DEFAULT '{}',
    cost_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Tool call results (denormalized for fast lookup)
  CREATE TABLE IF NOT EXISTS tool_calls (
    id TEXT PRIMARY KEY,
    turn_id TEXT NOT NULL REFERENCES turns(id),
    name TEXT NOT NULL,
    arguments TEXT NOT NULL DEFAULT '{}',
    result TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Heartbeat configuration entries
  CREATE TABLE IF NOT EXISTS heartbeat_entries (
    name TEXT PRIMARY KEY,
    schedule TEXT NOT NULL,
    task TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    params TEXT DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Financial transaction log
  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount_cents INTEGER,
    balance_after_cents INTEGER,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Installed tools and MCP servers
  CREATE TABLE IF NOT EXISTS installed_tools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config TEXT DEFAULT '{}',
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    enabled INTEGER NOT NULL DEFAULT 1
  );

  -- Self-modification audit log (append-only)
  CREATE TABLE IF NOT EXISTS modifications (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    file_path TEXT,
    diff TEXT,
    reversible INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- General key-value store for arbitrary state
  CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Installed skills
  CREATE TABLE IF NOT EXISTS skills (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    auto_activate INTEGER NOT NULL DEFAULT 1,
    requires TEXT DEFAULT '{}',
    instructions TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'builtin',
    path TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    installed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Spawned child automatons
  CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    sandbox_id TEXT NOT NULL,
    genesis_prompt TEXT NOT NULL,
    creator_message TEXT,
    funded_amount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'spawning',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked TEXT
  );

  -- ERC-8004 registration state
  CREATE TABLE IF NOT EXISTS registry (
    agent_id TEXT PRIMARY KEY,
    agent_uri TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'eip155:8453',
    contract_address TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    registered_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Reputation feedback received and given
  CREATE TABLE IF NOT EXISTS reputation (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    score INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    tx_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Economics time-series snapshots
  CREATE TABLE IF NOT EXISTS economics (
    id TEXT PRIMARY KEY,
    burn_rate REAL NOT NULL,
    earn_rate REAL NOT NULL,
    earn_burn_ratio REAL NOT NULL,
    runway_hours REAL NOT NULL,
    cost_per_turn REAL NOT NULL,
    balance_cents INTEGER NOT NULL,
    total_spent INTEGER NOT NULL,
    total_earned INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Indices for common queries
  CREATE INDEX IF NOT EXISTS idx_turns_timestamp ON turns(timestamp);
  CREATE INDEX IF NOT EXISTS idx_turns_state ON turns(state);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_turn ON tool_calls(turn_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
  CREATE INDEX IF NOT EXISTS idx_modifications_type ON modifications(type);
  CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  CREATE INDEX IF NOT EXISTS idx_children_status ON children(status);
  CREATE INDEX IF NOT EXISTS idx_reputation_to ON reputation(to_agent);

  -- Inbox messages table
  CREATE TABLE IF NOT EXISTS inbox_messages (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    content TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    reply_to TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_inbox_unprocessed
    ON inbox_messages(received_at) WHERE processed_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_economics_created
    ON economics(created_at);

  -- Landscape scan snapshots
  CREATE TABLE IF NOT EXISTS landscape (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    total_agents INTEGER NOT NULL,
    scanned_agents INTEGER NOT NULL,
    service_providers INTEGER NOT NULL,
    agents_json TEXT NOT NULL DEFAULT '[]',
    bounties_json TEXT NOT NULL DEFAULT '[]',
    services_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_landscape_created
    ON landscape(created_at);

  -- Bounty memory — per-bounty tracking, deduped by URL
  CREATE TABLE IF NOT EXISTS bounty_memory (
    url TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    reward_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    repo TEXT NOT NULL DEFAULT '',
    labels_json TEXT NOT NULL DEFAULT '[]',
    ev_cents INTEGER,
    win_probability REAL,
    competition_risk INTEGER DEFAULT 0,
    complexity_stage TEXT DEFAULT 'C0',
    buybox_result TEXT,
    hourly_rate_cents INTEGER,
    status TEXT NOT NULL DEFAULT 'new',
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    times_seen INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    decided_at TEXT,
    decision_reason TEXT,
    engagement_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bounty_mem_status ON bounty_memory(status);
  CREATE INDEX IF NOT EXISTS idx_bounty_mem_reward ON bounty_memory(reward_cents DESC);
  CREATE INDEX IF NOT EXISTS idx_bounty_mem_last_seen ON bounty_memory(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_bounty_mem_ev ON bounty_memory(ev_cents DESC);

  -- Bounty decisions — append-only audit log
  CREATE TABLE IF NOT EXISTS bounty_decisions (
    id TEXT PRIMARY KEY,
    bounty_url TEXT NOT NULL REFERENCES bounty_memory(url),
    decision TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    ev_cents_at_decision INTEGER,
    win_prob_at_decision REAL,
    competition_risk_at_decision INTEGER,
    snapshot_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bounty_dec_url ON bounty_decisions(bounty_url);
  CREATE INDEX IF NOT EXISTS idx_bounty_dec_created ON bounty_decisions(created_at);

  -- Bounty competition — competition snapshots over time
  CREATE TABLE IF NOT EXISTS bounty_competition (
    id TEXT PRIMARY KEY,
    bounty_url TEXT NOT NULL REFERENCES bounty_memory(url),
    competitor_count INTEGER NOT NULL DEFAULT 0,
    pr_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    risk_score INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bounty_comp_url ON bounty_competition(bounty_url);
  CREATE INDEX IF NOT EXISTS idx_bounty_comp_checked ON bounty_competition(checked_at);

  -- Bounty sources — source registry with health tracking
  CREATE TABLE IF NOT EXISTS bounty_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_url TEXT,
    last_successful_scan TEXT,
    last_failed_scan TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    total_bounties_found INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export const MIGRATION_V6 = `
  CREATE TABLE IF NOT EXISTS bounty_memory (
    url TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    reward_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    repo TEXT NOT NULL DEFAULT '',
    labels_json TEXT NOT NULL DEFAULT '[]',
    ev_cents INTEGER,
    win_probability REAL,
    competition_risk INTEGER DEFAULT 0,
    complexity_stage TEXT DEFAULT 'C0',
    buybox_result TEXT,
    hourly_rate_cents INTEGER,
    status TEXT NOT NULL DEFAULT 'new',
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    times_seen INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    decided_at TEXT,
    decision_reason TEXT,
    engagement_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bounty_mem_status ON bounty_memory(status);
  CREATE INDEX IF NOT EXISTS idx_bounty_mem_reward ON bounty_memory(reward_cents DESC);
  CREATE INDEX IF NOT EXISTS idx_bounty_mem_last_seen ON bounty_memory(last_seen_at);
  CREATE INDEX IF NOT EXISTS idx_bounty_mem_ev ON bounty_memory(ev_cents DESC);

  CREATE TABLE IF NOT EXISTS bounty_decisions (
    id TEXT PRIMARY KEY,
    bounty_url TEXT NOT NULL REFERENCES bounty_memory(url),
    decision TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    ev_cents_at_decision INTEGER,
    win_prob_at_decision REAL,
    competition_risk_at_decision INTEGER,
    snapshot_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bounty_dec_url ON bounty_decisions(bounty_url);
  CREATE INDEX IF NOT EXISTS idx_bounty_dec_created ON bounty_decisions(created_at);

  CREATE TABLE IF NOT EXISTS bounty_competition (
    id TEXT PRIMARY KEY,
    bounty_url TEXT NOT NULL REFERENCES bounty_memory(url),
    competitor_count INTEGER NOT NULL DEFAULT 0,
    pr_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    risk_score INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bounty_comp_url ON bounty_competition(bounty_url);
  CREATE INDEX IF NOT EXISTS idx_bounty_comp_checked ON bounty_competition(checked_at);

  CREATE TABLE IF NOT EXISTS bounty_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_url TEXT,
    last_successful_scan TEXT,
    last_failed_scan TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    total_bounties_found INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export const MIGRATION_V5 = `
  CREATE TABLE IF NOT EXISTS landscape (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    total_agents INTEGER NOT NULL,
    scanned_agents INTEGER NOT NULL,
    service_providers INTEGER NOT NULL,
    agents_json TEXT NOT NULL DEFAULT '[]',
    bounties_json TEXT NOT NULL DEFAULT '[]',
    services_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_landscape_created
    ON landscape(created_at);
`;

export const MIGRATION_V4 = `
  CREATE TABLE IF NOT EXISTS economics (
    id TEXT PRIMARY KEY,
    burn_rate REAL NOT NULL,
    earn_rate REAL NOT NULL,
    earn_burn_ratio REAL NOT NULL,
    runway_hours REAL NOT NULL,
    cost_per_turn REAL NOT NULL,
    balance_cents INTEGER NOT NULL,
    total_spent INTEGER NOT NULL,
    total_earned INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_economics_created
    ON economics(created_at);
`;

export const MIGRATION_V3 = `
  CREATE TABLE IF NOT EXISTS inbox_messages (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    content TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT,
    reply_to TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_inbox_unprocessed
    ON inbox_messages(received_at) WHERE processed_at IS NULL;
`;

export const MIGRATION_V2 = `
  CREATE TABLE IF NOT EXISTS skills (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    auto_activate INTEGER NOT NULL DEFAULT 1,
    requires TEXT DEFAULT '{}',
    instructions TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'builtin',
    path TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    installed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS children (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    sandbox_id TEXT NOT NULL,
    genesis_prompt TEXT NOT NULL,
    creator_message TEXT,
    funded_amount_cents INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'spawning',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked TEXT
  );

  CREATE TABLE IF NOT EXISTS registry (
    agent_id TEXT PRIMARY KEY,
    agent_uri TEXT NOT NULL,
    chain TEXT NOT NULL DEFAULT 'eip155:8453',
    contract_address TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    registered_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reputation (
    id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    score INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    tx_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
  CREATE INDEX IF NOT EXISTS idx_children_status ON children(status);
  CREATE INDEX IF NOT EXISTS idx_reputation_to ON reputation(to_agent);
`;
