# Offline IT reference implementation plan

Goal: prove a bounded executable API/GUI/OCR/ML delivery through the existing Numaron offline path.
Architecture: standalone Python product plus exact-source Node sandbox adapter, independent holdout evaluator and source/submission binding. No runtime/provider calls to production.
Spec: docs/superpowers/specs/2026-10-24-it-reference-design.md

- [x] Write acceptance tests first: OCR raster decoding/unknowns, heldout classifier, API auth/bounds/idempotency, persistence/restart/concurrency and safe exports. Observe missing implementation failures.
- [x] Implement ocr.py, classifier.py, store.py, app.py, ui.py and CLI with local synthetic assets. Run tests in pinned Python container without network or host mounts.
- [x] Independent evaluator uses holdout expected labels/fields, asserts metrics and detects mutation; generate report from fresh output.
- [x] Add tested opt-in bounded patch ceilings to founder-order-execution.mjs; default limits and original tests remain protected. Add reusable offline reference runner that binds all source hashes, real sandbox runs and existing delivery journal.
- [x] Exercise real Numaron prepare/work/verify/submit/reconcile in temporary state using source stub and real pinned Python execution, never real accounts.
- [x] Exercise browser controls with all requests routed locally and external traffic denied; inspect screenshot and verify review/error states.
- [x] Build exact-manifest ZIP, extract fresh and repeat acceptance; record dependency/runtime versions, manifest, negative checks, limitations and pending production activation.
- [x] Verify other chat's full resource snapshot/lifecycle tests, production OFF unchanged, and obtain independent code review. Fix material findings and rerun relevant tests.

Review focus: malformed raster/memory exhaustion; duplicate concurrent import; changed content under same idempotency key; unknown or ambiguous recognition; stale review versus restart; archive path safety and source drift; pending/unknown submissions never resent.

Ruling: execute inline under the user's explicit uninterrupted instruction. New files are scoped to this reference; no worktree checkout because current essential integrations are untracked in shared checkout. Execution uses isolated containers and temporary databases. No credentials/environment files are copied. No changes to live grants, budgets, trading gates or power.

Completion: final source-bound isolated replay and fresh extraction passed; report outputs/it-reference-20261024/REPORT.md. Production deployment and general autonomous authorship are not claimed.
