# Document Operations Desk

Offline reference product for a bounded document workflow with API, browser GUI, template OCR, trained Naive Bayes classification, SQLite checkpoints, review and CSV export. Uses Python 3.11+ standard library only. No cloud account, API key, runtime install, network provider or package download.

## Run in a disposable workspace

Extract the delivery ZIP into a new directory. Run `python -B verify_delivery.py` before executing the product; it checks file hashes and rejects unexpected files, including executable bytecode caches. Use `-B` in the commands below to avoid creating caches. This is an integrity check, not a digital signature. Create a separate writable `state` directory. Open a terminal in the extracted project directory. In PowerShell:

```powershell
New-Item -ItemType Directory state
$env:DESK_TOKEN = 'replace-with-your-own-local-random-token'
python -B cli.py serve --state state/demo.db --port 8765
```

Open `http://127.0.0.1:8765`. Enter the same local token, choose a supported grayscale PNG or PGM, give it a unique import key and click **Importieren**. Click **Verarbeiten**, inspect the recognized text, prediction and extracted fields, then **Freigeben** or **Ablehnen**. Uncertain/incomplete recognition can only be rejected in this version; correct and reimport the original raster under a new key. Once all documents are decided, click **CSV erstellen** and download. Stop with Ctrl+C. State survives restart. No server starts automatically on import.

To create a sample PNG from the supplied synthetic fixtures:

```powershell
python -c "import json,base64; from pathlib import Path; d=json.loads(Path('fixtures/holdout.json').read_text()); Path('sample.png').write_bytes(base64.b64decode(d[0]['image']))"
```

The token protects a local demo; do not expose this development server on the internet. Do not use personal or confidential documents. No system is changed to ON, no production account is configured and no financial action is implemented.

## Verify

```powershell
python -B -m unittest discover -s tests -v
python -B evaluate.py fixtures/evaluation.json state/evaluation
```

The Numaron integration acceptance runner lives in the parent repository at `scripts/founder-it-reference.mjs`. It uses the existing pinned Python container, no network and no host mounts. The ZIP is a standalone Python product; it intentionally does not include the whole Numaron runtime or its credentials.

## API

All `/api` requests need `Authorization: Bearer <local token>`.

- `POST /api/jobs`: `{ "key": "import-001", "image": "<base64 PNG or PGM>" }`. Returns 201 on first import, 200 on exact retry, 409 for changed bytes under the same key.
- `GET /api/jobs`: list persisted jobs.
- `GET /api/jobs/<id>`: exact current result/version.
- `POST /api/jobs/<id>/process`: `{}`; checkpointed recognition/classification. Retrying an already processed document does no work.
- `POST /api/jobs/<id>/review`: `{ "version": 3, "decision": "approved" }` or `rejected`; stale versions fail.
- `GET /api/export`: approved structured rows and CSV; pending reviews block it, rejected documents are excluded.

Amounts are integer minor units (e.g. 17001 means 170.01), never binary floating-point currency. The CSV includes only constrained IDs, class labels, numbers and currency enums, not raw OCR text.

## Evidence and limits

The 18 development documents were used during implementation. The 12 additional evaluation documents were generated after the first implementation and use separate phrases, IDs, totals, currency and raster sizes. Model fitting reads training.json only; the OCR template reads glyphs.json only. Evaluation reports precision/recall/confusion matrix, character error rate, exact documents/fields and corruption detection. These small synthetic sets establish this contract, not real-world production accuracy.

Supported OCR: fixed-cell upright Aileron uppercase Latin and digits, high-contrast grayscale PNG/PGM. Template OCR is genuine pixel matching but deliberately narrow. Arbitrary fonts, handwriting, skewed pages, RGB PNG, PDFs and multilingual OCR require a separately tested adapter. Fixtures were rendered locally with the already bundled Pillow default font; Pillow/font files are not needed by the delivered runtime. The optional author-side builder is kept in the source repository only.

Naive Bayes provides reproducible local training and inference, not an unrestricted machine-learning platform. The saved model is exported as model.json. GUI tests route all requests to the local API with external traffic blocked. Real HTTP transport is tested separately inside the network-none container.

Authoring provenance: Codex implemented the code and test harness. Numaron's real existing prepare/work/verify/delivery engine applies the reviewed patch and executes it in isolation. The fake source is explicitly synthetic. No claim is made that a production Numaron AI session independently designed arbitrary software while switched off, or that this project proves every more complex IT assignment.
