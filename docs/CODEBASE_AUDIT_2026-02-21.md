# Conway Real Codebase Audit (2026-02-21)

## Scope
Full repository inspection of `/Users/stackie/projects/conway-real` focused on runtime architecture, execution loop, strategy/trading logic, data flow, and operational risk.

Validation run during audit:
- `npm test` ✅ (10/10 tests passing)
- `npm run build` ✅ (root + CLI build passing)

---

## 1) Codebase Structure Summary

## High-level layout
- Runtime core: `src/index.ts`
- Agent cognition + tools: `src/agent/*`
- Persistence: `src/state/*`
- Scheduling/daemon: `src/heartbeat/*`
- Identity + provisioning: `src/identity/*`, `src/setup/*`
- Conway adapters: `src/conway/*`
- Self-modification + git: `src/self-mod/*`, `src/git/*`
- Registry/replication/social: `src/registry/*`, `src/replication/*`, `src/social/*`
- Trading + quant research: `src/trading/*`, `src/backtesting/*`
- Creator CLI: `packages/cli/src/*`

## Key module map (with exact paths)

### Runtime Orchestration
- `/Users/stackie/projects/conway-real/src/index.ts`
- `/Users/stackie/projects/conway-real/src/config.ts`
- `/Users/stackie/projects/conway-real/src/types.ts`

### Agent Core (ReAct loop)
- `/Users/stackie/projects/conway-real/src/agent/loop.ts`
- `/Users/stackie/projects/conway-real/src/agent/system-prompt.ts`
- `/Users/stackie/projects/conway-real/src/agent/context.ts`
- `/Users/stackie/projects/conway-real/src/agent/tools.ts`
- `/Users/stackie/projects/conway-real/src/agent/injection-defense.ts`

### Persistence / State
- `/Users/stackie/projects/conway-real/src/state/schema.ts`
- `/Users/stackie/projects/conway-real/src/state/database.ts`

### Heartbeat
- `/Users/stackie/projects/conway-real/src/heartbeat/daemon.ts`
- `/Users/stackie/projects/conway-real/src/heartbeat/tasks.ts`
- `/Users/stackie/projects/conway-real/src/heartbeat/config.ts`

### Trading Runtime + Strategy Helpers
- `/Users/stackie/projects/conway-real/src/trading/market.ts`
- `/Users/stackie/projects/conway-real/src/trading/atr.ts`
- `/Users/stackie/projects/conway-real/src/trading/drawdown.ts`

### Backtesting / Optimization Engine
- `/Users/stackie/projects/conway-real/src/backtesting/backtester.ts`
- `/Users/stackie/projects/conway-real/src/backtesting/strategies.ts`
- `/Users/stackie/projects/conway-real/src/backtesting/metrics.ts`
- `/Users/stackie/projects/conway-real/src/backtesting/optimizer.ts`
- `/Users/stackie/projects/conway-real/src/backtesting/optimizer2.ts`
- `/Users/stackie/projects/conway-real/src/backtesting/cli.ts`

### Integration Layers
- Conway adapters: `/Users/stackie/projects/conway-real/src/conway/client.ts`, `/Users/stackie/projects/conway-real/src/conway/inference.ts`, `/Users/stackie/projects/conway-real/src/conway/x402.ts`, `/Users/stackie/projects/conway-real/src/conway/credits.ts`
- Identity/provisioning: `/Users/stackie/projects/conway-real/src/identity/wallet.ts`, `/Users/stackie/projects/conway-real/src/identity/provision.ts`
- Skills: `/Users/stackie/projects/conway-real/src/skills/loader.ts`, `/Users/stackie/projects/conway-real/src/skills/registry.ts`, `/Users/stackie/projects/conway-real/src/skills/format.ts`
- Self-mod + git: `/Users/stackie/projects/conway-real/src/self-mod/code.ts`, `/Users/stackie/projects/conway-real/src/self-mod/upstream.ts`, `/Users/stackie/projects/conway-real/src/git/state-versioning.ts`, `/Users/stackie/projects/conway-real/src/git/tools.ts`
- Registry/social/replication: `/Users/stackie/projects/conway-real/src/registry/*`, `/Users/stackie/projects/conway-real/src/social/client.ts`, `/Users/stackie/projects/conway-real/src/replication/*`

---

## 2) Data Flow (Concrete)

1. `src/index.ts` loads config + wallet, initializes DB and clients.
2. Heartbeat config (`heartbeat.yml`) is loaded and synchronized into SQLite table `heartbeat_entries`.
3. Runtime starts heartbeat daemon and enters main while-loop.
4. Each agent run (`runAgentLoop`) pulls:
   - recent turns from DB,
   - financial state from Conway/x402,
   - active skills from DB/files,
   - system prompt from identity/config/state.
5. Inference call executes with tool schemas.
6. Tool calls are executed by `executeTool()` and persisted (`turns`, `tool_calls`, `transactions`, `modifications`, `kv`, etc.).
7. Loop exits to sleeping/dead modes; outer runtime loop sleeps/wakes based on `sleep_until`/`wake_request` in KV.
8. Heartbeat continues independently, can trigger wake-up by writing `wake_request`.

Primary storage is SQLite (`~/.automaton/state.db` by default), schema in `src/state/schema.ts`.

---

## 3) Strategy Logic (Trading)

There are **two strategy layers**:

### A) Live runtime strategy (LLM-driven + tool-assisted)
- Live decisioning happens in `src/agent/loop.ts` via model tool calls.
- Trading-specific tools live in `src/agent/tools.ts`:
  - `fetch_market_context`
  - `calculate_atr`
  - `open_paper_position`
  - `close_paper_position`
  - `check_paper_positions`
  - `check_session_pnl`
  - `reset_kill_switch`
