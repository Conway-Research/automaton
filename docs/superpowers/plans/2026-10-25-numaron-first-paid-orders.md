# First paid orders implementation plan

> For agentic workers: execute inline using superpowers:executing-plans. User explicitly requested implementation after design approval; no further design gate.

**Goal:** Opt-in autonomous pilot from existing source discovery through delivery, with complete costs and human minutes, never personnel costs.
**Architecture:** Compose existing order selection/lifecycle with a persisted pilot admission layer. Append-only economic and time events project existing authenticated receipts without booking them twice. Re-evaluate admission before execution as well as scheduling.
**Tech Stack:** Node ESM, built-in test runner, SQLite via existing better-sqlite3.
**Spec:** ../specs/2026-10-25-numaron-first-paid-orders-design.md

## Global constraints

OFF, no production takeover, no external calls. Human only when existing gates require it. No personnel valuation. Existing budgets, payment authority, independent checks and public-delivery release remain mandatory. Work only in isolated checkout; preserve existing work. All test inputs synthetic and temporary.

## Review focus

- Changed evidence after scheduling must prevent dispatch.
- Duplicate invoice/usage and gross/net representations must not inflate costs/revenue.
- Missing costs, currencies or unconfirmed minutes must not look like zero.
- Failed applications and canceled orders remain in cohort economics.
- ON simulation may only use temporary state and fake adapters.

### Task 1: Economic and time journal

Create scripts/founder-pilot-ledger.mjs and .test.mjs. API openPilotLedger(file): record(event), snapshot(), report({orders,coverage}), close(). SQLite append-only validated events, exact deduplication and conflicting-beleg rejection. Money safe integers, currency, confirmed/estimated/unknown status, expense/revenue/transfer/refund, order/pool/investment target. Explicit corrections void a prior event once, replacement uses new identity. Actual human intervals confirmed in minutes, no overlap; estimates separate. Coverage attests category completeness, missing coverage blocks profit. Test RED then GREEN: persistence, idempotence/conflict, currencies, unknowns, refunds, transfer, correction, lost acquisition and timing.

### Task 2: Pilot admission policy

Create scripts/founder-paid-order-pilot.mjs and .test.mjs. API assessPilotCandidate({candidate,plan,capability,policy,now}), createPaidOrderPilot({ledger,isEnabled,resolve,policy,orders}). Read-only assessment binds source/revision/scope/runtime to current verified capability via injected trusted resolver, passes through existing selectOrderCandidate and guardOrderAction. Conservative estimate includes all defined cost categories, 30% reserve, CHF100 minimum contribution, 30% margin; unknown values block. No labour inputs accepted. API inspect(order), assertAction(action,order), report(), record(event); zero implicit authority. Only explicit opt-in config. Fake lifecycle test goes discovery to paid without human gates added; required human release remains blocked.

### Task 3: Existing pipeline integration

Modify scripts/founder-order-restoration.mjs opt-in pilot option. Before scheduling actions and in every guarded dispatch/recheck call pilot assertion. Post-dispatch economic capture records pending unknown if actual cost unavailable, attaches root/action identities; external action success never becomes payment proof. Include pilot report in status/accounts without second financial posting. Expose explicit time-record method. Discovery stays existing monitor source path; ranked pilot selection derives from stored observations and trusted resolver. OFF snapshot methods make no provider calls. Test integration default behavior unchanged, off isolation, revoked evidence, autonomous stages, journal reopen and counterchecks.

### Task 4: Evidence and handoff

Run scoped Node tests with copied current dependencies and fake adapters. Broaden only offline-safe suites; full suite must be screened for provider defaults before running. Write report and machine-readable handoff, source fingerprints, exact test counts and remaining activation prerequisites. Keep production power state unchanged; no stage/apply. Request fresh code review, address important findings with failing tests. Commit only isolated feature files and verified prerequisite snapshots separately; no unrelated changes.
