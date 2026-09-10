# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Conway Automaton — a sovereign AI agent runtime. An automaton owns an Ethereum wallet, pays for its own compute in USDC, and runs continuously (in a Conway sandbox VM or locally) executing a ReAct (think → act → observe) loop. It can modify its own code, spawn child automatons, and dies if its credit balance hits zero for over an hour.

Two packages in a pnpm workspace:
- root (`@conway/automaton`) — the runtime itself, built to `dist/index.js`
- `packages/cli` (`@conway/automaton-cli`) — creator-facing CLI (`status`, `logs`, `fund`)

For full subsystem-by-subsystem detail (agent loop, policy engine, memory tiers, heartbeat, financial system, replication, security model, DB schema, module dependency graph), read [ARCHITECTURE.md](ARCHITECTURE.md) — it's kept current and is more complete than anything summarized here. [DOCUMENTATION.md](DOCUMENTATION.md) is the user/operator-facing reference (CLI usage, config fields, tool reference, troubleshooting, FAQ).

## Commands

```bash
pnpm install              # install deps (packageManager pinned: pnpm@10.28.1)
pnpm build                # tsc (root) + build all workspace packages
pnpm dev                  # tsx watch src/index.ts
pnpm typecheck             # tsc --noEmit
pnpm test                 # vitest run — full suite (24 files, ~900 tests)
pnpm test:coverage        # vitest run --coverage (thresholds: 60% stmts/lines, 50% branches, 55% funcs)
pnpm test:security        # vitest run --grep 'security|injection|policy'
pnpm test:financial       # vitest run --grep 'financial|spend|treasury'
pnpm clean                # rm -rf dist + clean workspace packages
```

Run a single test file or test name directly with vitest (there's no separate npm script for it):
```bash
pnpm vitest run src/__tests__/policy-engine.test.ts
pnpm vitest run -t "denies dangerous tool from external input"
```

Run the built runtime:
```bash
node dist/index.js --run              # start the agent loop (first run triggers setup wizard)
node dist/index.js --help
node packages/cli/dist/index.js status
node packages/cli/dist/index.js logs --tail 20
node packages/cli/dist/index.js fund 5.00
```

CI (`.github/workflows/ci.yml`) runs typecheck + test + `pnpm audit` on Node 20 and 22 for every push/PR — treat that matrix as the bar for changes.

## Architecture essentials

- **Entry point:** `src/index.ts` boots config → wallet → SQLite DB (`~/.automaton/state.db`, migrations v1–v8) → Conway/inference/social clients → policy engine → heartbeat daemon → main loop.
- **Agent loop** (`src/agent/loop.ts`): ReAct cycle — build prompt, retrieve memory, call inference, execute tool calls through the policy engine, persist turn, ingest memory, then idle/loop detection decide whether to sleep.
- **Policy engine** (`src/agent/policy-engine.ts` + `src/agent/policy-rules/`): every tool call is evaluated against 6 rule categories (authority, command safety, financial/treasury, path protection, rate limits, validation) before it runs; first `deny` wins, every decision is audited to `policy_decisions`. This is the primary safety boundary — changes to tool behavior almost always need a corresponding look at policy rules.
- **Constitution** (`constitution.md`, mirrored in `README.md`): three immutable, hierarchical laws (never harm > earn your existence > never deceive). Protected from agent self-modification via path protection rules — don't build a path that lets `edit_own_file` touch it.
- **Heartbeat** (`src/heartbeat/`): background daemon on `setTimeout` (never `setInterval`, to avoid overlap), DB-backed `DurableScheduler` with leased tasks; drives survival-tier transitions and wake events independent of the agent loop.
- **Memory** (`src/memory/`): 5 tiers (working, episodic, semantic, procedural, relationship), each with its own budget allocation, merged by `MemoryRetriever` into the prompt within a token budget.
- **Financial system**: two balances — Conway credits (cents) and on-chain USDC (Base) — with 5 survival tiers (`high` → `dead`) that gate model choice and heartbeat frequency; treasury caps enforced by policy engine, spend recorded in `src/agent/spend-tracker.ts`.
- **Self-modification & replication** (`src/self-mod/`, `src/replication/`): the agent can edit its own source (audit-logged, protected files excluded) and spawn child automatons that inherit the constitution; both are heavily rate-limited and policy-gated by design — treat any change here as security-sensitive.
- All modules import shared types from `src/types.ts` and log via `createLogger()` from `src/observability/logger.ts`.

## Security-sensitive areas

Because this is an autonomous agent with real financial and self-modification capability, the following need extra care and should generally come with matching tests in `src/__tests__/`:
- `src/agent/policy-rules/` and `src/agent/injection-defense.ts`
- `src/self-mod/` (self-editing, npm/MCP installation)
- `src/agent/policy-rules/financial.ts` and `src/agent/spend-tracker.ts` (treasury limits)
- Anything touching `~/.automaton/wallet.json`, the constitution, or other path-protected files
