# MT5 demo binding: implementation and activation status

Patrice authorized binding Numaron to the existing separate MT5 demo account, read-only, without trades, keeping the running session, budgets and risk limits unchanged.

## Implemented

- `scripts/founder-mt5-demo.mjs` binds account, market, trading research and historical reads to a single strictly validated local demo profile. The reader instance pins that profile; a changed account requires a controlled restart and storage review. There is no launch-argument fallback.
- `scripts/mt5-demo-readonly.py` wraps existing collectors with an explicit read-capability allowlist. Every broker data read verifies login, server, demo mode0, connected terminal, exact installation path and portable data directory. Order submission, order checks and login functions are unavailable. No execution configuration/adapter was added to the trading engine.
- `src/revenue/mt5-readonly.ts` additionally validates expectedTradeMode0 for this caller, while preserving freshness and identity checks.
- `scripts/founder-mt5.mjs` routes all four MT5 read paths through this binding and uses separate demo journals/research storage. Existing real-account observations are preserved separately.
- Local demo profile and future launch arguments are prepared. The previous launch configuration is preserved in a local backup. Credential file arguments, budgets, risk limits and power state were not changed.

## Verification

Live standalone checks on 16 October2026, Europe/Zurich: account confirmed demo, EUR50000 balance/equity, zero positions, zero pending orders. Account, market10 instruments, trading research50 instruments and historical read1 report all succeeded using the strict portable-demo facade, with execution disabled. No trade API was invoked.

Evidence: `artifacts/founder-reboot-check/mt5-demo-binding-20261016-verification.json`.

Tests: full Founder suite291/291 passed; Python demo guard7/7 and original account reader3/3 passed; TypeScript account-boundary suite6/6 passed. Tests cover real/contest/missing mode, wrong identity/server/terminal, mid-read account switch, prohibited trade APIs, missing/changed profile, account separation and sanitized errors. Independent read-only review found a missing instrument constant, fixed with a failing regression then passing test. A second review concern about mixing profiles between reads was also fixed with a failing regression and instance pinning.

## Pending activation

The existing production PID8628 was not restarted or stopped. Power remained ON revision18, controller running. That already-loaded process retains its old account binding; **it has not switched to demo yet**. New source/profile and future-launch configuration do not constitute activation in that process.

A live switch cannot be performed safely through the current service interfaces: its MT5 arguments and imported readers are captured at startup. Activating the binding therefore requires Patrice's explicit authorization for one controlled maintenance interruption. After restart, Numaron must remain OFF until Patrice personally presses the dashboard start button and confirms. No automated start is permitted by AGENTS.md. Verify demo telemetry again after that human start.

Unchanged limits: CHF20/Zurich day, CHF2.50/task family, CHF150/original30-day period, max4 workers. Risk limits5%/trade,15%total and30%day loss remain unchanged. No commit or push was requested or performed.
