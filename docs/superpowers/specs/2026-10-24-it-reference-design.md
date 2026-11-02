# Offline IT reference: Document Operations Desk

User authorization: 24 October 2026, complete uninterrupted isolated offline implementation; production remains OFF.

Build an end-to-end local document intake product: authenticated JSON API, interactive browser GUI, genuine pixel-to-text OCR, trained text classifier, durable SQLite workflow, reviewer decisions, structured CSV/JSON export and a verified delivery package. Use only synthetic documents. No external providers, downloads, customer data or production registrations. Tests and fake submissions use temporary state.

Approach chosen by implementer: Python standard library runtime, original synthetic rendered glyph assets, template OCR with explicit supported printed-character limits, multinomial Naive Bayes trained on separate text examples; vanilla HTML/JS embedded as Python text. Reuse the existing pinned, network-none Numaron Python sandbox and order delivery journal. A cloud model would violate offline constraints; a collection of mock profile names would not demonstrate execution.

Acceptance: exact held-out document fields; measured OCR character/field accuracy and classifier confusion matrix with confidence abstention; API authentication/input validation/idempotency/stale review protection; crash and restart recovery; real browser upload/process/review/export interactions; independent evaluator must fail on deliberately corrupted output; source/package hashes and fresh extracted package execution; exact-once simulated source submission and lost-ack reconciliation through existing Numaron machinery.

Restrictions: supported printed uppercase Latin A-Z, digits and spaces on synthetic raster forms. No handwriting, arbitrary fonts, real invoices, unrestricted PDFs, production execution or inferred payment. Model evaluation is a synthetic benchmark, not a generalization claim. Runtime needs Python 3.11+; optional author-side fixture generation uses existing bundled Pillow; delivered product has zero external Python dependencies.

Resource planning is being edited by the other active chat. Do not edit those files; verify its finished resource snapshot/lifecycle tests and document any remaining boundary. Real assignment, customer permission, scope and funding remain absent, never manufacture them.

All new project files live in packages/numaron-it-reference, evidence in outputs/it-reference-20261024. Existing untracked production work is intentionally not reset or moved. The container and temporary volumes provide execution isolation; no production runtime restart.
