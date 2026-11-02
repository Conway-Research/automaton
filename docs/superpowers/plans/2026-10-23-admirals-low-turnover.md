# Offline Admirals low-turnover comparison

Authorized: research and offline tests only; preserve the running Numaron session, no restarts or orders.

Freeze four long-only adaptations before calculating returns: completed-month close versus 10-month SMA; positive 12-month price momentum; 10-month SMA with +/-2% entry/exit band; quarterly combined SMA/momentum with 126 observed trading-session cooldown after every exit. Decisions occur at the close of the first observed session of a new month, using only completed monthly closes, then execute one or two sessions later. Quarterly reviews occur January/April/July/October. No published performance is claimed as reproduced.

Daily trailing protective stops use max(4 ATR14, 5% price), with all existing CHF portfolio and cycle risk limits unchanged. Stops, risk reductions and the permanent drawdown halt override calendar schedules. No forced minimum holding period. No pyramiding. Each family is tested on each of the same 12 cached US stock CFDs and as a shared 12-market portfolio: 52 candidates. No new data acquisition, broker calls or production imports.

Reuse reconciled current demo commissions, conversion fees, financing and the three existing execution/cost scenarios; preserve existing development 2016–2021, validation 2022–2023, test 2024–2025 and 2026 extension, plus continuous history. These dates have been examined in earlier research: this is temporally separated historical testing, not fresh unseen evidence. Select only on validation, require three closed cycles there; report sparse samples and no qualifying candidate if necessary. Also show retrospective active leaders, actual fill counts, holding duration, funding and cash benchmarks. Positive dividend credits remain omitted conservatively; results are not exact historical all-in broker P&L.

Verify causal monthly features, cooldown, old ledger regression tests and independent accounting replay. Pin code, input and fee-evidence hashes before evaluating returns. Compare realized trade frequency to the previous daily-rule research without treating unequal trade activity as equal statistical evidence. Record final production power and PID read-only.
