# Additional strategy reproduction implementation plan

**Goal:** Research public >=50% CAGR claims and independently test fixed rules over longer histories with lower-drawdown and cost gates.
**Architecture:** A new isolated research directory contains immutable public-source snapshots, acquisition manifests, frozen protocol, synthetic tests and cached-only simulations. No productive code, service, accounts or state changes.
**Tech Stack:** Python standard library, public Binance monthly archives, existing Yahoo ETF history.
**Spec:** User request 21 October 2026, AGENTS.md manual power constraints, outputs/strategy-search-50-lower-dd-20261021/protocol.json.

## Global constraints
- Numaron remains OFF. Never start paper trading, production execution, collectors or service restarts.
- Public historical acquisition only; simulations never access network or vendor executables.
- No parameter tuning. Report all source interpretations, including weak or failing results.
- True unseen validation is unavailable for published retrospective parameters; label date partitions accordingly.
- Prior DD comparison threshold <50%; stronger research gate <35%, >=50% CAGR after base and stress costs and in the later period.

## Review focus
- Close signals cannot obtain same-close fills; assert prior-signal next-open timing.
- Trailing stops must acknowledge unknown within-hour paths; test both orderings and close-updated trailing.
- Funding timestamps must precede the signal; no future interpolation or silent old values through outages.
- ETF splits/dividends must preserve accounting and stops; reuse verified loader, test cash accounting.
- Gaps, fees, open trades, source mismatches and missing archives must remain visible.

## Tasks (execute inline; no delegation or commits in unrelated dirty workspace)
- [x] Freeze protocol before market simulations; save source exclusions and all rule ambiguities.
- [x] Write failing tests for indicators, causal funding, cash ledger, stop ordering, weekly limits and signal execution.
- [x] Implement cached-only simulator; run tests, inspect failures and correct to green.
- [x] Run zero/low/base/stress and execution perturbations, separated periods, yearly/rolling summaries. No winner tuning.
- [x] Independently review accounting, source coverage and output counts; save report, hashes and read-only OFF/paper status.

Ruling: Use a unique output directory instead of a worktree because all changes are standalone research artifacts and existing productive files must remain untouched. No production feature is being deployed. Direct source downloads and Exa snapshots are distinguished; a cached source is not proof of present repository availability.

Completion evidence:25 passing tests,82 model configurations,365 period rows, eight independently replayed base cash ledgers and4165 independently matched SOXL voting sessions. Added a separately frozen SOXL protocol after discovering the complete source; Patrice subsequently explicitly confirmed the longer SOXL test. No tuning or activation. Final artifacts: outputs/strategy-search-50-lower-dd-20261021/BERICHT.txt and verification.json.
