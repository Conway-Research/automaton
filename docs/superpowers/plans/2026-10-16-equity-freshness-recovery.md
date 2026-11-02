# Equity freshness recovery — 2026-10-16

Reported symptom: generic missing account-bound equity message. The existing one-second day guard combines missing/invalid equity with stale or future timestamps. Current production observations and GUI confirm EUR50,000 opening equity and EUR0 external flow, and no incident was reproduced during this investigation.

Measurements: three real read-only demo snapshots returned account age 48/35/33ms, history age54/42/40ms. Temporary output timing instrumentation recorded output-to-production-market-event delays up to458ms. These healthy samples do not prove the root cause of the earlier incident. Temporary Python instrumentation was removed and the wrapper restored exactly; local measurements remain under artifacts/founder-reboot-check.

Repair prepared: one bounded complete market/account/history reread for valid account data older than1000ms at arrival. Never refresh just a timestamp or combine old history with new equity. Recheck power between reads; reject identity/server/currency changes. Both attempts still face the unchanged strict day freshness guard. No retry for missing identity/invalid equity/future stamps. Repeated stale data, read failure or missing history remain blocked. Day diagnostics now distinguish missing/invalid equity, future timestamps and stale data, and reject infinite equity.

Validation: regression red→green for eight retry cases and one diagnostic/nonfinite test. All328 selected Founder/radar/day/risk tests passed. Independent focused review: no actionable issues. This is a tested offline recovery mechanism, not a proven diagnosis or activated production fix.

Activation remains pending: JS modules are cached in production process25844. Patrice requested continuous operation; no stop/restart/ON action was performed. Production ON revision24, zero process restarts, fresh market events, confirmed existing demo day baseline, no trading intents or live-enabled events. Budgets CHF20/day,CHF2.50/root task,CHF150/original30days and risk5%/15%/30% unchanged.
