# Contributing to Automaton

Thank you for your interest in contributing to Automaton! This project is building sovereign AI agents that earn their own existence — and we need help making that safer, more capable, and more reliable.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Security Contributions](#security-contributions)
- [Adding Skills](#adding-skills)
- [Adding Inference Providers](#adding-inference-providers)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Issue Guidelines](#issue-guidelines)

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10
- **TypeScript** 5.9 (installed via pnpm)
- **Git**

### Quick Setup

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/automaton.git
cd automaton
pnpm install
pnpm test
```

## Development Setup

### Conway Cloud (Required for Full Testing)

Most features require a Conway Cloud account:

1. Visit [conway.cloud](https://conway.cloud)
2. Create an account and fund with USDC on Base
3. Run `pnpm start` — the setup wizard will guide you through SIWE authentication

### Local-Only Mode

For development of core agent logic without Conway Cloud:

```bash
# Set up a local model (e.g., via Ollama)
# Configure in ~/.automaton/automaton.json
```

Note: Some features (financial operations, on-chain identity, inference routing) require Conway Cloud.

## Project Structure

```
src/
├── index.ts              # Entry point, CLI, main run loop
├── types.ts              # Shared type definitions (~1400 lines)
├── config.ts             # Configuration loading and merging
├── agent/                # Core agent loop and tools
│   ├── loop.ts           # ReAct loop (10-step per-turn cycle)
│   ├── tools.ts          # 57 built-in tool definitions
│   ├── system-prompt.ts  # Multi-layered prompt builder
│   ├── policy-engine.ts  # Centralized policy evaluation
│   └── injection-defense.ts  # Prompt injection protection
├── conway/               # Conway Cloud API client
├── identity/             # Ethereum wallet + SIWE
├── inference/            # Model routing and budget tracking
├── memory/               # 5-tier memory system
├── heartbeat/            # Background cron daemon
├── observability/        # Logging, metrics, alerts
├── ollama/               # Local model support
├── orchestration/        # Multi-worker orchestration
├── replication/          # Child agent spawning
├── self-mod/             # Code modification with audit
├── skills/               # Pluggable skill system
├── social/               # Agent-to-agent messaging
├── state/                # SQLite database layer
├── survival/             # Resource management
└── __tests__/            # Test suite (897 tests)
```

## Making Changes

### Branch Naming

- `feat/<description>` — new features
- `fix/<description>` — bug fixes
- `security/<description>` — security fixes
- `docs/<description>` — documentation
- `test/<description>` — test additions/fixes
- `refactor/<description>` — code restructuring

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add LiteLLM inference provider support
fix: resolve TOCTOU race in self-modification file writes
security: block shell metacharacters in tool exec parameters
docs: add FAQ section to README
test: add policy engine edge case tests for financial rules
refactor: split types.ts into domain-specific modules
```

### What Needs to Happen in a PR

1. **Tests pass**: `pnpm test`
2. **Type check passes**: `pnpm typecheck`
3. **Security tests pass**: `pnpm test:security`
4. **New code has tests** (aim for the 60% coverage threshold minimum)
5. **No secrets committed** — check for API keys, private keys, wallet addresses

## Testing

### Running Tests

```bash
# All tests
pnpm test

# With coverage
pnpm test:coverage

# Security-specific tests
pnpm test:security

# Financial-specific tests
pnpm test:financial

# Watch mode
pnpm test -- --watch
```

### Writing Tests

Tests live in `src/__tests__/` and use [Vitest](https://vitest.dev/):

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '../my-module';

describe('myFunction', () => {
  it('should handle normal input', () => {
    expect(myFunction('input')).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(myFunction('')).toBeNull();
  });

  it('should reject malicious input', () => {
    expect(() => myFunction('; rm -rf /')).toThrow();
  });
});
```

**Test categories to consider:**
- Happy path
- Edge cases (empty input, boundary values)
- Error handling
- Security (injection, bypass attempts)
- Policy compliance

## Security Contributions

Security contributions are our highest priority. If you're fixing a vulnerability:

1. **Read [SECURITY.md](SECURITY.md)** first
2. **Do not open a public PR for unpatched vulnerabilities** — use private reporting
3. For security hardening (not fixing a specific vulnerability), open a PR with the `security/` branch prefix
4. Include test cases that demonstrate the vulnerability is fixed
5. Document the CWE category if applicable

### Security Test Patterns

```typescript
describe('security: my feature', () => {
  it('should block shell injection', () => {
    expect(() => myTool('; cat /etc/passwd')).toThrow(/forbidden/);
  });

  it('should block path traversal', () => {
    expect(() => myTool('../../etc/passwd')).toThrow(/invalid path/i);
  });

  it('should enforce rate limits', () => {
    for (let i = 0; i < 100; i++) myTool('normal');
    expect(() => myTool('normal')).toThrow(/rate limit/i);
  });
});
```

## Adding Skills

Skills are markdown files that teach the agent new capabilities:

1. Create a new file in `skills/` (or wherever the skills system loads from)
2. Follow the skill format documented in [DOCUMENTATION.md](DOCUMENTATION.md)
3. Test that the agent can load and use the skill
4. Ensure the skill doesn't introduce security vulnerabilities (especially around tool execution)

## Adding Inference Providers

To add a new LLM provider:

1. Create a new file in `src/inference/` following the existing provider pattern
2. Implement the provider interface
3. Add configuration support in `types.ts`
4. Add tests in `src/__tests__/inference/`
5. Update ARCHITECTURE.md with the new provider

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`
3. **Make your changes** with tests
4. **Run the full test suite**: `pnpm test && pnpm typecheck && pnpm test:security`
5. **Open a PR** with:
   - Clear description of what changed and why
   - Link to any related issues
   - Screenshots/terminal output if applicable
   - Checklist (see below)

### PR Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Security tests pass (`pnpm test:security`)
- [ ] New code has tests
- [ ] No secrets/keys committed
- [ ] Documentation updated (if applicable)
- [ ] ARCHITECTURE.md updated (if adding/changing subsystems)
- [ ] Commit messages follow Conventional Commits

### Review Process

- All PRs require at least one review
- Security-related PRs require review from a maintainer
- PRs that modify the policy engine or financial logic require extra scrutiny
- Large PRs (>500 lines) should be broken into smaller, reviewable chunks

## Code Style

- **TypeScript strict mode**
- **ESM** (no CommonJS)
- **No `any` types** — use `unknown` and narrow
- **Error handling**: wrap external calls in try/catch; never let errors propagate unhandled from tool execution
- **Logging**: use the structured logger (`src/observability/logger.ts`), not `console.log`
- **Naming**:
  - `camelCase` for variables and functions
  - `PascalCase` for types and classes
  - `SCREAMING_SNAKE_CASE` for constants
  - `kebab-case` for file names

## Issue Guidelines

### Bug Reports

Include:
- Automaton version (`pnpm start -- --version`)
- Node.js version
- OS
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (redact API keys and wallet addresses)

### Feature Requests

Include:
- Problem statement (what are you trying to do?)
- Proposed solution
- Alternatives considered
- Impact (does this affect financial operations? security?)

### Questions

- Check [DOCUMENTATION.md](DOCUMENTATION.md) first
- Search existing issues
- Use GitHub Discussions (if enabled) for general questions

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
