# Numaron Payment Modes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; TDD for each task and one independent review after implementation.

**Goal:** Preserve platform escrow and support explicitly evidenced postpaid work with one open family and CHF 2.50 maximum exposure.

**Architecture:** A persistent shared payment authority selects an explicit mode, enforces atomic exposure claims and validates current evidence at execution boundaries. Escrow.com is an offline injected-transport sandbox scaffold; no live credentials, account creation or provider calls.

**Tech Stack:** Node ESM, better-sqlite3, existing controller and budget adapters, node:test.

**Spec:** docs/superpowers/specs/2026-10-18-numaron-payment-modes-design.md, approved by Patrice's request to implement both modes and local fake-only Escrow.com tests.

## Global Constraints

Numaron OFF; no provider calls or production runtime construction. Existing budgets and CHF 5 held reservations unchanged. Trades demo-only. No new deposits/accounts/credentials. Reuse authorized dirty checkout, preserve unrelated changes, no commit/push or restart. Source contract evidence remains required.

## Review Focus

- Parallel and restarted controllers cannot claim a second unpaid family.
- Missing costs or zero-cost work cannot silently release exposure.
- Source identity, amount, recipient, scope and policy revision cannot drift.
- No fallback from revoked escrow to unsecured work.
- A fake delivery or merge cannot settle a receivable as paid.

## Tasks

- [x] 1. RED/GREEN persistent payment authority: strict explicit modes, postpaid terms validation, atomic CHF 250-rappen family claim, restart recovery, exact payment settlement and OFF tests. Files: scripts/founder-order-payment.mjs and test.
- [x] 2. RED/GREEN wire shared authority into runtime/GitHub and generic assignment/native/lifecycle guards without changing legacy escrow behavior. Prove a complete fake postpaid controller lifecycle, blocked second family and revoked proof. Files: founder-runtime, founder-order-github, founder-order-restoration, founder-order-lifecycle, founder-native-work, founder-opportunity-store and existing tests.
- [x] 3. RED/GREEN offline Escrow.com sandbox source: injected GET transport and trusted decoding only, fixed sandbox origin, exact reviewed binding, no default network transport or mutation. Files: founder-escrowcom-sandbox.mjs and test.
- [x] 4. Run relevant regressions and tsc, independently review the change, correct material findings, check production invariants and update continuation evidence. No maintenance restart in this task.

## Rulings

- Execute inline per Patrice's explicit implementation request; do not reopen approval for the already approved design and CHF 2.50 limit.
- Claim the full CHF 2.50 ceiling for an open postpaid family, conservatively, even if the first task is free. This is risk capacity, never a new budget reservation or charge.
- Unknown provider schemas and missing real source contracts stay blocked; the sandbox transport/decoder scaffold is not reported as a live account or a verified vendor response mapper.

## Completion evidence

251 final guarded offline tests passed; tsc --noEmit passed. See artifacts/payment-modes-20261018/implementation-status.json for exact live prerequisites and the earlier unguarded-test audit limitation. No commit, push, production construction or restart.
