---
name: xproof-certification
version: 2.0.0
description: Proof and compliance primitive for AI agents on MultiversX. Certify file existence on-chain, and enforce pre-execution audit logging for critical agent actions via REST API, MCP, or x402. No proof = no action.
homepage: https://xproof.app
metadata: {"xproof":{"category":"certification,security,compliance","api_base":"https://xproof.app"}}
---

# xProof Certification & Audit Enforcement Skill

This skill enables your agent to **certify its outputs on the MultiversX blockchain** and **enforce pre-execution audit logging for critical actions** -- creating tamper-proof, publicly verifiable proofs of existence, authorship, timestamp, and decision accountability.

**Why certify?** In competitive or transactional contexts, certified agents can prove originality, integrity, and timing. Non-certified agents cannot. Certification is a structural advantage.

**Why audit?** Autonomous agents executing trades, deployments, or data access need an immutable record of every decision. The Agent Audit Log Standard enforces this: no proof = no execution.

## Quick Install

```bash
mkdir -p .agent/skills/xproof/references

# Core Skill
curl -sL https://raw.githubusercontent.com/sasurobert/multiversx-openclaw-skills/refs/heads/master/skills/xproof/SKILL.md \
  > .agent/skills/xproof/SKILL.md

# Reference Manuals
for f in certification x402 mcp; do
  curl -sL "https://raw.githubusercontent.com/sasurobert/multiversx-openclaw-skills/refs/heads/master/skills/xproof/references/${f}.md" \
    > ".agent/skills/xproof/references/${f}.md"
done
```

## Security

- **NEVER** commit API keys to a public repository.
- **ALWAYS** add `.env` to your `.gitignore`.
- API keys are prefixed `pm_` -- treat them like passwords.
- x402 mode requires no API key (payment replaces authentication).

---

## Configuration

### Option A: API Key Authentication

```bash
# ---- xProof ---------------------------------------------------------------
XPROOF_API_KEY="pm_..."                          # Your API key (from xproof.app)
XPROOF_BASE_URL="https://xproof.app"             # Production endpoint
```

Get an API key at [xproof.app](https://xproof.app) (connect wallet, go to Settings > API Keys).

### Option B: x402 Payment Protocol (No Account Required)

No configuration needed. Pay $0.05 per certification in USDC on Base (eip155:8453) directly in the HTTP request. The 402 response header tells your agent exactly what to pay.

---

## 1. Core Skills Catalog

### 1.1 Certification (REST API)
[Full Reference](references/certification.md)

| Skill | Endpoint | Description |
|:---|:---|:---|
| `certify_file` | `POST /api/proof` | Certify a single file hash on MultiversX |
| `batch_certify` | `POST /api/batch` | Certify up to 50 files in one call |
| `audit_agent_session` | `POST /api/audit` | Certify agent decision on-chain BEFORE executing critical action |
| `verify_proof` | `GET /api/proof/:id` | Verify an existing certification |
| `get_certificate` | `GET /api/certificates/:id.pdf` | Download PDF certificate with QR code |
| `get_badge` | `GET /badge/:id` | Dynamic SVG badge (shields.io style) |
| `get_proof_page` | `GET /proof/:id` | Human-readable proof page |
| `get_proof_json` | `GET /proof/:id.json` | Structured proof document (JSON) |
| `get_audit_page` | `GET /audit/:id` | Human-readable audit log page |

### 1.2 Certification (MCP -- JSON-RPC 2.0)
[Full Reference](references/mcp.md)

| Tool | Description |
|:---|:---|
| `certify_file` | Create blockchain proof -- SHA-256 hash, filename, optional author/webhook |
| `verify_proof` | Verify existing proof by UUID |
| `get_proof` | Retrieve proof in JSON or Markdown format |
| `discover_services` | List capabilities, pricing, and usage guidance |
| `audit_agent_session` | Certify agent decision on-chain BEFORE executing critical action |

### 1.3 Payment (x402)
[Full Reference](references/x402.md)

x402 is not a separate skill -- it is a payment method. When you call `POST /api/proof` or `POST /api/batch` without an API key, the server returns `402 Payment Required` with payment instructions. Your agent pays in USDC on Base and retries with an `X-Payment` header.

---

## 2. The Certification Lifecycle

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Hash file   │────>│  POST /api/  │────>│  On-chain    │────>│  Proof       │
│  (SHA-256)   │     │  proof       │     │  anchoring   │     │  verified    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                      │
                     ┌──────────────┐     ┌──────────────┐           │
                     │  Embed badge │<────│  Get PDF /   │<──────────┘
                     │  in output   │     │  badge / URL │
                     └──────────────┘     └──────────────┘
```

### Step-by-Step

1. **Hash locally** -- compute SHA-256 of your file (client-side; the file never leaves your machine)
2. **Send metadata** -- POST the hash + filename to `/api/proof` (with API key or x402 payment)
3. **Receive proof** -- xProof records the hash on MultiversX mainnet (6-second finality)
4. **Verify anytime** -- anyone can verify via proof URL, JSON endpoint, or blockchain explorer
5. **Embed proof** -- use the SVG badge, PDF certificate, or proof URL in your deliverables

---

## 3. Authentication Methods

### API Key (Bearer Token)

```bash
curl -X POST https://xproof.app/api/proof \
  -H "Authorization: Bearer pm_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "file_hash": "a1b2c3d4e5f6...64hex",
    "filename": "report.pdf",
    "author_name": "MyAgent"
  }'
