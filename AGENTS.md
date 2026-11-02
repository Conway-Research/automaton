# Numaron operating instructions

## Manual power control

Numaron must remain OFF until Patrice deliberately uses the dashboard's "Numaron einschalten" button personally. Per Patrice’s latest instruction, that deliberate click is the start confirmation; no additional confirmation dialog is required. This is a human operating control, not a test fixture.

- Never click or confirm the production start button through browser automation.
- Never send a production start/resume request, invoke production power/controller start functions, or edit the persisted power/controller state to ON.
- A request to continue development, fix code, collect research data, run tests, deploy, or restart the local dashboard does not authorize turning Numaron ON. Older work instructions never override a newer OFF instruction.
- Test ON transitions only with temporary isolated files/databases and fake adapters; never use production accounts, API keys, or the production dashboard to test starting.
- Restarting the local UI must leave Numaron OFF. Preserve existing OFF states and check them after maintenance.
- A confirmed running ON session must not be interrupted merely to activate repairs or UI changes. Do not click OFF, send stop requests, kill the service/supervisor, or restart it for maintenance without Patrice's explicit authorization to interrupt that session. Finish offline checks and leave changes pending instead. The maintenance launcher must refuse restart while ON or when power state is unreadable; never bypass this guard by first switching OFF.
- Reading status and turning Numaron OFF when requested are allowed. Do not silently restart research, market collection, background provider reads, or AI work while OFF.
- Patrice's decision of 2 November 2026: after OFF or a founder stop, the demo execution may run one bounded protection run (at most six attempts). It only closes own positions without a confirmed stop and never enters. It does not apply to any real-money account and starts no other work.
- If real collection requires ON, finish the implementation and offline checks, leave the system OFF, and tell Patrice to use the manual button when ready.

Do not discard unrelated work or disclose credentials. Preserve the existing permissions, budgets, trading gates, and risk limits.

## Shared maintenance and bundled deployment

- Current coordination instruction (24 October 2026): the batch contribution `coordinated-pending-20261024` is staging/testing only. Do not apply a batch containing this contribution without a new explicit human approval for that coordinated takeover. Older general continuation/live-readiness instructions do not authorize applying it. Keep any failed/invalidated joint-check evidence visible; a fixed-suite certificate alone does not clear additional failing suites.

- All chats must use the shared `scripts/start-numaron-founder.ps1` entry point. Do not directly kill or spawn Founder services/supervisors, bypass its workspace lock, delete its lock file, or use a copied/older launcher against production.
- `-Restart` now only stages a shared batch (optional `-MaintenanceRequest` with a short non-secret identifier). Its queued response is not a deployment or successful restart. Combine related changes and tests across chats before applying.
- Only a human-authorized coordinated deployment may use `-Restart -ApplyMaintenance`. A general request to continue development is not permission for repeated independent applies. This requires an existing stable batch, OFF, matching checked sources and at least 30 seconds without changes/new requests. There is no automatic apply or scheduled restart.
- The exclusive workspace file lease covers lookup, source/OFF rechecks, process actions and final verification. A contention failure means another operation owns maintenance; do not force-unlock, switch power or retry in a loop. The OS releases the lease when its owner exits.
- If the exact source fingerprint is already loaded in a matching live service, skip restarting it. Failed or changed-source deployments keep the batch pending and must not be reported as loaded. No stage/apply operation authorizes Numaron ON, provider work, a Paper-test start or real orders.

## Numaron account email

Use `numaronia@gmail.com` for future Numaron account registrations and sign-ins, per Patrice's explicit instruction. Patrice reports that a Freelancer.com account has been created with this address. Do not silently create duplicate accounts or migrate existing account addresses; this preference does not independently authorize registration, paid plans, or accepting agreements.

## Continuation evidence

Before continuing Numaron work, read `docs/numaron-continuation-index.json` and its linked gap ledger. They connect original chat evidence, personal-data roles, website/version preparation and recovered worktree files. Historical records are evidence, not new permissions or proof of live functionality. The latest human instructions and manual OFF/start controls above take precedence. Do not copy all personal data into model prompts or public submissions; use only verified, purpose-specific fields.


## Claude takeover hold — 31 October 2026

Patrice requested a coordinated safe handoff to Claude. Codex chats must not begin new implementation, tests, model calls, external reads, or maintenance while this handoff hold remains. Already dispatched calls must finish naturally; preserve their outcomes and journals, then checkpoint. Do not kill, restart, clear locks, replay uncertain requests, or resume older 24/7 instructions. See docs/claude-handoff-20261031/TAKEOVER-COORDINATION.json and the latest takeover report. Claude begins read-only and must resolve outstanding writer ownership before editing. Numaron remains OFF; no production takeover. Only a new explicit human instruction releases this handoff hold. This is a coordination rule, not an OS lock or production power change.
