# Autonomous offline project author implementation plan

Goal: implement the missing generation and repair loop without substituting a prepared patch for real model proof.
Architecture: scoped persistent author session + trusted offline model boundary + existing pinned code sandbox + independent acceptance + bound package.
Spec: docs/superpowers/specs/2026-10-24-project-author-design.md

- [x] Add failing tests for requirements/design validation, immutable acceptance, generated files, repair feedback, no model block, restart/ambiguous inference, failure limits, cancellation, exact-source packaging and provenance.
- [x] Implement bounded contract and author session. Preserve requirement and acceptance digests, durable inference IDs and source-bound results.
- [x] Implement source ZIP with immutable acceptance and design manifest, verify with independent Python zipfile in real container.
- [x] Exercise a scripted model with the real sandbox, recording it explicitly as controller-only proof. An incomplete first attempt must fail and feedback repair must pass; no prerecorded test result.
- [x] Expose an optional offline-development task adapter through the existing runtime adapter interface, without changing production provider/budget/power configuration. New-project file creation is intentionally not squeezed into the legacy existing-file patch adapter. Actual local-model generation remains blocked if no runtime/model exists.
- [x] Independent review, fix material findings, rerun relevant checks and write source-bound report/index. Production OFF rechecked; no restart or external calls.

Ruling: proceed inline under user's continuing uninterrupted authorization. Use new scoped files in current checkout because essential existing code is untracked; executable candidates only enter temporary network-none containers. No production AI or hosted-model fallback is allowed for offline inference.

- [ ] Real local model runtime/weights and independent inference receipts; genuine unseen-project authorship run (blocked: offline-model-required).