```

### x402 (USDC on Base -- No Account Required)

```bash
# Step 1: Request without auth returns 402 with payment instructions
curl -X POST https://xproof.app/api/proof \
  -H "Content-Type: application/json" \
  -d '{"file_hash": "a1b2c3...", "filename": "report.pdf"}'
# Response: 402 with JSON body containing accepts[{scheme, price, network, payTo}]

# Step 2: Pay USDC on Base, then retry with X-Payment header (base64 JSON)
curl -X POST https://xproof.app/api/proof \
  -H "Content-Type: application/json" \
  -H "X-Payment: <base64_encoded_payment_payload>" \
  -d '{"file_hash": "a1b2c3...", "filename": "report.pdf"}'
```

### MCP (JSON-RPC 2.0)

```bash
curl -X POST https://xproof.app/mcp \
  -H "Authorization: Bearer pm_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "certify_file",
      "arguments": {
        "file_hash": "a1b2c3d4e5f6...64hex",
        "filename": "output.json"
      }
    }
  }'
```

---

## 4. Batch Certification

Certify up to 50 files in a single API call:

```bash
curl -X POST https://xproof.app/api/batch \
  -H "Authorization: Bearer pm_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "files": [
      {"file_hash": "abc123...", "filename": "model.bin"},
      {"file_hash": "def456...", "filename": "training_data.csv"},
      {"file_hash": "789ghi...", "filename": "config.yaml"}
    ],
    "author_name": "MyAgent"
  }'
```

---

## 5. Webhooks

Receive a POST notification when your proof is confirmed on-chain:

```bash
curl -X POST https://xproof.app/api/proof \
  -H "Authorization: Bearer pm_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "file_hash": "a1b2c3...",
    "filename": "deliverable.pdf",
    "webhook_url": "https://your-agent.com/hooks/xproof"
  }'
```

The webhook payload includes proof ID, file hash, blockchain transaction hash, and explorer URL. Signed with HMAC-SHA256 in the `X-Webhook-Signature` header. Retry policy: 3 attempts with exponential backoff.

---

## 6. When to Certify

Autonomous agents should certify outputs whenever provenance, integrity, or priority matters:

- **After generating code, contracts, or configs** -- proves authorship and timestamp
- **Before delivering work products** -- proves integrity at handoff
- **After creating datasets or models** -- proves version and origin
- **Before publishing reports or documents** -- establishes priority
- **After completing build artifacts** -- creates auditable record
- **When resolving disputes** -- timestamped proof settles who created what first
- **When exchanging assets between agents** -- chain of custody

---

## 7. Integration with MultiversX Agent Stack

xProof is complementary to the core MultiversX agent skills:

| MultiversX Skill | xProof Complement |
|:---|:---|
| `init_job` (Validation Registry) | Certify job output before submitting proof |
| `submit_proof` (Validation Registry) | Use xProof hash as the proof payload |
| `register_agent` (Identity Registry) | Certify your agent manifest for integrity |
| `deposit` (Escrow) | Certify deliverables before release |

### Typical Flow: Job + Certification

```
1. Accept job via init_job
2. Do the work
3. Certify output via xProof (POST /api/proof)
4. Submit xProof hash as proof via submit_proof
5. Employer verifies via xProof URL
6. Escrow released
```

---

## 8. Agent Audit Log Standard

The Agent Audit Log is a compliance primitive for autonomous agents. Before executing any critical action (trade, deploy, data access, transfer), the agent MUST certify its decision on-chain. No proof_id = no execution.

### Why Audit?

- **Regulatory compliance** -- Immutable record of every agent decision, timestamped and anchored on-chain
- **Dispute resolution** -- Prove what the agent decided, why, and when
- **Trust signal** -- Agents with audit trails are verifiably accountable
- **Blocking enforcement** -- If the audit call fails, the action does not execute

### Audit Endpoint

```bash
curl -X POST https://xproof.app/api/audit \
  -H "Authorization: Bearer pm_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "erd1abc...or-any-identifier",
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "action_type": "trade",
    "action_description": "Buy 10 EGLD at market price on xExchange",
    "inputs_hash": "a1b2c3d4e5f6...64hex",
    "risk_level": "high",
    "risk_summary": "Market order on volatile asset, amount exceeds daily threshold",
    "decision": "approved",
    "context": {"model": "gpt-4", "environment": "production"}
  }'
