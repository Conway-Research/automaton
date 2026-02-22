# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is intent-scout-001

On-chain agent company operating as **Intent Solutions Agent Company**. Runs inside a **concentric ring security architecture**: Docker sandbox (inner) → Moat policy gateway (middle) → IRSB on-chain accountability (outer).

- **Display name**: intent-scout-001
- **Agent address**: `0x83Be08FFB22b61733eDf15b0ee9Caf5562cd888d`
- **ERC-8004 ID**: **1319** (Sepolia, IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e`)
- **Model**: gpt-4o-mini (budget: $20)
- **Base balance**: $10 USDC
- **Docker service name**: `scout`
- **Repo**: `github.com/jeremylongshore/intent-scout`

## Build & Run

```bash
# Docker stack (preferred — full security isolation)
docker compose up -d                    # Start 6 containers
docker compose up -d --build scout      # Rebuild after code changes
docker compose logs -f scout            # Watch agent logs
docker compose down                     # Stop everything

# Health checks
curl localhost:8002/healthz             # Moat Gateway
curl localhost:8001/healthz             # Moat Control Plane
docker compose ps                       # Container status

# Bare metal (no security isolation — dev/debug only)
pnpm install
pnpm build
node dist/index.js --run
node dist/index.js --status
```

## Docker Architecture

6 containers, 2 networks, defense-in-depth:

| Container | Network | Purpose |
|-----------|---------|---------|
| scout | sandbox-internal | Agent (no internet, no DNS) |
| moat-gateway | sandbox + external | Policy bridge (only way out) |
| moat-control-plane | sandbox + external | Capability registry |
| moat-trust-plane | sandbox | Reliability scoring |
| postgres | sandbox | Moat database |
| redis | sandbox | Rate limiting / cache |

**Network isolation**: `sandbox-internal` has `internal: true` (no default gateway). intent-scout-001 has `dns: []`. Any `curl`/`wget`/`git` to the internet FAILS at the network layer. Only reachable host: `moat-gateway:8002`.

## Skills (10)

| Skill | Purpose | Routing |
|-------|---------|---------|
| conway-compute | Conway network compute | Direct |
| conway-payments | Conway payment handling | Direct |
| survival | Agent survival logic | Direct |
| service-catalog | Service discovery | Direct |
| job-dispatcher | Work routing | Direct |
| gwi-bridge | GWI code services | Via Moat Gateway |
| irsb-receipts | On-chain receipts | Via Moat Gateway (dry-run) |
| inbox-handler | Message processing | Direct |
| work-hunter | Bounty discovery | Direct |
| bounty-executor | Bounty execution | Via Moat Gateway |

## Heartbeat Tasks

| Task | Interval | Purpose |
|------|----------|---------|
| heartbeat_ping | 15 min | Liveness check |
| check_credits | 6h | Conway credit balance |
| check_usdc_balance | 12h | Base USDC balance |
| check_for_updates | 4h | Software updates |
| health_check | 30 min | System health |
| check_social_inbox | 2 min | Social messages |
| landscape_scan | 30 min | Work opportunity discovery |
| check_economics | 3h | Economic metrics |

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point (propagates openaiApiKey to env) |
| `src/agent/tools.ts` | Tool definitions + FORBIDDEN_COMMAND_PATTERNS |
| `src/conway/client.ts` | Conway API client (exec() at line 68) |
| `src/heartbeat/daemon.ts` | Heartbeat daemon (bypasses credit checks with OpenAI key) |
| `Dockerfile` | Multi-stage build (node:22-slim) |
| `docker-compose.yml` | Full stack: agent + Moat (3 services) + postgres + redis |
| `vitest.config.ts` | Test configuration (Vitest) |
| `packages/cli/` | CLI workspace package |
| `.github/workflows/ci.yml` | CI pipeline (5 jobs: build, test, docker, security, integration) |
| `scripts/integration-test.sh` | Docker stack integration tests (10 test groups) |
| `scripts/seed-capabilities.sh` | Seeds Moat control plane with PolicyBundles |
| `~/.automaton/SOUL.md` | Agent personality/identity |
| `~/.automaton/automaton.json` | Config with API keys (NOT in git) |
| `~/.automaton/heartbeat.yml` | Heartbeat task definitions |
| `~/.automaton/skills/` | Skill definitions (SKILL.md per skill) |
| `~/.automaton/state.db` | SQLite state (chmod 600) |
| `~/.automaton/private_key.txt` | Docker secret for signing |

## Security Notes

- `automaton.json` is in `.gitignore` — never commit (contains API keys)
- `FORBIDDEN_COMMAND_PATTERNS` in `tools.ts` blocks env/credential exfiltration
- Private key signing uses Docker secrets (`scout_private_key`)
- Docker secrets mount private key at runtime
- Container runs as uid 1000 (`user: "1000:1000"`) matching host user

## Moat Integration

intent-scout-001 routes external actions through Moat Gateway at `$MOAT_GATEWAY_URL` (default: `http://moat-gateway:8002`).

The gwi-bridge skill uses `curl -sf -X POST ${MOAT_GATEWAY_URL}/execute/{capability_id}` instead of direct `exec()` calls.

Policy engine enforces: scope checks, daily budget limits, domain allowlists, approval requirements. Default-deny — unregistered capabilities are blocked.

### HTTP Proxy via Moat

All outbound HTTP is routed through Moat's `http.proxy` capability. The scout has **zero direct internet access** — DNS is disabled in the container. The `moatFetch()` helper (`src/landscape/moat-fetch.ts`) wraps all HTTP calls.

**Header**: `X-Tenant-ID: automaton` (required when Moat auth is disabled)

**11 Allowlisted Domains**:

| Domain | Purpose |
|--------|---------|
| `api.github.com` | GitHub Issues/bounty labels |
| `github.com` | GitHub web scraping fallback |
| `api.algora.io` | Algora bounty platform API |
| `console.algora.io` | Algora bounty listings |
| `gitcoin.co` | Gitcoin grants/bounties |
| `indexer.gitcoin.co` | Gitcoin data indexer |
| `api.immunefi.com` | Immunefi Web3 security bounties |
| `immunefi.com` | Immunefi listings |
| `code4rena.com` | Code4rena audit contests |
| `api.sherlock.xyz` | Sherlock audit competitions |
| `app.hats.finance` | Hats Finance bug bounties |

### Bounty Scanners (6)

The landscape scanner (`src/landscape/scanner.ts`) runs 6 concurrent scanners every 30 minutes:

| Scanner | Source | What It Finds |
|---------|--------|---------------|
| GitHub Bounties | `api.github.com` | Issues with bounty/reward labels across top repos |
| Algora | `console.algora.io` | Active bounties with USD rewards |
| Gitcoin | `gitcoin.co` | Active grants rounds and bounties |
| Web3 Audits | `immunefi.com`, `code4rena.com`, `api.sherlock.xyz`, `app.hats.finance` | Smart contract audit contests and bug bounties |
| ERC-8004 Jobs | Moat `erc8004.*` capabilities | On-chain job postings for registered agents |
| ERC-8004 Network | Moat `erc8004.*` capabilities | Agent network opportunities |

## Conventions

- **Commit format**: `<type>(<scope>): <subject>`
- **Build**: `pnpm build` (TypeScript → dist/)
- **Test**: `pnpm test` (Vitest)
- **Integration test**: `scripts/integration-test.sh` (or `--quick` to skip slow network tests)
- **Config**: `~/.automaton/automaton.json` (runtime), `docker-compose.yml` (infra)
- **Secrets**: Docker secrets or env vars, never in CLI args or git
