# Bitcoin funding and fixed position-risk experiment

**Goal:** Execute Patrice's approved offline comparison without parameter optimization.
**Architecture:** Unique output folder, immutable protocol and input hashes; reuse already tested pure signal/funding functions. Implement an isolated cash/episode ledger for partial position changes, daily causal volatility sizing and realistic costs. No productive changes.
**Tech Stack:** Python standard library and cached public archives.
**Spec:** outputs/btc-position-risk-20261021/protocol.json; approved in-chat research scope and AGENTS.md.

## Constraints and review focus
- OFF and Paper controls; read-only start/end operating evidence.
- No future day-close volatility, funding or price; test prefix causality.
- Every partial resize pays costs, never borrows or resets the existing trailing stop.
- Full episode PnL includes all partial cash flows and open positions, independent replay must match every mark.
- Identical windows for funding/no-funding; all size variants and all results retained.

## Tasks
- [x] Hash cached inputs and source dependencies; freeze protocol before results.
- [x] Write failing sizing, order sequencing, partial accounting and time-split tests.
- [x] Implement cached-only experiment and pass tests.
- [x] Run six variants across nine costs/execution scenarios and fresh common/three partition starts; no tuning.
- [x] Independently replay cash ledgers, compare unchanged reference to old simulator, and calculate fixed risk gates.
- [x] Save complete report, tabular results, hashes and final OFF/Paper verification.

Ruling: This is the already approved bounded research probe. Numeric sizing choices not specified previously are fixed once in protocol before testing (50% daily target and25% volatility target over30 daily log returns). No extra approval or tuning loop. A separate output directory provides isolation; no existing code is edited or deployed, no worktree/commit touches unrelated work.

Completion evidence:16 passing synthetic tests;54 primary plus48 fresh-start configurations;270 primary plus48 fresh period rows;12 independent mark-by-mark cash replays;4 unchanged reference cases match old real-data engine to at most1.2e-10 USDT NAV. Strict55/fixed50 passes all predetermined risk gates; strict55/vol25 passes base/stress but fails delayed stress at30.37% DD. No parameter adjustments after results. Artifacts in outputs/btc-position-risk-20261021.
