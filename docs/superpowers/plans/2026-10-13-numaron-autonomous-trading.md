# Numaron Autonomous Trading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user selects delegation. Steps use checkbox syntax for tracking.

**Goal:** Prepare a validated autonomous MT5 trading service and understandable Founder dashboard with the user's agreed risk policy.

**Architecture:** Separate market reads, versioned strategy evaluation, deterministic risk admission and durable broker execution. Preserve the existing Founder business runtime. Reuse journals and evidence conventions; do not extend the funded-spot gateway to leveraged MT5 products by bypassing its restrictions.

**Tech Stack:** Node.js ES modules, TypeScript through tsx, Python MetaTrader5, better-sqlite3, existing local authenticated HTTP dashboard.

**Spec:** ../specs/2026-10-13-numaron-autonomous-trading-design.md (user approved 2026-10-13).

## Global Constraints

- Maximum planned risk per trade: 5% of current account equity; total planned risk: 15%, including pending entry orders.
- Daily entry-stop threshold: 30% of opening Zurich-day equity, adjusted for external cash flows. No forced blanket liquidation at that threshold.
- All products actually accessible through connected brokers may be assessed; execution requires verified instrument capability and validated strategy evidence.
- Precommitted strategy exits, stop-loss and profit target remain effective. No widening stops or model-driven risk increases.
- Persistent halt and ambiguous execution block entries across restarts. Protective exits remain separate from entry authorization.
- Preparation does not activate live trading. Tests never send real broker orders. No changes to unrelated concurrent work; commits contain only reviewed task files if requested.

## Review Focus

1. Netting merges manual and automated positions: ownership ambiguity must block entry and destructive exit (Task 4).
2. Non-FX products have different contract/tick/currency conventions: unknown calculation must block sizing (Tasks 1–2).
3. Zurich days can be 23/25 hours: daily state must use calendar boundaries, not fixed 86400000 ms (Task 2).
4. Crash between broker acceptance and journal update: recover by reconciliation without duplicate submission (Task 4).
5. Research or optimized parameters can leak future data: validation must enforce chronological splits and immutable evidence (Task 3).

## Shared interfaces

MarketSnapshot: schemaVersion, account {identity,server,currency,equity,freeMargin,mode,observedAt}, instruments [{symbol,contractKind,capability,reasons,bid,ask,quoteAt,closedBars,volumeMin,volumeMax,volumeStep,stopDistance,session,costEvidence}], positions, orders, cashFlows. Identity is private and omitted from browser responses.
StrategySignal: signalId, strategyVersion, symbol, side, entry, stop, target, rationale, invalidation, exitRule, observedAt, expiresAt, validationId.
RiskDecision: allowed, reasons[], lots, plannedLoss, riskFraction, totalRiskFraction, dailyLossFraction, currency. Monetary values use account currency and checked integer minor units where applicable.
BrokerResult: accepted | rejected | partial | unknown, intentId, brokerIds[], fills[], observedAt. An unknown result never releases risk reservation.

### Task 1: Verified multi-product market adapter

Files: create scripts/mt5-trading-adapter.py, scripts/mt5-trading-adapter.test.py; extend scripts/trade-radar.mjs only through a documented adapter interface. Read existing scripts/mt5-market-readonly.py and src/revenue/mt5-readonly.ts before implementation.

Produces: collect_market(mt5, expected_account, now) -> MarketSnapshot; broker_size(mt5, signal, risk_budget) -> {lots,loss,margin,costEvidence,reasons}.

- [ ] Write tests with fake MT5: wrong account/server rejects; unsupported contract yields capability=false; closed-session and stale quotes reject; FX/metal/equity/crypto use broker profit and margin calculations, not assumed pip values; missing commission/financing/slippage evidence prevents executable signal.
- [ ] Run `python -m unittest discover -s scripts -p mt5-trading-adapter.test.py`; confirm failure before implementation.
- [ ] Implement bounded paginated instrument discovery, complete closed bars, authenticated identity checks and explicit capability report. Keep existing readonly scripts readonly.
- [ ] Repeat test command; all tests pass without importing a live terminal into test execution.
- [ ] Review diff for account identity leakage and unintended changes.

### Task 2: Deterministic portfolio risk and Zurich daily state

Files: create scripts/trading-risk.mjs, scripts/trading-risk.test.mjs, scripts/trading-state.mjs, scripts/trading-state.test.mjs. Inspect src/revenue/live-daily-loss.ts; its fixed-day contract cannot be silently reused for Zurich calendar rollover.

Produces: assessRisk({market,signal,sizing,day,holds},now) -> RiskDecision; openTradingState(file) -> {reserveIntent,recordBrokerResult,halt,snapshot,close}. Reservations use SQLite immediate transactions and unique signal identities.

- [ ] Write tests: exact 5% and 15% boundaries; larger values reject; concurrent reservations cannot exceed 15%; minimum lot over budget rejects; missing stop/cost blocks; cashflows do not masquerade as profits; daily losses include unrealized changes; profits do not expand daily opening budget.
- [ ] Add spring/autumn Zurich boundary tests, unknown opening equity, missing cashflows, restart-persistent halt and unknown submission holds.
- [ ] Run `node --test scripts/trading-risk.test.mjs scripts/trading-state.test.mjs`; observe failure.
- [ ] Implement signatures above with 0.05/0.15/0.30 immutable policy ceilings; entries reserve remaining daily budget before broker I/O. Threshold halts entries and schedules cancellation of own pending entries, not blanket position closure.
- [ ] Repeat tests until pass, then review reservation and rollover invariants.

### Task 3: Knowledge-derived strategies and controlled learning

