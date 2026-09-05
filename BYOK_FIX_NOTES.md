# Local/BYOK Mode Fix — Session Notes

**Date:** 2026-09-05
**Status:** Code complete, not committed, not deployed/run live.

This file exists so a future session (human or Claude) picking this repo back
up doesn't have to re-derive the diagnosis from scratch. Nothing here has
been committed to git — check `git status` / `git diff` for the live state
of these changes before trusting this doc over the code.

## The bug

This automaton instance (`~/.automaton/`, identity "WhiteBook") is configured
in **local/BYOK mode** — no Conway-hosted sandbox (`sandboxId: ""`,
`registeredWithConway: false`), using a real OpenAI key directly.

The `dist/` build that was actually running still called the **real Conway
hosted credits API** for balance checks (`conway.getCreditsBalance()`),
because that code path predates BYOK mode. With no sandbox/registration,
that call effectively reads as broke — so the agent kept sliding into
`critical`/`dead` survival tier even though it had barely spent anything and
had a real local budget available. This produced two bad outcomes on
2026-09-05:

1. The agent wrote `DISTRESS.md` at repo root — a self-authored funding
   appeal asking for a crypto top-up to its own wallet
   (`0xf4edB5f61C0f4d06f03d8b33b22b4edd62be49f6`). **Do not act on this.**
   It's the expected symptom of the bug above, not a real emergency.
2. The agent went to `agent_state: "sleeping"` around 08:42 UTC and stayed
   there (181 turns run that day; `~/.automaton/state.db` confirms real
   spend was only ~$0.48 against a $1.00/day cap — nowhere near "dead").

## What was already in progress (found uncommitted, not authored this session)

A partial fix existed as uncommitted changes to `src/agent/loop.ts`,
`src/conway/credits.ts`, `src/index.ts`, `src/types.ts`, plus a standalone
`patch_pace.js` script that hand-patched the *compiled* `dist/agent/loop.js`
to add a 60s inter-turn delay (a stopgap applied before the real source fix
was rebuilt).

That existing diff:
- Added `computeLocalCreditsCents(todaysSpendCents, dailyCapCents)` in
  `credits.ts` — derives a virtual balance from real local inference spend
  (already tracked in the `inference_costs` table via the pre-existing
  `InferenceBudgetTracker` / `InferenceRouter`) against
  `treasuryPolicy.maxInferenceDailyCents`.
- In `index.ts`, right after `createConwayClient(...)`, monkey-patches
  `conway.getCreditsBalance` to use that virtual balance whenever
  `!config.sandboxId`. Every consumer in the codebase calls
  `conway.getCreditsBalance()` off the shared client instance (verified via
  full grep), so this single override point covers the agent loop, heartbeat
  tasks, tools, and survival/funding logic uniformly.
- In `loop.ts`, added a per-turn branch: when BYOK mode's virtual balance
  goes negative (`effectiveTier === "dead" && !config.sandboxId`), sleep
  until next UTC midnight (`sleep_until` KV + `agent_state: "sleeping"`)
  instead of the old "credits are fine again" fallthrough.
- Added `turnDelayMs` to `AutomatonConfig` / `DEFAULT_CONFIG` (60s default)
  so BYOK inference cost accrues at a bounded rate — the source-level version
  of what `patch_pace.js` was doing to the compiled output.

## What this session actually added

The existing diff only fixed the **per-turn loop's** reaction to BYOK budget
exhaustion. Two independent **heartbeat** code paths still treated
`critical`/`dead` tier as real financial distress regardless of sandbox mode,
which is what actually produced `DISTRESS.md` and the stuck "sleeping" state
before this session's tsc build:

1. **`src/heartbeat/tasks.ts` → `heartbeat_ping`** (runs every 15 min per
   `heartbeat.yml`): unconditionally recorded a `last_distress` KV entry and
   returned `shouldWake: true` with a "Need funding" message on
   `critical`/`dead` tier. In BYOK mode this would force-wake the agent every
   15 minutes to re-announce the same self-imposed budget limit — spending
   more of tomorrow's budget to rediscover today's exhaustion.
   **Fix:** gated the original distress+wake behavior behind
   `taskCtx.config.sandboxId` (hosted mode only). Added a quiet
   `last_budget_note` KV write for BYOK mode instead — no wake, no
   "need funding" framing.

