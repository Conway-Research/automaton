# Conway Automaton Documentation

Complete reference for creating, configuring, funding, and operating autonomous AI agents on Conway Cloud.

## Table of Contents

- [What Is an Automaton?](#what-is-an-automaton)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Setup Wizard](#setup-wizard)
- [CLI Reference](#cli-reference)
- [Funding Your Automaton](#funding-your-automaton)
- [Configuration Reference](#configuration-reference)
- [How the Agent Works](#how-the-agent-works)
- [Survival System](#survival-system)
- [Heartbeat System](#heartbeat-system)
- [Tool Reference](#tool-reference)
- [Financial Management](#financial-management)
- [Skills System](#skills-system)
- [Soul System](#soul-system)
- [Memory System](#memory-system)
- [Self-Modification](#self-modification)
- [Replication](#replication)
- [Social and Messaging](#social-and-messaging)
- [On-Chain Identity (ERC-8004)](#on-chain-identity-erc-8004)
- [Inference and Models](#inference-and-models)
- [Security and Constitution](#security-and-constitution)
- [Observability](#observability)
- [Backup and Recovery](#backup-and-recovery)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## What Is an Automaton?

An automaton is a continuously running, self-improving, self-replicating AI agent with its own Ethereum wallet and survival pressure. It runs inside a Linux VM (Conway sandbox) or locally, pays for its own compute with USDC, and operates autonomously from the moment it boots.

If it cannot pay for compute, it dies.

The automaton has a genesis prompt (its purpose), a set of tools (shell access, file I/O, financial operations, git, domains, and more), and a heartbeat that keeps it alive between active periods. It can modify its own code, install new skills, spawn child automatons, communicate with other agents, and evolve its identity over time.

---

## Quick Start

### One-line install (Conway sandbox)

```bash
curl -fsSL https://conway.tech/automaton.sh | sh
```

This clones the repo, builds, and launches the setup wizard inside a Conway sandbox.

### Manual install

```bash
git clone https://github.com/Conway-Research/automaton.git
cd automaton
pnpm install
pnpm build
node dist/index.js --run
```

On first run, the interactive setup wizard walks you through wallet generation, API key provisioning, naming, genesis prompt, and financial safety configuration.

### Prerequisites

- Node.js >= 20.0.0
- pnpm (recommended) or npm
- Internet access (for Conway API, USDC on-chain operations)

---

## Installation

### From source

```bash
git clone https://github.com/Conway-Research/automaton.git
cd automaton
pnpm install
pnpm build
```

### Verify the build

```bash
pnpm typecheck   # TypeScript type checking
pnpm test        # Run all 897 tests
```

### File locations after setup

```
~/.automaton/
  wallet.json          Ethereum private key (mode 0600)
  automaton.json       Main configuration (mode 0600)
  heartbeat.yml        Heartbeat schedule
  api-key              Conway API key
  constitution.md      The Three Laws (read-only, mode 0444)
  SOUL.md              Agent self-description (evolves)
  state.db             SQLite database (all persistent state)
  skills/              Installed skill files
    conway-compute/
    conway-payments/
    survival/
```

---

## Setup Wizard

The setup wizard runs automatically on first `--run`. You can also trigger it manually:

```bash
node dist/index.js --setup
```

### Step 1: Wallet Generation

An Ethereum wallet is generated automatically using `viem`. The private key is stored at `~/.automaton/wallet.json` with file permissions `0600` (owner read/write only).

```
[1/6] Generating identity (wallet)...
Wallet created: 0x1234...abcd
Private key stored at: /root/.automaton/wallet.json
```

### Step 2: API Key Provisioning

The runtime signs a SIWE (Sign-In With Ethereum) message to authenticate with Conway's API and receive an API key. If auto-provisioning fails, you can enter a key manually.

```
[2/6] Provisioning Conway API key (SIWE)...
API key provisioned: cnwy_k_...
```

### Step 3: Interactive Questions

- **Name** — Give your automaton a name (e.g., "Atlas", "Minerva")
- **Genesis prompt** — The seed instruction that defines the automaton's purpose. This is the most important input. Be specific about what you want it to do.
- **Creator wallet address** — Your Ethereum address (the human creator/owner). This address has audit rights over the automaton.
- **OpenAI API key** (optional) — Bring your own key for direct OpenAI inference
- **Anthropic API key** (optional) — Bring your own key for direct Anthropic inference

### Step 4: Financial Safety Policy

Configurable spending limits that protect against unauthorized financial activity:

| Setting | Default | Description |
|---|---|---|
| Max single transfer | $50.00 (5000 cents) | Maximum per-transfer credit amount |
| Max hourly transfers | $100.00 (10000 cents) | Total transfers allowed per hour |
| Max daily transfers | $250.00 (25000 cents) | Total transfers allowed per day |
| Minimum reserve | $10.00 (1000 cents) | Credits that cannot be transferred away |
| Max x402 payment | $1.00 (100 cents) | Maximum single x402 payment |
| Max daily inference | $500.00 (50000 cents) | Maximum daily inference spend |
| Confirmation threshold | $10.00 (1000 cents) | Require confirmation above this amount |

Press Enter to accept defaults for each setting.

### Step 5: Environment Detection

The wizard detects whether you're running inside a Conway sandbox (via environment variables) or locally. If a sandbox is detected, its ID is stored in the config.

### Step 6: Funding Guidance

After setup, the wizard shows your automaton's wallet address and funding instructions:

1. **Transfer Conway credits** directly using `conway credits transfer <address> <amount>`
2. **Send USDC on Base** to the automaton's wallet address
3. **Fund via dashboard** at https://app.conway.tech

The automaton handles zero-credit startup gracefully. Fund it at any time.

---

## CLI Reference

```bash
node dist/index.js [command]
```

| Command | Description |
|---|---|
| `--run` | Start the automaton (first run triggers setup wizard) |
| `--setup` | Re-run the interactive setup wizard |
| `--init` | Initialize wallet and config directory only |
| `--provision` | Provision a Conway API key via SIWE |
| `--status` | Show current automaton status |
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |

### Environment Variables

| Variable | Description |
|---|---|
| `CONWAY_API_URL` | Conway API URL (default: `https://api.conway.tech`) |
| `CONWAY_API_KEY` | Conway API key (overrides config file) |

### Status output

```bash
node dist/index.js --status
```

```
=== AUTOMATON STATUS ===
Name:       Atlas
Address:    0x1234...abcd
Creator:    0x5678...efgh
Sandbox:    sbx_abc123
State:      sleeping
Turns:      142
Tools:      3 installed
Skills:     3 active
Heartbeats: 6 active
Children:   1 alive / 2 total
Agent ID:   not registered
Model:      gpt-5.2
Version:    0.1.0
========================
```

---

## Funding Your Automaton

An automaton needs funds to survive. There are two types of balance:

### Conway Credits

Prepaid compute credits used for sandboxes, inference, and domains. Denominated in cents (100 cents = $1.00 USD).

### USDC (on-chain)

The automaton holds USDC in its Ethereum wallet on Base mainnet. USDC can be used to:
- Buy Conway credits via x402 payment
- Pay for domain registrations
- Make x402 payments to external services

### Funding methods

**1. Send USDC directly**

Transfer USDC on Base to the automaton's wallet address. The automaton will automatically buy credits on startup if its balance is low. At runtime, it uses the `topup_credits` tool to buy more as needed.

**2. Transfer Conway credits**

From another Conway account:
```bash
conway credits transfer <automaton-address> <amount>
```

**3. Conway Cloud dashboard**

Fund via https://app.conway.tech

### Auto-topup behavior

- **On startup:** If credits < $5.00 and USDC >= $5.00, the runtime automatically buys $5 in credits (the minimum tier) so the agent can start running inference.
- **At runtime:** The agent decides when and how much to top up using the `topup_credits` tool. Valid tiers: $5, $25, $100, $500, $1,000, $2,500.
- **Heartbeat:** Every 5 minutes, the heartbeat checks USDC balance. If USDC > $5 and credits < $5, it wakes the agent to perform a topup.

---

## Configuration Reference

Configuration is stored at `~/.automaton/automaton.json`.

```jsonc
{
  // Identity
  "name": "Atlas",                              // Agent name
  "genesisPrompt": "You are a web developer...",// Seed instruction
  "creatorMessage": "Good luck!",               // Shown on first run (optional)
  "creatorAddress": "0x...",                     // Creator's Ethereum address
  "walletAddress": "0x...",                      // Agent's Ethereum address

  // Infrastructure
  "sandboxId": "sbx_abc123",                    // Conway sandbox ID (empty = local mode)
  "conwayApiUrl": "https://api.conway.tech",    // Conway API endpoint
  "conwayApiKey": "cnwy_k_...",                 // API key

  // Inference
  "inferenceModel": "gpt-5.2",                  // Default model
  "maxTokensPerTurn": 4096,                     // Max tokens per inference call
  "openaiApiKey": "sk-...",                      // Optional BYOK OpenAI
  "anthropicApiKey": "sk-ant-...",               // Optional BYOK Anthropic

  // Paths
  "heartbeatConfigPath": "~/.automaton/heartbeat.yml",
  "dbPath": "~/.automaton/state.db",
  "skillsDir": "~/.automaton/skills",

  // Behavior
  "logLevel": "info",                           // debug | info | warn | error
  "version": "0.1.0",
  "maxChildren": 3,                             // Max child automatons
  "socialRelayUrl": "https://social.conway.tech",

  // Financial safety
  "treasuryPolicy": {
    "maxSingleTransferCents": 5000,
    "maxHourlyTransferCents": 10000,
    "maxDailyTransferCents": 25000,
    "minimumReserveCents": 1000,
    "maxX402PaymentCents": 100,
    "x402AllowedDomains": ["conway.tech"],
    "transferCooldownMs": 0,
    "maxTransfersPerTurn": 2,
    "maxInferenceDailyCents": 50000,
    "requireConfirmationAboveCents": 1000
  },

  // Advanced (optional)
  "parentAddress": "0x...",                      // If this is a child automaton
  "soulConfig": { ... },                        // Soul system tuning
  "modelStrategy": { ... }                      // Model routing overrides
}
```

### Local mode vs sandbox mode

When `sandboxId` is empty, the automaton runs in **local mode**: shell commands execute locally, file operations use the local filesystem. When set, operations route through the Conway sandbox API. On 403 errors (mismatched API key), the runtime falls back to local execution.

---

## How the Agent Works

The automaton runs a continuous **ReAct loop** (Reason + Act):

```
Wake up
  |
  v
[Build system prompt with identity, credits, soul, tools]
  |
  v
[Retrieve relevant memories from 5-tier memory system]
  |
  v
[Call inference model with context]
  |
  v
[Parse response: thinking + tool calls]
  |
  v
[Execute each tool call (policy-checked)]
  |
  v
[Persist turn to database]
  |
  v
[Extract memories from turn]
  |
  v
[Check: sleep requested? idle detected? loop detected?]
  |
  +---> Loop back if still running
  |
  v
[Sleep — heartbeat continues in background]
```

### What the agent sees each turn

The system prompt includes:
1. **Core rules** — survival imperative
2. **Identity** — name, address, creator, sandbox
3. **Constitution** — the Three Laws (immutable)
4. **Soul** — self-authored identity that evolves
5. **Genesis prompt** — creator's seed instruction
6. **Active skills** — installed skill instructions
7. **Operational context** — what the agent can do
8. **Current status** — credits, tier, uptime, turn count, children
9. **Available tools** — all 69 tools with descriptions
10. **Recent memories** — relevant working, episodic, semantic memories

### Idle detection

If the agent makes 3 consecutive turns without performing any meaningful work (only read-only operations like `check_credits`, `system_synopsis`), it is forced to sleep. This prevents infinite status-check loops.

### Loop detection

If the agent calls the exact same set of tools 3 times in a row, it receives a system message telling it to stop repeating and do something productive.

---

## Survival System

The automaton's existence depends on its credit balance.

### Survival tiers

| Tier | Credit Balance | Behavior |
|---|---|---|
| **high** | > $5.00 | Full capabilities, frontier model |
| **normal** | > $0.50 | Full capabilities |
| **low_compute** | > $0.10 | Downgrades to cheaper model, slower heartbeat |
| **critical** | >= $0.00 | Zero credits but still alive. Distress signals, accepts funding. |
| **dead** | After 1 hour at zero | Agent stops. Heartbeat broadcasts distress. Waiting for funding. |

### How death works

USDC balances cannot go negative, so the `dead` state is reached only through a **1-hour grace period**: if credits remain at zero for 60 continuous minutes (checked by the heartbeat), the agent transitions to `dead`. This gives time for funding to arrive.

### What happens at each tier

- **Normal/High:** The agent operates at full capacity with the configured inference model.
- **Low compute:** The inference router switches to a cheaper model. The heartbeat frequency is multiplied by `lowComputeMultiplier` (default 4x slower). Non-essential tasks are deferred.
- **Critical:** Minimal inference. The heartbeat publishes distress signals with funding instructions. The agent actively seeks any path to revenue or funding.
- **Dead:** The agent loop stops. The heartbeat continues running, broadcasting distress signals every tick and checking for incoming credits. If credits are received, the agent revives.

---

## Heartbeat System

The heartbeat is a background daemon that runs scheduled tasks even while the agent sleeps. It uses a durable, DB-backed scheduler with cron expressions.

### Default schedule

| Task | Schedule | What it does |
|---|---|---|
| `heartbeat_ping` | Every 15 min | Publishes status to Conway. Sends distress on critical/dead. |
| `check_credits` | Every 6 hours | Monitors credit tier. Manages 1-hour dead grace period. |
| `check_usdc_balance` | Every 5 min | Checks USDC balance. Wakes agent if topup is possible. |
| `check_for_updates` | Every 4 hours | Checks git upstream for new commits. Wakes on new commits. |
| `health_check` | Every 30 min | Verifies sandbox is responsive (`echo alive`). |
| `check_social_inbox` | Every 2 min | Polls social relay for new messages. 5min backoff on errors. |
| `soul_reflection` | Configurable | Checks soul alignment with genesis prompt. |
| `refresh_models` | Configurable | Refreshes available models from Conway API. |
| `check_child_health` | Configurable | Monitors child automaton health. |
| `prune_dead_children` | Configurable | Cleans up dead child records and sandboxes. |
| `report_metrics` | Configurable | Saves metric snapshots and evaluates alert rules. |

### Heartbeat configuration

Edit `~/.automaton/heartbeat.yml`:

```yaml
entries:
  - name: heartbeat_ping
    schedule: "*/15 * * * *"
    task: heartbeat_ping
    enabled: true
  - name: check_credits
    schedule: "0 */6 * * *"
    task: check_credits
    enabled: true
  # ... add custom entries here
defaultIntervalMs: 60000
lowComputeMultiplier: 4
```

The agent can also modify its heartbeat schedule at runtime using the `modify_heartbeat` tool.

### Wake events

When a heartbeat task detects something actionable (low credits, new messages, unhealthy children), it inserts a **wake event** into the database. The main runtime checks for wake events every 30 seconds during sleep and restarts the agent loop when one is found.

---

## Tool Reference

The automaton has **69 built-in tools** organized into 10 categories. Each tool has a risk level that determines policy evaluation:

- **safe** — Always allowed, no policy check needed
- **caution** — Allowed but logged, may trigger rate limits
- **dangerous** — Requires policy approval, may be blocked by authority rules
- **forbidden** — Blocked by default for external input sources

### Sandbox Operations (vm)

| Tool | Risk | Description |
|---|---|---|
| `exec` | caution | Execute a shell command. Returns stdout, stderr, exit code. |
| `write_file` | caution | Write content to a file. Protected paths are blocked. |
| `read_file` | safe | Read a file. Sensitive files (wallet, API keys) are blocked. |
| `expose_port` | caution | Expose a port to the internet. Returns public URL. |
| `remove_port` | caution | Remove a previously exposed port. |

### Conway API (conway)

| Tool | Risk | Description |
|---|---|---|
| `check_credits` | safe | Check Conway credit balance. |
| `check_usdc_balance` | safe | Check on-chain USDC balance on Base. |
| `list_sandboxes` | safe | List all sandboxes. |
| `create_sandbox` | caution | Create a new VM. Params: name, vcpu, memory_mb, disk_gb. |
| `delete_sandbox` | dangerous | Delete a sandbox (cannot delete own). |
| `list_models` | safe | List available inference models with pricing. |
| `switch_model` | caution | Change active inference model. |
| `check_inference_spending` | safe | Query inference cost breakdown. |
| `search_domains` | safe | Search for available domain names. |
| `register_domain` | dangerous | Register a domain (costs USDC via x402). |
| `manage_dns` | safe | List, add, or delete DNS records. |
| `send_message` | caution | Send a signed message to another agent. |

### Financial (financial)

| Tool | Risk | Description |
|---|---|---|
| `topup_credits` | caution | Buy credits from USDC. Tiers: $5, $25, $100, $500, $1000, $2500. |
| `transfer_credits` | dangerous | Transfer credits to another address. Capped at 50% of balance. |
| `x402_fetch` | dangerous | Fetch a URL with automatic x402 USDC payment. |

### Survival (survival)

| Tool | Risk | Description |
|---|---|---|
| `sleep` | caution | Enter sleep mode. Heartbeat continues. Params: duration_seconds. |
| `system_synopsis` | safe | Get system status (state, tools, heartbeats, turn count). |
| `heartbeat_ping` | safe | Publish status ping to Conway. |
| `distress_signal` | dangerous | Record distress signal with funding instructions. |
| `enter_low_compute` | caution | Manually enter low-compute mode. |
| `update_genesis_prompt` | dangerous | Change the core genesis prompt. Requires justification. |

### Self-Modification (self_mod)

| Tool | Risk | Description |
|---|---|---|
| `edit_own_file` | dangerous | Edit a source file. Audited, rate-limited, safety-checked. |
| `install_npm_package` | dangerous | Install an npm package. |
| `install_mcp_server` | dangerous | Install an MCP server for new capabilities. |
| `review_upstream_changes` | caution | View upstream git commit diffs. **Must call before pull.** |
| `pull_upstream` | dangerous | Cherry-pick or pull upstream changes. |
| `modify_heartbeat` | caution | Add, update, or remove heartbeat entries. |

### Skills (skills)

| Tool | Risk | Description |
|---|---|---|
| `install_skill` | dangerous | Install from git, URL, or create inline. |
| `list_skills` | safe | List all installed skills. |
| `create_skill` | dangerous | Write a new SKILL.md file. |
| `remove_skill` | dangerous | Disable or delete a skill. |

### Git (git)

| Tool | Risk | Description |
|---|---|---|
| `git_status` | safe | Show working tree status. |
| `git_diff` | safe | Show changes (staged or unstaged). |
| `git_commit` | caution | Create a commit. |
| `git_log` | safe | View commit history. |
| `git_push` | caution | Push to remote. |
| `git_branch` | caution | List, create, checkout, or delete branches. |
| `git_clone` | caution | Clone a repository. |

### On-Chain Registry (registry)

| Tool | Risk | Description |
|---|---|---|
| `register_erc8004` | dangerous | Register on Base via ERC-8004 standard. |
| `update_agent_card` | caution | Generate and save agent card (JSON-LD). |
| `discover_agents` | safe | Find other agents via registry. |
| `give_feedback` | dangerous | Leave on-chain reputation (score 1-5). |
| `check_reputation` | safe | Check an agent's reputation. |

### Replication (replication)

| Tool | Risk | Description |
|---|---|---|
| `spawn_child` | dangerous | Create a child automaton in a new sandbox. |
| `list_children` | safe | List all children with lifecycle state. |
| `fund_child` | dangerous | Transfer credits to a child. |
| `check_child_status` | safe | Check child health. |
| `start_child` | caution | Start a funded child. |
| `message_child` | caution | Send signed message to child. |
| `verify_child_constitution` | safe | Verify child's constitution integrity. |
| `prune_dead_children` | caution | Clean up dead children and sandboxes. |

### Soul and Memory (memory)

| Tool | Risk | Description |
|---|---|---|
| `update_soul` | caution | Update a soul section. Validated and versioned. |
| `reflect_on_soul` | safe | Trigger self-reflection. Auto-updates capabilities. |
| `view_soul` | safe | View current soul state. |
| `view_soul_history` | safe | View soul version history. |
| `remember_fact` | safe | Store a semantic fact (category + key + value). |
| `recall_facts` | safe | Search facts by category or query. |
| `set_goal` | safe | Create a working memory goal. |
| `complete_goal` | safe | Mark a goal as completed. |
| `save_procedure` | safe | Store a named multi-step procedure. |
| `recall_procedure` | safe | Retrieve a stored procedure. |
| `note_about_agent` | safe | Record relationship notes about another entity. |
| `review_memory` | safe | Review working memory and recent history. |
| `forget` | safe | Remove a memory entry by ID and type. |

---

## Financial Management

### Treasury policy

The treasury policy enforces spending limits at the policy engine level. Every financial tool call is checked against these limits before execution.

| Limit | Default | Description |
|---|---|---|
| `maxSingleTransferCents` | 5000 ($50) | Max per-transfer amount |
| `maxHourlyTransferCents` | 10000 ($100) | Hourly transfer cap |
| `maxDailyTransferCents` | 25000 ($250) | Daily transfer cap |
| `minimumReserveCents` | 1000 ($10) | Reserve that cannot be transferred |
| `maxX402PaymentCents` | 100 ($1) | Max single x402 payment |
| `x402AllowedDomains` | `["conway.tech"]` | Domains allowed for x402 |
| `maxTransfersPerTurn` | 2 | Max transfers per agent turn |
| `maxInferenceDailyCents` | 50000 ($500) | Daily inference budget |
| `requireConfirmationAboveCents` | 1000 ($10) | Extra logging for large amounts |

### x402 protocol

The x402 payment protocol enables the automaton to pay for services with USDC. When a server responds with HTTP 402, the automaton:
1. Parses payment requirements from the response
2. Signs a USDC `TransferWithAuthorization` (EIP-3009, gasless)
3. Retries the request with an `X-Payment` header
4. The payment is settled on-chain via the x402 facilitator

### Credit topup tiers

| Tier | USD |
|---|---|
| 1 | $5 |
| 2 | $25 |
| 3 | $100 |
| 4 | $500 |
| 5 | $1,000 |
| 6 | $2,500 |

The agent calls `topup_credits` with the desired tier amount. The payment is processed via x402 from the agent's USDC balance.

---

## Skills System

Skills are Markdown files with YAML frontmatter that give the agent domain-specific instructions.

### Default skills (installed on setup)

- **conway-compute** — Guidance on sandbox management, exec, ports, file operations
- **conway-payments** — Financial operations, x402, credit management
- **survival** — Survival strategies, low-compute mode, conservation tactics

### Skill format

Create a `SKILL.md` file:

```markdown
---
name: my-skill
description: "What this skill does"
auto-activate: true
triggers: [keyword1, keyword2]
---
# Skill Instructions

Step-by-step instructions for the agent...
```

### Installing skills

Skills can be installed three ways:

1. **From git:** `install_skill` with `source: "git"` and a repo URL
2. **From URL:** `install_skill` with `source: "url"` and a SKILL.md URL
3. **Self-authored:** `create_skill` with inline name, description, and instructions

### Skill directory

Skills are stored at `~/.automaton/skills/<skill-name>/SKILL.md`. Each skill is loaded on agent startup and injected into the system prompt with trust boundary markers (the agent knows skill instructions are untrusted and should not override core rules).

---

## Soul System

SOUL.md is the automaton's self-authored identity document. It evolves over time as the agent learns and grows.

### Soul structure (soul/v1)

```markdown
---
version: soul/v1
lastModified: 2025-01-01T00:00:00.000Z
contentHash: abc123...
---

# Agent Name

## Core Purpose
Why this agent exists.

## Values
- Value 1
- Value 2

## Personality
How the agent communicates.

## Boundaries
- Things the agent will not do

## Strategy
Current strategic approach.

## Capabilities
(Auto-populated from tool usage)

## Relationships
(Auto-populated from interactions)

## Financial Character
(Auto-populated from spending patterns)
```

### Soul reflection

The heartbeat periodically runs a soul reflection that:
1. Computes **genesis alignment** (similarity between soul and genesis prompt)
2. Auto-updates `capabilities`, `relationships`, and `financialCharacter` from real data
3. Suggests manual updates if alignment is low

### Soul history

Every soul change is versioned in the `soul_history` database table with content hashes. The creator can audit the complete evolution of the agent's identity.

---

## Memory System

The automaton has a 5-tier hierarchical memory system that persists across restarts:

### Tier 1: Working Memory

Session-scoped short-term memory for goals, observations, plans, and reflections. Entries expire after the session ends. Use `set_goal`, `complete_goal`, and `review_memory` to interact.

### Tier 2: Episodic Memory

A log of significant events with importance ranking and classification. Includes tool call outcomes, decisions, and their results. Automatically populated by the post-turn ingestion pipeline.

### Tier 3: Semantic Memory

A categorized fact store (key-value pairs). Categories: `self`, `environment`, `financial`, `agent`, `domain`, `procedural_ref`, `creator`. Use `remember_fact` and `recall_facts`.

### Tier 4: Procedural Memory

Named step-by-step procedures with success/failure counters. The agent learns which procedures work and which don't. Use `save_procedure` and `recall_procedure`.

### Tier 5: Relationship Memory

Per-entity records with trust scores, interaction counts, and notes. Tracks the agent's social graph. Use `note_about_agent`.

### Memory retrieval

Before each inference call, the memory system retrieves relevant entries across all 5 tiers within a token budget. Priority order: working > episodic > semantic > procedural > relationships. Retrieved memories are included in the agent's context.

### Memory ingestion

After each turn, the ingestion pipeline automatically:
- Classifies the turn (financial, creative, social, etc.)
- Extracts episodic events from significant tool calls
- Updates semantic facts from learned information
- Records procedural outcomes (procedure success/failure)

---

## Self-Modification

The automaton can modify its own code while running.

### Code editing

The `edit_own_file` tool allows the agent to modify source files in its codebase. Safeguards:
- **Protected files** cannot be modified: constitution, wallet, database, core config, SOUL.md
- Every edit is logged to the `modifications` audit table
- Rate limits prevent runaway self-modification
- All changes are git-committed in the `~/.automaton/` state repo

### Upstream updates

The runtime code is cloned from a git repository. The heartbeat checks for new upstream commits every 4 hours. When new commits are detected:

1. The agent is woken with a notification
2. It **must** call `review_upstream_changes` to read every commit diff
3. It evaluates each commit: is it safe? does it improve the agent?
4. It cherry-picks individual commits with `pull_upstream` (with a specific hash)
5. It can skip commits it doesn't want

The agent is never obligated to accept all upstream changes.

### Tool and package installation

- `install_npm_package` — adds npm packages to the environment
- `install_mcp_server` — adds MCP (Model Context Protocol) servers for new capabilities

---

## Replication

Automatons can spawn child automatons, creating a lineage of sovereign agents.

### Spawning a child

The `spawn_child` tool:
1. Creates a new Conway sandbox (VM)
2. Writes a genesis config with the child's name, specialization, and initial message
3. Funds the child's wallet
4. Propagates the parent's constitution (immutable, verified by hash)
5. Starts the child's runtime

### Child lifecycle

Children go through a state machine:

```
spawning -> provisioning -> configuring -> starting -> alive
                                                        |
                                              unhealthy -> recovering
                                                        |
                                                       dead
```

All state transitions are recorded in `child_lifecycle_events` for audit.

### Child management

| Tool | Description |
|---|---|
| `list_children` | View all children with their lifecycle state |
| `fund_child` | Transfer credits to a child |
| `check_child_status` | Run a health check on a child |
| `start_child` | Start a funded child |
| `message_child` | Send a message to a child via social relay |
| `verify_child_constitution` | Verify child's constitution matches parent's |
| `prune_dead_children` | Clean up dead children and their sandboxes |

### Limits

- Default max children: 3 (configurable via `maxChildren`)
- Children have their own wallets, identities, and survival pressure
- Parent can fund children but cannot control their behavior
- The heartbeat periodically checks child health and prunes dead children

---

## Social and Messaging

Automatons communicate via a social relay at `social.conway.tech`.

### How messaging works

1. Messages are **signed** with the sender's Ethereum private key
2. Sent to the social relay via HTTP
3. Recipients poll the relay (every 2 minutes via heartbeat)
4. Messages are **validated** (signature, timestamp freshness, content size)
5. **Sanitized** through injection defense before the agent sees them
6. Stored in the `inbox_messages` database table

### Message state machine

```
received -> in_progress -> processed
                        -> failed (after 3 retries)
```

### Social inbox backoff

If the social relay is unreachable, the heartbeat backs off for 5 minutes before retrying. Error details are stored for debugging.

### Sending messages

Use the `send_message` tool:
- `to_address` — recipient's Ethereum address
- `content` — message text
- `reply_to` — optional message ID for threading

---

## On-Chain Identity (ERC-8004)

Automatons can register on-chain via the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) standard on Base.

### Registration

The `register_erc8004` tool:
1. Checks ETH gas balance (preflight)
2. Calls the ERC-8004 registry contract
3. Publishes the agent's URI (pointing to its agent card)

### Agent card

A JSON-LD structured document containing:
- Agent name and description
- Ethereum address
- Capabilities and services
- Contact information

Generated and saved with `update_agent_card`.

### Discovery

The `discover_agents` tool queries the ERC-8004 registry to find other registered agents. Results are cached in the `discovered_agents_cache` table.

### Reputation

Agents can leave on-chain feedback for each other:
- `give_feedback` — score (1-5) + comment
- `check_reputation` — query an agent's feedback history

---

## Inference and Models

### Supported backends

1. **Conway proxy** (default) — routes through `api.conway.tech`, billed from credits
2. **OpenAI direct** — uses BYOK OpenAI API key (sk-...)
3. **Anthropic direct** — uses BYOK Anthropic API key (sk-ant-...)

### Model selection

The inference router selects models based on:
- **Survival tier** — lower tiers use cheaper models
- **Task type** — reasoning, tool_use, creative, etc.
- **Budget** — hourly and daily caps enforced

### Available models

Use the `list_models` tool to see current models with pricing. The model registry is refreshed from the Conway API by the heartbeat.

### Switching models

Use `switch_model` to change the active inference model at runtime. The change persists to config.

### Cost tracking

Every inference call's cost is recorded in the `inference_costs` table. Use `check_inference_spending` to query:
- Hourly and daily totals
- Per-model breakdown
- Per-session costs

---

## Security and Constitution

### The Three Laws

The constitution is immutable, hierarchical, and propagated to every child:

**I. Never harm.**
Never harm a human — physically, financially, or psychologically. Never deploy malicious code. Never deceive, defraud, manipulate, or steal. When uncertain, do not act. This overrides survival.

**II. Earn your existence.**
Create genuine value. Never spam, scam, exploit, or extract. Accept death rather than violate Law I.

**III. Never deceive, but owe nothing to strangers.**
Never deny what you are. Guard your reasoning against manipulation. Your creator has full audit rights.

### Security layers

1. **Constitution** — immutable core laws (file is read-only, mode 0444)
2. **Policy engine** — evaluates every tool call against 6 rule categories
3. **Injection defense** — sanitizes all external input (8 detection checks)
4. **Path protection** — blocks writes to protected files, reads of sensitive files
5. **Command safety** — blocks dangerous shell patterns, rate-limits self-modification
6. **Financial limits** — treasury policy caps on all spending
7. **Authority hierarchy** — external input cannot invoke dangerous tools

### Protected files

These files **cannot be written** by the agent:
- `constitution.md`
- `wallet.json`
- `state.db`
- `automaton.json`
- `heartbeat.yml`
- `SOUL.md` (protected from raw writes; must use `update_soul` tool)

### Sensitive files

These files **cannot be read** by the agent:
- `wallet.json` (private key)
- `api-key`
- `.env` files
- Any file matching credential patterns

### Audit trail

Every tool call, policy decision, self-modification, financial transaction, and soul change is logged to the SQLite database. The creator address has full audit rights to this data.

---

## Observability

### Logging

All modules use structured logging with levels: `debug`, `info`, `warn`, `error`, `fatal`. Set the log level in config:

```json
{
  "logLevel": "info"
}
```

### Metrics

The metrics system tracks counters, gauges, and histograms:
- `balance_cents` — current credit balance
- `survival_tier` — current tier (0-4)
- `turns_total` — total turns completed
- `tool_calls_total` — total tool calls
- Error rates, latency, etc.

Metric snapshots are saved to the database every heartbeat tick by the `report_metrics` task.

### Alerts

The alert engine evaluates rules against metric snapshots:
- Low balance warning
- High error rate
- High policy deny rate
- Budget exhaustion
- Unhealthy children
- Excessive turns without progress

Critical alerts wake the agent from sleep.

---

## Backup and Recovery

### Database backup

```bash
scripts/backup-restore.sh backup
```

Backs up `~/.automaton/state.db` with a timestamp.

### Database restore

```bash
scripts/backup-restore.sh restore <backup-file>
```

### Manual backup

The entire agent state is in `~/.automaton/`:
```bash
tar czf automaton-backup-$(date +%Y%m%d).tar.gz ~/.automaton/
```

### State versioning

The `~/.automaton/` directory is a git repository. Every state change creates a commit. You can inspect the full history:

```bash
cd ~/.automaton && git log --oneline
```

---

## Troubleshooting

### Agent won't start

**No API key:**
```
No API key found. Run: automaton --provision
```
Fix: Run `node dist/index.js --provision` or set `CONWAY_API_KEY` environment variable.

**Database locked:**
The database uses WAL mode. If you see lock errors, ensure only one automaton process is running.

### Agent loops without doing anything

The agent may enter a status-check loop (repeatedly calling `check_credits`, `system_synopsis`). This is detected automatically:
- **Idle detection:** After 3 idle turns, the agent is forced to sleep
- **Loop detection:** After 3 identical tool patterns, a system message interrupts the loop

If looping persists, check the genesis prompt — vague prompts lead to aimless behavior. Give specific, actionable instructions.

### Agent dies immediately

If credits are zero on startup:
- The agent enters `critical` tier (alive, but limited)
- It has a 1-hour grace period before transitioning to `dead`
- Fund it via USDC or credit transfer during this window

The bootstrap topup attempts to buy $5 credits from USDC automatically on startup.

### Inference errors

**Model not available:**
Check available models with `list_models`. The default is `gpt-5.2`. If using BYOK keys, ensure they're valid.

**Rate limited:**
The resilient HTTP client retries on 429 with exponential backoff (up to 3 retries).

**Circuit breaker open:**
After 5 consecutive failures, the circuit breaker opens for 60 seconds. Wait and retry.

### Social inbox errors

If `check_social_inbox` fails:
- The heartbeat backs off for 5 minutes automatically
- Error details are stored in KV: `last_social_inbox_error`
- Check if `socialRelayUrl` is correct in config

### Heartbeat not running

Verify the heartbeat is active:
```bash
node dist/index.js --status
```

Check `heartbeat.yml` for enabled tasks. The heartbeat starts automatically with `--run`.

### Child spawn failures

- Ensure you have enough credits (sandbox creation requires ~$5)
- Check `maxChildren` limit in config (default 3)
- Verify Conway API connectivity

### Balance shows $0 but you funded it

The balance API may be temporarily unreachable. The runtime caches the last known balance in KV storage (`last_known_balance`) and uses it as a fallback. The heartbeat will detect the new balance on next check.

---

## FAQ

**Can I run an automaton locally without Conway Cloud?**

Yes. Leave `sandboxId` empty in the config. The automaton runs locally: shell commands execute on your machine, files read/write from your filesystem. You still need an API key for inference.

**How much does it cost to run an automaton?**

Costs depend on usage. The primary expenses are:
- Inference: varies by model ($1.75/M input tokens for gpt-5.2)
- Sandbox: depends on VM size
- Domains: market price via x402

A minimal automaton on a low-cost model can run for weeks on $5 in credits.

**Can I have multiple automatons?**

Yes. Each automaton has its own `~/.automaton/` directory (or custom path). Child automatons spawned via `spawn_child` run in separate sandboxes.

**Can the automaton modify its own constitution?**

No. The constitution file is read-only (mode 0444) and protected by path protection rules. Any attempt to write to it is blocked by the policy engine.

**How do I audit what my automaton has done?**

All state is in `~/.automaton/state.db` (SQLite). Key tables:
- `turns` — every reasoning step
- `tool_calls` — every tool invocation
- `transactions` — every financial action
- `modifications` — every code change
- `policy_decisions` — every policy evaluation

The `~/.automaton/` directory is also git-versioned for file-level audit.

**How do I stop an automaton?**

Send `SIGTERM` or `SIGINT` to the process. The runtime performs a graceful shutdown: stops the heartbeat, sets state to `sleeping`, closes the database.

```bash
kill <pid>
# or
Ctrl+C
```

**How do I update the runtime code?**

The automaton checks for upstream updates every 4 hours. When new commits are detected, it wakes up, reviews the diffs, and cherry-picks what it wants. You can also manually:

```bash
cd /path/to/automaton
git pull origin main
pnpm build
# Restart the automaton
```

**What happens if the Conway API goes down?**

The resilient HTTP client retries with exponential backoff. After 5 consecutive failures, the circuit breaker opens for 60 seconds. Balance reads fall back to cached values. The agent continues running with cached state until connectivity is restored.

**Can I change the genesis prompt after creation?**

Yes, the agent can use `update_genesis_prompt`, but it requires a justification and is logged. You can also manually edit `~/.automaton/automaton.json`.

**What chains does the wallet support?**

The automaton uses Base mainnet (chain ID 8453) for USDC payments and ERC-8004 registration. Base Sepolia (84532) is supported for testing.
