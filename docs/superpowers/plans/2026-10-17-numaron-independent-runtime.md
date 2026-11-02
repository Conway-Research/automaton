# Numaron independent runtime implementation plan

> Execute inline using executing-plans; user explicitly approved implementation without further approval rounds.

Goal: local ten-minute read-only monitoring independent of Codex, exclusive ownership, persistent discovery cursors and protected dashboard reauthentication.

Spec: ../specs/2026-10-17-numaron-independent-runtime-design.md

Constraints: existing ON process untouched; no new API keys/services; no new paid worker; manual power control; no external submissions; shared budget unchanged; existing dirty checkout preserved.

Ruling: Work on narrowly named files in existing checkout because deployment must reuse its extensive existing untracked runtime; do not reset, branch-switch, or commit unrelated files. User waived further approval stages. Existing AI worker remains the only paid execution path.

1. Pause existing Codex heartbeat and wait for final monitor handoff. Keep local owner disabled meanwhile.
2. Write failing isolated tests for SQLite exclusive ownership, process-bound lease with no timeout takeover, OFF mid-round, error/quota handling and cursor persistence. Implement coordinator, reusable local status, monitor adapters and persistent runner.
3. Write failing testserver tests for authentication renewal and one-time local login-file consumption, using fake clock and power only. Implement rolling session expiration and rotating private local bootstrap file; existing server remains unchanged in memory.
4. Test detached, single-instance monitor start and maintenance guards with fake processes; extend existing Windows launcher and existing startup only. Start monitor without touching original Founder PID.
5. Confirm Codex round ended before recording local ownership. Run first gated local round, inspect evidence and retry schedules. Verify same original Founder PID/power revision, one monitor process, paused heartbeat. Document source access gaps and pending server activation.

Review focus: unknown process identity fails closed; PID reuse; stale cookies/bootstrap reuse; OFF during request/clock reversal; crashes after HTTP success before cursor write. Tests cover these at the owning modules. Never retry external submissions: monitor is GET-only by construction.

Execution ledger: implementation complete; isolated tests green. Existing Codex heartbeat paused and finished-thread proof received before local ownership assignment. Local monitor activated without touching Founder PID16996/supervisor17984/power revision54. First run completed. Ruling: reload only the newly created idle monitor companion to correct Windows credential-module loading, with all source due dates retained; the original ON session was never interrupted. Register/quota review findings fixed with regression tests. Dashboard server renewal remains pending the next expressly allowed Founder start; browser-only ugig/Guru are explicitly access-required. No production power transition tests, new API keys or paid worker.

Final verification: 39 relevant isolated/regression tests passed. Independent monitor completed the next scheduled round with35 successful sources and2 access-required browser sources. Existing Google OAuth grant renewed with identical account/label/scope; its token maintenance is the sole fixed-endpoint POST exception, not an order action. Three new-companion reloads occurred only between completed rounds while original Founder/supervisor continued unchanged. No Codex resumption or new automation. Existing checkout retained in place; no merges, broad commits or cleanup of unrelated work. See artifacts/numaron-independent-runtime-20261017/completion.json and saved last-monitor-run.json.
