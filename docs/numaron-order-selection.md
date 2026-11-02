# Relaxed order screening

Implemented 2026-10-18 at Patrice's request. No production restart or power change.

`scripts/founder-order-selection.mjs` is a pure screening stage. Existing monitor
observations retain bounded metadata; their latest revision is ranked in the
opportunity store and exposed by `openOrderRestoration().status().selection`.
The original observation history remains intact. No order registration is inferred.

- `propose`: enough listing information for a conditional proposal draft.
- `clarify`: missing or stale information produces specific questions. This
  includes payment/acceptance/AI rules, missing adapter, application fee and scope.
- `exclude`: closed/filled/cancelled listing, explicit eligibility mismatch,
  worker deposit, identity misrepresentation, prohibited AI use or incompatible work.

At most 30 proposals receive preference. 31–60 can still be a proposal for a strong
fit. More than 60 triggers a question about an unfilled bounded milestone, not
deletion. Large scopes trigger a paid first-milestone question. Fees trigger a
question about a permitted free route; they never authorize payment. Evidence
older than seven days, invalid dates and expired deadlines require reconfirmation.

Listing claims are never authority: every selection has `executionAuthorized`,
`paymentVerified` and `contactAuthorized` false. Questions are drafts in the status,
not automatically sent messages. Existing reviewed communication adapters and
authorization are still required to send. This change does not create adapters,
expand supported runtime profiles or bypass action, budget, funding or OFF guards.
It also does not estimate profitability from missing price/cost evidence.

The unchanged execution path must independently verify assignment, scope, funding,
budget, isolation and delivery. No existing limited-postpayment policy was edited.

Synthetic samples and rerun commands: `examples/numaron-portfolio/README.md`.

Offline verification:

```powershell
node --import tsx --test scripts/founder-order-selection.test.mjs scripts/founder-order-selection.integration.test.mjs scripts/founder-orders.test.mjs scripts/founder-order-flow.test.mjs scripts/founder-order-execution.test.mjs
python -I -B -m unittest discover -s examples/numaron-portfolio -p test_samples.py -v
```

Node tests use temporary databases and fake source/payment/runtime adapters;
Python tests use in-memory invented inputs and injected fake transports. This is
state/adapter isolation, not a claim of a new OS-level sandbox certification.
