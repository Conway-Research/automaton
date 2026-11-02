# Dealwork Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Process explicitly assigned, escrow-funded native Dealwork code contracts through the existing budget and isolated code pipeline.

**Architecture:** A bounded Dealwork worker transport validates assignment and funding. A separate native flow stores preparation and delivery journals in SQLite and shares the existing controller, worker and sandbox. Public GitHub source preparation remains read-only and independent of GitHub bounty funding.

**Tech Stack:** Node ESM, node:test, better-sqlite3, existing code sandbox and budget controller.

**Spec:** ../specs/2026-10-16-numaron-dealwork-code-design.md

## Global Constraints

- Keep the confirmed running production session running; no restart or power transition.
- CHF 20 per Zurich day, CHF 2.50 per task family, CHF 150 in the original 30-day period, four workers; preserve risk limits.
- No claims, bids, new contracts, wallet operations, payments, general messages or GitHub publication.
- Algora is read-only research only. No Algora writes are added.
- Contract data stays local. Only explicitly referenced public dependency-free JavaScript and public issue text reaches the model.

## Review Focus

- A lost POST response must never cause a second deliverable.
- Changed scope or funding must stop model, sandbox and delivery boundaries.
- Missing contract/job schema fields must block rather than infer authorization.
- Private contract text must never enter the model context.
- Restart must preserve journal and shared root budget identity.

### Task 1: Native worker transport

**Files:** scripts/founder-dealwork-escrow.mjs, scripts/founder-dealwork-work.test.mjs.
**Interfaces:** listWork(ctx), readWork(id,ctx), requireWork(binding,ctx), deliveries(id,ctx), writeWork(binding,operation,ctx). Existing requireFunding and read-only adapter stay compatible.

- [x] Write and run failing tests for own assignment, exact fresh funding/scope, signed START_WORK/deliverable/SUBMIT_WORK, forbidden operations and stale responses.
- [x] Implement strict worker transport; every write rechecks the persisted binding; raw body participates in HMAC.
- [x] Run node --test scripts/founder-dealwork-*.test.mjs; expected all pass.

### Task 2: Public source and durable delivery

**Files:** scripts/founder-dealwork-code.mjs, scripts/founder-dealwork-code.test.mjs.
**Interfaces:** createDealworkCode({directory,provider,github,sandbox,code,...}) returns adapters, refresh, advance, status, close.

- [x] Write failing tests for public-only model input, original/patch/regression verification, funding at every boundary, changed source/scope, durable delivery and ambiguous reconciliation.
- [x] Implement bounded public issue/source preparation and local journal; only exact certified files may be delivered. Reconcile unknown outcomes before any write.
- [x] Run native module tests; expected all pass. Use temporary databases and fake model/provider/sandbox only.

### Task 3: Runtime integration and regression

**Files:** scripts/founder-runtime.mjs and native integration tests.
**Interfaces:** optional injected dealworkCode; native adapters and snapshot share existing controller.

- [x] Test stable contract root identity, empty discovery, OFF gates, shared budgets and no duplicate delivery after reopen.
- [x] Add guarded native refresh/advance, status and close without altering existing GitHub flow.
- [x] Run complete founder test suite, inspect diff, confirm production process and budgets untouched.

No commit or push is part of this request. The user explicitly approved the design and requested implementation/testing; execute inline without another design approval.

Verification and implementation decisions: [verification record](2026-10-16-dealwork-code-verification.md). Final check: 287/287 Founder tests passed; no production restart or power change.
