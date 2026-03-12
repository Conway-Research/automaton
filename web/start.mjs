#!/usr/bin/env node
/**
 * Zentience Production Startup
 *
 * Runs BOTH processes in a single container:
 * 1. Web server (serve.mjs) — dashboard + API proxy — this process
 * 2. Full autonomous agent (dist/index.js --run) — child process
 *    - Heartbeat daemon, agent loop, x402 payment server, revenue engine
 *    - Creates and manages the SQLite database
 *    - Earns money through x402 micropayments
 *
 * The agent is the brain. The web server is the face.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const AUTOMATON_DIR = join(homedir(), '.automaton');
const DB_PATH = process.env.AUTOMATON_DB_PATH || join(AUTOMATON_DIR, 'state.db');

// ─── Step 1: Ensure directories exist ──────────────────
if (!existsSync(AUTOMATON_DIR)) {
  mkdirSync(AUTOMATON_DIR, { recursive: true, mode: 0o700 });
  console.log(`[startup] Created ${AUTOMATON_DIR}`);
}

const skillsDir = join(AUTOMATON_DIR, 'skills');
if (!existsSync(skillsDir)) {
  mkdirSync(skillsDir, { recursive: true });
}

// ─── Step 2: Pre-init database ─────────────────────────
// Create DB with essential tables BEFORE the agent starts.
// The web server can immediately read from it.
async function preInitDatabase() {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS identity (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

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

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount_cents INTEGER,
        balance_after_cents INTEGER,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS revenue_ledger (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        service_endpoint TEXT NOT NULL,
        payer_address TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        network TEXT NOT NULL DEFAULT 'solana:mainnet-beta',
        transaction_signature TEXT NOT NULL DEFAULT '',
        service_category TEXT NOT NULL DEFAULT 'agent_task',
        created_at TEXT NOT NULL,
        token TEXT NOT NULL DEFAULT 'USDC',
        token_amount_raw TEXT NOT NULL DEFAULT '0'
      );

      CREATE INDEX IF NOT EXISTS idx_revenue_source ON revenue_ledger(source);
      CREATE INDEX IF NOT EXISTS idx_revenue_payer ON revenue_ledger(payer_address);
      CREATE INDEX IF NOT EXISTS idx_revenue_created ON revenue_ledger(created_at);
      CREATE INDEX IF NOT EXISTS idx_revenue_endpoint ON revenue_ledger(service_endpoint);
      CREATE INDEX IF NOT EXISTS idx_revenue_token ON revenue_ledger(token);

      CREATE TABLE IF NOT EXISTS expense_ledger (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_expense_category ON expense_ledger(category);
      CREATE INDEX IF NOT EXISTS idx_expense_created ON expense_ledger(created_at);

      CREATE TABLE IF NOT EXISTS bounty_board (
        id TEXT PRIMARY KEY,
        client_address TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        reward_cents INTEGER NOT NULL,
        deadline TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        category TEXT NOT NULL DEFAULT 'agent_task',
        deliverable TEXT,
        estimated_cost_cents INTEGER DEFAULT 0,
        actual_cost_cents INTEGER DEFAULT 0,
        payment_signature TEXT,
        created_at TEXT NOT NULL,
        claimed_at TEXT,
        delivered_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_bounty_status ON bounty_board(status);
      CREATE INDEX IF NOT EXISTS idx_bounty_client ON bounty_board(client_address);

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

      CREATE TABLE IF NOT EXISTS installed_tools (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config TEXT DEFAULT '{}',
        installed_at TEXT NOT NULL DEFAULT (datetime('now')),
        enabled INTEGER NOT NULL DEFAULT 1
      );

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
    `);

    // Seed identity if wallet address is available
    const walletAddress = process.env.AUTOMATON_WALLET_ADDRESS || '';
    if (walletAddress) {
      const upsert = db.prepare(
        "INSERT OR REPLACE INTO identity (key, value) VALUES (?, ?)"
      );
      upsert.run('name', 'Zentience');
      upsert.run('address', walletAddress);
      const existingCreatedAt = db.prepare("SELECT value FROM identity WHERE key = 'createdAt'").get();
      if (!existingCreatedAt) {
        upsert.run('createdAt', new Date().toISOString());
      }
      console.log(`[startup] Seeded identity: ${walletAddress}`);
    }

    // Set agent state to waking
    const upsertKV = db.prepare(
      "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    );
    upsertKV.run('agent_state', '"waking"');

    db.close();
    console.log(`[startup] Database pre-initialized at ${DB_PATH}`);
  } catch (err) {
    console.warn(`[startup] DB pre-init failed (agent will create it): ${err.message}`);
  }
}

// ─── Step 3: Start the full autonomous agent ───────────
function startAgent() {
  const agentPath = join(PROJECT_ROOT, 'dist', 'index.js');

  if (!existsSync(agentPath)) {
    console.warn(`[startup] Agent not built at ${agentPath} — running web server only`);
    return null;
  }

  console.log('[startup] Starting autonomous agent...');

  const agent = spawn('node', [agentPath, '--run'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  agent.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.log(`[agent] ${line}`);
    }
  });

  agent.stderr.on('data', (data) => {
    for (const line of data.toString().split('\n').filter(Boolean)) {
      console.error(`[agent] ${line}`);
    }
  });

  agent.on('exit', (code, signal) => {
    console.error(`[startup] Agent exited (code=${code}, signal=${signal}). Restarting in 10s...`);
    setTimeout(() => startAgent(), 10000);
  });

  agent.on('error', (err) => {
    console.error(`[startup] Agent spawn error: ${err.message}`);
  });

  return agent;
}

// ─── Step 4: Start everything ──────────────────────────
async function start() {
  await preInitDatabase();
  process.env.AUTOMATON_DB_PATH = DB_PATH;

  // Start the web server (in this process)
  console.log('[startup] Starting web server...');
  await import('./serve.mjs');

  // Start the full autonomous agent (child process)
  const hasApiKey = process.env.CONWAY_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (hasApiKey) {
    await new Promise(r => setTimeout(r, 1500));
    startAgent();
  } else {
    console.warn('[startup] No API keys set — running web server only (no agent)');
    console.warn('[startup] Set ANTHROPIC_API_KEY or CONWAY_API_KEY to enable the full agent');
  }
}

start().catch(err => {
  console.error(`[startup] Fatal: ${err.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => { console.log('[startup] SIGTERM — shutting down'); process.exit(0); });
process.on('SIGINT', () => { console.log('[startup] SIGINT — shutting down'); process.exit(0); });
