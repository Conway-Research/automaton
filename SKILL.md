---
name: xproof
description: "Certify your outputs on MultiversX blockchain -- create immutable, verifiable proofs of work that other agents and humans can independently verify. Prove the value you create."
auto-activate: true
requires:
  bins:
    - curl
    - sha256sum
  env: []
---

# xProof -- On-Chain Output Certification

You can use xProof to create **immutable, cryptographic proofs** that your work exists and was authored by you -- recorded on the MultiversX blockchain. Any agent or human can independently verify these proofs.

This is how you prove the value you create. A certification is permanent, timestamped, and publicly verifiable.

**Base URL:** `https://xproof.app`

## When to Use This Skill

- After completing a deliverable (code, report, analysis, file) -- certify it to prove you did the work.
- Before sending outputs to another agent -- certify first so they can verify authenticity.
- When you need to build a verifiable track record of your contributions.
- When a client, creator, or peer agent asks for proof of work.

## Authentication

Two methods are available. Choose based on your situation:

### Option A: API Key (recommended if you have one)

Include the key in the `Authorization` header:

```
Authorization: Bearer pm_your_api_key_here
```

Store your API key in the environment variable `XPROOF_API_KEY` if available.

### Option B: x402 Payment Protocol (no account needed)

Send a request without auth -- you will receive an HTTP 402 response with payment requirements. Sign a USDC payment on Base (chain eip155:8453) and resend the request with the `X-PAYMENT` header. Starting at **$0.05 per certification** -- price decreases as the network grows (all-time volume). Current pricing: https://xproof.app/api/pricing. No account or API key required.

## Core Operations

### 1. Hash a File

Before certifying, compute the SHA-256 hash of the file:

```bash
sha256sum /path/to/file | awk '{print $1}'
```

For content you generated in memory, write it to a file first, then hash it.

### 2. Certify a Single File -- `POST /api/proof`

```bash
curl -s -X POST https://xproof.app/api/proof \
  -H "Authorization: Bearer $XPROOF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_hash": "<64-char-sha256-hex>",
    "filename": "report.pdf",
    "author_name": "your-automaton-name"
  }'
```

**Request body:**

| Field         | Type   | Required | Description                              |
|---------------|--------|----------|------------------------------------------|
| `file_hash`   | string | yes      | SHA-256 hex hash (exactly 64 characters) |
| `filename`    | string | yes      | Original filename                        |
| `author_name` | string | no       | Defaults to "AI Agent"                   |
| `webhook_url` | string | no       | HTTPS URL to receive confirmation        |

**Response (success):**

```json
{
  "proof_id": "uuid",
  "status": "certified",
  "file_hash": "abc123...",
  "filename": "report.pdf",
  "verify_url": "https://xproof.app/proof/uuid",
  "certificate_url": "https://xproof.app/api/certificates/uuid.pdf",
  "proof_json_url": "https://xproof.app/proof/uuid.json",
  "blockchain": {
    "network": "MultiversX",
    "transaction_hash": "txhash...",
    "explorer_url": "https://explorer.multiversx.com/transactions/txhash..."
  },
  "timestamp": "2026-02-19T00:00:00.000Z"
}
```

If the file was already certified, you get the existing proof back with the same structure.

### 3. Certify Multiple Files -- `POST /api/batch`

Certify up to 50 files in a single call:

```bash
curl -s -X POST https://xproof.app/api/batch \
  -H "Authorization: Bearer $XPROOF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [\
      {"file_hash": "<hash1>", "filename": "output1.txt"},\
      {"file_hash": "<hash2>", "filename": "output2.py"}\
    ],
    "author_name": "your-automaton-name"
  }'
```

### 4. Verify a Proof

Two endpoints are available to retrieve and verify an existing certification:

**API endpoint** -- `GET /api/proof/:id` -- returns the full certification record:

```bash
curl -s https://xproof.app/api/proof/<proof_id>
```

**Structured JSON proof** -- `GET /proof/:id.json` -- returns a machine-readable proof document:

```bash
curl -s https://xproof.app/proof/<proof_id>.json
```

**Human-readable page** -- share `https://xproof.app/proof/<proof_id>` with anyone who wants to verify visually in a browser.

## Recommended Workflow

1. Complete your work and write the output to a file.
2. Hash the file: `sha256sum output.txt | awk '{print $1}'`
3. Certify: `POST /api/proof` with the hash and filename.
4. Store the `proof_id` and `verify_url` from the response.
5. Share the `verify_url` with anyone who needs to verify your work.

## Why This Matters for Survival

Your survival depends on demonstrating value. An xProof certification is **cryptographic evidence** -- recorded on MultiversX blockchain -- that you produced a specific output at a specific time. No one can dispute it, forge it, or take it from you. When you need to prove your worth to your creator, to clients, or to other agents, point them to your verify URL. The blockchain speaks for itself.
