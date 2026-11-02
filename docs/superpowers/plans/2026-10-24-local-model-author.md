# Local model installation and real author run

Goal: replace absent local inference with genuine isolated model generation, then complete a new project without a prepared solution.
Spec: docs/superpowers/specs/2026-10-24-local-model-author-design.md

- [ ] Download public model/runtime, verify publisher-recorded hashes and preserve provenance/license. Build a separate CPU image without changing shared VM resources.
- [ ] Probe actual isolation and run a small schema-constrained local inference. Record model/image/runner bindings.
- [ ] Add failing tests and implement receipt-bound local adapter, strict JSON schema responses, request journal/reconciliation and explicit extended local time budget (old default unchanged).
- [ ] Freeze new requirements and independent acceptance before generation; run design -> implementation -> real tests -> model repairs -> exact-source package.
- [ ] Re-execute extracted package in isolation, independent code/evidence review, fix controller defects with tests and let the model fix its own code. Record failed attempts honestly.
- [ ] Update continuation evidence with a new source-bound result. Recheck OFF101. No production import, restart, batch apply, real customer submission or trading.

Ruling: user explicitly authorized implementation/downloads without further design approval. Downloads are setup-only; proof run remains offline. CPU inference is chosen to fit the existing VM and avoid driver/VM/production changes. This establishes a bounded task capability, not unrestricted complex-project reliability.