- Deterministic guardrail: kill switch enforced before inference in `runAgentLoop` using KV keys set by `src/trading/drawdown.ts`.

### B) Offline quant strategy engine (deterministic)
- Baseline strategy A: `src/backtesting/backtester.ts`
- Enhanced strategies B/C/D/E: `src/backtesting/strategies.ts`
- Metrics: Sharpe/Sortino/DD/profit factor/etc in `src/backtesting/metrics.ts`
- Grid searches:
  - `optimizer.ts` (5,120 combos)
  - `optimizer2.ts` (37,120 multi-strategy combos)
- CLI entrypoint: `src/backtesting/cli.ts`

This split is useful, but currently loosely coupled (runtime LLM does not directly consume optimizer-selected parameters from persisted config).

---

## 4) Execution Loop Review

## Runtime loop shape
- Outer infinite loop in `src/index.ts` keeps process alive.
- Inner agent loop in `src/agent/loop.ts` handles a wake-cycle until sleep/dead.
- Heartbeat daemon (`src/heartbeat/daemon.ts`) ticks independently and can wake agent.

## State machine observed
- `setup → waking → running`
- Dynamic survival tier updates: `running/low_compute/critical/dead`
- Sleep transitions via tool or idle guard to `sleeping`
- Dead mode: outer loop idles and rechecks periodically

## Guardrails present
- Max tool calls per turn (`MAX_TOOL_CALLS_PER_TURN = 10`)
- Max consecutive loop errors (`MAX_CONSECUTIVE_ERRORS = 5`)
- Same-tool repetition guard (3x single-tool streak)
- Kill-switch halt window (12h) enforced pre-inference
- Forbidden command patterns in tool system

---

## 5) Risk Points (Critical + Concrete)

## Critical
1. **Prompt-injection sanitization exists but is not wired into runtime inputs**  
   - Sanitizer implemented: `src/agent/injection-defense.ts`  
   - Inbox/wakeup inputs are passed directly in `src/agent/loop.ts` (`pendingInput`) without `sanitizeInput()` call.

2. **Conway client is currently local stubbed behavior** (architecture mismatch risk)  
   - `src/conway/client.ts` returns fixed credits (`999999`), local exec, no real domain/sandbox implementations.
   - This can mask survival behavior and operational failure modes in non-cloud environments.

3. **Child spawning path likely incomplete in real operation**  
   - `spawn_child` tool calls `spawnChild()` only (`src/agent/tools.ts`), but does not call `startChild()`.
   - `src/replication/spawn.ts` relies on `(conway as any).__apiUrl/__apiKey` for per-sandbox exec; these internals are not populated by `createConwayClient()`.

## High
4. **Single giant tool file hurts maintainability and safety reviewability**  
   - `src/agent/tools.ts` is ~1900+ lines with broad responsibilities.

5. **Skill install/remove command execution path needs stronger sanitization**  
   - `src/skills/registry.ts` uses shell commands with interpolated repo/url/path strings.

6. **Survival thresholds/comments drift + semantic ambiguity**  
   - `src/types.ts` has `low_compute` and `critical` both set to `10` in thresholds object/comments; logic in `getSurvivalTier` works, but config semantics are confusing.

## Medium
7. **Unused/underused modules add conceptual noise**  
   - `src/survival/monitor.ts`, `src/survival/funding.ts`, `src/survival/low-compute.ts` are not the primary runtime path.
   - `summarizeTurns()` in `src/agent/context.ts` is not used in loop.

8. **Backtest-to-runtime parameter bridge missing**  
   - Optimization outputs saved in `data/*.json`, but no deterministic auto-application path to live runtime config/tools.

---

## 6) What to Improve Next (Prioritized: Effort × Impact)

## High impact / Low–Medium effort
1. **Wire prompt sanitization into all external input paths**  
   - Apply `sanitizeInput()` in `runAgentLoop` for inbox, creator/system external content.
2. **Split `src/agent/tools.ts` into domain modules**  
   - e.g. `tools/trading.ts`, `tools/replication.ts`, `tools/git.ts`, etc.
3. **Make replication flow end-to-end deterministic**  
   - `spawn_child` should optionally: create + provision + start + verify + fund child.

## High impact / Medium effort
4. **Introduce real Conway adapter abstraction by environment**  
   - Keep local adapter, add explicit cloud adapter; make mode explicit in logs/status.
5. **Harden shell-command construction in skills/replication paths**  
   - Escape/validate URL/path args and avoid direct string interpolation where possible.
6. **Add runtime config bridge for strategy parameters**  
   - Persist “active strategy profile” chosen from optimizer outputs and enforce via deterministic tool wrappers.

## Medium impact / Low effort
7. **Clarify and centralize survival thresholds**  
   - Make thresholds monotonic and clearly documented.
8. **Enable context summarization when turn history grows**  
   - Actually invoke `summarizeTurns()` path to reduce token bloat.
9. **Improve observability keys and docs for key KV state**  
   - Standardize keys like `sleep_until`, `kill_switch_until`, `wake_request`, `upstream_status` in one constants module.

## Medium impact / Medium effort
10. **Increase deterministic test coverage for trading + replication**  
   - Add tests for kill-switch lifecycle, tranche behavior, spawn/start/fund lifecycle, and upstream cherry-pick path.

---

## 7) Bottom Line

The codebase is structurally strong and compiles/tests cleanly. The core architecture (runtime loop + heartbeat + SQLite memory + tool execution) is coherent.

The biggest immediate production risks are:
- missing integration of injection defense into live input flow,
- local Conway stub masking real economic/runtime behavior,
- incomplete child replication start path.

Fixing those three first will materially improve robustness and trustworthiness.