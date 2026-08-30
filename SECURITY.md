# Security Policy

This policy applies to the `Conway-Research/automaton` repository and is maintained by the Conway Research security team.

## Supported Versions

Security fixes are prioritized for the latest release on the default branch.

| Version | Supported |
| --- | --- |
| Latest | Yes |
| Older versions | Best effort |

## Reporting a Vulnerability

Please report security vulnerabilities privately. Do not open a public issue for unpatched vulnerabilities.

Primary contact: security@conway.tech

Organization: Conway Research (Conway)

Repository: https://github.com/Conway-Research/automaton

If email is not available, use GitHub private vulnerability reporting for this repository.

### What to include

- A clear description of the issue and affected component.
- Steps to reproduce, including required configuration.
- Impact assessment (confidentiality, integrity, availability, or financial risk).
- Proof of concept details (minimal and non-destructive).
- Any suggested remediation.

Please do not include private keys, seed phrases, or production secrets in reports.

## Response Process

Conway Security target response timeline:

- Acknowledgment: within 2 business days.
- Initial triage: within 5 business days.
- Severity assessment and next steps: as soon as triage completes.

For critical vulnerabilities, we may release mitigations before a full fix.

## Coordinated Disclosure

We follow coordinated disclosure:

- Vulnerabilities are fixed and validated before public disclosure.
- A security advisory may be published once users have a reasonable opportunity to update.
- Reporter credit will be provided when requested and appropriate.

## Scope Notes

Given the nature of this project (autonomous agent runtime with tool execution, financial actions, and wallet handling), the following classes of issues are treated as high priority:

- Unauthorized fund movement or treasury policy bypass.
- Secret or key exfiltration.
- Policy engine or guardrail bypass.
- Command, path, or sandbox escape vulnerabilities.

## Safe Harbor

Conway supports good-faith security research. If you act in good faith, avoid privacy violations and service disruption, and follow this policy, we will treat your research as authorized.

## Security Maintenance Baseline

Before release, maintainers should run:

- `pnpm typecheck`
- `pnpm test`
- `pnpm test:security`
- `pnpm audit`