Files: create scripts/trading-strategies.mjs, scripts/trading-validation.mjs, scripts/trading-learning.mjs and matching *.test.mjs. Read src/revenue/trading-knowledge.ts, strategy-research.ts, strategy-comparison.ts and profitability.ts; reuse evidence formats where compatible.

Produces: evaluateStrategy(version,market) -> StrategySignal[]; validateStrategy({version,bars,costs,split,forwardEvidence}) -> ValidationReport; promoteCandidate(state,report) -> version or rejection. ValidationReport stores chronological boundaries, net performance, drawdown, sample count, uncertainty, cost assumptions and source provenance.

- [ ] Write tests: unsupported products have no signal; unverified knowledge cannot become validated evidence; no later bars enter earlier decisions; open candles excluded; cost-free backtests reject; reused evaluation data cannot count as independent evidence; only a complete immutable report can promote a version.
- [ ] Run `node --test scripts/trading-strategies.test.mjs scripts/trading-validation.test.mjs scripts/trading-learning.test.mjs`; observe failure.
- [ ] Implement structured strategy rules from source-backed knowledge, reproducible replay and independent forward evaluation. Store evidence-based acceptance criteria before evaluation; missing sample adequacy or positive conservative net evidence keeps strategy unapproved. The experimental M5 radar is a candidate, not an approved strategy.
- [ ] Implement champion/candidate comparison including switching costs and drift suspension. Promotion cannot change risk policy or reinterpret an existing position's exit rule.
- [ ] Repeat tests until pass; preserve reports even when no strategy qualifies. No profitability claim from passing software tests.

### Task 4: Durable MT5 execution and protective management

Files: create scripts/trading-execution.mjs, scripts/trading-execution.test.mjs; extend new scripts/mt5-trading-adapter.py with submit_once, reconcile_intent and manage_exit, each behind explicit mode/account checks. Do not alter the funded-spot contract in src/revenue/live-orders.ts.

Consumes: Tasks 1–3. Produces: executeSignal({signal,market,state,adapter,validation},now) -> BrokerResult; reconcileOutstanding(state,adapter); manageProtection(state,adapter,now).

- [ ] Write fake-broker tests: one submission per identity; duplicate simultaneous signals; rejection; partial fill; timeout followed by late acceptance; crash after acceptance; absent SL/TP; account change; ambiguous ownership in netting; manual positions untouched; broker order_check success alone never counts as a fill.
- [ ] Add tests that strategy-compatible exits remain operational during entry halt, mandatory stops cannot be vetoed by a model, and daily threshold does not force liquidation.
- [ ] Run `node --test scripts/trading-execution.test.mjs` and the Python adapter tests; observe failures.
- [ ] Persist intent before I/O, serialize admission, send once, reconcile broker IDs/deal history, verify actual stops/targets and fill-risk deviation. Unknown protection or ownership halts entries and exposes an actionable error. No blind retries.
- [ ] Implement latched entry stop, own pending-order cancellation and separate explicit close-own-positions operation with finality reconciliation.
- [ ] Repeat tests and review each broker mutation path independently.

### Task 5: Service and dashboard integration

Files: create scripts/founder-trading.mjs, scripts/founder-trading.test.mjs, web/founder/trading.mjs; modify scripts/founder-mt5.mjs, scripts/founder-dashboard.mjs, web/founder/app.js, index.html, style.css; add scripts/founder-trading-ui.test.mjs.

Produces: openFounderTrading(options) -> {start,snapshot,control,close}. Dashboard snapshot.tradingEngine exposes status, limits, evidence summaries, signals, own positions and reasons; excludes credentials and private account identity.

- [ ] Write tests: disabled by default; stale data and no validated strategy display specific blockers; CSRF/session required for controls; halt survives restart; live activation binds account/policy/strategy digest; startup never silently enables live; trading stop does not kill protective management; business AI stop does not pretend to close broker positions.
- [ ] Run `node --import tsx --test scripts/founder-trading.test.mjs scripts/founder-trading-ui.test.mjs`; observe failure.
- [ ] Integrate dedicated service with bounded scanning and analysis costs, validated-strategy-only execution and permanent journal. Display trade rationale, lot, SL/TP, account-currency risk, 5/15% limits, 30% entry-stop threshold, execution status and active exit rules on Start. Keep unrealized trading P/L outside business revenue.
- [ ] Test browser navigation, disconnected/stale views, theme and dialog dismissal. Do not click live activation or real order controls during verification.
- [ ] Run the new tests and existing Founder UI, finance, trade journal and radar suites. Review the scoped diff.

### Task 6: Live-readiness verification and handoff

Files: create docs/trading/live-readiness.md and outputs/numaron-trading-readiness.json from actual check results. Extend scripts/start-numaron-founder.ps1 only if Task 5 requires explicit service configuration.

- [ ] Perform terminal-free replay and execution fault tests, including shutdown/recovery and strategy promotion rollback.
- [ ] Perform readonly broker capability/history checks, identify actual supported products and verify cost completeness. Do not manufacture missing broker data or strategy performance.
- [ ] Record each requirement as passed, failed or unverified, linked to evidence. Live-ready requires all execution/protection/account and strategy gates passed; otherwise report the exact blockers.
- [ ] Deliver dashboard screenshot and readiness report. Actual live activation is a separate concrete action after verified readiness and applicable account authorization; do not send real test orders.

## Self-review

Spec coverage: market/product scope Task 1; 5/15/30 policy Task 2; knowledge, validation and learning Task 3; order lifecycle and strategy exits Task 4; dashboard and service Task 5; operational proof Task 6. All five review-focus conditions have named tests. Existing parallel changes are preserved. No validated strategy or broker capability is assumed from file existence.
