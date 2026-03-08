# MCP Server

xProof exposes a Model Context Protocol (MCP) JSON-RPC 2.0 endpoint for AI agent integration.

## Endpoint

```
POST https://xproof.app/mcp
```

**Authentication:** API Key (`Authorization: Bearer pm_...`)

**Content-Type:** `application/json`

## Available Tools

### `certify_file`

Create a blockchain certification for a file.

**Parameters:**

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `file_hash` | string | Yes | SHA-256 hash (64 hex characters) |
| `filename` | string | Yes | Original filename with extension |
| `author_name` | string | No | Name of the certifier (default: "AI Agent") |
| `webhook_url` | string | No | HTTPS URL for on-chain confirmation callback |

**Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "certify_file",
    "arguments": {
      "file_hash": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd",
      "filename": "report.pdf",
      "author_name": "MyAgent"
    }
  }
}
```

**Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "{\"proof_id\":\"uuid-v4\",\"status\":\"certified\",\"file_hash\":\"a1b2c3...\",\"filename\":\"report.pdf\",\"verify_url\":\"https://xproof.app/proof/uuid-v4\",\"certificate_url\":\"https://xproof.app/api/certificates/uuid-v4.pdf\",\"blockchain\":{\"network\":\"MultiversX\",\"transaction_hash\":\"abc123...\",\"explorer_url\":\"https://explorer.multiversx.com/transactions/abc123...\"},\"timestamp\":\"2026-02-19T12:00:00.000Z\"}"
    }]
  }
}
```

---

### `verify_proof`

Verify an existing certification by UUID.

**Parameters:**

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `proof_id` | string | Yes | UUID of the certification to verify |

**Example:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "verify_proof",
    "arguments": {
      "proof_id": "uuid-v4"
    }
  }
}
```

---

### `get_proof`

Retrieve a proof in structured JSON or Markdown format.

**Parameters:**

| Parameter | Type | Required | Description |
|:---|:---|:---|:---|
| `proof_id` | string | Yes | UUID of the certification |
| `format` | string | No | `json` (default) or `md` |

Use `md` format for LLM consumption -- produces human-readable Markdown with all proof details.

---

### `discover_services`

List xProof capabilities, pricing, and usage guidance. No parameters required.

**Returns:** Service description, pricing ($0.05/cert in EGLD), list of tools, certification triggers, batch API details, and supported protocols.

## Discovery

| Endpoint | Description |
|:---|:---|
| `GET /mcp` | MCP capability discovery (tool list) |
| `GET /.well-known/mcp.json` | MCP server manifest |

## LLM Prompt Engineering

When exposing xProof to an LLM, use:

> **Skill: Certify**
> "Use this to create an immutable blockchain proof for a file. Compute SHA-256 of the file content, then call certify_file with the hash and filename. Cost: $0.05."

> **Skill: Verify**
> "Use this to check if a file has been certified. Pass the proof UUID to verify_proof. Returns blockchain transaction, timestamp, and verification status."
