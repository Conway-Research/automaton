# Document Operations Desk — reference acceptance contract

Synthetic offline software project; neither a customer award nor a funded order.

1. Import actual grayscale PNG (8-bit, noninterlaced) or P5 PGM raster documents through an authenticated JSON API. Bound size to 1,200,000 pixels, width/height to 1,600, and unique alphanumeric import keys to 80 characters. Invalid PNG checksums, decompression excess, truncated bodies and conflicting key reuse must fail.
2. Recognize supported upright printed uppercase A–Z, digits and spaces in the fixture font/cell layout. There is no text-layer extraction or lookup of expected answers. Unknown glyphs and inadequate contrast must abstain.
3. Fit a reproducible multinomial Naive Bayes model on the 24 training texts; predict invoice, order or support with a 0.78 confidence threshold and known-word coverage checks. Unknown inputs abstain. Holdout labels never train the model.
4. Extract one document ID and, for invoice/order, one integer minor-unit total and currency CHF/EUR/USD. Duplicate or missing required values are not silently selected. No financial decisions or payments.
5. Persist import, OCR checkpoint, classification and versioned approval/rejection in SQLite. Retry after interruption resumes the saved phase; duplicate imports do not create jobs, and stale decisions fail. All unresolved jobs block aggregate export. Unknown results cannot be approved.
6. Provide interactive browser import, processing, detailed result review, approval/rejection and CSV download. Use textContent for untrusted text, no external resources, no persisted browser token. The bundled server binds loopback only, validates Host/Origin, requires a local token for API calls, and serves no arbitrary files.
7. Deliver source, fixtures, tests, CLI, model export and usage instructions. Reproduce tests after fresh extraction without package downloads. Source/package hashes bind the evidence. A deliberately corrupted total/class must fail the independent evaluator.
8. Run the project through Numaron's real order engine and real pinned network-none Python sandbox, with temporary synthetic contracts and recipient. Lose the submission acknowledgement after recipient commit, restart the temporary engine, and reconcile once without duplicate submission. This is simulated source integration, no production grant.

Scope: synthetic printed forms in the documented font and layout; no handwriting, arbitrary PDFs, arbitrary fonts, unrestricted installations, confidential documents or general learned software authorship claim. The implementation is authored by Codex in this chat. Numaron's existing engine executes and verifies the reviewed patch automatically; no production model session is started.
