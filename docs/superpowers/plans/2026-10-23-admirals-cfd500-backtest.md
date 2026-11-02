# Admirals CHF500 CFD comparison

Goal: acquire missing broker daily histories and compare fixed non-crypto strategies with CHF500, historical FX, commissions, financing, spreads/slippage, and temporal separation. No orders or production changes.

Isolated folder: outputs/admirals-cfd500-20261023. Existing running Numaron/MT5 processes and profiles remain unchanged. Per-symbol read-only child processes have a bounded timeout and retain their last phase; a timeout never causes terminal/service restart or production fallback.

Fixed universe before returns are read: #AAPL,#MSFT,#CSCO,#INTC,#KO,#PEP,#JNJ,#PG,#XOM,#CVX,#JPM,#BAC. Liquid US stock CFDs from technology, consumer, healthcare, energy and banking. All currently use USD quotes, contract1, minimum0.1lot, step0.01, interest-current swap. No claim of exhaustive best among 2239 catalog entries.

Fixed candidates: 20/10 channel with 2ATR trailing stop; 55/20 channel with 3ATR trailing stop; RSI2<5 above SMA200 exiting above SMA5 with 2ATR hard stop; cumulative RSI2<35 exiting RSI2>65 with 2ATR hard stop; bounded TPS four legs with 2ATR hard stop; slow SMA200 trend with 3ATR trailing stop. Long only; no short dividend liabilities. No tuning after test evaluation.

Existing caps:10%position,15%market,60%gross,30%sleeve,.5%risk/position,3%totalrisk,6slots,2%daily loss,15%drawdown,1%previous-session real-volume participation. Quote/volume histories distinguish real from tick volume. Stop distances include costs in admission budget; full notional reserve conservatively replaces leveraged margin assumptions. Base account EUR, marks in CHF using lagged ECB fixings; FX endpoint scenario .5/1%.

Costs: published US commission conservative full-price scenario (not claimed account-history proof); observed broker interest-current swap -7.49% annually /360 with Friday triple rollover, stress higher financing; historical bar spread with conservative floors; next open and extra-session delay. No optimistic zero-commission promo. Dividends on long CFDs excluded as conservative positive credits; no exact historical cashflow reproduction claim. Corporate action/split treatment must be documented before eligibility.

Windows: development2020–2021, validation2022–2023, test2024–2025, extension2026Jan–Sep, continuous2020Jul–2026Sep. Each freshCHF500. Choose by validation only; show retrospective winner separately and keep CHF cash benchmark. Previously studied histories not pristine holdout.

- [x] bounded read-only history acquisition: all12broker histories, 3000rows each;12Yahoo underlying series,3205rows each; quality/split checks and hashes
- [x] cost evidence and immutable protocol; historical personal CFD commission/swap proof unavailable, explicitly scenario-based rather than fabricated
- [x] 20 isolated engine/data/FX tests; independent review issues fixed before frozen evaluation
- [x] 79fixed candidates,2370cases; independent replay of3721848NAVmarks,18728fills,83465financingcharges,9339closedcycles,9389admissions
- [x] powerON revision100/controller running/PID55016 unchanged; readable bericht.txt and complete summary.csv

Ruling before evaluation: acquired histories cover late2014 onward, so expand development to2016–2021 and continuous window to2016–Sep2026; validation/test/2026 separation stays intact. Protocol records exact dates. No strategy parameters changed based on returns.

Review interpretation recorded before return inspection: ACTIVE selection requires at least3closed validation cycles; retrospective active leaders at least1cycle with sample-size warning. Robust cases must actually trade in every base/wide delay case. Raw selection retained, audited-selection.json governs interpretation. No robust profitable candidate found. All continuous cases negative under modeled costs, including EUR cash exchange effects.

Only newly created research children may be ended on timeout. Never stop or restart Numaron, MT5, collectors, paper/demo runners or the controller. No production adaptation or new forward-test start.
