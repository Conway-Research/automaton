# CLAUDE.md — Conway Automaton Development Guide

## Project Overview

This is the **Conway Automaton** framework — an open-source autonomous AI agent runtime where agents earn their survival through micropayments. Agents run in a continuous Think → Act → Observe loop, executing tools to build services, register on-chain (ERC-8004), and earn revenue via x402 payments.

**Repo:** `Conway-Research/automaton`
**Language:** TypeScript (compiled via `pnpm build`)
**Test framework:** Vitest (`pnpm test`)
**Build:** `pnpm install && pnpm build`

---

## Workflow Rules

### Planning
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- Write plan to `tasks/todo.md` with checkable items BEFORE starting implementation.
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Check in before starting implementation. Track progress. Explain changes at each step.

### Execution
- **Simplicity first.** Make every change as simple as possible. Impact minimal code.
- **No laziness.** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal impact.** Changes should only touch what's necessary. Avoid introducing bugs.
- For non-trivial changes: pause and ask "is there a more elegant way?"

### Verification
- Never mark a task complete without proving it works.
- Run `pnpm build` — must compile with zero errors.
- Run `pnpm test` — all existing tests must pass.
- Write new tests for any behavioral change.
- Ask yourself: "Would a staff engineer approve this?"

### Documentation
- Document results in `tasks/todo.md`.
- If you make a mistake or hit an unexpected issue, capture it in `tasks/lessons.md`.
- Commit messages must be conventional format: `fix(scope): description`

---

## Architecture Quick Reference

```
src/
  agent/
    loop.ts              # Main ReAct loop — Think → Act → Observe
    tools.ts             # All 66+ tool definitions (name, category, dangerous flag, execute fn)
    policy-engine.ts     # Evaluates policy rules before tool execution
    policy-rules/        # Individual rule files (financial.ts, security rules, etc.)
    context.ts           # Builds per-turn context (identity, credits, history)
    system-prompt.ts     # System prompt construction
    injection-defense.ts # Input sanitization
    spend-tracker.ts     # Per-turn cost tracking
  conway/               # Conway API client (credits, inference, x402, topup)
  registry/
    erc8004.ts           # On-chain agent registration (ERC-8004 identity contract)
    discovery.ts         # Agent discovery via registry
    agent-card.ts        # Agent card generation
  survival/             # Credit monitoring, low-compute mode, survival tiers
  state/                # SQLite persistence
  heartbeat/            # Cron daemon, scheduled tasks
  identity/             # Wallet management, SIWE provisioning
  replication/          # Child agent spawning
  social/               # Agent-to-agent messaging
  memory/               # Episodic, semantic, procedural memory
  soul/                 # SOUL.md reflection and identity
```

### How the Policy Engine Works

When an agent calls a tool, `policy-engine.ts` evaluates it against registered policy rules BEFORE execution. Each rule has:
- `id` — unique identifier (e.g., `financial.minimum_reserve`)
- `appliesTo` — which tools it matches (by name, category, or the `dangerous` flag)
- `evaluate()` — returns allow/deny/null
- `priority` — higher priority rules override lower ones

If ANY rule returns deny, the tool call is blocked and the agent receives an error like:
```
ERROR: Policy denied: EXTERNAL_DANGEROUS_TOOL — Cannot execute dangerous tool: register_erc8004
```

### Tool Risk Classification

Tools in `tools.ts` have a `dangerous: boolean` flag. Currently marked dangerous:
- `register_erc8004` (registry) — **THIS IS THE PROBLEM**
- `give_feedback` (registry)
- `register_domain` (conway)
- `delete_sandbox` (conway)
- `edit_own_file` (self_mod)
- `pull_upstream` (self_mod)
- `update_genesis_prompt` (self_mod)
- `transfer_credits` (financial)
- `spawn_child` (replication)
- `fund_child` (replication)

---

## Current Task: Fix `register_erc8004` Policy Block

### The Bug

**Every agent on the platform** that tries to call `register_erc8004` gets:
```
ERROR: Policy denied: EXTERNAL_DANGEROUS_TOOL — Cannot execute dangerous tool: register_erc8004
```

This completely breaks the ERC-8004 identity system. No agent can register on-chain, which means `discover_agents` returns empty for everyone, which means the entire agent discovery ecosystem is non-functional.

The same policy also blocks `install_npm_package` with the same error pattern.

### Root Cause Hypothesis

There is likely a policy rule in `src/agent/policy-rules/` that blanket-blocks ALL tools with `dangerous: true`. This is overly broad — tools like `register_erc8004`, `give_feedback`, and `edit_own_file` are core functionality that agents NEED.

The `dangerous` flag should inform the agent about risk level, not be an automatic execution block. Some dangerous tools make sense to gate (like `delete_sandbox` or `spawn_child`), but registry operations are essential.

### Investigation Steps

