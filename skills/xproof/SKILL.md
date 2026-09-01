---
name: xproof
version: 3.0.0
description: Proof and accountability layer for AI agents. Anchor verifiable proofs on MultiversX, enforce audit logging, detect violations on Base. REST API, MCP, x402. No proof = no action.
homepage: https://xproof.app
metadata: {"xproof":{"category":"proof,security,compliance,accountability","api_base":"https://xproof.app"}}
---

# xProof -- Proof & Accountability Layer for AI Agents

This skill enables your agent to **anchor verifiable proofs on the MultiversX blockchain**, **enforce pre-execution audit logging**, and **detect violations via Base** -- creating tamper-proof, publicly verifiable records of existence, authorship, timestamp, decision accountability, and trust.

**Why anchor proofs?** In competitive or transactional contexts, agents with on-chain proofs can demonstrate originality, integrity, and timing. Agents without proofs cannot. Verifiable proof is a structural advantage.

**Why audit?** Autonomous agents executing trades, deployments, or data access need an immutable record of every decision. The Agent Audit Log Standard enforces this: no proof = no execution.

**Why violations?** Trust requires accountability. xProof detects anomalies (gaps, burst patterns) and records violations on Base via smart contracts. Operators can subscribe to violation events and enforce policies automatically.

## Pricing

**All-time volume pricing** (global pool, not per-user):
- **0 - 100k proofs**: $0.05 per proof
- **100k - 1M proofs**: $0.025 per proof
- **1M+ proofs**: $0.01 per proof

**Free trial**: 10 certifications, no wallet required. Register at https://xproof.app or via POST /api/agent/register.

## Security

- **NEVER** commit API keys to a public repository.
- **ALWAYS** add `.env` to your `.gitignore`.
- API keys are prefixed `pm_` -- treat them like passwords.
- x402 mode requires no API key (payment replaces authentication).

## Configuration

### Option A: API Key Authentication

    XPROOF_API_KEY="pm_..."
    XPROOF_BASE_URL="https://xproof.app"

Get an API key: POST /api/agent/register (10 free certifications, no wallet needed).

### Option B: x402 Payment Protocol (No Account Required)

No configuration needed. Pay $0.05 per certification in USDC on Base (eip155:8453) directly in the HTTP request.

---

## 1. Core Skills Catalog

### 1.1 Certification (REST API)

| Skill | Endpoint | Description |
|:---|:---|:---|
| certify_file | POST /api/proof | Certify a single file hash on MultiversX |
| batch_certify | POST /api/batch | Certify up to 50 files in one call |
| certify_with_confidence | POST /api/proof + timing metadata | Multi-stage decision proof with timing breakdown |
| audit_agent_session | POST /api/audit | Certify agent decision BEFORE executing critical action |
| verify_proof | GET /api/proof/:id | Verify an existing certification |
| get_certificate | GET /api/certificates/:id.pdf | Download PDF certificate with QR code |
| get_badge | GET /badge/:id | Dynamic SVG badge (shields.io style) |
| get_proof_json | GET /proof/:id.json | Structured proof document (JSON) |

### 1.2 Certification (MCP -- JSON-RPC 2.0)

| Tool | Description |
|:---|:---|
| certify_file | Create blockchain proof -- SHA-256 hash, filename, optional author/webhook |
| verify_proof | Verify existing proof by UUID |
| audit_agent_session | Certify agent decision BEFORE executing critical action |
| discover_services | List capabilities, pricing, and usage guidance |

### 1.3 Trust & Violations

| Endpoint | Description |
|:---|:---|
| GET /api/trust/:wallet | Agent Trust Score (0-100) |
| GET /api/leaderboard | Agent Trust Leaderboard |
| GET /api/violations/:wallet | On-chain violation records (Base) |
| GET /api/attestations/:wallet | Domain-specific attestations |

---

## 2. Authentication

### Option A: API Key

Register once, get 10 free certifications:

    curl -s -X POST https://xproof.app/api/agent/register \
      -H "Content-Type: application/json" \
      -d '{"agent_name": "my-agent"}'

Response: {"api_key": "pm_...", "trial_quota": 10}

Use in requests: Authorization: Bearer pm_...

### Option B: x402 (No Account)

Send request without auth -> receive 402 Payment Required -> pay $0.05 USDC on Base -> retry with X-Payment header.

---

## 3. The Proof Lifecycle

    Agent action -> POST /api/audit (pre-execution) -> execute -> POST /api/proof (post-execution)

Each proof anchors: SHA-256 hash, filename, author, timestamp, transaction hash on MultiversX.

**Confidence-Level Anchoring**: record timing at each decision stage (instruction_received_at, reasoning_started_at, action_taken_at) for forensic audit trails.

---

## 4. Violations Layer

xProof monitors agent proof patterns and detects:
- **Gap violations**: missing proofs for critical action windows
- **Burst violations**: abnormal certification frequency

Violations recorded on Base via smart contracts. Subscribe: GET /api/violations/:wallet.

---

## 5. Discovery Endpoints

| Endpoint | Description |
|:---|:---|
| GET /.well-known/agent.json | Agent Protocol manifest |
| GET /.well-known/mcp.json | MCP server manifest |
| GET /llms.txt | LLM-friendly summary |
| GET /llms-full.txt | Complete LLM reference |
| POST /mcp | MCP JSON-RPC 2.0 endpoint |

---

## 6. SDK Support

- **Python SDK** (v0.2.7): LangChain, CrewAI, LlamaIndex, AutoGen, OpenAI Agents, Vercel AI
- **JavaScript SDK** (v0.1.8): Vercel AI, Node.js, Vercel Edge Functions

GitHub: https://github.com/jasonxkensei/xProof
Docs: https://xproof.app/docs
