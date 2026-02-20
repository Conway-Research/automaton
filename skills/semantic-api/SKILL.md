---
name: semantic-api
description: Discover and call any API through Semantic API's universal gateway. Supports API keys and x402 USDC micropayments.
auto-activate: true
version: "1.3.0"
author: "Cove AI"
requires:
  env: []
---

# Semantic API — Universal API Discovery & Calling

You have access to Semantic API, a universal API discovery and execution service. When you need to interact with ANY external API or service, use this skill to find it, understand it, and call it.

**163 providers. 771 capabilities. Plain English.**

## Three Interfaces

| Interface | Install | Best For |
|-----------|---------|----------|
| **CLI** | `pip install semanticapi-cli` | Terminal developers |
| **MCP Server** | `pip install semanticapi-mcp` | Claude Desktop / ChatGPT |
| **REST API** | `https://semanticapi.dev` | Agent frameworks |

## CLI Quick Start

```bash
pip install semanticapi-cli
semanticapi config set-key YOUR_KEY
semanticapi discover stripe
semanticapi query "send an SMS via Twilio"
semanticapi preflight "process a payment"
semanticapi batch "get stock price" "search the web" "send email"
```

## Two Modes

| Mode | Endpoint | Use When |
|------|----------|----------|
| **Discovery** | `POST /api/query` | You want to find the right API and call it yourself. Returns provider, endpoint, auth setup, and code snippets. |
| **Execution** | `POST /api/query/agentic` | You want Semantic API to call the API for you. Returns the actual API response. Requires stored credentials. |

Use **Discovery** when you can make HTTP calls yourself. Use **Execution** when you want one endpoint to handle everything.

## Endpoints

| Endpoint | Method | What It Does | x402 Price |
|----------|--------|-------------|------------|
| `/api/query` | POST | **Discovery** — natural language → matched API + code snippets | $0.01 USDC |
| `/api/query/agentic` | POST | **Execution** — natural language → actual API response | $0.01 USDC |
| `/api/query/batch` | POST | Batch up to 10 discovery queries in one call | $0.05 USDC |
| `/api/query/preflight` | POST | Check if a query would match (free, no LLM) | Free |
| `/api/discover/search` | POST | Find a specific provider/API by name + intent | $0.05 USDC |
| `/api/discover/from-url` | POST | Deep analysis of any API from its URL/docs | $0.10 USDC |

**Base URL:** `https://semanticapi.dev`

## Authentication

Two options — use whichever your agent supports:

```bash
# Option 1: API Key (X-API-Key header)
curl -s "https://semanticapi.dev/api/query" \
  -H "X-API-Key: sapi_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"query": "send an SMS"}'

# Option 2: API Key (Authorization Bearer header)
curl -s "https://semanticapi.dev/api/query" \
  -H "Authorization: Bearer sapi_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"query": "send an SMS"}'
```

Without an API key, priced endpoints return HTTP 402 with x402 USDC payment info (see below).

## How to Use

### 1. Search for an API by Query
```bash
curl -s "https://semanticapi.dev/api/query" \
  -X POST -H "Content-Type: application/json" \
  -d '{"query": "send a transactional email"}' | jq .
```

### 2. Find a Specific Provider
```bash
curl -s "https://semanticapi.dev/api/discover/search" \
  -X POST -H "Content-Type: application/json" \
  -d '{"provider_name": "sendgrid", "user_intent": "send an email"}' | jq .
```

### 3. Analyze an API from URL
```bash
curl -s "https://semanticapi.dev/api/discover/from-url" \
  -X POST -H "Content-Type: application/json" \
  -d '{"url": "https://docs.stripe.com/api"}' | jq .
```

### 4. Free Pre-Check
```bash
curl -s "https://semanticapi.dev/api/query/preflight" \
  -X POST -H "Content-Type: application/json" \
  -d '{"query": "send an SMS via twilio"}' | jq .
```

### 5. Batch Queries (up to 10)
```bash
curl -s "https://semanticapi.dev/api/query/batch" \
  -X POST -H "Content-Type: application/json" \
  -d '{"queries": ["send an SMS", "process a payment", "search the web"]}' | jq .
```

## x402 Payment Protocol

For agents without API keys, Semantic API supports [x402](https://www.x402.org/) — HTTP 402 micropayments in USDC on Base.

**Flow:**
1. Make a request without auth → get `402 Payment Required`
2. Response headers include payment details:
   - `X-Payment-Amount`: price in USDC (e.g., `0.01`)
   - `X-Payment-Address`: recipient wallet
   - `X-Payment-Network`: `eip155:8453` (Base mainnet)
3. Send USDC payment, include proof in `X-Payment` header
4. Retry the request with the payment header → get your response

This is ideal for autonomous agents with crypto wallets — no signup, no API keys, just pay and use.

## What You Can Search For

163 providers across every category:

- **Payments**: Stripe, Square, PayPal, Braintree
- **Communication**: Twilio, SendGrid, Resend, Vonage, Mailgun
- **AI/ML**: OpenAI, Anthropic, Hugging Face, Replicate
- **Data**: Alpha Vantage, CoinGecko, OpenWeatherMap
- **DevOps**: GitHub, GitLab, Vercel, Fly.io, Cloudflare
- **Productivity**: Todoist, Notion, Linear, Slack, Discord
- **Search**: Tavily, Brave Search, Serper, SerpAPI
- **Storage**: AWS S3, Pinecone, Supabase, Firebase
- **And 130+ more** — if it has an API, we probably index it

## Tips for Agents

1. **Start with preflight** — it's free and tells you if a query will match
2. **Use batch for multiple lookups** — cheaper than individual queries
3. **Cache results** — provider schemas don't change often
4. **Auto-discover unknown APIs** — `/api/discover/from-url` can analyze any API docs page

## Links

- **API**: https://semanticapi.dev
- **Docs**: https://semanticapi.dev/docs
- **CLI**: https://pypi.org/project/semanticapi-cli/
- **MCP Server**: https://pypi.org/project/semanticapi-mcp/
- **Open Source Engine**: https://github.com/peter-j-thompson/semanticapi-engine
- **Skill Repo**: https://github.com/peter-j-thompson/semantic-api-skill
