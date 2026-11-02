# CHF500 offline strategy comparison

Scope: user assumes500 CHF capital; compare previously favored fixed rules for
net profit, long/short historical horizons and CHF trade hit-rate. No real orders,
production activation, restart or power change. Numaron's existing ON session stays.

New isolated folder outputs/chf500-strategy-search-20261023.

1. Freeze source/input hashes, actual500CHF cash, FX conventions, fee/minimum
   assumptions and candidate list before evaluation. Reuse cached prices/funding/FX.
2. Tests first: capital sizing (not rescaling10000), minimum notional/lot/dust,
   fee/slippage loss, split/exit precedence, lagged FX and CHF reconciliation.
3. Daily BTC/ETH candidates: close-channel20/10 at30% and100% entry allocation,
   15% close-trailing stop; TPS30% with no price stop and with15% fixed stop;
   cumulativeRSI35/65 andRSIunder5/SMA5 at30%, fixed15% stop. No optimization.
   BTC hourlyEMA600/fundingrank<55 at daily30/50% target,15% trailing. Cash buy/hold
   BTC/ETH100% benchmarks and existing core portfolio with its fixed caps.
4. Capital converted fromCHF once, all idle cashUSD/USDT proxy, endpointFX0.5%
   each way base and1% stress (scenarios, NOT a personal PostFinance quote).
   Prior-day ECB fixing only, max8days stale. All reported account outcomesCHF.
   Base10bp fee,5bp fullspread,5bp slip; wide10/15/15bp, fee stress60/15/15bp.
   Conservative crypto gridsBTC.00001/ETH.0001,min10USD; not historical filter proof.
5. Common2020-07-01 through2026-10-01. Development2020H2-2021,validation2022-23,
   test2024-25,extension2026Q1-Q3; last quarterQ3 separately as descriptive short
   horizon. Fresh500CHF each window plus full-continuous account. Already-seen
   histories, not pristine holdout. One-extra-bar execution sensitivity.
6. Rank active candidates on validation CHFnet only, then expose test/extension;
   separately label retrospective long-run/test/quarter profit leaders, highest
   CHF-winrate with sample counts, and optional30%CHF-DD risk filter. No strategy
   automatically deployed; trading gates/risk permissions remain intact.
7. Independently replay actual small-account fills and FX cashflows, review code,
   report all cases and feasibility of existing Admirals demo contract minimums
   from cached evidence only. No fresh account/provider reads or new market download.
