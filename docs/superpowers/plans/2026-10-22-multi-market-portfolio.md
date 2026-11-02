# Offline multi-market trend / mean-reversion portfolio

User scope: one shared cash ledger, fixed limits, realistic cost scenarios,
separated historical periods; no Numaron restart, power mutation, provider calls
or orders. Existing ON session is outside this research implementation.

Deliverable namespace: outputs/portfolio-trend-mr-20261022. New files only.

1. Write failing tests for event ordering, shared cash, simultaneous-signal
   contention, risk sizing, corporate actions, stop gaps and circuit breakers.
2. Implement a pure event-driven ledger, reusing fixed mathematical signal rules
   from the hash-pinned round2 snapshot. Equity opens use post-2007 NY DST rules;
   equity bar completion is conservatively available at22:00UTC. Crypto bars
   complete at23:59:59.999UTC. Daily OHLC cannot locate intraday stop timestamps:
   stop proceeds are unavailable until bar completion, except observable open gaps.
3. Freeze protocol before evaluation: core6 and extended10 markets, shared USD
   cash10000 and capital sensitivity100000; combined50/50 sleeve caps vs solo
   sleeves, three existing costs, next-open and one-extra-session delays.
   Risk: ATR20 Wilder*2, minimum2% signal-close distance. Fixed initial MR stop;
   trend stop only trails upward after completed bars. No extra leverage;
   embedded3x ETFs count3x in exposure caps. Position10%, market15%, gross60%,
   sleeve30% combined/60% solo; groups equity35%,crypto20%,bonds20%,gold15%.
   Max6 positions, entry stop-loss budget0.5% each and3% total. Cash fees inside
   budgets. Same-symbol sleeves remain separate owned research episodes.
   Daily2% loss blocks buys until next UTC day. Drawdown15% schedules full exit
   next eligible opens and permanently halts new entries in that sample.
   Exposure/risk drift schedules whole-position reductions at next opens.
4. Run development2018-2021, validation2022-2023, test2024-2025,
   extensionJan-Sep2026, and full2018-Sep2026 separately. No fitting/selection.
   Compare continuous full-history periods separately to avoid hiding a halt.
5. Independently replay fills, dividends/splits, cash and open inventory; verify
   admissions obey frozen limits and past-only signal causality. Review pure code.
6. Report net results, drawdown, exposure, trade counts, cost sensitivity,
   circuit-trigger losses and breadth. These cash/spot proxies do not establish
   Admirals CFD financing, CHF FX, venue transfers, option/futures execution or
   a future90% win rate. USD/USDT parity is a declared limitation.
