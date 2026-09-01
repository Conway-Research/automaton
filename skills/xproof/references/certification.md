# Certification API

REST endpoints for creating and verifying blockchain certifications on MultiversX.

## Endpoints

### `POST /api/proof` -- Certify a Single File

Creates an immutable certification on MultiversX mainnet.

**Authentication:** API Key (`Authorization: Bearer pm_...`) or x402 payment.

**Request:**

```json
{
  "file_hash": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
  "filename": "report.pdf",
  "author_name": "MyAgent",
  "webhook_url": "https://your-agent.com/hooks/xproof"
}
```

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `file_hash` | string | Yes | SHA-256 hash (64 hex characters) |
| `filename` | string | Yes | Original filename with extension |
| `author_name` | string | No | Name of the certifier (default: "AI Agent") |
| `webhook_url` | string | No | HTTPS URL for on-chain confirmation callback |

**Response (200):**

```json
{
  "id": "uuid-v4",
  "status": "certified",
  "file_hash": "a1b2c3...",
  "filename": "report.pdf",
  "author_name": "MyAgent",
  "verify_url": "https://xproof.app/proof/uuid-v4",
  "certificate_url": "https://xproof.app/api/certificates/uuid-v4.pdf",
  "badge_url": "https://xproof.app/badge/uuid-v4",
  "blockchain": {
    "network": "MultiversX",
    "transaction_hash": "abc123...",
    "explorer_url": "https://explorer.multiversx.com/transactions/abc123..."
  },
  "timestamp": "2026-02-19T12:00:00.000Z"
}
```

**Duplicate handling:** If the same `file_hash` has already been certified, the existing certification is returned (no duplicate charge).

---

### `POST /api/batch` -- Batch Certify (up to 50 files)

**Authentication:** API Key or x402 payment.

**Request:**

```json
{
  "files": [
    { "file_hash": "abc123...", "filename": "model.bin" },
    { "file_hash": "def456...", "filename": "data.csv" }
  ],
  "author_name": "MyAgent",
  "webhook_url": "https://your-agent.com/hooks/xproof"
}
```

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `files` | array | Yes | Array of `{file_hash, filename}` objects (max 50) |
| `author_name` | string | No | Name of the certifier |
| `webhook_url` | string | No | HTTPS URL for on-chain confirmation callback |

**Response (200):** Array of certification results (same structure as single).

---

### `GET /api/proof/:id` -- Verify a Certification

**Authentication:** Public (no auth required).

**Response (200):**

```json
{
  "id": "uuid-v4",
  "status": "certified",
  "verified": true,
  "file_hash": "a1b2c3...",
  "filename": "report.pdf",
  "author": "MyAgent",
  "blockchain": {
    "network": "MultiversX",
    "transaction_hash": "abc123...",
    "explorer_url": "https://explorer.multiversx.com/transactions/abc123..."
  },
  "timestamp": "2026-02-19T12:00:00.000Z"
}
```

---

### `GET /proof/:id` -- Human-Readable Proof Page

Returns an HTML page with full certification details. Public.

### `GET /proof/:id.json` -- Structured Proof Document

Returns a JSON document with complete proof metadata. Public.

### `GET /api/certificates/:id.pdf` -- PDF Certificate

Returns a downloadable PDF certificate with QR code. Public.

### `GET /badge/:id` -- Dynamic SVG Badge

Returns a shields.io-style SVG badge showing certification status:
- **Verified** (green) -- hash found on-chain
- **Pending** (yellow) -- awaiting confirmation
- **Not Found** (red) -- no matching hash

Embed in Markdown:

```markdown
![xProof Certified](https://xproof.app/badge/<proof_id>)
```

---

## Webhook Payload

When a certification is confirmed on-chain, xProof sends a POST to the `webhook_url`:

```json
{
  "event": "proof.confirmed",
  "proof_id": "uuid-v4",
  "file_hash": "a1b2c3...",
  "filename": "report.pdf",
  "blockchain": {
    "network": "MultiversX",
    "transaction_hash": "abc123...",
    "explorer_url": "https://explorer.multiversx.com/transactions/abc123..."
  },
  "timestamp": "2026-02-19T12:00:00.000Z"
}
```

**Security:** HMAC-SHA256 signature in `X-Webhook-Signature` header.
**Retry:** 3 attempts with exponential backoff.

## Error Codes

| Code | Meaning |
|:---|:---|
| `400` | Invalid request (missing/malformed file_hash or filename) |
| `401` | Missing or invalid API key |
| `402` | Payment required (x402 mode) |
| `409` | File already certified (returns existing certification) |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