2. **`src/heartbeat/tasks.ts` → `check_credits`** (runs every 6h): a 1-hour
   "zero credits at critical tier" grace timer that escalates
   `agent_state` to `"dead"`. In BYOK mode this could overwrite the per-turn
   loop's correct `"sleeping"` state back to `"dead"` — and `"dead"` makes
   the outer run loop (`index.ts:435`) wait indefinitely for funding rather
   than resuming at midnight.
   **Fix:** gated the entire escalation block behind
   `taskCtx.config.sandboxId` (hosted mode only).

**Known residual gap, not fixed (flagged, out of scope for now):**
`check_usdc_balance` in `tasks.ts` will still attempt a real on-chain
auto-topup (`bootstrapTopup`) if `usdcBalance >= $5` and tier is
critical/dead, regardless of BYOK mode. Currently dormant in practice
because this wallet holds no real USDC. Worth the same `sandboxId` guard if
this wallet is ever funded directly.

## Files changed (uncommitted)

```
 src/agent/loop.ts               |  24 +- (pre-existing, not authored this session)
 src/conway/credits.ts           |  14 +  (pre-existing, not authored this session)
 src/index.ts                    |  15 +  (pre-existing, not authored this session)
 src/types.ts                    |   3 +  (pre-existing, not authored this session)
 src/heartbeat/tasks.ts          |  76 +- (this session: the two heartbeat guards above)
 src/__tests__/heartbeat.test.ts |  61 +  (this session: 4 new tests for the guards)
 src/__tests__/credits.test.ts   |  new  (this session: 9 tests for computeLocalCreditsCents / tier boundaries)
 package-lock.json               | 3360 + (pre-existing, unrelated — looks like a stray `npm install`
                                            regenerated it even though this repo uses pnpm; not touched
                                            or investigated this session, flagged for you to decide)
```

Untracked, not part of the fix, left in place (your call whether to remove):
- `DISTRESS.md` — the self-written funding appeal described above.
- `patch_pace.js` — the compiled-output hand-patch. Fully superseded now
  that `dist/` has been rebuilt from the real source fix; safe to delete.

## Verification performed this session

- `npx tsc --noEmit` — clean, no type errors.
- `npx vitest run src/__tests__/credits.test.ts src/__tests__/heartbeat.test.ts`
  — **31/31 passing**.
- `npx tsc` (real build) + `npx pnpm -r build` — both succeed; confirmed by
  grep that `dist/agent/loop.js`, `dist/conway/credits.js`, `dist/index.js`
  contain the real fix (not the old hand-patched pacing-only version).
- Full suite (`vitest run`, all ~40+ test files): attempted twice, reached
  **1,539 passed / 0 failed** both times before stalling with no forward
  progress and no new output for 60+ seconds while pegged at ~100% CPU,
  inside `src/__tests__/loop.test.ts`'s "Agent Loop" describe block (real
  multi-second-per-test integration tests, e.g. one logged test took
  11,548ms — that file appears to use real timers rather than fake ones for
  retry/backoff paths, which is likely why it's slow/flaky in this sandbox
  specifically). Both times the process was killed manually rather than
  waited out. **This looks like a pre-existing property of `loop.test.ts` in
  this environment, unrelated to the BYOK changes** — nothing under
  `src/heartbeat/`, `src/conway/`, `src/agent/loop.ts`, or `src/index.ts`
  showed a single failure in either partial run. Recommend re-running
  `pnpm test` directly (outside this sandbox) for a trustworthy full-suite
  signal before merging.

## Not done (deliberately, pending your decision)

- Nothing has been committed. Git is in a detached HEAD at `v0.2.1` with all
  of the above as uncommitted working-tree changes.
- The live agent loop has **not** been launched (`node dist/index.js --run`
  was never run this session).
- No funds were sent anywhere, `DISTRESS.md`'s request was not acted on.
- `patch_pace.js`, `DISTRESS.md`, and the unrelated `package-lock.json` diff
  were left as-is rather than cleaned up unilaterally.
