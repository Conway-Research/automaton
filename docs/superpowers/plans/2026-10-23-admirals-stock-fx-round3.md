# Further slow stock and FX research

Goal: evaluate three additional fixed slow rules at 500 CHF, without changing production or limits. This is a bounded offline extension of round2; the user authorizes research and tests directly. No account opening, broker orders, power changes, or service restarts.

Rules frozen before results: (1) daily close above prior 126 adjusted closes, exit below prior 63; (2) first observed session of each ISO week, completed-week EMA13 above EMA40, exit below; (3) first observed session of each month, both completed-month six- and twelve-month returns positive, exit when either nonpositive. Weekly EMA requires 40 completed weeks; monthly momentum requires 13 completed months. FX uses exact mirrored short rules. ATR14 Wilder stop distance max(4 ATR,5% price), same existing conservative trailing stop/risk engine.

Signals on first observed session close use only already completed week/month data. Execution next session or one further session; no historical calendar-end lookahead. No tuning after seeing results. Same 12 current US names individually and shared portfolio, no new account assumed. Genuine stock eligibility conditional on Invest account; existing Trade CFD variant modeled separately. No capital/risk relaxation to manufacture FX orders.

Reuse corrected round2 ledgers and independent verifier byte-for-byte; replace only feature generator and FX direction mapping. Pin all inputs and code, including prior protocol and source scripts. 39 candidates x4 cash cost cases x2 delays x5 windows =1560; CFD39x2x2x5=780; FX6x3x3x2x5=540. Windows and selection identical: development2016–21, validation2022–23 (positive net and >=3 closed trades), test2024–25, extensionJan–Sep2026, continuous2016–Sep2026. Previously inspected years are not fresh independent holdouts.

Tasks:
- Test causal prefixes, completed calendar periods, exact 126/63 thresholds, symmetric FX directions and stop scale before signal implementation.
- Implement isolated signals and wrappers; run offline tests.
- Freeze protocol then execute all cases and CFD addendum; do not revise rules based on results.
- Independently replay accounting and queued execution schedules, review source differences, report validation selection separately from hindsight leaders and FX admission-only outcomes.
- Read minimal existing production status at completion; save report and continuation reference without altering frozen predecessors.

Primary research inspiration: https://www.aqr.com/insights/research/journal-article/a-century-of-evidence-on-trend-following-investing and https://mebfaber.com/2017/12/13/episode-86-quantitative-approach-tactical-asset-allocation/ . These are adaptations, not exact replications of institutional diversified futures or Faber's original asset allocation. No source return transplanted to this account.
