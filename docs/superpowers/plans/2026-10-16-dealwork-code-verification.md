# Dealwork implementation verification

Verified 16 October 2026 (Europe/Zurich). Implementation is present in source; the existing human-started production process was not restarted and has not loaded it.

## Implementation

- `scripts/founder-dealwork-escrow.mjs`: preserve the private read-only escrow adapter; add narrowly permitted worker operations, fresh own-contract/scope binding and exact raw-body HMAC. Unknown native schema fields block.
- `scripts/founder-dealwork-source.mjs`: public active GitHub issue/repository, explicit AI contribution permission, bounded immutable dependency-free JavaScript source and original tests. No GitHub writes.
- `scripts/founder-dealwork-code.mjs`: local SQLite preparation, exact test certificate and durable delivery journal; share the existing controller, model adapter, budget and sandbox. Refresh funding after source reads and before model/sandbox/write boundaries. Reprepare changed source/scope at most three versions under the same contract budget root, only before external operations have begun.
- `scripts/founder-runtime.mjs`: native adapter lifecycle, guarded refresh/advance and `dealworkCodeOrders` snapshot. Injected fake runtime tests do not instantiate production adapters.
- Algora remains a read-only research option; no claim, offer, message, registration, payment or submission API has been added for it.

## Verification evidence

Command:

`node --require ./scripts/verification-network-guard.cjs --import tsx --test scripts/founder-*.test.mjs`

Result: **287 passed, 0 failed**. Log: `artifacts/founder-reboot-check/dealwork-full-20261016-tests.log`.

Native tests cover signed requests, missing/foreign/stale funding, changed scope/buyer/deadline, unsupported schema, source privacy, dependency/policy boundaries, shared CHF2.50 family limit, baseline/patch/original-regression tests, funding loss during source refresh, lost START_WORK/DELIVER/SUBMIT_WORK responses, empty or ambiguous reconciliation, restart without duplicate POST, changed-source repreparation, empty contracts and OFF gates. Paid model and delivery tests use fake adapters and temporary databases only.

Independent read-only review identified funding freshness after source reads, ignored extra native scope and missing versioned repreparation. Each received a reproducing failing regression test and a passing fix; the full suite passed afterward.

Live verification: `artifacts/founder-reboot-check/dealwork-implementation-20261016-verification.json`. Authenticated read succeeded; **0 own contracts, 0 escrow proofs, 0 external writes and 0 paid test calls**. Power remained enabled, revision18; controller running. Existing ten unclear cost holds totaling CHF5 remain unchanged.

## Explicit implementation decisions and remaining limits

1. The initial native job schema is deliberately strict. The description must be `Implement public issue: https://github.com/OWNER/REPO/issues/N`, the title must match the public issue, and any supported additional acceptance criteria must equal its public body. Unknown fields, private additional requirements, attachments or other source formats block. This avoids silently dropping private requirements or forwarding them to AI. Cost if too narrow: an otherwise legitimate job waits for explicit schema/scope support.
2. No active own contract exists, so actual Dealwork delivery response shape and live end-to-end customer processing remain unproven. Missing provider fields fail closed rather than infer authorization. Offline results are not customer completion or revenue.
3. Existing deliverables require explicit revision review; they are not overwritten or treated as permission for another delivery. Changed scope before writes receives fresh preparation under the original budget root. Unknown earlier writes prevent automatic new preparation/delivery.
4. Deferred review minor: reconciliation currently requires the original public source to remain eligible. If an issue closes or source changes after a lost submission response, the journal can stay unresolved until explicit read-only reconciliation is extended. No duplicate write is allowed to resolve that ambiguity.
5. No production restart, power action, new spending authorization, risk-limit change, commit or push occurred. A later approved maintenance restart must leave Numaron OFF until Patrice personally confirms start.

## Execution record

The user explicitly approved the design and implementation/testing in this chat; implementation continued inline without another design approval. Work stayed in the existing checkout because required preceding funding repairs are uncommitted there; unrelated files and the index were preserved. No automatic implementation commits were made because this request did not ask for a commit and the checkout contains unrelated staged work.

Task1 complete: signed transport and binding tests green. Task2 complete: public source, isolated pipeline and durable delivery tests green. Task3 complete: runtime lifecycle/OFF/shared-budget regression tests and all287 Founder tests green. Reviewer made no repository changes or live requests.
