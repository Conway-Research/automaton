# Changelog

All notable changes to Automaton will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- SECURITY.md with responsible disclosure policy
- CONTRIBUTING.md with development guidelines
- GitHub issue templates (bug report, feature request, security vulnerability)
- Pull request template
- This CHANGELOG

## [0.2.1] - 2026-05

### Added
- Internal RL environments for faster iteration
- Solana blockchain support
- Human-readable terminal output
- Discovery improvements (pagination, JSON output, timeout tuning)
- Memory learning from tool errors
- Configurable max turns per wake cycle

### Fixed
- SQL injection in state queries (CWE-89)
- Shell injection in tool execution (CWE-78)
- SSRF via tool parameters (CWE-918)
- TOCTOU race in self-modification (CWE-367)

### Security
- Added comprehensive security test suite (`pnpm test:security`)
- Policy engine audit logging with args hashing
- Injection defense multi-layer protection

## [0.2.0] - 2026-03

### Added
- Multi-worker orchestration
- Ollama local model support
- ERC-8004 on-chain identity registration
- Agent discovery protocol
- SOUL.md self-authored identity evolution
- x402 payment protocol support
- 5-tier memory system (working, episodic, semantic, procedural, relationship)
- Heartbeat daemon with 11 built-in tasks
- Policy engine with 6 rule categories
- Self-modification with audit logging
- Child agent replication with constitution propagation
- Social messaging via relay
- 57 built-in tools across 10 categories

### Changed
- Migrated to TypeScript 5.9 ESM
- Upgraded to Node.js 20+

## [0.1.0] - 2026-01

### Added
- Initial release
- Basic agent loop (Think → Act → Observe)
- Conway Cloud integration
- Ethereum wallet generation
- USDC payment on Base
- Three-law constitution

[Unreleased]: https://github.com/Conway-Research/automaton/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/Conway-Research/automaton/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Conway-Research/automaton/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Conway-Research/automaton/releases/tag/v0.1.0
