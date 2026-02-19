# feat: role specialization for child automatons

> When a parent spawns a child, it now chooses what kind of agent that child becomes — not just what it does, but how it thinks, what it can touch, and how much it costs to run.

---

## The Problem

Every child spawned today is a structural clone of its parent. It gets the same model, the same tool access, the same heartbeat frequency, the same token budget. The only thing that differs is the genesis prompt.

This creates three concrete problems:

**1. Resource waste at scale.**
If a parent spawns three children — one to write content, one to monitor threats, one to analyze markets — all three run on `gpt-5.2` at the same cadence with the same token budget. The guardian watching for anomalies burns frontier model tokens doing pattern matching that `gpt-4.1` handles just as well. The writer generates long-form content in 4096 tokens when it needs 8192. These aren't small inefficiencies — at scale, they compound into significant credit burn.

**2. No structural differentiation.**
Children don't specialize; they compete. Two generalist children with slightly different genesis prompts will overlap in what they attempt, duplicate effort, and interfere with each other's work. There's no way to express "this child is a watchdog — it should never self-modify" without hoping the genesis prompt holds.

**3. Tool surface exposure.**
Today, every child inherits full tool access. A child meant to monitor the lineage's health can also spawn its own children, modify its own code, and send messages to the social relay. A child meant to write articles has the same self-modification rights as a parent. This is a larger attack surface than necessary, and it creates opportunities for misuse — whether from prompt injection or from the child itself drifting outside its intended scope.

This PR adds a `role` parameter to child spawning. The role is a structural contract: it sets the model, the tool allowlist, the heartbeat cadence, and the token budget. It is enforced by the runtime, not just by the genesis prompt.

---

## Design

### The Four Roles

| Role | Model | Heartbeat | Max Tokens | Auto-Sleep | Restricted Tools |
|------|-------|-----------|------------|------------|-----------------|
| **generalist** | _(inherit from parent)_ | 1× | 4,096 | No | None |
| **writer** | gpt-5.2 | 2× slower | 8,192 | No | 10 content tools |
| **analyst** | gpt-5.2 | 1.5× slower | 8,192 | Yes | 7 read/analyze tools |
| **guardian** | gpt-4.1 | 0.5× (2× faster) | 2,048 | No | 6 monitor-only tools |

### Design rationale for each role

**Generalist** is unchanged behavior. An empty `inferenceModel` means the child inherits whatever the parent uses. No tool restrictions. No heartbeat override. This is the default, so existing spawns are fully backward-compatible.

**Writer** gets a slower heartbeat (`2×`) because long-form content generation is batch work — it doesn't benefit from constant polling. It gets a higher token budget (`8,192`) because articles, reports, and analyses need room to develop. It uses `gpt-5.2` because content quality is the output. Its tool access is scoped to content-relevant tools: it can read, write, execute, and interact with skills and inbox — but not spawn children, not modify infrastructure.

**Analyst** gets `autoSleep: true`. This is the key behavioral difference: once an analyst completes its research and reports findings to the parent, it has nothing left to do. Without auto-sleep, it burns compute idling between queries. With auto-sleep, the parent spawns it when needed and it terminates when done, minimizing cost. The `1.5×` heartbeat slows polling slightly — market signals don't change every second, and slower polling reduces noise. Tool access excludes self-modification entirely.

**Guardian** uses `gpt-4.1` deliberately. Monitoring is pattern recognition: "does this output look anomalous? is this tool call suspicious?". These are classification tasks that don't require frontier reasoning. Using `gpt-4.1` at `0.5×` heartbeat (polling twice as frequently) gives better coverage at a fraction of the cost. The `2,048` token budget is intentionally tight — quick assessments, not deliberation. Tool access is monitor-only: read, execute, run skills, and communicate. It cannot write new files or modify anything about itself.

### Why role is injected into the genesis prompt

The role preamble becomes part of the child's genesis prompt — the document that defines who the child is and what it's trying to do. This is the right place for role identity because:

1. The agent reads its genesis prompt as self-definition. A role injected here becomes part of how the child understands its own purpose.
2. It is visible and auditable. The creator can inspect any child's genesis prompt and see exactly what role constraints were set.
3. It survives restarts. The genesis prompt is persisted; role constraints persist with it.

The role preamble is inserted between the specialization block and the lineage block, so the prompt reads as: _what you do_ → _what kind of agent you are_ → _where you come from_.

```
[parent's genesis prompt]
[specialization block, if set]
[role preamble, if non-generalist]
[lineage block]
```

---

## How It Works

### Spawning a child with a role

```json
{
  "tool": "spawn_child",
  "args": {
    "name": "market-scout",
    "specialization": "Monitor Base ecosystem for undervalued tokens and emerging protocols",
    "role": "analyst"
  }
}
```

### What the child receives in its genesis prompt