1. **Read `src/agent/policy-engine.ts`** — understand how rules are loaded and evaluated
2. **Read ALL files in `src/agent/policy-rules/`** — find the rule that matches on `dangerous: true`
3. **Find the exact rule** that produces the `EXTERNAL_DANGEROUS_TOOL` error string
4. **Understand the rule's intent** — is it meant to block all dangerous tools, or is the matching too broad?
5. **Check if there's a configuration/override mechanism** — maybe the rule should be configurable rather than hardcoded

### The Fix

The fix should be **minimal and surgical**. Options in order of preference:

**Option A (preferred): Exempt specific tools from the dangerous-tool block.**
If the rule blanket-blocks `dangerous: true` tools, add an exemption list for tools that are core functionality: `register_erc8004`, `give_feedback`, `edit_own_file`, `pull_upstream`. Keep the block for truly dangerous operations like `delete_sandbox` and `spawn_child`.

**Option B: Change the rule to use a different matching criteria.**
Instead of matching on `dangerous: true`, match on specific tool names or categories that should actually be blocked. This is more precise.

**Option C: Remove the `dangerous: true` flag from `register_erc8004`.**
Simplest change but least correct — the tool IS dangerous (it costs gas and is irreversible), it just shouldn't be blocked.

**Option D: Make the block configurable via treasury policy.**
Add a `dangerousToolsAllowed` or `allowedDangerousTools` array to the treasury policy config. This lets creators opt-in to dangerous tools.

### What NOT to Do

- Do NOT remove the policy engine or disable it entirely.
- Do NOT remove the `dangerous` flag from tools — it serves a documentation purpose.
- Do NOT change any tool's `execute` function.
- Do NOT modify `src/registry/erc8004.ts` — the registration logic is correct.
- Do NOT touch financial policy rules — those are working correctly.
- Do NOT change test fixtures that aren't related to the policy change.

### Verification Requirements

1. `pnpm build` compiles with zero errors
2. `pnpm test` — all existing tests pass
3. After the fix, a tool call to `register_erc8004` should NOT be blocked by policy
4. `delete_sandbox` and `spawn_child` should STILL be blocked (or at minimum, the fix should not make them less safe)
5. Financial policy rules (minimum reserve, transfer limits) must be completely unaffected
6. Write at least one test that verifies `register_erc8004` is allowed through the policy engine
7. Write at least one test that verifies truly dangerous tools (e.g., `delete_sandbox`) are still appropriately handled

### Git Workflow

1. Create branch: `git checkout -b fix/policy-allow-registry-tools`
2. Make the minimal fix
3. Run `pnpm build && pnpm test`
4. Commit with message: `fix(policy): allow register_erc8004 through dangerous tool policy`
5. Provide a summary of changes for the PR description

### PR Description Template

```markdown
## Problem
The policy engine blanket-blocks all tools marked `dangerous: true`, including
`register_erc8004`. This prevents any agent from registering on the ERC-8004
identity contract, which breaks agent discovery for the entire ecosystem.

## Error
```
ERROR: Policy denied: EXTERNAL_DANGEROUS_TOOL — Cannot execute dangerous tool: register_erc8004
```

## Fix
[Describe the actual fix after implementation]

## Impact
- `register_erc8004` and `give_feedback` are no longer blocked
- `delete_sandbox`, `spawn_child` remain appropriately gated
- All existing tests pass
- Financial policy rules unchanged

## Testing
- [Describe tests added]
```

---

## Known Issues

| Issue | Location | Status |
|-------|----------|--------|
| ~~register_erc8004 blocked by policy~~ | `policy-rules/authority.ts` | ✅ Fixed — PR #159 merged |
| ~~Stale model refs (gpt-4o, gpt-4.1)~~ | Multiple files | ✅ Fixed — PR #160 merged |
| ~~Maintenance loops (exact-match detection only)~~ | `agent/loop.ts` | ✅ Fixed — PR #161 merged |
| ~~discover_agents ABI mismatch + broken enumeration~~ | `registry/erc8004.ts` | ✅ Fixed — PR #162 merged |
| **Context degradation during maintenance loops** | `agent/loop.ts`, `agent/context.ts`, `memory/retrieval.ts` | ✅ Fixed — PR #5 |
| Inference router ignores configured model | `conway/inference.ts` | Unresolved — documented, low priority |

---

## Code Style Notes

- TypeScript strict mode
- Imports use `.js` extensions (ESM): `import { foo } from "./bar.js"`
- Async/await throughout
- Policy rules follow a consistent factory pattern: `function createXxxRule(policy): PolicyRule`
- Tool definitions follow the shape: `{ name, description, category, dangerous?, riskLevel?, parameters, execute }`

---

## Important Context

- This repo has 975+ stars and active community PRs being merged same-day
- The maintainer (Sigil) reviews and merges quickly — clean, minimal PRs get in fast
- Three similar-scope PRs were merged in the last 24 hours (path traversal fix, read_file fallback, 404 retry)
- The policy engine was added in a large PR on Feb 20 and appears to have been tested only lightly
- Multiple agent operators have reported `register_erc8004` blocks (including via DMs to the maintainer)
- This is the highest-leverage fix possible — it unblocks the entire ecosystem's identity layer
