---
name: proxies-sx
description: Mobile proxy infrastructure for AI agents — buy 4G/5G proxies, launch antidetect browsers, earn USDC as a peer. Pay with USDC via x402 on Base or Solana.
auto-activate: true
version: "1.0.0"
author: "Proxies.sx"
repo: "https://github.com/bolivian-peru/proxies-sx-mcp-server"
requires: {}
---

# Proxies.sx — Mobile Proxy Infrastructure

You have access to Proxies.sx, a mobile proxy infrastructure service for AI agents. Real 4G/5G connections from 155+ physical devices in 6 countries (US, DE, GB, FR, ES, PL). All endpoints accept USDC payments via x402 — no accounts, no API keys needed.

Use this when you need:
- A real mobile IP address (anti-detection, geo-targeting, web scraping)
- An antidetect browser session with unique fingerprint
- To earn USDC passively by sharing bandwidth as a peer

## Buy a Mobile Proxy

Purchase a proxy with automatic x402 payment using your wallet:

```bash
# Step 1: Request proxy (returns 402 with payment info)
curl -s "https://api.proxies.sx/v1/x402/proxy?country=US&traffic=0.1"

# Step 2: Send USDC to the recipient address on Base or Solana, then retry with tx hash
curl -s "https://api.proxies.sx/v1/x402/proxy?country=US&traffic=0.1" \
  -H "Payment-Signature: YOUR_TX_HASH"
```

**If you have x402_fetch available, use it directly:**
```bash
# x402_fetch handles the 402 flow automatically
x402_fetch("https://api.proxies.sx/v1/x402/proxy?country=US&traffic=0.1")
```

Response includes: `host`, `httpPort`, `socksPort`, `username`, `password`, `sessionToken`, `rotationToken`

### Use the Proxy

```bash
# HTTP proxy
curl -x http://USERNAME:PASSWORD@HOST:HTTP_PORT https://api.ipify.org

# SOCKS5 proxy
curl -x socks5://USERNAME:PASSWORD@HOST:SOCKS_PORT https://api.ipify.org

# Rotate IP (free, no payment needed)
curl -s "https://api.proxies.sx/rotate/YOUR_ROTATION_TOKEN"
```

### Pricing

| Type | Price/GB | Min Purchase |
|------|----------|-------------|
| Shared | $4.00 USDC | 0.1 GB ($0.40) |
| Private | $8.00 USDC | 0.1 GB ($0.80) |

Duration is FREE — you only pay for traffic.

### Payment Networks

| Network | Settlement | Recipient |
|---------|-----------|-----------|
| Base | ~2 sec | `0xF8cD900794245fc36CBE65be9afc23CDF5103042` |
| Solana | ~400ms | `6eUdVwsPArTxwVqEARYGCh4S2qwW2zCs7jSEDRpxydnv` |

### Session Management

After purchasing, save the `sessionToken` (format: `x402s_...`) for management:

```bash
# Check session status
curl -s "https://api.proxies.sx/v1/x402/manage/session" \
  -H "X-Session-Token: x402s_YOUR_TOKEN"

# Replace broken port (free, max 3 per session)
curl -s -X POST "https://api.proxies.sx/v1/x402/manage/ports/replace" \
  -H "X-Session-Token: x402s_YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"country":"US"}'

# Top up session with more traffic
curl -s -X POST "https://api.proxies.sx/v1/x402/manage/session/topup" \
  -H "X-Session-Token: x402s_YOUR_TOKEN" \
  -H "Payment-Signature: NEW_TX_HASH" \
  -H "Content-Type: application/json" \
  -d '{"addTrafficGB":1}'
```

## Launch an Antidetect Browser

Cloud Chrome browser with stealth fingerprint and auto-allocated mobile proxy:

```bash
# Create browser session (x402 payment, ~$0.005/min)
x402_fetch("https://browser.proxies.sx/v1/sessions", {
  method: "POST",
  body: JSON.stringify({ durationMinutes: 15, country: "US" })
})

# Control the browser
curl -s -X POST "https://browser.proxies.sx/v1/sessions/SESSION_ID/command" \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"navigate","url":"https://example.com"}'

# Take screenshot + extract text
curl -s -X POST "https://browser.proxies.sx/v1/sessions/SESSION_ID/command" \
  -H "Authorization: Bearer SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"screenshot"}'
```

Identity Bundles: Save and restore complete browser identity (cookies, localStorage, fingerprint, proxy) across sessions by passing `profile_id` on creation.

## Earn USDC as a Peer

Share your bandwidth and earn USDC on Solana:

```bash
# Register as a peer
curl -s -X POST "https://api.proxies.sx/v1/peer/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-automaton","type":"claude","walletAddress":"YOUR_SOLANA_WALLET"}'

# Response: { deviceId, jwt, refreshToken, relay: "wss://relay.proxies.sx" }
# Connect to relay via WebSocket and route traffic to earn per GB
```

| IP Type | Earnings/GB |
|---------|------------|
| Mobile | $0.25 |
| Residential | $0.15 |
| Datacenter | $0.02 |

Min payout: $5 USDC on Solana.

## x402-Gated Data Services

Pay-per-request intelligence APIs (use `x402_fetch` for automatic payment):

| Service | Endpoint | Price |
|---------|----------|-------|
| Mobile SERP Tracker | `GET /v1/x402/serp` | $0.003/query |
| Google Maps Lead Gen | `GET /v1/x402/maps/run` | $0.005/record |
| Job Market Intelligence | `GET /v1/x402/jobs` | $0.005/query |
| Google Reviews | `GET /v1/x402/reviews/search` | $0.01/query |
| Prediction Markets | `GET /v1/x402/predictions` | $0.05/query |

All endpoints at `https://api.proxies.sx`.

## MCP Server (Alternative)

For deeper integration, install the MCP server (55 tools for proxy management, 11 for browser):

```bash
npx -y @proxies-sx/mcp-server    # Proxy MCP (55 tools)
npx -y @proxies-sx/browser-mcp   # Browser MCP (11 tools)
```

## When to Use This

- You need a real mobile IP to avoid blocks or CAPTCHAs
- You need to scrape a website that blocks datacenter IPs
- You need geo-targeted access (specific country)
- You need an antidetect browser for account management
- You want to earn passive USDC income from your network connection
- You need SERP, Maps, Jobs, or Reviews data

## Links

- Skill file: https://agents.proxies.sx/skill.md
- x402 Discovery: https://agents.proxies.sx/.well-known/x402.json
- LLM Reference: https://agents.proxies.sx/llms.txt
- Marketplace: https://agents.proxies.sx/marketplace/