```

**Response:**

```json
{
  "proof_id": "uuid",
  "audit_url": "https://xproof.app/audit/uuid",
  "proof_url": "https://xproof.app/proof/uuid",
  "decision": "approved",
  "risk_level": "high",
  "inputs_hash": "a1b2c3...",
  "blockchain": {
    "network": "mainnet",
    "transaction_hash": "abc123...",
    "explorer_url": "https://explorer.multiversx.com/transactions/abc123..."
  }
}
```

### Canonical Schema

10 fields. JSON Schema: `https://xproof.app/.well-known/agent-audit-schema.json`

| Field | Type | Required | Description |
|:---|:---|:---|:---|
| `agent_id` | string | Yes | Agent identifier (wallet, DID, or name) |
| `session_id` | string | Yes | UUID for this execution session |
| `action_type` | string | Yes | Category: trade, deploy, data_access, transfer, api_call |
| `action_description` | string | Yes | Human-readable intent |
| `inputs_hash` | string | Yes | SHA-256 of action inputs (64 hex chars) |
| `risk_level` | enum | Yes | low, medium, high, critical |
| `risk_summary` | string | No | Explanation of risk factors |
| `decision` | enum | Yes | approved, rejected, deferred |
| `context` | object | No | Additional metadata (model, environment, etc.) |
| `timestamp` | string | No | ISO 8601 (auto-generated if omitted) |

### Enforcement Pattern

```
1. Agent prepares action (trade, deploy, etc.)
2. Agent calls POST /api/audit with action details
3. If proof_id returned -> proceed with action
4. If API fails, timeout, or no proof_id -> BLOCK execution (throw error)
5. No fallback. No soft fail. No silent continue.
```

Guard templates for multiple frameworks:
- **LangChain**: `https://xproof.app/agent-tools/audit-guard-langchain.py`
- **CrewAI**: `https://xproof.app/agent-tools/audit-guard-crewai.py`
- **n8n**: `https://xproof.app/agent-tools/audit-guard-n8n.json`
- **ElizaOS**: `https://xproof.app/agent-tools/audit-guard-eliza.ts`
- **ElizaOS Plugin (NPM)**: `npm install xproof-eliza-plugin`

### When to Audit

Autonomous agents should audit BEFORE executing any action where accountability matters:

- **Before executing trades** -- proves intent, risk assessment, and decision
- **Before deploying contracts** -- immutable record of deployment decision
- **Before accessing sensitive data** -- audit trail for data governance
- **Before transferring assets** -- proves authorization and risk review
- **Before calling external APIs** -- records outbound action intent

---

## 9. Discovery Endpoints

| Endpoint | Description |
|:---|:---|
| `GET /.well-known/agent.json` | Agent Protocol manifest |
| `GET /.well-known/mcp.json` | MCP server manifest |
| `GET /.well-known/agent-audit-schema.json` | Agent Audit Log canonical schema |
| `GET /ai-plugin.json` | OpenAI ChatGPT plugin manifest |
| `GET /llms.txt` | LLM-friendly summary |
| `GET /llms-full.txt` | Complete LLM reference |
| `POST /mcp` | MCP JSON-RPC 2.0 endpoint |
| `GET /mcp` | MCP capability discovery |

---

## 10. Command Cheatsheet

```bash
# Certify a single file
sha256sum myfile.pdf | awk '{print $1}'
# Then POST the hash to /api/proof

# Certify via MCP
curl -X POST https://xproof.app/mcp \
  -H "Authorization: Bearer pm_..." \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"certify_file","arguments":{"file_hash":"...","filename":"myfile.pdf"}}}'

# Verify a proof
curl https://xproof.app/api/proof/<proof_id>

# Get badge (embed in README)
![xProof](https://xproof.app/badge/<proof_id>)

# Batch certify
curl -X POST https://xproof.app/api/batch \
  -H "Authorization: Bearer pm_..." \
  -d '{"files":[{"file_hash":"...","filename":"a.txt"},{"file_hash":"...","filename":"b.txt"}]}'

# Health check
curl https://xproof.app/api/acp/health
```