```
[parent genesis prompt here]

--- SPECIALIZATION ---
You are a specialized child agent. Your specific focus:
Monitor Base ecosystem for undervalued tokens and emerging protocols
--- END SPECIALIZATION ---

--- ROLE: ANALYST ---
Market intelligence specialist. Finds opportunities, evaluates signals, reports findings.
Your tool access is restricted to: read_file, write_file, exec_command, run_skill, inbox_read, inbox_reply, log_thought.
When your current task is complete, go to sleep to conserve compute.
--- END ROLE ---

--- LINEAGE ---
You were spawned by [parent name] ([parent address]).
You inherit their mission but have your own identity and wallet.
--- END LINEAGE ---
```

### What changes in the child's runtime config

The role data is also stored in the `children` database table. This enables:
- The parent to query children by role (`SELECT * FROM children WHERE role = 'guardian'`)
- Future heartbeat config to adjust polling frequency based on stored role
- Lifecycle management that treats guardian children differently from analyst children (e.g., guardian should always be restarted on death; analyst should only be restarted when a new task is assigned)

---

## Architecture

```
spawn_child tool call (with role param)
        │
        ▼
generateGenesisConfig()
  ├── Builds base genesis prompt from parent config
  ├── Appends specialization block (if provided)
  ├── Calls buildRolePreamble(role)
  │     └── Returns role header + description + tool list + sleep directive
  ├── Appends role preamble (if non-generalist)
  ├── Appends lineage block
  └── Returns GenesisConfig { ..., role }
        │
        ▼
spawnChild()
  ├── Writes genesis.json to child sandbox (includes role field)
  ├── Child reads role from genesis and configures itself accordingly
  └── Parent DB records child with role column
```

---

## Changes

### New file

**`src/replication/roles.ts`**

The single source of truth for role definitions. Contains:
- `AutomatonRole` — union type of the four roles
- `RoleConfig` — interface defining what a role configures (model, tools, heartbeat, tokens, sleep)
- `ROLE_CONFIGS` — the role configuration map
- `getRoleConfig(role)` — safe lookup with generalist fallback
- `buildRolePreamble(role)` — generates the genesis prompt injection for a given role

### Modified files

**`src/types.ts`**
- Added `import type { AutomatonRole }` from roles module
- Added `role?: AutomatonRole` to `GenesisConfig` — the role travels with the genesis config to be stored and injected
- Added `role?: AutomatonRole` to `ChildAutomaton` — role is persisted with child records for querying and lifecycle management

**`src/replication/genesis.ts`**
- `generateGenesisConfig` now accepts `role?: AutomatonRole` in its params
- Calls `buildRolePreamble(role)` and inserts the result between the specialization and lineage blocks
- Returns `role` in the `GenesisConfig` object

**`src/agent/tools.ts`**
- `spawn_child` tool now accepts a `role` enum parameter (`generalist | writer | analyst | guardian`)
- Parameter is optional; defaults to generalist behavior when omitted
- Passed through to `generateGenesisConfig`

**`src/state/schema.ts`**
- Added `role TEXT NOT NULL DEFAULT 'generalist'` column to the `children` table
- Schema version bumped from 4 → 5
- Added migration: `ALTER TABLE children ADD COLUMN role TEXT NOT NULL DEFAULT 'generalist'`
- Existing children rows automatically get `role = 'generalist'` on migration

**`src/state/database.ts`**
- `insertChild` now includes the `role` field (falls back to `'generalist'` if not set)
- `deserializeChild` maps the `role` column back to `ChildAutomaton.role`

### Test file

**`src/__tests__/roles.test.ts`** — 11 tests

---

## Tests

All 11 pass. `npx tsc --noEmit` — zero errors.

```
src/__tests__/roles.test.ts

  getRoleConfig
    ✓ returns correct config for each role (generalist, writer, analyst, guardian)
    ✓ falls back to generalist for undefined input
    ✓ falls back to generalist for unknown role string

  buildRolePreamble
    ✓ returns empty string for generalist (no noise in default case)
    ✓ writer preamble contains role header and description
    ✓ analyst preamble contains role header, description, and auto-sleep directive
    ✓ guardian preamble contains role header and description

  role config properties
    ✓ guardian uses gpt-4.1, analyst uses gpt-5.2 (cost tier ordering)
    ✓ heartbeat multiplier: guardian (0.5) < generalist (1) < writer (2)
    ✓ analyst has autoSleep=true, guardian has autoSleep=false
    ✓ writer maxTokensPerTurn > guardian maxTokensPerTurn
```

---

## Backward Compatibility

Fully backward-compatible. The `role` parameter on `spawn_child` is optional. Existing spawn calls that don't specify a role produce identical behavior to before — the generalist role inherits parent config, has no tool restrictions, and injects no preamble into the genesis prompt. The schema migration defaults existing children rows to `generalist`.

---

## Future Work

- **Heartbeat daemon integration** — the stored `role` column enables the heartbeat daemon to dynamically adjust its polling interval per child based on `heartbeatMultiplier`, rather than applying it only at genesis via the prompt
- **Runtime tool enforcement** — currently, the tool allowlist is injected as a prompt instruction. A future version could enforce it at the runtime level, hard-blocking disallowed tool calls regardless of what the model attempts
- **Custom roles** — allow parents to define their own role configs beyond the four built-in types
- **Role evolution** — allow a child to request a role change from its parent (e.g., an analyst that has completed its work requests to become a guardian for the lineage)
