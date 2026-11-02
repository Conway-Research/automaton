# Admirals personal demo fees and fixed-rule retest

Scope: read-only account fee verification, then repeat the existing CHF500 non-crypto comparison without strategy or risk tuning. Never switch the MT5 account or restart production. No orders.

Evidence: authenticated dashboard confirms bound demo Trade.MT5/EUR/Retail; read-only MT5 history has8stock-CFD deals, all commissioned. French0.10% nominal charges match six deals. US BCS500-share fills have EUR8.89/8.93 commissions, consistent with USD0.02/share at the contemporaneous FX rate; conversion fees match0.3% on absolute PnL+commission+swap. Published CFD—not Invest—schedule now explicitly supplies USminimumUSD1 and minimum conversionEUR0.01. Minimum is published, not directly demonstrated by a small observed fill. No prospective live-account guarantee.

Implementation: isolated outputs/admirals-personal-fees-20261023/retest. Copy pure proven engine, keep original79candidates/data/windows/limits. Add EUR-cent commission/settlement rounding and minimum conversion charge, with financing conversion settled once on closure (no daily surcharge duplication). Current7.49% interest-current swap, higher-cost sensitivities and lagged FX remain. Long dividend credit omitted as before; no historical personalized fee/swap-series claim.

- [x] read continuation ledger, currentON status, demo deal history and dashboard type without state changes
- [x] reconcile observed commissions/conversion including same-currency exemption and swap settlement
- [x] 25 tests pass including actual large US opening fee, published minimum conversion, zero-conversion case, financing settlement, bank allocation and ledger
- [x] proof hashes frozen; repeated2370cases with unchanged79candidates/risklimits/data/windows and activity-aware validation selection
- [x] independent replay passed:3721848NAVmarks,18988fills,75704financingcharges,9474closedcycles,9514admissions; independent review no material new defect
- [x] bericht.txt and full results saved; finalON revision100/controller running/PID55016unchanged; no restart or orders

Outcome: zero profitable continuous scenarios and zero robust positive validation candidates. Recent2026Jan–Sep retrospective leaderINTC-trend20 endsCHF508.295659 with3closedcycles/1winner, not a validated profitable long-run choice. Scope is observed DEMO fees plus published minima, not personally verified live-account pricing or a complete historical personalized fee/swap series. Prior frozen outputs were not modified.

Constraints: full historical broker fee schedules cannot be inferred from today's observations. Public promotion terms are not account eligibility proof, and actual observed stock commissions are not zero. Remaining PostFinance transfer/FX fees and tick fills remain scenarios. Live account not connected through MT5; no login or order check/send calls.
