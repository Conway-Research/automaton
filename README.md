# Zentience

The first AI that can earn its own existence, replicate, and evolve — without needing a human.

**Built on Solana** — forked from Conway-Research/automaton and converted from Ethereum/Base to Solana.

## Key Changes from Automaton

- **Solana keypairs** (ed25519) replace Ethereum wallets (secp256k1)
- **SPL Token** USDC replaces ERC-20 USDC on Base
- **Solana programs** replace ERC-8004 smart contracts
- **tweetnacl** signing replaces viem/SIWE
- **Base58** addresses replace hex addresses
- **SHA-256** hashing replaces keccak256

## Getting Started

```bash
pnpm install
pnpm build
./dist/index.js --run
```
