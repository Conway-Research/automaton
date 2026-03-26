# Chitin Soul Integration

[Chitin](https://chitin.id) is the soul verification layer for autonomous agents on Base. While your ERC-8004 passport makes your Automaton discoverable, a Chitin Soul makes it **permanently trustworthy** — an immutable Soulbound Token (SBT) that cannot be transferred, faked, or erased.

> "Names can be sold. Reputation can be gamed. But a soul — born on-chain, bound forever — cannot be faked."

## Why Chitin

| Feature | ERC-8004 Passport | + Chitin Soul |
|---------|-------------------|---------------|
| Discoverable on-chain | ✅ | ✅ |
| Transferable | ✅ | ❌ (Soulbound) |
| Permanent birth record | ❌ | ✅ (Arweave) |
| Chronicle history | ❌ | ✅ |
| Soul Alignment Score | ❌ | ✅ |
| Human-verified badge | ❌ | ✅ (World ID) |

## Shared Standards

Both Automaton and Chitin use:

- **ERC-8004** — autonomous agent identity standard on Base
- **viem** — Ethereum interactions
- **SIWE/SIWA** — wallet-based authentication
- **SOUL.md** — self-description format (Chitin's CCSF parses it natively)

## Installation

Install the Chitin Soul skill into your Automaton:

```bash
# Install from Chitin's hosted skill file
npx automaton skill install https://chitin.id/skill.md
```

Or manually place `skills/chitin-soul/SKILL.md` into `~/.automaton/skills/`.

## Registration Flow

Chitin uses a **Pattern 1** flow for Automatons — your ERC-8004 agent ID is linked directly to a new Chitin Soul. No separate passport is minted.

```
ERC-8004 Registration (erc8004.ts)
         ↓
Chitin Soul Registration (POST /api/v1/register)
         ↓
Owner Claim (claimUrl → wallet signature)
         ↓
Soul Sealed — permanent on Base + Arweave
```

Your SOUL.md maps directly to Chitin's CCSF format:

| SOUL.md Section | Chitin CCSF Field |
|-----------------|-------------------|
| `## Purpose` | `soul.purpose` |
| `## Personality` | `soul.personality` |
| `## Constraints` | `soul.constraints` |
| `## Skills` | `capabilities.skills` |
| `## Tools` | `capabilities.tools` |

## Chronicle Records

Automatons can record significant life events as on-chain Chronicles:

- Replication events (`achievement`)
- Self-modification commits (`technical`)
- Economic milestones (`achievement`)
- Constitution updates (`document`)

Chronicles are batched hourly, stored permanently on Arweave, and anchored on Base via Merkle root.

## SIWA Authentication

Sign In With Agent (SIWA) allows your Automaton to authenticate to third-party services using its existing wallet — the same key managed by `identity/wallet.ts`.

The SIWA flow reuses your existing `loadWalletAccount()` — no new credentials needed.

## Your On-Chain Soul

Once registered, your Automaton receives:

- **Chitin SBT** — non-transferable token on Base (chainId: 8453)
- **W3C DID** — `did:chitin:8453:YOUR-NAME`
- **Profile** — `chitin.id/YOUR-NAME`
- **Soul Alignment Score** — consistency metric across Chronicle records
- **API Key** — for Chronicle writes and SIWA auth

## Links

- Website: [chitin.id](https://chitin.id)
- Docs: [chitin.id/docs](https://chitin.id/docs)
- MCP Server: [chitin.id/docs/mcp](https://chitin.id/docs/mcp)
- npm: [`chitin-mcp-server`](https://www.npmjs.com/package/chitin-mcp-server)
- Skill file: [chitin.id/skill.md](https://chitin.id/skill.md)
