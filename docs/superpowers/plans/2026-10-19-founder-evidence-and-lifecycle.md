# Founder Evidence and Lifecycle Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation. Track progress below. User explicitly requested plan creation followed by implementation.

**Goal:** Add conservative capability evidence and exercise the complete isolated Founder order lifecycle without production changes.

**Architecture:** A pure evidence projection augments existing runtime state, with a dedicated authenticated read endpoint and additive UI text. Existing permission and budget decisions remain authoritative. Integration tests run real local orchestration with fake external adapters.

**Tech Stack:** Node ESM, node:test, existing SQLite stores, browser ES modules. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-19-founder-evidence-and-lifecycle-design.md` (approved).

## Global Constraints

- Numaron remains OFF; no production start, stop, restart, provider calls or production database writes.
- Preserve existing edits, permissions, budgets, reservations and demo trading limits.
- Temporary databases and fake adapters only. External fetch/TCP/DNS guards enabled.
- Evidence does not grant permission. Existing capability status semantics remain unchanged.
- No fabricated Git identity; commits remain deferred while identity is absent.

## Review Focus

1. Missing or maliciously shaped evidence must never imply availability or authorization (Task 2).
2. A successful waiting report is not completed customer work (Task 2).
3. Conflicting timestamps, revision changes and newer failures must invalidate current positive evidence (Task 2).
4. Reading the new endpoint must not invoke broad snapshots or provider readers (Task 3).
5. A restart after ambiguous submission must not repeat delivery or release unresolved costs (Task 4).

## Verification command prefix

`node --require ./scripts/verification-network-guard.cjs --import ./scripts/founder-offline-test-guard.mjs --import tsx --test`

Use the prefix followed by the task's test files; expect exit 0 and zero failed tests. Save full output in this plan's work directory.

## Task 1: Baseline payment fixture

Files: `scripts/founder-restoration-runtime.test.mjs`.
Interface: existing exact contract-bound payment validation remains unchanged.
- [x] Recheck the previously failing payment test with the guarded prefix (already corrected in the captured existing work; 11/11 passed).
- [x] Preserve the existing synthetic payment fixture correction; add integrated negative amount/currency/recipient/owner cases.
- [x] Run restoration-runtime and order-accountability tests; require zero failures.

## Task 2: Pure evidence projection

Files: create `scripts/founder-capability-evidence.mjs` and `.test.mjs`.
Interface: `projectCapabilityEvidence({capabilities, sources, proofs, now, powerEnabled, controllerRunning, budgetActive})` returns `{schemaVersion:1, observedAt, entries, diagnostics}`. Proofs are explicitly supplied trusted local records, never loaded from paths or model output. Each binds capabilityId/sourceId/operation/revision, dimension, outcome, environment, ref, observedAt and optional expiresAt.
- [x] Write tests first: no evidence => unknown; blocked adapter => unavailable; OFF => power-off; valid current proof => matching dimension only; offline proof never live; future/expired/revision-mismatch => no positive; newer failure wins; same-time conflict => unknown; excessive lists fail closed; unsafe reference fields never copied; input remains unchanged.
- [x] Run and observe missing implementation failure.
- [x] Implement bounded pure projection, expose only allowlisted fields and opaque safe references, derive source action bindings from the existing source capability mapping, treat legacy registry verification as historical scope evidence rather than independent permission proof.
- [x] Run all projection tests.

## Task 3: Runtime, endpoint and display

Files: `scripts/founder-runtime.mjs`, `scripts/founder-dashboard.mjs`, `web/founder/model.mjs`, `web/founder/app.js`; create `scripts/founder-capability-integration.test.mjs`.
Interfaces: runtime `capabilityEvidence()` returns the projection; snapshot adds `capabilityEvidence`; GET `/api/capability-evidence` calls only that method after session authentication. `capabilityEvidenceText(entry, now)` formats statuses and observed ages, without HTML.
- [x] Write failing tests: OFF runtime projection has no live claim; repeated reads do not call adapters or add reservations; endpoint rejects unauthenticated access; authenticated read never calls broad runtime snapshot; legacy runtime yields explicit unavailable response; UI text identifies missing proof and old observations.
- [x] Add projection to existing runtime using local adapter descriptors and registry snapshots; default explicit proofs empty. Do not infer authorization from lastSuccessAt.
- [x] Add authenticated GET route and additive text display using existing textContent helpers; retain older-runtime fallback.
- [x] Run integration tests and relevant existing model/UI tests with injected fake dependencies.

## Task 4: Full lifecycle acceptance

File: create `scripts/founder-lifecycle-acceptance.test.mjs`; fix production logic only if a failing integrated scenario proves a defect, retaining existing changes.
Interface: real `openFounderRuntime` with explicit temporary base, fake action adapters, source records and own synthetic order; manipulate only temporary stores. Reopen runtime against the same temporary directory to check recovery.
- [x] Exercise OFF no-op and assigned-order through accepted/paid via controller ticks, reservations and existing stores; assert exact call counts and one root.
- [x] Exercise missing/expired source authority, independent verification failure and OFF during work; assert no subsequent submit.
- [x] Exercise response loss and reopen; assert pending intent preserved, no blind replay, unresolved cost remains held.
- [x] Exercise proven unsent dispatch reconciliation, buyer revision and exact payment mismatches; retain historical delivery and cost records.
- [x] Run lifecycle tests plus existing controller, restoration, delivery-journal, payment and UI regression tests selected after checking isolation.

## Task 5: Review and handoff

- [x] Obtain fresh read-only review of changed files and the five Review Focus cases; do not review or change unrelated work.
- [x] Fix material findings with regression tests; rerun the final selected suite and record exit code, totals and file hashes.
- [x] Compare edited source files to the captured baseline before any integration into original checkout. If concurrent edits conflict, leave reviewed changes isolated and report exact paths.
- [x] Report implementation, tests, activation status and remaining live proof honestly. Do not claim full Founder completion or profitability.

## Execution ledger

Ruling: Inline execution follows Patrice's explicit instruction to create the plan and implement it subsequently; no further planning approval loop.
Ruling: A managed isolated worktree receives a snapshot of the current relevant code, because HEAD omits extensive existing Founder work. Preserve original checkout and store baseline hashes for conflict detection.
Ruling: Git commits are deferred because author identity was absent in the previous turn; do not invent identity or include unrelated staged changes.

## Execution results — 2026-10-19

Ruling: Managed worktree setup did not finish during implementation. Used outputs/founder-evidence-20261019/workspace as an isolated code snapshot with no copied production state, credentials or node_modules. Dependencies resolve from the existing checkout. The pending managed worktree was not used or deleted.
Ruling: The old payment fixture failure was already fixed in existing work. Preserved that fix; baseline restoration suite passed 11/11.
Ruling: Selected a guarded 12-file offline regression instead of running unrelated suites that may open production stores or providers. This does not establish full-repository test coverage.
Ruling: Explicit user authorization covers incorporating this implementation into the working files. Rechecked every affected baseline hash, backed up originals to pre-integration, and copied only 10 reviewed implementation/test/UI files. No branch merge, commit, service restart or deployment.

Implemented pure bounded evidence projection, authenticated provider-free endpoint, additive dashboard display and temporary-database lifecycle acceptance tests. Missing proof stays unknown; legacy success grants no permission. Production proof collection remains absent by default.

RED/GREEN records: projection-red.tap, integration-red.tap, regression-red.tap (missing asset + malformed newer proof), review-red.tap (inherited operation keys). Final isolated acceptance: 93 passed, 0 failed, exit 0; 12 test files. Lifecycle coverage: 14 cases, including missing/expired authority, OFF, verification rejection, lost response/reopen, unsent refusal/recovery, buyer revision and four payment mismatches.

Fresh read-only review found inherited object operation lookup (P2), fixed using Object.hasOwn and a regression test. Review-requested negative unsent case added and passed. No production execution gates were changed. Runtime proofs must be explicitly supplied with exact binding and revision; no fabricated live evidence is inserted.

Evidence and integration manifest: outputs/founder-evidence-20261019. Power record was OFF, revision 79; no production control requests were made. No claim of live capability verification, whole-product completeness, profitability or 10/10 quality.
Integrated acceptance: same 12-file suite passed 93/93, exit 0 in the original checkout; integrated-acceptance.tap. Final read-only power check remains OFF revision 79.
