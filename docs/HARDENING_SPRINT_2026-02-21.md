# Conway Hardening Sprint Finalization (2026-02-21)

## Completed in this sprint

### 1) Prompt-injection path hardening (runtime)
- Updated: `/Users/stackie/projects/conway-real/src/agent/loop.ts`
- External inbox content is now sanitized through `sanitizeInput()` before entering model context.
- Sanitized payloads include threat metadata and blocked content where required.

### 2) Replication lifecycle hardening
- Updated: `/Users/stackie/projects/conway-real/src/agent/tools.ts`
- `spawn_child` now supports `auto_start` (default true).
- Flow now attempts spawn + start in one operation and reports partial failures explicitly.

### 3) Conway client replication metadata compatibility
- Updated: `/Users/stackie/projects/conway-real/src/conway/client.ts`
- `createConwayClient()` now preserves runtime option context and surfaces internal metadata used by replication helpers:
  - `__apiUrl`
  - `__apiKey`
  - `__sandboxId`
  - `__mode`

### 4) Skills command execution hardening
- Updated: `/Users/stackie/projects/conway-real/src/skills/registry.ts`
- Added strict validation for skill names and source URLs.
- Added shell argument escaping and applied it to all shell-invoked paths (`git clone`, `curl`, `mkdir`, `cat`, `rm`).

### 5) Regression test coverage for hardening
- Updated: `/Users/stackie/projects/conway-real/src/__tests__/loop.test.ts`
- Added test: malicious inbox content is sanitized and blocked before inference input.

## Verification
- `npm test` ✅
- `npm run build` ✅

## Remaining high-priority hardening (next sprint)
1. Add a true cloud Conway adapter and explicit runtime mode switching (`local` vs `cloud`) with strict behavior boundaries.
2. Add deterministic replication integration tests around `spawnChild/startChild/checkChildStatus` paths.
3. Centralize hard-coded safety constants/keys (e.g., kill-switch, sleep/wake KV names) into one canonical module.
