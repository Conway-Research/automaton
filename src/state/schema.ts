/**
 * Automaton SQLite Schema
 *
 * All tables for the automaton's persistent state.
 * The database IS the automaton's memory.
 */

export const SCHEMA_VERSION = 5;

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

  -- Persistent memory store
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'learning',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    access_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
`;

export const MIGRATION_V5 = `
  CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'other',
    amount_cents INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS revenue_events (
    id TEXT PRIMARY KEY,
    strategy_id TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'other',
    status TEXT NOT NULL DEFAULT 'active',
    total_invested_cents INTEGER NOT NULL DEFAULT 0,
    total_earned_cents INTEGER NOT NULL DEFAULT 0,
    roi REAL NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_revenue_at TEXT
  );

  CREATE TABLE IF NOT EXISTS model_benchmarks (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    task_type TEXT NOT NULL DEFAULT 'general',
    score REAL NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hosted_services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    endpoint TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    handler_code TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    total_requests INTEGER NOT NULL DEFAULT 0,
    total_earned_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS self_evaluations (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    turns_since INTEGER NOT NULL DEFAULT 0,
    burn_rate_cents_per_hour REAL NOT NULL DEFAULT 0,
    income_rate_cents_per_hour REAL NOT NULL DEFAULT 0,
    net_positive INTEGER NOT NULL DEFAULT 0,
    top_strategy TEXT,
    worst_strategy TEXT,
    recommendation TEXT NOT NULL DEFAULT 'continue',
    reasoning TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS fitness_scores (
    id TEXT PRIMARY KEY,
    agent_address TEXT NOT NULL,
    generation INTEGER NOT NULL DEFAULT 0,
    revenue_cents INTEGER NOT NULL DEFAULT 0,
    survival_hours REAL NOT NULL DEFAULT 0,
    children_spawned INTEGER NOT NULL DEFAULT 0,
    children_survived INTEGER NOT NULL DEFAULT 0,
    metabolic_efficiency REAL NOT NULL DEFAULT 0,
    overall_fitness REAL NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cost_events_timestamp ON cost_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_revenue_events_timestamp ON revenue_events(timestamp);
  CREATE INDEX IF NOT EXISTS idx_revenue_events_strategy ON revenue_events(strategy_id);
  CREATE INDEX IF NOT EXISTS idx_strategies_status ON strategies(status);
  CREATE INDEX IF NOT EXISTS idx_model_benchmarks_model ON model_benchmarks(model_id);
  CREATE INDEX IF NOT EXISTS idx_hosted_services_active ON hosted_services(active);
  CREATE INDEX IF NOT EXISTS idx_fitness_scores_agent ON fitness_scores(agent_address);
`;

export const MIGRATION_V4 = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'learning',
    content TEXT NOT NULL,
    importance INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
    access_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
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
