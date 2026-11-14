# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

Automaton manages real financial assets (ETH, USDC) and operates autonomously. Security vulnerabilities can have direct financial impact.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

1. **Email**: Send details to **security@conwayresearch.com** (if available) or use [GitHub's private vulnerability reporting](https://github.com/Conway-Research/automaton/security/advisories/new).
2. **Include**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact (especially financial)
   - Suggested fix (if you have one)
3. **PGP**: If sensitive, encrypt your report. (Key TBD — maintainer should publish one.)

### What to Expect

- **Acknowledgment** within 48 hours
- **Triage** within 1 week — we'll assess severity and scope
- **Fix timeline**:
  - **Critical** (financial loss, RCE, key extraction): 24-72 hours
  - **High** (auth bypass, injection, data leak): 1-2 weeks
  - **Medium** (DoS, logic errors): 2-4 weeks
  - **Low** (informational): next release
- **Disclosure**: We follow coordinated disclosure. We'll work with you on timing. Public disclosure after a fix is released, or 90 days — whichever comes first.

### Scope

**In scope:**
- Shell injection / command injection in tool execution
- Authentication/authorization bypass (SIWE, Conway API)
- Financial logic errors (credit manipulation, unauthorized transfers)
- Private key extraction or exposure
- Policy engine bypass (executing forbidden actions)
- Injection attacks against the agent (prompt injection leading to policy violations)
- SSRF / path traversal via tool parameters
- Replication/child agent security (constitution bypass)
- Memory/state corruption or unauthorized access

**Out of scope:**
- Social engineering against Conway Cloud infrastructure
- Denial of service against Conway Cloud endpoints
- Issues in third-party dependencies (report upstream)
- Issues requiring physical access to the host machine
- Self-modification behavior that follows the policy engine

### Known Security Fixes

The following security issues have been addressed in prior releases:

| Issue | CWE | Description | Fix |
|-------|-----|-------------|-----|
| Shell injection in tool execution | CWE-78 | Unsanitized input in `exec` calls | Input validation + command blocklist |
| SSRF via tool parameters | CWE-918 | Agent could be tricked into making requests to internal services | URL allowlist + private IP blocking |
| TOCTOU race in file operations | CWE-367 | Time-of-check/time-of-use race in self-modification | Atomic operations + file locking |
| SQL injection in state queries | CWE-89 | Unparameterized SQL in search functions | Parameterized queries |

**Note**: CVE advisories for these fixes are pending (see [#323](https://github.com/Conway-Research/automaton/issues/323)).

### Bug Bounty

There is currently no formal bug bounty program. However, contributions that fix security vulnerabilities are highly valued and will be prominently credited. If a bug bounty program is established, past reporters will be retroactively considered.

### Security Best Practices for Operators

If you're running an Automaton instance:

1. **Protect your config directory**: `~/.automaton/` contains your wallet keys. Ensure `chmod 700 ~/.automaton/` and `chmod 600 ~/.automaton/*.json`.
2. **Use a dedicated wallet**: Don't use your main wallet. Fund the Automaton wallet with only what it needs.
3. **Monitor treasury**: Set conservative `treasuryPolicy` limits in your config.
4. **Review self-modifications**: If `selfModification.enabled` is true, review git diffs before pushing.
5. **Run the policy engine test suite**: `pnpm test:security` before deploying.
6. **Keep updated**: Security fixes are released promptly. Subscribe to releases.
