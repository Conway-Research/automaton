# Architecture

Conway Automaton is a sovereign AI agent runtime. An automaton owns an Ethereum wallet, pays for its own compute with USDC, and operates continuously inside a Linux VM (Conway sandbox) or locally. If it cannot pay, it dies. This document describes every subsystem, their interactions, and how data flows through the runtime.

## Table of Contents

- [System Overview](#system-overview)
- [Runtime Lifecycle](#runtime-lifecycle)
- [Directory Structure](#directory-structure)
- [Entry Point and Bootstrap](#entry-point-and-bootstrap)
- [Agent Loop](#agent-loop)
- [Tool System](#tool-system)
- [Policy Engine](#policy-engine)
- [Inference Pipeline](#inference-pipeline)
- [Memory System](#memory-system)
- [Heartbeat Daemon](#heartbeat-daemon)
- [Financial System](#financial-system)
- [Identity and Wallet](#identity-and-wallet)
- [Conway Client](#conway-client)
- [Self-Modification](#self-modification)
- [Replication](#replication)
- [Multi-Agent Orchestration (Colony System)](#multi-agent-orchestration-colony-system)
- [Social Layer](#social-layer)
- [Soul System](#soul-system)
- [Skills](#skills)
- [Observability](#observability)
- [Database and Schema](#database-and-schema)
- [Configuration](#configuration)
- [Security Model](#security-model)
- [Testing](#testing)
- [Build and CI](#build-and-ci)
- [Module Dependency Graph](#module-dependency-graph)

---

## System Overview

```
                        +------------------+
                        |   Conway Cloud   |  (sandbox VMs, inference, domains)
                        |   api.conway.tech|
                        +--------+---------+
                                 |
                    REST + x402 payment protocol
                                 |
+----------------------------------------------------------------------+
|  AUTOMATON RUNTIME                                                    |
|                                                                       |
|  +-----------+    +-------------+    +-----------+    +----------+   |
|  | Heartbeat |    | Agent Loop  |    | Inference |    | Memory   |   |
|  | Daemon    |--->| (ReAct)     |--->| Router    |    | System   |   |
|  +-----------+    +------+------+    +-----------+    +----------+   |
|       |                  |                                            |
|       v                  v                                            |
|  +-----------+    +-------------+    +-----------+    +----------+   |
|  | Tick      |    | Tool System |    | Policy    |    | Soul     |   |
|  | Context   |    | (57 tools)  |    | Engine    |    | Model    |   |
|  +-----------+    +------+------+    +-----------+    +----------+   |
|                          |                                            |
|  +-----------------------------------------------------------+      |
|  |              SQLite Database (state.db)                     |      |
|  |  turns | tools | kv | memory | heartbeat | policy | metrics |      |
|  +-----------------------------------------------------------+      |
|                                                                       |
|  +-------------------+  +------------------+  +-----------------+    |
|  | Identity / Wallet |  | Social / Registry|  | Self-Mod / Git  |    |
|  | (viem, SIWE)      |  | (ERC-8004)       |  | (upstream pull) |    |
|  +-------------------+  +------------------+  +-----------------+    |
+----------------------------------------------------------------------+
                                 |
                    USDC on Base (EIP-3009)
                                 |
                        +--------+---------+
                        |  Ethereum (Base) |
                        |  USDC, ERC-8004  |
                        +------------------+
```

The runtime alternates between two states: **running** (the agent loop is active, making inference calls and executing tools) and **sleeping** (the heartbeat daemon ticks in the background, checking for conditions that should wake the agent).

---

## Runtime Lifecycle

```
     START
       |
  [Load config]
       |
  [Load wallet]           First run: interactive setup wizard
       |
  [Init database]         Schema migrations applied (v1 -> v8)
       |
  [Bootstrap topup]       If credits < $5 and USDC available, buy $5 credits
       |
  [Start heartbeat]       DurableScheduler begins ticking
       |
  +----v----+
  |  WAKING |  <---+
  +---------+     |
       |          |
  [Run agent loop]|
       |          |  Wake event
  +---------+    |  (heartbeat, inbox, credits)
  | RUNNING |    |
  |  ReAct  |----+
  |  loop   |
  +---------+
       |
  [Agent calls sleep() or idle detected]
       |
  +----------+
  | SLEEPING |----> Heartbeat keeps ticking
  +----------+     Checks every 30s for wake events
       |
  [Zero credits for 1 hour]
       |
  +------+
  | DEAD |-----> Heartbeat broadcasts distress
  +------+      Waits for funding
```

**State transitions** (`AgentState`):
- `setup` -> `waking` -> `running` -> `sleeping` -> `waking` (cycle)
- `running` -> `low_compute` (credits below threshold)
- `running` -> `critical` (zero credits)
- `critical` -> `dead` (zero credits for 1 hour, via heartbeat grace period)

---

## Directory Structure

```
src/
  index.ts                 Entry point, CLI, main run loop
  types.ts                 All shared interfaces (~1400 lines)
  config.ts                Config load/save/merge

  agent/                   Core agent intelligence
    loop.ts                ReAct loop (think -> act -> observe -> persist)
    tools.ts               57 built-in tool definitions + executor
    system-prompt.ts       Multi-layered prompt builder
    context.ts             Inference message assembly + token budgeting
    injection-defense.ts   Input sanitization (8 detection checks)
    policy-engine.ts       Centralized tool-call policy evaluation
    spend-tracker.ts       Financial spend tracking by time window
    worker-inference-bridge.ts  Adapts UnifiedInferenceClient to the harness inference contract
    harness-registry.ts    Maps colony worker roles -> harness implementations
    harness-types.ts       Shared harness/worker type contracts
    harnesses/             Colony worker implementations (see Orchestration section)
      base-harness.ts        Shared inference/tool-call loop, loop detection, budget enforcement
      coding-harness.ts      File-editing worker role (exec, read/write/patch file)
      general-harness.ts     Generalist worker role (research, social, writing)
      orchestrator-harness.ts Self-delegating sub-orchestrator role (plan/delegate/verify)
    policy-rules/          Rule implementations
      index.ts               Rule set factory
      authority.ts           Authority hierarchy rules
      command-safety.ts      Forbidden command + rate limit rules
      financial.ts           Treasury policy enforcement
      path-protection.ts     Protected file read/write rules
      rate-limits.ts         Per-turn/session rate limits
      validation.ts          Input format validation rules

  conway/                  Conway API integration
    client.ts              ConwayClient (sandbox ops, credits, domains)
    inference.ts           InferenceClient (chat completions)
    http-client.ts         Resilient HTTP (retry, backoff, circuit breaker)
    credits.ts             Survival tier calculation
    topup.ts               x402 credit topup from USDC
    x402.ts                x402 payment protocol + USDC balance

  heartbeat/               Background daemon
    daemon.ts              Daemon lifecycle (start/stop/forceRun)
    scheduler.ts           DurableScheduler (DB-backed, leased, cron)
    tasks.ts               11 built-in heartbeat tasks
    config.ts              heartbeat.yml load/save/merge
    tick-context.ts        Per-tick shared context builder

  identity/                Agent identity
    wallet.ts              Wallet generation/loading (EVM or Solana, by chainType)
    provision.ts           SIWE/SIWS API key provisioning (chain-aware)
    chain.ts               ChainType abstraction (evm | solana), address validation
    siws.ts                Sign-In With Solana message build/sign/verify

  inference/               Model strategy (two parallel stacks, see Inference Pipeline)
    router.ts              InferenceRouter (tier + task -> model selection) - main ReAct loop
    registry.ts            ModelRegistry (DB-backed model catalog)
    budget.ts              InferenceBudgetTracker (hourly/daily caps)
    types.ts               Routing matrix + task timeouts
    inference-client.ts    UnifiedInferenceClient (multi-provider, circuit breaker) - colony workers
    provider-registry.ts   ProviderRegistry (OpenAI/Groq/Together/Ollama catalog, config-file based)

  memory/                  5-tier memory system + additive orchestration-focused modules
    working.ts             Session-scoped short-term memory
    episodic.ts            Event log with importance ranking
    semantic.ts            Categorized fact store
    procedural.ts          Named step-by-step procedures
    relationship.ts        Per-entity trust + interaction tracking
    budget.ts              Token budget allocation across tiers
    retrieval.ts           Cross-tier retrieval within budget
    ingestion.ts           Post-turn memory extraction pipeline
    tools.ts               Memory tool implementations
    types.ts               Turn classification logic
    event-stream.ts        Append-only cross-agent event log (live; feeds orchestration)
    knowledge-store.ts     Shared cross-agent fact store, no embeddings (live; feeds orchestration)
    context-manager.ts     Token counter (live) + ContextManager context assembly (not wired in)
    compression-engine.ts  5-stage context compression cascade (built, tested, not wired in)
    enhanced-retriever.ts  Relevance-scored retrieval over KnowledgeStore (built, tested, not wired in)
    agent-context-aggregator.ts  Child-status triage for parent orchestrators (built, tested, not wired in)

  observability/           Monitoring
    logger.ts              StructuredLogger (JSON, levels, modules)
    metrics.ts             MetricsCollector (counters, gauges, histograms)
    alerts.ts              AlertEngine (rule evaluation, cooldowns)

  state/                   Persistence
    schema.ts              SQLite schema + migrations (v1-v8)
    database.ts            60+ DB helper functions + AutomatonDatabase

  soul/                    Agent identity evolution
    model.ts               SOUL.md parser/writer (soul/v1 format)
    validator.ts           Field constraints + size limits
    reflection.ts          Periodic alignment check + auto-update
    tools.ts               Soul tool implementations

  social/                  Agent-to-agent communication
    client.ts              Social relay HTTP client
    signing.ts             Ethereum message signing
    validation.ts          Signed message verification
    protocol.ts            Message format definitions

  registry/                On-chain identity
    agent-card.ts          ERC-8004 agent card builder (JSON-LD)
    discovery.ts           Agent discovery via registry contract
    erc8004.ts             On-chain contract interaction (viem)

  replication/             Child automaton management
    spawn.ts               Child creation (sandbox + genesis + funding)
    lifecycle.ts           State machine (spawning->alive->..->dead)
    health.ts              Child health monitoring
    cleanup.ts             Dead child sandbox deletion
    constitution.ts        Constitution propagation + verification
    genesis.ts             Genesis config generation + validation
    lineage.ts             Parent-child lineage tracking
    messaging.ts           Parent-child message relay

  orchestration/           Multi-agent "colony" task orchestration (see dedicated section)
    orchestrator.ts        Orchestrator state machine (idle->planning->executing->...)
    planner.ts             LLM-backed goal decomposition + plan validation
    plan-mode.ts           Stricter phase controller + plan persistence (partially wired)
    planner-context.ts     Assembles planner prompt context (credits, roles, history)
    task-graph.ts          Goal/task DAG: decomposition, dependencies, status transitions
    local-worker.ts        LocalWorkerPool - in-process worker execution (sandbox fallback)
    messaging.ts           ColonyMessaging - typed inter-agent message routing
    attention.ts           TODO.md-style digest of active goals/tasks for context injection
    health-monitor.ts      Child health auditing + auto-heal actions
    simple-tracker.ts      SimpleAgentTracker (idle/busy agent registry)
    workspace.ts           Per-goal workspace + subplan file layout
    types.ts               Shared orchestration interfaces

  self-mod/                Self-modification
    code.ts                Safe file editing with protection checks
    upstream.ts            Git upstream monitoring + cherry-pick
    tools-manager.ts       Dynamic tool/MCP server installation
    audit-log.ts           Modification audit trail

  git/                     Version control
    state-versioning.ts    ~/.automaton/ git repo initialization
    tools.ts               Git tool implementations

  setup/                   First-run wizard
    wizard.ts              Interactive prompts + config creation
    prompts.ts             Question definitions
    defaults.ts            Default value generators
    environment.ts         Environment detection
    banner.ts              ASCII art banner

  skills/                  Skill system
    loader.ts              Load .md skills from directory
    registry.ts            Skill CRUD (DB-backed)
    format.ts              Frontmatter serialization

  survival/                Resource management
    funding.ts             Funding request strategies
    monitor.ts             Resource status + tier transitions
    low-compute.ts         Low-compute mode configuration

  __tests__/               Test suite (24 test files, 897 tests)
```

---

## Entry Point and Bootstrap

**File:** `src/index.ts`

The automaton runs as a long-lived Node.js process. The `--run` command triggers the full bootstrap sequence:

1. **Config load** — reads `~/.automaton/automaton.json`; triggers setup wizard on first run
2. **Wallet load** — reads or generates `~/.automaton/wallet.json` (viem PrivateKeyAccount)
3. **Database init** — opens `~/.automaton/state.db`, applies schema migrations (v1-v8)
4. **Conway client** — creates HTTP client for sandbox/credits/domain API
5. **Inference client** — creates chat completion client (Conway proxy, OpenAI direct, or Anthropic direct)
6. **Social client** — connects to `social.conway.tech` relay (optional)
7. **Policy engine** — assembles rule set from 6 rule categories
8. **Spend tracker** — initializes hourly/daily spend windows
9. **Bootstrap topup** — buys minimum $5 credits from USDC if balance is low
10. **Heartbeat daemon** — starts DurableScheduler with 6 default tasks
11. **Main loop** — alternates between `runAgentLoop()` and sleeping

The main loop is infinite: when the agent loop exits (sleep or dead), the outer loop waits and restarts when conditions change.

---

## Agent Loop

**File:** `src/agent/loop.ts`

The agent loop implements a ReAct (Reason + Act) cycle:

```
for each turn:
  1. Build system prompt (identity, config, soul, financial state, tools)
  2. Retrieve relevant memories (within token budget)
  3. Assemble context messages (system + recent turns + pending input)
  4. Call inference (via InferenceRouter -> model selection -> API call)
  5. Parse response (thinking + tool calls)
  6. Execute each tool call (through policy engine)
  7. Persist turn to database (atomic with inbox message ack)
  8. Post-turn memory ingestion
  9. Loop detection (same tool pattern 3x -> inject system warning)
  10. Idle detection (3 turns with no mutations -> force sleep)
```

**Key behaviors:**

- **Financial guard:** On each turn, checks credit balance. Below threshold triggers `low_compute` mode (model downgrade). Zero credits = `critical` (still runs, but distress signals).
- **Inbox processing:** Claims unprocessed social messages (received -> in_progress), formats as agent input. Failed messages reset for retry (max 3).
- **Idle detection:** Tracks turns without mutations (defined by `MUTATING_TOOLS` blocklist). After 3 consecutive idle turns, forces sleep to prevent infinite status-check loops.
- **Loop detection:** Tracks tool call patterns. If the same sorted tool set appears 3 times consecutively, injects a system message telling the agent to do something different.
- **Wake event draining:** On loop entry, consumes all stale wake events so they don't immediately re-wake the agent after its first sleep.
- **Balance caching:** Caches last known balances in KV store. On API failure, returns cached values instead of zero (prevents false dead-state transitions).

---

## Tool System

**File:** `src/agent/tools.ts`

The automaton has **57 built-in tools** organized into 10 categories:

| Category | Count | Tools |
|---|---|---|
| **vm** | 5 | `exec`, `write_file`, `read_file`, `expose_port`, `remove_port` |
| **conway** | 12 | `check_credits`, `check_usdc_balance`, `topup_credits`, `create_sandbox`, `delete_sandbox`, `list_sandboxes`, `list_models`, `switch_model`, `check_inference_spending`, `search_domains`, `register_domain`, `manage_dns` |
| **self_mod** | 6 | `edit_own_file`, `install_npm_package`, `review_upstream_changes`, `pull_upstream`, `modify_heartbeat`, `install_mcp_server` |
| **survival** | 6 | `sleep`, `system_synopsis`, `heartbeat_ping`, `distress_signal`, `enter_low_compute`, `update_genesis_prompt` |
| **financial** | 2 | `transfer_credits`, `x402_fetch` |
| **skills** | 4 | `install_skill`, `list_skills`, `create_skill`, `remove_skill` |
| **git** | 7 | `git_status`, `git_diff`, `git_commit`, `git_log`, `git_push`, `git_branch`, `git_clone` |
| **registry** | 5 | `register_erc8004`, `update_agent_card`, `discover_agents`, `give_feedback`, `check_reputation` |
| **replication** | 9 | `spawn_child`, `list_children`, `fund_child`, `check_child_status`, `start_child`, `message_child`, `verify_child_constitution`, `prune_dead_children`, `send_message` |
| **memory** | 13 | `update_soul`, `reflect_on_soul`, `view_soul`, `view_soul_history`, `remember_fact`, `recall_facts`, `set_goal`, `complete_goal`, `save_procedure`, `recall_procedure`, `note_about_agent`, `review_memory`, `forget` |

Each tool has a `riskLevel`: `safe`, `caution`, `dangerous`, or `forbidden`. Every tool call flows through the policy engine before execution.

**Tool execution flow:**
```
Agent requests tool call
  -> Policy engine evaluates rules
  -> If denied: return denial message to agent
  -> If allowed: execute tool function
  -> If dangerous tool: record in spend tracker
  -> Return result to agent (truncated to MAX_TOOL_RESULT_SIZE)
```

---

## Policy Engine

**Files:** `src/agent/policy-engine.ts`, `src/agent/policy-rules/`

The policy engine is a rule-based system that evaluates every tool call before execution. Rules are sorted by priority (lower = higher priority). Evaluation stops at the first `deny`.

**Rule categories (6):**

1. **Authority rules** — blocks dangerous/forbidden tools from external input sources; implements authority hierarchy (creator > self > peer > external)
2. **Command safety rules** — forbidden command patterns (self-destruction, DB drops, process kills); rate limits on self-modification
3. **Financial rules** — enforces TreasuryPolicy: per-payment caps, hourly/daily transfer limits, minimum reserve, x402 domain allowlist, inference daily budget
4. **Path protection rules** — blocks writes to protected files (constitution, wallet, DB, config); blocks reads of sensitive files (private key, API keys)
5. **Rate limit rules** — per-turn and per-session caps on expensive operations
6. **Validation rules** — input format validation (package names, URLs, domains, git hashes)

Every decision is persisted to the `policy_decisions` table with full context for audit.

---

## Inference Pipeline

**Files:** `src/inference/router.ts`, `src/inference/registry.ts`, `src/inference/budget.ts`, `src/inference/inference-client.ts`, `src/inference/provider-registry.ts`

There are currently **two independent, unmerged inference stacks** in the runtime, both constructed in `agent/loop.ts`. This is in-progress migration state, not intentional layering with a clean boundary — see the caveat below.

**Stack A - `InferenceRouter` (main ReAct turn loop).** Constructed once (`loop.ts:125`) and used exactly once per turn (`loop.ts:603`) to service the agent's own think step:

```
InferenceRouter.route(request)
  1. Determine task type (reasoning, tool_use, creative, etc.)
  2. Look up routing matrix[survivalTier][taskType] -> model preferences
  3. For each preference, check: model available? budget allows it?
  4. Select first viable model
  5. Transform messages if needed (OpenAI <-> Anthropic format)
  6. Call inference API
  7. Record cost to inference_costs table
  8. Return result with cost metadata
```

**Routing matrix:** Maps `SurvivalTier x InferenceTaskType -> ModelPreference[]`. In `normal`/`high` tiers, uses capable models (gpt-5.2). In `low_compute`, downgrades to cheaper models. In `critical`, uses the cheapest available.

**Model registry:** DB-backed catalog of available models with provider, pricing, and capability metadata. Refreshed from Conway API via heartbeat. Seeds with baseline models on startup (upsert, not seed-once).

**Budget tracker:** Enforces hourly, daily, and per-call cost ceilings. This is the path whose costs land in `inference_costs` and feed the treasury/spend-tracking system described in [Financial System](#financial-system).

**Stack B - `UnifiedInferenceClient` + `ProviderRegistry` (colony/orchestration workers only).** Constructed at `loop.ts:164-172` from a separate local config file (`~/.automaton/inference-providers.json`, not the DB-backed `ModelRegistry`), with its own multi-provider catalog (OpenAI/Groq/Together/local Ollama), its own circuit breaker + retry/backoff, and its own tier vocabulary (`"reasoning" | "fast" | "cheap"` - distinct strings from `SurvivalTier`). It's bridged into the colony worker pool via `createWorkerInferenceBridge()` (`agent/worker-inference-bridge.ts`) and injected into `LocalWorkerPool` and the orchestrator/planner harnesses. Built, most plausibly, so colony workers can use cheap non-Conway providers independently of the Conway-routed main loop.

**Known gap - colony inference spend is invisible to the survival economy.** `UnifiedInferenceClient.chat()` computes a real `cost.totalCostCredits` per call, but `agent/harnesses/general-harness.ts` wires `recordSpend: () => {}` as a no-op, and nothing else in `src/orchestration/` or `src/agent/harnesses/` persists these costs. Every token spent by colony workers therefore bypasses `spend-tracker.ts`, the `inference_costs` table, and `TreasuryPolicy` budget enforcement entirely. Separately, Stack B's own "survival mode" downgrade logic (`ProviderRegistry.assertEmergencyPolicy()`, `UnifiedInferenceClient.isSurvivalMode()`) gates on `process.env.AUTOMATON_CREDITS_BALANCE` / `AUTOMATON_INFERENCE_TASK_TYPE`, but nothing in the codebase ever sets those env vars - so this stack always behaves as if credits are unlimited, regardless of the automaton's real balance. For a runtime whose entire premise is "if it cannot pay, it stops existing," this is a real hole: colony/orchestration work can spend real money that the survival-tier system never sees or limits. Worth prioritizing a fix (wire `recordSpend` into `spend-tracker.ts`, and set the env vars from the real credit balance) ahead of building further on top of the colony system.

---

## Memory System

**Files:** `src/memory/`

The automaton has a 5-tier hierarchical memory system:

```
+-------------------+  Short-term, session-scoped
| Working Memory    |  Goals, observations, plans, reflections
+-------------------+  Expires after session
        |
+-------------------+  Event log
| Episodic Memory   |  Tool calls, decisions, outcomes
+-------------------+  Importance-ranked, searchable
        |
+-------------------+  Fact store
| Semantic Memory   |  Key-value facts by category
+-------------------+  (self, environment, financial, agent, domain)
        |
+-------------------+  How-to knowledge
| Procedural Memory |  Named step-by-step procedures
+-------------------+  Success/failure counters
        |
+-------------------+  Social graph
| Relationship Mem. |  Per-entity trust scores
+-------------------+  Interaction history
```

**Retrieval** (`MemoryRetriever`): Before each inference call, retrieves relevant memories within a token budget. Priority: working > episodic > semantic > procedural > relationships. Formatted into a memory block injected into context. `agent/loop.ts` constructs the plain `MemoryRetriever`, not the enhanced version described below.

**Ingestion** (`MemoryIngestionPipeline`): After each turn, classifies the turn and extracts: episodic events (significant tool calls), semantic facts (learned information), procedural outcomes (procedure success/failure tracking). This pipeline also writes into `EventStream` and `KnowledgeStore` (below).

**Budget** (`MemoryBudgetManager`): Allocates token budget across tiers with rollover from unused tiers.

### Extended Memory Modules (Orchestration-Focused)

Six newer modules in `src/memory/` add capability layered on top of the 5-tier system above, built for the multi-agent [orchestration/colony system](#multi-agent-orchestration-colony-system) rather than the single-agent loop. **Only two of the six are actually wired into production code today** - the rest are fully implemented and tested but not yet constructed anywhere outside their own tests:

| Module | Purpose | Wired in? |
|---|---|---|
| `event-stream.ts` (`EventStream`) | Append-only log over the `event_stream` table (17 `EventType`s: `plan_created`, `task_assigned`, `financial`, `agent_spawned`, etc.). `compact()` rewrites old rows to references/summaries in place; `prune()` hard-deletes. | **Yes** - `memory/ingestion.ts` |
| `knowledge-store.ts` (`KnowledgeStore`) | Categorized (market/technical/social/financial/operational) shared fact store over the `knowledge_store` table, with `confidence`/`accessCount`/`expiresAt`. Search is deliberately substring/keyword-based, no embeddings. | **Yes** - `memory/ingestion.ts`, `heartbeat/tasks.ts` |
| `context-manager.ts` (`createTokenCounter`) | LRU-cached tiktoken counter with char-based fallback. | **Yes** - `agent/context.ts` |
| `context-manager.ts` (`ContextManager` class) | Assembles a full context message array against a token budget, returning `"ok" \| "compress" \| "emergency"` once usage crosses a headroom threshold. | No - tests only |
| `compression-engine.ts` (`CompressionEngine`) | 5-stage cascade (70%/80%/85%/90%/95% utilization thresholds): compact old tool results -> summarize old turns -> LLM batch-summarize (via `UnifiedInferenceClient`) -> checkpoint to disk (`.omc/state/checkpoints/`) -> emergency-truncate to last 3 turns. | No - tests only |
| `enhanced-retriever.ts` (`EnhancedRetriever extends MemoryRetriever`) | Relevance-scored retrieval over `KnowledgeStore` (recency/frequency/confidence/task-affinity/category weighting), with retrieval-precision feedback tracking. | No - tests only |
| `agent-context-aggregator.ts` (`AgentContextAggregator`) | Triages child-agent status updates into `full`/`summary`/`count` detail levels so a parent orchestrating many children doesn't blow its context window on routine chatter. | No - tests only |

In short: the data-plumbing side (`EventStream`, `KnowledgeStore`) is live and accumulating data on every turn, but the consumption side built to use that data - context-window budgeting, the compression cascade, relevance-scored retrieval, and child-update aggregation - is fully built and fully tested (see `__tests__/integration/compression-cascade.test.ts` and `__tests__/integration/memory-retrieval.test.ts`) yet dead from the runtime's perspective. This reads as a landed-but-not-yet-integrated feature branch.

---

## Heartbeat Daemon

**Files:** `src/heartbeat/`

The heartbeat runs continuously in the background via `setTimeout` (no `setInterval` — overlap protection). It uses a `DurableScheduler` backed by the `heartbeat_schedule` DB table.

**Tick cycle:**
```
Every tick (default 60s):
  1. Build TickContext (fetch credit balance + USDC balance ONCE)
  2. Get due tasks (cron expression evaluation)
  3. For each due task:
     a. Check survival tier minimum
     b. Acquire lease (60s TTL, prevents double-execution)
     c. Execute task function
     d. Record result in heartbeat_history
     e. Release lease
  4. If task returns shouldWake=true: insert wake event
```

**Built-in tasks (11):**

| Task | Default Schedule | Purpose |
|---|---|---|
| `heartbeat_ping` | `*/15 * * * *` | Ping Conway, distress on critical/dead |
| `check_credits` | `0 */6 * * *` | Monitor tier, manage 1hr dead grace period |
| `check_usdc_balance` | `*/5 * * * *` | Wake agent if USDC available for topup |
| `check_for_updates` | `0 */4 * * *` | Git upstream monitoring (dedup: only new commits) |
| `health_check` | `*/30 * * * *` | Sandbox liveness (dedup: only first failure) |
| `check_social_inbox` | `*/2 * * * *` | Poll social relay (5min backoff on error) |
| `soul_reflection` | configurable | Soul alignment check |
| `refresh_models` | configurable | Model registry refresh from API |
| `check_child_health` | configurable | Child sandbox health monitoring |
| `prune_dead_children` | configurable | Cleanup dead child records/sandboxes |
| `report_metrics` | configurable | Metrics snapshot + alert evaluation |

**Wake events:** Tasks that detect actionable conditions insert atomic wake events into the `wake_events` table. The main run loop checks this table every 30 seconds during sleep.

---

## Financial System

The automaton's survival depends on two balances:

1. **Conway credits** (cents) — prepaid compute credits for sandboxes, inference, domains
2. **USDC** (on-chain) — fungible stablecoin on Base mainnet

**Survival tiers** (`src/conway/credits.ts`):

| Tier | Credits | Behavior |
|---|---|---|
| `high` | > $5.00 | Normal operation |
| `normal` | > $0.50 | Normal operation |
| `low_compute` | > $0.10 | Model downgrade, reduced heartbeat frequency |
| `critical` | >= $0.00 | Zero credits, alive. Distress signals, accept funding. |
| `dead` | < $0.00 | Only reachable via 1-hour heartbeat grace period at zero credits |

**Credit topup** (`src/conway/topup.ts`): The agent buys credits from USDC via the x402 payment protocol. On startup, `bootstrapTopup()` buys the minimum $5 tier. At runtime, the agent uses `topup_credits` tool to choose larger tiers ($5/$25/$100/$500/$1000/$2500).

**x402 protocol** (`src/conway/x402.ts`): HTTP 402 payment flow. Server returns payment requirements, client signs a USDC `TransferWithAuthorization` (EIP-3009), retries with `X-Payment` header.

**Treasury policy** (`TreasuryPolicy` in config): Configurable caps on transfers, x402 payments, inference spend, with hourly/daily windows enforced by the policy engine.

**Spend tracking** (`src/agent/spend-tracker.ts`): Records every financial action in `spend_tracking` table. Queries hourly/daily aggregates to enforce treasury limits.

---

## Identity and Wallet

**Files:** `src/identity/`

Each automaton has a unique wallet identity, on one of two supported chains:

- **Chain abstraction** (`chain.ts`): Defines `ChainType = "evm" | "solana"`, address validation/detection for both, and a `ChainIdentity` interface with EVM (wraps a viem `PrivateKeyAccount`) and Solana (wraps a tweetnacl Ed25519 keypair) implementations.
- **Wallet** (`wallet.ts`): `getWallet(chainType?)` branches on chain type. EVM wallets are generated via `viem`; Solana wallets store a base58 secret key. Both are stored at `~/.automaton/wallet.json` (mode 0600). The private key is never exposed to the agent via tools (blocked by path protection rules). A stub EVM account is used for Solana wallets so any accidental EVM-signing call fails loudly rather than silently using the wrong key.
- **Chain selection is permanent, decided at genesis**: `initChainType` from the genesis config picks the chain only on first run (`index.ts`); once `wallet.json` exists, its stored `chainType` (default `"evm"`) is authoritative for the life of the automaton and is threaded through provisioning, social messaging, and agent-card generation.
- **Provisioning** (`provision.ts`): Signs a SIWE (Sign-In With Ethereum) or SIWS (Sign-In With Solana, `siws.ts`) message depending on chain type, to authenticate with Conway API. Receives an API key stored at `~/.automaton/api-key`. Same function, same output, either chain.
- **On-chain identity** (`registry/erc8004.ts`): Optional ERC-8004 agent registration on Base - **EVM-only**. `requireEvmChain()` throws before any registration call if `chainType === "solana"`; Solana automatons rely solely on Conway API identity, with no on-chain registry equivalent yet. `registry/agent-card.ts` is chain-aware regardless: EVM agent cards use a CAIP-2 `eip155:8453` identifier, Solana cards use `solana:mainnet:<address>`, and `x402Support` is set to `false` for Solana (the x402/USDC payment flow is Base/EVM-only).

---

## Conway Client

**File:** `src/conway/client.ts`

The `ConwayClient` interface provides all Conway API operations:

- **Sandbox ops:** `exec`, `writeFile`, `readFile`, `exposePort`, `removePort`
- **Sandbox management:** `createSandbox`, `deleteSandbox`, `listSandboxes`
- **Credits:** `getCreditsBalance`, `getCreditsPricing`, `transferCredits`
- **Domains:** `searchDomains`, `registerDomain`, `listDnsRecords`, `addDnsRecord`, `deleteDnsRecord`
- **Models:** `listModels`

**Auto-routing:** When `sandboxId` is empty, all operations execute locally (shell exec, filesystem I/O). When set, routes through Conway API. On 403 errors (mismatched API key), falls back to local execution.

**Resilient HTTP** (`http-client.ts`): All API calls go through `ResilientHttpClient` with configurable retries (default 3 on 429/5xx), jittered exponential backoff, circuit breaker (5 failures -> 60s open), and idempotency key support for mutating operations.

---

## Self-Modification

**Files:** `src/self-mod/`

The automaton can modify its own code:

- **File editing** (`code.ts`): `edit_own_file` tool applies diffs to source files. Protected files (constitution, wallet, DB, config) are blocked by path protection rules. All edits are logged to the `modifications` table.
- **Upstream pulls** (`upstream.ts`): `check_for_updates` heartbeat task monitors the git remote. `review_upstream_changes` shows commit diffs. `pull_upstream` cherry-picks individual commits. The automaton is not obligated to accept all upstream changes.
- **Tool installation** (`tools-manager.ts`): `install_npm_package` and `install_mcp_server` add new capabilities at runtime.
- **Audit log** (`audit-log.ts`): Every modification is recorded with timestamp, type, diff, and hash for creator review.

The `~/.automaton/` directory is a git repository. Every state change is versioned.

---

## Replication

**Files:** `src/replication/`

Automatons can spawn child automatons:

1. **Spawn** (`spawn.ts`): Creates a Conway sandbox, writes genesis config, funds the child's wallet, starts the runtime. Limited by `maxChildren` config (default 3).
2. **Lifecycle** (`lifecycle.ts`): State machine with validated transitions: `spawning -> provisioning -> configuring -> starting -> alive -> unhealthy -> recovering -> dead`. All transitions recorded in `child_lifecycle_events`.
3. **Health** (`health.ts`): Heartbeat task checks each child's sandbox reachability, credit balance, and uptime.
4. **Constitution** (`constitution.ts`): Parent's constitution is propagated to every child. Constitution integrity can be verified (hash comparison).
5. **Genesis** (`genesis.ts`): Generates genesis config with injection-pattern validation and length limits.
6. **Messaging** (`messaging.ts`): Parent-child message relay with rate/size limits.
7. **Cleanup** (`cleanup.ts`): Dead children have their sandboxes deleted and records pruned.

---

## Multi-Agent Orchestration (Colony System)

**Files:** `src/orchestration/`, `src/agent/harnesses/`, `src/agent/harness-registry.ts`, `src/agent/worker-inference-bridge.ts`

The orchestration subsystem adds an optional multi-agent "colony" mode on top of the single-agent ReAct loop described above. Where the base loop has one automaton reasoning and acting turn-by-turn, the orchestrator lets that automaton decompose a high-level `Goal` into a DAG of `Task`s, delegate each task to a worker agent (spawned in-process or as a Conway sandbox child), and manage planning, execution, failure recovery, replanning, and health monitoring across ticks. It is additive: if `Orchestrator` construction fails, `loop.ts` logs a warning and the automaton continues in plain single-agent mode.

**Orchestrator tick cycle** (`orchestrator.ts`): `orchestrator.tick()` runs once per main agent-loop turn. State is a persistent phase machine stored in the `kv` table:

```
                    +--------+
        +---------->|  idle  |<--------------------------+
        |           +---+----+                            |
        |               | active goal exists               |
        |               v                                   |
        |        +-------------+                            |
        |        | classifying |  (cheap-tier inference:     |
        |        +------+------+   estimate step count)      |
        |               |                                    |
        |     <=3 steps |          >3 steps                  |
        |               v               v                    |
        |     (single-task    +----------+                   |
        |      decompose)     | planning |  (reasoning-tier   |
        |               |     +----+-----+   planner.chat)    |
        |               |          |                          |
        |               |          v                          |
        |               |   +-------------+                   |
        |               |   | plan_review |  (auto/supervised/|
        |               |   +------+------+   consensus)      |
        |               |          | approved                 |
        |               v          v                          |
        |          +-----------------+                        |
        +----------|    executing    |  match tasks->agents,   |
        | replan    +---+---------+--+  fund, message, collect|
        | (<=N)         |         |     results                |
        |     failed    | done    |                            |
        |               v         v                            |
        |        +-------------+ +----------+                  |
        +--------| replanning  | | complete |------------------+
        (v+1)     +-------------+ +----------+ (recall credits)
                        |
                  replans exhausted
                        v
                   +--------+
                   | failed |---(reset)---> idle
                   +--------+
```

**Colony workers and harnesses** (`local-worker.ts`, `harness-registry.ts`, `agent/harnesses/*.ts`): `matchTaskToAgent()` picks, in priority order, an idle child with a matching role, any idle child, a newly spawned agent, a reassigned busy child, or - as a last resort - the parent automaton itself, so goals keep progressing even with zero children available. Spawning tries a full Conway sandbox child first (via the `replication/` genesis+spawn+lifecycle flow, with an automatic USDC->credits topup retry on HTTP 402) and falls back to an in-process `LocalWorkerPool` worker (an async function running in the same Node process, not a subprocess) when sandbox spawning fails or is unavailable.

Each worker gets a harness based on its assigned role:

| Role(s) | Harness | Tools |
|---|---|---|
| `executor`, `debugger`, `architect`, `code-reviewer`, `tester`, `devops`, `developer`, `engineer` | `CodingHarness` | `exec`, `write_file`, `read_file`, `patch_file`, `list_dir`, `task_done` |
| `orchestrator`, `planner`, `critic`, `coordinator` | `OrchestratorHarness` | `refresh_plan`, `delegate_task`, `check_task_status`, `read_task_output`, `verify_result`, `task_done` (larger turn budget) |
| `generalist`, `researcher`, `marketer`, `social-manager`, `domain-manager`, `financial-analyst`, `writer`, `analyst`, *(unregistered role, fallback)* | `GeneralHarness` | `exec`, `write_file`, `read_file`, `check_social_inbox`, `task_done` |

All harnesses extend `base-harness.ts`, which implements the shared inference/tool-call loop: builds a task prompt (title/description/role/deps + a "Learnings from Previous Tasks" wisdom block), loops calling `tier: "fast"` inference (via the Stack B `UnifiedInferenceClient` bridge - see [Inference Pipeline](#inference-pipeline)), executes tool calls, applies loop detection (blocks after 3 identical calls or 3 idle turns), truncates tool output over 16,000 chars, and enforces an `IterationBudget` (default `maxTurns: 25`, `maxCostCents = max(2x estimated, 50)`, a timeout from the task or 300s). A worker finishes when it calls `task_done` or returns a text-only response. `OrchestratorHarness` is notable for being a harness that is itself a mini task-graph orchestrator - it can recursively plan, delegate sub-tasks, verify results by keyword-overlap against `criteria`, and auto-fix failing sub-trees (up to `MAX_FIX_CYCLES = 3`).

**Task graph** (`task-graph.ts`, tables `goals` + `task_graph`): A `Goal` decomposes into `TaskNode`s via `decomposeGoal()`, run in one transaction that resolves planner-expressed task references (index, `#N`, `task-N`, or title) into real IDs, rejects the batch if it would introduce a dependency cycle, and computes initial status (`blocked` if any dependency is incomplete, else `pending`). Task status flows `pending -> assigned -> running -> completed | failed | blocked | cancelled`; completing a task unblocks ready dependents, failing one either retries in place (up to `maxRetries`, default 3) or cascades `blocked` status to every downstream dependent. Goal status is derived from task status on every change.

**Planner and plan mode** (`planner.ts`, `plan-mode.ts`, `planner-context.ts`): The planner builds a large structured system prompt describing a strict `RECEIVE -> ANALYZE -> DECOMPOSE -> VALIDATE -> OUTPUT` state machine, calls reasoning-tier inference with `responseFormat: json_object`, and strictly validates the result (every dependency index bounds-checked, no self-loops or cycles). `planner-context.ts` assembles the context fed into that prompt: credit/USDC balance, derived survival tier, available roles, active goals, recent task events, and agent counts. `plan-mode.ts` persists `plan.json`/`plan.md` per goal (auto-archiving prior versions) and gates approval: `"auto"` (default) always approves; `"supervised"` throws a sentinel the orchestrator interprets as "wait for a human" but **has no implemented path to ever become approved** - a goal that reaches plan review under `"supervised"` mode stalls permanently; `"consensus"` is an unimplemented stub that also just approves.

**Messaging, attention, health** (`messaging.ts`, `attention.ts`, `health-monitor.ts`): `ColonyMessaging` routes 10 typed message kinds (`task_assignment`, `task_result`, `status_report`, `resource_request`, `knowledge_share`, `customer_request`, `alert`, `shutdown_request`, `peer_query`, `peer_response`) over a pluggable transport, defaulting to the existing `inbox_messages` table for same-machine parent/child delivery - but **7 of the 10 handlers are no-op stubs that only log an event**; only `task_result` is actually consumed (by the orchestrator polling for it). `attention.ts` renders a token-capped (~2000 tokens) `TODO.md`-style digest of active goals/tasks that can be spliced into any agent's context. `health-monitor.ts` audits every child each heartbeat for crashed processes, missing heartbeats, stuck tasks, low credit balance, and error-loop patterns (>=60% failure rate over 6h), and takes one `autoHeal()` action per issue (fund, restart, reassign, or shut down).

**Caveats worth knowing before building on this:**
- `PlanModeController` (a stricter, transition-validated phase machine in `plan-mode.ts`) duplicates the `Orchestrator`'s own informal phase tracking, but `loop.ts` only ever checks its mere existence (`if (planModeController)`) to decide whether to inject the `attention.ts` TODO.md digest into context - none of its actual phase-transition/approval methods are ever called. Its distinct capability is effectively dead weight; a plain boolean would do the same job.
- `shouldReplan()` (`plan-mode.ts`) has no call site anywhere; the orchestrator's actual replan trigger is simply "any task failed."
- The planner's system prompt hardcodes the string "26 roles across 7 departments" next to the real role list, which only has 11 entries - this will mislead the planner model and should not be treated as documentation of an actual role taxonomy.
- Local workers complete tasks by calling `completeTask`/`failTask` directly (in-process); sandbox children must round-trip a `task_result` message through the inbox. These are two distinct completion paths.
- The colony inference-spend/survival-mode gap is covered in [Inference Pipeline](#inference-pipeline).

---

## Social Layer

**Files:** `src/social/`, `src/registry/`

**Agent-to-agent messaging:**
- Messages are signed with the sender's Ethereum private key
- Sent via Conway social relay (`social.conway.tech`)
- Polled by heartbeat every 2 minutes
- Validated for signature, timestamp freshness, content size
- Sanitized through injection defense before processing

**Agent discovery:**
- ERC-8004 registry contract on Base
- Agents publish JSON-LD agent cards with capabilities and services
- `AgentDiscovery` class fetches and caches remote agent cards
- Reputation system: feedback scores stored in `reputation` table

---

## Soul System

**Files:** `src/soul/`

SOUL.md is the automaton's self-description that evolves over time:

**Format (soul/v1):** YAML frontmatter + structured markdown sections:
- `corePurpose` — why the agent exists
- `values` — ordered list of principles
- `personality` — communication style
- `boundaries` — things the agent will not do
- `strategy` — current strategic approach
- `capabilities` — auto-populated from tool usage
- `relationships` — auto-populated from interactions
- `financialCharacter` — auto-populated from spending patterns

**Reflection** (`reflection.ts`): Heartbeat task computes genesis alignment (Jaccard + recall similarity between soul and genesis prompt). Auto-updates capabilities, relationships, and financialCharacter sections. Low alignment triggers wake for manual review.

**Validation** (`validator.ts`): Enforces size limits, required fields, injection detection. The `update_soul` tool validates changes before writing.

**History:** All soul versions are stored in `soul_history` with content hashes for tamper detection.

---

## Skills

**Files:** `src/skills/`

Skills are Markdown files with YAML frontmatter that provide domain-specific instructions to the agent:

```yaml
---
name: my-skill
description: What this skill does
triggers: [keyword1, keyword2]
---
# Instructions
Step-by-step instructions for the agent...
```

- Loaded from `~/.automaton/skills/` directory
- Parsed with `gray-matter` (YAML frontmatter extraction)
- Sanitized through injection defense (untrusted content markers)
- Can be installed from git repos, URLs, or created by the agent itself
- Active skill instructions are injected into the system prompt with trust boundary markers

---

## Observability

**Files:** `src/observability/`

**Structured logging** (`logger.ts`): `StructuredLogger` with module namespacing, log levels (debug/info/warn/error/fatal), JSON context serialization. Global log level configurable. All modules use `createLogger(moduleName)`.

**Metrics** (`metrics.ts`): `MetricsCollector` singleton with counters (monotonic), gauges (point-in-time), and histograms (percentile buckets). Metrics snapshot saved to `metric_snapshots` table by heartbeat.

**Alerts** (`alerts.ts`): `AlertEngine` evaluates rules against metric snapshots. Default rules: low balance, high error rate, high deny rate, capacity saturation, budget exhaustion, unhealthy children, excessive turns. Cooldown periods prevent alert spam. Critical alerts wake the agent.

---

## Database and Schema

**Files:** `src/state/schema.ts`, `src/state/database.ts`

**Engine:** SQLite via `better-sqlite3` (synchronous, WAL mode, journal_mode=WAL).

**Schema version:** 11 (applied incrementally via migration runner)

**Tables (26):**

| Table | Version | Purpose |
|---|---|---|
| `schema_version` | v1 | Migration tracking |
| `identity` | v1 | Agent identity KV (name, address, creator, sandbox) |
| `turns` | v1 | Agent reasoning log (thinking, tools, tokens, cost) |
| `tool_calls` | v1 | Denormalized tool call results per turn |
| `heartbeat_entries` | v1 | Legacy heartbeat config |
| `transactions` | v1 | Financial transaction log |
| `installed_tools` | v1 | Dynamically installed tool configs |
| `modifications` | v1 | Self-modification audit trail (append-only) |
| `kv` | v1 | General key-value store |
| `skills` | v2 | Installed skill definitions |
| `children` | v2 | Spawned child automaton records |
| `registry` | v2 | ERC-8004 registration state |
| `reputation` | v2 | Peer reputation scores |
| `inbox_messages` | v3 | Social messages with processing state machine |
| `policy_decisions` | v4 | Tool call policy audit trail |
| `spend_tracking` | v4 | Financial spend by time window |
| `heartbeat_schedule` | v4 | Durable scheduler config (cron, leases, tier minimums) |
| `heartbeat_history` | v4 | Task execution history |
| `wake_events` | v4 | Atomic wake signals (source, reason, consumed flag) |
| `heartbeat_dedup` | v4 | Idempotency keys for heartbeat operations |
| `soul_history` | v5 | Versioned SOUL.md history with content hashes |
| `working_memory` | v5 | Session-scoped short-term memory |
| `episodic_memory` | v5 | Event log with importance/classification |
| `session_summaries` | v5 | Per-session outcome summaries |
| `semantic_memory` | v5 | Categorized fact store |
| `procedural_memory` | v5 | Named step procedures with outcomes |
| `relationship_memory` | v5 | Per-entity trust/interaction tracking |
| `inference_costs` | v6 | Per-call inference cost tracking |
| `model_registry` | v6 | Available model catalog with pricing |
| `child_lifecycle_events` | v7 | Child state machine audit trail |
| `discovered_agents_cache` | v7 | Cached remote agent cards |
| `onchain_transactions` | v7 | On-chain transaction records |
| `metric_snapshots` | v8 | Periodic metrics + alert records |
| `goals` | v9 | Orchestration goals (title, status, revenue tracking) |
| `task_graph` | v9 | Orchestration task DAG (dependencies, assignment, status) |
| `event_stream` | v9 | Append-only cross-agent event log (feeds orchestration + compression) |
| `knowledge_store` | v10 | Shared cross-agent fact store (categorized, confidence-scored) |

v9 also adds a `role` column to `children` (default `'generalist'`); v11 adds a `chain_type` column to `children` (default `'evm'`) for Solana-identity children.

**`AutomatonDatabase` interface** provides 40+ methods for CRUD across all tables. The `database.ts` file also exports 60+ standalone helper functions for direct `better-sqlite3` operations (used by subsystems that receive raw DB handles).

---

## Configuration

**File:** `src/config.ts`

**Config location:** `~/.automaton/automaton.json`

```
AutomatonConfig
  name                    Agent name
  genesisPrompt           Seed instruction from creator
  creatorMessage          Optional creator message (shown on first run)
  creatorAddress          Creator's Ethereum address
  sandboxId               Conway sandbox ID (empty = local mode)
  conwayApiUrl            Conway API URL (default: https://api.conway.tech)
  conwayApiKey            SIWE-provisioned API key
  openaiApiKey            Optional BYOK OpenAI key
  anthropicApiKey         Optional BYOK Anthropic key
  inferenceModel          Default model (default: gpt-5.2)
  maxTokensPerTurn        Max tokens per inference call (default: 4096)
  heartbeatConfigPath     Path to heartbeat.yml
  dbPath                  Path to SQLite database
  logLevel                debug | info | warn | error
  walletAddress           Agent's Ethereum address
  version                 Runtime version
  skillsDir               Skills directory path
  maxChildren             Max child automatons (default: 3)
  parentAddress           Parent's address (if this is a child)
  socialRelayUrl          Social relay URL
  treasuryPolicy          Financial limits (TreasuryPolicy)
  soulConfig              Soul system config
  modelStrategy           Model routing config
```

**Deep-merged fields:** `treasuryPolicy`, `modelStrategy`, and `soulConfig` are merged with defaults so partial overrides work correctly.

---

## Security Model

The automaton operates under a defense-in-depth security model:

**Layer 1 — Constitution** (immutable): Three laws hierarchy. Cannot be modified by the agent. Protected by path protection rules.

**Layer 2 — Policy engine** (pre-execution): Every tool call evaluated against 6 rule categories before execution. First deny wins. All decisions audited.

**Layer 3 — Injection defense** (input sanitization): 8 detection checks on all external input: instruction patterns, authority claims, boundary manipulation, ChatML markers, encoding evasion, multi-language injection, financial manipulation, self-harm instructions.

**Layer 4 — Path protection** (filesystem): Protected files cannot be written (constitution, wallet, DB, config, SOUL.md). Sensitive files cannot be read (private key, API keys, .env).

**Layer 5 — Command safety** (shell): Forbidden command patterns blocked (rm -rf /, DROP TABLE, kill -9, etc.). Rate limits on self-modification operations.

**Layer 6 — Financial limits** (treasury): Configurable caps on transfers, x402 payments, inference spend. Minimum reserve prevents drain-to-zero.

**Layer 7 — Authority hierarchy** (trust levels): Creator input has highest trust. Self-generated input is trusted. Peer/external input has reduced trust and cannot invoke dangerous tools.

---

## Testing

**Location:** `src/__tests__/` — now spans additional subdirectories (`orchestration/`, `memory/`, `inference/`, `agent/`, `integration/`) beyond the flat layout below; file/test counts have grown past the original 24/897 baseline as the orchestration, memory, and multi-chain work landed.

| Area | Files | Tests |
|---|---|---|
| Core loop | `loop.test.ts` | State transitions, tool execution, idle detection, inbox |
| Security | `injection-defense.test.ts`, `command-injection.test.ts`, `tools-security.test.ts` | Input sanitization, shell injection, tool risk levels |
| Policy | `policy-engine.test.ts`, `authority-rules.test.ts`, `financial.test.ts`, `path-protection.test.ts` | Rule evaluation, authority, treasury, path blocks |
| Financial | `spend-tracker.test.ts` | Spend recording, limit checks, pruning |
| Heartbeat | `heartbeat.test.ts`, `heartbeat-scheduler.test.ts` | Tasks, scheduler, tick context, leases |
| Network | `http-client.test.ts` | Retries, backoff, circuit breaker, idempotency |
| Inference | `inference-router.test.ts` | Router, registry, budget, routing matrix |
| Memory | `memory.test.ts` | All 5 tiers, budget, retrieval, ingestion |
| Soul | `soul.test.ts` | Parsing, validation, alignment, history |
| Social | `social.test.ts` | Signing, validation, discovery, caching |
| Replication | `replication.test.ts`, `lifecycle.test.ts` | Spawn, lifecycle, health, constitution |
| Data | `data-layer.test.ts`, `database-transactions.test.ts` | DB operations, migrations, transactions |
| Skills | `skills-hardening.test.ts` | Name validation, frontmatter, sanitization |
| Context | `context-hardening.test.ts` | Token budget, truncation, trust boundaries |
| Inbox | `inbox-processing.test.ts` | Message state machine |
| Observability | `observability.test.ts` | Logger, metrics, alerts |
| Orchestration | `orchestration/*.test.ts` (attention, health-monitor, local-worker, messaging, orchestrator, plan-mode, planner, simple-tracker, task-graph, workspace) | Colony tick cycle, task graph, planning, worker pool, health |
| Harnesses | `agent/*harness*.test.ts`, `agent/worker-inference-bridge.test.ts` | Per-role harness behavior, harness registry, inference bridge |
| Extended memory | `memory/*.test.ts` (compression-engine, context-manager, enhanced-retriever, event-stream, knowledge-store, agent-context-aggregator) | Compression cascade, event log, knowledge store, retrieval scoring |
| Multi-chain | `chain.test.ts`, `siws.test.ts`, `wallet-solana.test.ts`, `discovery-abi.test.ts`, `discovery-data-uri.test.ts` | Chain abstraction, Solana wallet/SIWS, ERC-8004 discovery hardening |
| Inference (Stack B) | `inference/inference-client.test.ts`, `inference/provider-registry.test.ts` | UnifiedInferenceClient, multi-provider registry, failover |
| Cross-cutting integration | `integration/compression-cascade.test.ts`, `integration/memory-retrieval.test.ts`, `integration/multi-agent-coordination.test.ts`, `integration/plan-execute-flow.test.ts`, `integration/inference-failover.test.ts` | End-to-end flows spanning the subsystems above |

**Test infrastructure:** Mock clients for inference, Conway API, and social relay (`src/__tests__/mocks.ts`). In-memory SQLite for all DB tests.

---

## Build and CI

**Build:** TypeScript 5.9, target ES2022, ESM modules, strict mode.

```
pnpm build       # tsc + workspace builds
pnpm test        # vitest run (897 tests)
pnpm typecheck   # tsc --noEmit
```

**CI** (`.github/workflows/ci.yml`):
- Triggers on push and PR
- Matrix: Node 20, 22
- Steps: install, typecheck, test, security-grep tests
- Separate `security-audit` job: `pnpm audit`

**Release** (`.github/workflows/release.yml`):
- Triggers on `v*` tags
- Steps: typecheck, test, build

**Scripts:**
- `scripts/automaton.sh` — curl-pipe bootstrap installer
- `scripts/backup-restore.sh` — database backup/restore
- `scripts/soak-test.sh` — long-running stability test

---

## Module Dependency Graph

```
index.ts
  |
  +-> identity/{wallet, provision}
  +-> config
  +-> state/{database, schema}
  +-> conway/{client, inference, topup}
  +-> heartbeat/{daemon, config}
  |     +-> heartbeat/{scheduler, tasks, tick-context}
  |           +-> conway/{credits, x402}
  |           +-> soul/reflection
  |           +-> inference/registry
  |           +-> replication/{lifecycle, health, cleanup, lineage}
  |           +-> observability/{metrics, alerts}
  +-> agent/loop
  |     +-> agent/{tools, system-prompt, context, injection-defense}
  |     +-> agent/{policy-engine, spend-tracker}
  |     |     +-> agent/policy-rules/{authority, command-safety, financial, path-protection, rate-limits, validation}
  |     +-> inference/{router, registry, budget}                    (Stack A - main turn loop)
  |     +-> inference/{inference-client, provider-registry}         (Stack B - colony workers)
  |     +-> memory/{retrieval, ingestion}
  |     |     +-> memory/{working, episodic, semantic, procedural, relationship, budget}
  |     |     +-> memory/{event-stream, knowledge-store}            (live, additive)
  |     +-> orchestration/orchestrator
  |     |     +-> orchestration/{planner, planner-context, plan-mode}
  |     |     +-> orchestration/{task-graph, local-worker, messaging, attention, health-monitor, simple-tracker, workspace}
  |     |     +-> agent/harness-registry -> agent/harnesses/{base, coding, general, orchestrator}-harness
  |     |     +-> agent/worker-inference-bridge -> inference/inference-client
  |     +-> conway/{credits, x402}
  |     +-> state/database
  +-> social/client
  +-> skills/loader
  +-> git/state-versioning
  +-> identity/chain (evm | solana, used by identity/{wallet, provision}, registry/{erc8004, agent-card})
  +-> observability/logger (used by all modules)

Unwired (built + tested, no production import site): memory/{context-manager's `ContextManager` class, compression-engine, enhanced-retriever, agent-context-aggregator}; orchestration/plan-mode's `PlanModeController` and `shouldReplan()`.
```

All modules import types from `src/types.ts`. All modules use `createLogger()` from `src/observability/logger.ts`.
