# PR #5: Fix Agent Context Degradation During Maintenance Loops

## Status: IMPLEMENTATION IN PROGRESS

---

## Investigation Findings

### 3a. IDLE Filter Fallback Path

- `IDLE_ONLY_TOOLS` set at `loop.ts:224-230` — 17 tools: check_credits, check_usdc_balance, system_synopsis, review_memory, list_children, check_child_status, list_sandboxes, list_models, list_skills, git_status, git_log, check_reputation, discover_agents, recall_facts, recall_procedure, heartbeat_ping, check_inference_spending
- `allTurns = db.getRecentTurns(20)` — fetches 20 most recent turns
- `meaningfulTurns` = turns with at least one non-idle tool call, or text-only turns
- When `meaningfulTurns.length === 0`: falls back to `allTurns.slice(-2)` — last 2 turns, both maintenance
- `getRecentTurns(limit: number)` at database.ts:148 accepts a VARIABLE limit parameter — no parameterization needed

### 3b. Memory Block Injection

- Memory retrieved at `loop.ts:252-263` using `MemoryRetriever.retrieve()`
- Formatted at `loop.ts:258` via `formatMemoryBlock(memories)`
- Injected at `loop.ts:273` via `messages.splice(1, 0, { role: "system", content: memoryBlock })`
- Memory types included: working, episodic (20 entries), semantic, procedural, relationships
- **No classification filtering exists** — all 20 episodic entries passed through regardless of classification

### 3c. Episodic Memory Retrieval

- `episodic.getRecent(sessionId, 20)` at retrieval.ts:51 — returns 20 most recent entries
- **No classification filter exists** — returns all entries chronologically
- Each entry has `classification: TurnClassification` field
- The `review_memory` tool calls `MemoryRetriever.retrieve()` which calls `episodic.getRecent(sessionId, 20)` — same unfiltered path

### 3d. Classification Taxonomy (Confirmed)

| Classification | Importance | Tools |
|---------------|-----------|-------|
| strategic | 0.9 | update_genesis_prompt, edit_own_file, modify_heartbeat, spawn_child, register_erc8004, update_agent_card, install_mcp_server, update_soul |
| productive | 0.7 | exec, write_file, read_file, git_commit, git_push, install_npm_package, create_sandbox, expose_port, register_domain, manage_dns, install_skill, create_skill, save_procedure, set_goal |
| communication | 0.6 | send_message, check_social_inbox, give_feedback, note_about_agent |
| maintenance | 0.3 | check_credits, check_usdc_balance, system_synopsis, heartbeat_ping, list_sandboxes, list_skills, list_children, list_models, check_reputation, git_status, git_log, git_diff, review_memory, recall_facts, recall_procedure, discover_agents, search_domains |
| idle | 0.1 | (no tool calls + short thinking) |
| error | 0.8 | (any tool with error result) |

Type: `TurnClassification` at types.ts:997 — string union type, not enum.

### 3e. Anti-Repetition Warning

- Location: context.ts:183-205
- Trigger: any tool called 3+ times in last 5 turns (via `analysisWindow = recentTurns.slice(-5)`)
- Current message text:
  ```
  [system] WARNING: You have been calling {tools} repeatedly in recent turns. You already have this information. Move on to BUILDING something. Write code, create files, set up a service. Do not check status again.
  ```
- Injected as: `{ role: "user", content: "[system] WARNING: ..." }`
- Test coverage: searched `src/__tests__/` — NO existing tests assert on this exact message text. Safe to change.

### 3f. Test Patterns

- Import: `vi` from "vitest", mocks from `./mocks.js`
- DB: `createTestDb()` — creates temp SQLite DB
- Inference: `MockInferenceClient([responses])` — pre-programmed responses
- Responses: `toolCallResponse([{name, arguments}])`, `noToolResponse(text)`
- For multi-turn tests with IDs: construct explicit responses with unique IDs (see loop.test.ts:370-391)
- Assertions: `expect(x).toBeDefined()`, `expect(x).toContain(str)`, `expect(x).toBeUndefined()`

### 3g. getRecentTurns Signature

```typescript
const getRecentTurns = (limit: number): AgentTurn[] => { ... }
```
At database.ts:148. Already accepts variable limit. Can call `db.getRecentTurns(100)` directly.

### 3h. Turn Classification in DB

- **No classification field on turns table.** Classification lives in `episodic_memory` table only.
- The deep fallback filter must use `IDLE_ONLY_TOOLS` set logic on `toolCalls` field — same approach as existing filter.

---

## Implementation Plan

- [x] Complete investigation (gates 3a-3h)
- [ ] Fix A: IDLE filter deep fallback in loop.ts (scan back 100 turns)
- [ ] Fix B1: Memory block injection filtering in loop.ts (filter episodic entries)
- [ ] Fix B2: review_memory filtering in retrieval.ts (filter episodic entries)
- [ ] Fix C: Enhanced anti-repetition warning in context.ts
- [ ] Write tests for all three fixes
- [ ] Build + test (pnpm build && pnpm test)
- [ ] Create branch, commit, push
- [ ] Audit report + lessons

---

## Previous Tasks

### PR #4: fix/discovery-abi-mismatch (Completed)
### PR #3: Maintenance Loop Detection (Completed)
### PR #2: Stale Model References (Completed)
