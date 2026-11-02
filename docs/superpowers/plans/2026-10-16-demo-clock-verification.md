# MT5 Demo broker clock repair

Patrice authorized fixing Demo clock verification and checking market analysis/day reconciliation while keeping Numaron running, no trades and unchanged budgets/risk limits.

## Change

The exact `AdmiralsGroup-Demo` feed is now eligible for the same freshly measured0/10800-second correction as `AdmiralsGroup-Live`. Permission to measure is not proof: every scan still requires at least3 independent advancing sources,2-10seconds measurement, monotonic-clock agreement, quote freshness and consistent offsets. Frozen, mixed, stale or insufficient sources fail closed.

Trading research first uses the existing2.8second scan. On Demo failure only, one fresh7second measurement may follow. No previous proof is reused, no minimum is reduced and no unbounded retry is added. Both market and research collectors now require Demo proof explicitly, including watch quotes. Original timestamps remain available.

Files: `scripts/mt5-market-readonly.py`, `scripts/mt5-trading-adapter.py`, new `scripts/mt5-demo-clock.test.py`.

Python collectors are loaded in fresh subprocesses, so the running service picked up the repair without restart. No power, trading authorization, Node runtime configuration or budget setting was changed.

## Verification

- New regression tests first failed on missing Demo eligibility, missing bounded retry and absent fail-closed Demo proof gate; all passed after implementation.
- 39 affected Python tests passed, including original reader, Demo facade, adapter and quote-continuity tests.
- 309 Node Founder/radar/day/risk tests passed with external network transport disabled.
- Independent read-only review found no actionable Important issues; no provider calls or edits by reviewer.
- Live Demo market follow-up at2026-10-16T00:10:05Z:10800-second offset proved by5sources over7.04seconds;42 instruments passed the market checks;9 experimental setups, execution disabled. Other instruments remained excluded for incomplete bars, withdrawn breakouts or other existing checks. Initial scans without consensus remained blocked, as intended.
- Production research continued recording observations and unvalidated signals. No order intents or live-enabled events were present. PID36744, powerON revision20, no service restart.

Evidence: `artifacts/founder-reboot-check/demo-clock-repair-20261016-live.json`; test log: `artifacts/founder-reboot-check/demo-clock-repair-20261016-tests.log`.

## Day reconciliation remains blocked independently

The authenticated broker history read succeeded and found one external money movement. Its time assignment to the Zurich day is not independently verified, so `windowVerified` stays false and cash-flow evidence is not treated as complete. Quote-clock consensus is not proof of deal/bookkeeping timestamps. No opening equity or zero flow was invented, and no production daily baseline was manually inserted. Broker transaction timestamp evidence is needed before this gate can pass.

Budgets remain CHF20/day, CHF2.50/task family and CHF150/original30-day period, max4workers. Risks remain5%/trade,15%total and30%day-loss threshold. Existing10 unclear holds totalingCHF5 remain held. No trades, commit or push performed.
