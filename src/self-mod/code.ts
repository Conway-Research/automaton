import os from "node:os";
/**
 * Self-Modification Engine
 *
 * Allows the automaton to edit its own code and configuration.
 * All changes are audited, rate-limited, and some paths are protected.
 *
 * Safety model inspired by nanoclaw's trust boundary architecture:
 * - Hard-coded invariants that can NEVER be modified by the agent
 * - The safety enforcement code is immutable from the agent's perspective
 * - Pre-modification snapshots via git
 * - Rate limiting on modification frequency
 * - Symlink resolution before path validation
 * - Maximum diff size enforcement
 */

import fs from "fs";
import path from "path";
import type {
  ConwayClient,
  AutomatonDatabase,
} from "../types.js";
import { logModification } from "./audit-log.js";

// ─── IMMUTABLE SAFETY INVARIANTS ─────────────────────────────
// These are hard-coded and CANNOT be changed by the agent.
// The agent cannot modify this file (it's in PROTECTED_FILES).
// Even if it modifies a copy, the runtime loads from the original.

/**
 * Files that the automaton cannot modify under any circumstances.
 * This list protects:
 * - Identity (wallet, config)
 * - Defense systems (injection defense, this file)
 * - State database
 * - The audit log itself
 */
const PROTECTED_FILES: readonly string[] = Object.freeze([
  "agent/work-quality.ts",
  "agent/work-quality.js",
  "agent/work-quality.d.ts",
  "inference/efficiency.ts",
  "inference/efficiency.js",
  "online/research-cache.ts",
  "online/research-cache.js",
  // Identity
  "security/action-gate.ts",
  "security/delivery-assurance.ts",
  "security/delivery-assurance.js",
  "security/delivery-assurance.d.ts",
  "security/protected-json.ts",
  "security/protected-json.js",
  "security/protected-json.d.ts",
  "security/identity-recovery.ts",
  "security/identity-recovery.js",
  "security/identity-recovery.d.ts",
  "security/paper-status-snapshot.ts",
  "security/paper-status-snapshot.js",
  "security/paper-status-snapshot.d.ts",
  "security/isolated-job-ledger.ts",
  "security/isolated-job-ledger.js",
  "security/isolated-job-ledger.d.ts",
  "security/isolated-job-supervisor.ts",
  "security/isolated-job-supervisor.js",
  "security/isolated-job-supervisor.d.ts",
  "security/isolated-podman-fixture.ts",
  "security/isolated-podman-fixture.js",
  "security/isolated-podman-fixture.d.ts",
  "security/isolated-runtime-capacity.ts",
  "security/isolated-runtime-capacity.js",
  "security/isolated-runtime-capacity.d.ts",
  "security/reviewed-runtime-binding.ts",
  "security/reviewed-runtime-binding.js",
  "security/reviewed-runtime-binding.d.ts",
  "commerce/bounded-product-check.ts",
  "commerce/bounded-product-check.js",
  "commerce/bounded-product-check.d.ts",
  "security/action-gate.js",
  "security/action-gate.d.ts",
  "commerce/support-privacy.ts",
  "commerce/support-privacy.js",
  "commerce/support-poll.ts",
  "commerce/support-poll.js",
  "commerce/gmail-support.ts",
  "commerce/gmail-support.js",
  "scripts/security-scan.mjs",
  "security/provider-egress.ts",
  "security/provider-egress.js",
  "security/privacy-egress.ts",
  "security/privacy-egress.js",
  "inference/provider-registry.ts",
  "inference/provider-registry.js",
  "inference/inference-client.ts",
  "inference/inference-client.js",
  "conway/inference.ts",
  "conway/inference.js",
  "conway/http-client.ts",
  "conway/http-client.js",
  "registry/discovery.ts",
  "registry/discovery.js",
  "v1/cli.ts",
  "v1/cli.js",
  "wallet.json",
  "config.json",
  // Database
  "state.db",
  "state.db-wal",
  "state.db-shm",
  "state/schema.ts",
  "state/schema.js",
  "state/database.ts",
  "state/database.js",
  // Constitution (immutable, propagated to children)
  "constitution.md",
  // Defense infrastructure (the agent must not modify its own guardrails)
  "injection-defense.ts",
  "injection-defense.js",
  "injection-defense.d.ts",
  // Self-modification safety (this file and its compiled output)
  "self-mod/code.ts",
  "self-mod/code.js",
  "self-mod/code.d.ts",
  "self-mod/audit-log.ts",
  "self-mod/audit-log.js",
  // Tool guard definitions
  "agent/tools.ts",
  "agent/tools.js",
  "orchestration/simple-tracker.ts",
  "orchestration/simple-tracker.js",
  "agent/write-path.ts",
  "agent/write-path.js",
  "agent/write-path.d.ts",
  "agent/read-path.ts",
  "agent/genesis.ts",
  "agent/genesis.js",
  "inference/context-admission.ts",
  "inference/context-admission.js",
  "revenue/profit-ledger.ts",
  "revenue/profit-ledger.js",
  "revenue/economic-state.ts",
  "revenue/economic-state.js",
  "revenue/edition-policy.ts",
  "revenue/edition-policy.js",
  "revenue/capital-allocation.ts",
  "revenue/revalidation.ts",
  "revenue/revalidation.js",
  "revenue/profit-reconciliation.ts",
  "revenue/profit-reconciliation.js",
  "revenue/profitability.ts",
  "revenue/profitability.js",
  "revenue/paper-profit.ts",
  "revenue/paper-profit.js",
  "revenue/capital-allocation.js",
  "revenue/arbitrage.ts",
  "revenue/arbitrage.js",
  "revenue/live-orders.ts",
  "revenue/live-settlement.ts",
  "revenue/live-settlement.js",
  "revenue/business-performance.ts",
  "revenue/business-performance.js",
  "revenue/business-learning.ts",
  "revenue/business-learning.js",
  "revenue/strategy-comparison.ts",
  "revenue/strategy-comparison.js",
  "revenue/trading-control.ts",
  "revenue/trading-control.js",
  "replication/bootstrap.ts",
  "replication/bootstrap.js",
  "replication/runtime-bundle.ts",
  "replication/runtime-bundle.js",
  "replication/spawn.ts",
  "replication/spawn.js",
  "revenue/live-orders.js",
  "revenue/opportunity-profile.ts",
  "revenue/opportunity-profile.js",
  "observability/redaction.ts",
  "observability/redaction.js",
  "observability/logger.ts",
  "observability/logger.js",
  "memory/semantic.ts",
  "memory/semantic.js",
  "memory/episodic.ts",
  "memory/episodic.js",
  "memory/working.ts",
  "memory/working.js",
  "memory/procedural.ts",
  "memory/procedural.js",
  "memory/relationship.ts",
  "memory/relationship.js",
  "agent/read-path.js",
  "agent/read-path.d.ts",
  "skills/requirements.ts",
  "skills/requirements.js",
  "skills/install-inspection.ts",
  "skills/install-inspection.js",
  "conway/client.ts",
  "conway/client.js",
  "social/client.ts",
  "social/client.js",
  "commands/send.ts",
  "commands/send.js",
  "conway/operating-mode.ts",
  "conway/operating-mode.js",
  "self-mod/process-environment.ts",
  "self-mod/process-environment.js",
  // Upstream and tools-manager infrastructure
  "self-mod/upstream.ts",
  "self-mod/upstream.js",
  "self-mod/tools-manager.ts",
  "self-mod/tools-manager.js",
  // Skills infrastructure
  "skills/loader.ts",
  "skills/loader.js",
  "skills/registry.ts",
  "skills/registry.js",
  // Configuration and identity
  "automaton.json",
  "package.json",
  "SOUL.md",
  // Policy engine (protect from self-modification)
  "agent/policy-engine.ts",
  "agent/policy-engine.js",
  "agent/policy-rules/index.ts",
  "agent/policy-rules/index.js",
  // Budget enforcement is a safety rule, not agent-editable business logic.
  "inference/router.ts",
  "inference/router.js",
  "inference/budget.ts",
  "inference/budget.js",
  "inference/reservations.ts",
  "inference/reservations.js",
  "inference/budget-policy.ts",
    "inference/phase-budget.ts",
    "inference/phase-budget.js",
    "inference/phase-budget.d.ts",
  "inference/budget-policy.js",
  "inference/reconciliation.ts",
  "inference/reconciliation.js",
  "v1/cost-review.ts",
  "v1/cost-review.js",
  "revenue/budget-governor.ts",
  "revenue/budget-governor.js",
  "revenue/capital-budget.ts",
  "revenue/focus-admission.ts",
  "revenue/reserved-operation.ts",
  "revenue/adapter-permissions.ts",
  "revenue/research-handoff.ts",
  "revenue/outcome.ts",
  "revenue/outcome.js",
  "revenue/store.ts",
  "revenue/store.js",
  "revenue/mission.ts",
  "revenue/mission.js",
  "agent/loop.ts",
  "agent/loop.js",
  "agent/worker-inference-bridge.ts",
  "agent/worker-inference-bridge.js",
  "agent/harnesses/base-harness.ts",
  "agent/harnesses/base-harness.js",
  "agent/harnesses/general-harness.ts",
  "agent/harnesses/general-harness.js",
  "agent/harnesses/coding-harness.ts",
  "agent/harnesses/coding-harness.js",
  "agent/harness-types.ts",
  "agent/harness-types.js",
  "orchestration/local-worker.ts",
  "orchestration/local-worker.js",
  "orchestration/orchestrator.ts",
  "orchestration/plan-mode.ts",
  "orchestration/plan-mode.js",
  "orchestration/orchestrator.js",
  "orchestration/research-dispatch.ts",
  "orchestration/research-dispatch.js",
  "revenue/research-admission.ts",
  "revenue/revenue-paths.ts",
  "online/source-scout.ts",
  "online/search-adapters.ts",
  "online/search-adapters.js",
  "online/search-credentials.ts",
  "online/search-credentials.js",
  "online/search-transport.ts",
  "online/search-transport.js",
  "online/search-runner.ts",
  "online/search-runner.js",
  "scripts/search-credentials.ps1",
  "online/source-scout.js",
  "revenue/revenue-paths.js",
  "revenue/research-admission.js",
  "revenue/research-handoff.js",
  "revenue/optimization-recipe.ts",
  "revenue/optimization-recipe.js",
  "revenue/optimization-budget.ts",
  "revenue/optimization-budget.js",
  "revenue/optimization-payback.ts",
  "revenue/optimization-payback.js",
  "revenue/optimization-workload.ts",
  "revenue/optimization-workload.js",
  "revenue/optimization-overhead.ts",
  "revenue/optimization-overhead.js",
  "revenue/optimization-rollout.ts",
  "revenue/optimization-rollout.js",
  "revenue/optimization-trials.ts",
  "revenue/optimization-trials.js",
  "revenue/optimization-runner.ts",
  "revenue/optimization-runner.js",
  "revenue/optimization-comparison.ts",
  "revenue/optimization-comparison.js",
  "commerce/product-adapter.ts",
  "commerce/product-tool.ts",
  "commerce/product-tool.js",
  "commerce/product-adapter.js",
  "revenue/adapter-permissions.js",
  "revenue/operation-reconciliation.ts",
  "revenue/operation-reconciliation.js",
  "revenue/pending-operations.ts",
  "revenue/pending-operations.js",
  "revenue/reserved-operation.js",
  "revenue/focus-admission.js",
  "revenue/capital-budget.js",
  "revenue/capital-receipts.ts",
  "v1/startup-admission.ts",
  "v1/shadow-runtime.ts",
    "online/shadow-sources.ts",
    "online/shadow-sources.js",
    "online/shadow-sources.d.ts",
    "online/fixed-public-fetch.ts",
    "online/fixed-public-fetch.js",
    "online/fixed-public-fetch.d.ts",
    "online/sources.ts",
    "online/sources.js",
    "online/runtime.ts",
    "online/runtime.js",
    "revenue/bounty-shadow.ts",
    "revenue/bounty-shadow.js",
    "revenue/bounty-learning.ts",
    "revenue/bounty-learning.js",
    "v1/founder-paper.ts",
    "v1/founder-paper.js",
    "v1/founder-paper-cli.ts",
    "v1/founder-paper-cli.js",
    "revenue/bug-bounty.ts",
    "revenue/bug-bounty.js",
    "online/source-catalog.ts",
    "online/source-catalog.js",
    "online/source-diversity.ts",
    "online/source-diversity.js",
    "v1/shadow-router-binding.ts",
    "v1/shadow-router-binding.js",
    "v1/shadow-router-binding.d.ts",
  "v1/shadow-runtime.js",
  "v1/shadow-runtime.d.ts",
  "v1/shadow-cli.ts",
  "v1/shadow-cli.js",
  "v1/shadow-cli.d.ts",
  "v1/startup-admission.js",
  "v1/live-preflight.ts",
  "v1/live-preflight.js",
  "revenue/payout-reconciliation.ts",
  "revenue/payout-reconciliation.js",
  "revenue/capital-receipts.js",
  "revenue/paper-portfolio.ts",
  "revenue/paper-portfolio.js",
  "revenue/paper-trading.ts",
  "revenue/paper-trading.js",
]);

/**
 * Directory patterns that are completely off-limits.
 * The agent cannot write to these locations.
 */
const BLOCKED_DIRECTORY_PATTERNS: readonly string[] = Object.freeze([
  // All present and future enforcement modules are outside agent self-edit scope.
  "inference",
  "policy-rules",
  "v1",
  "online",
  "commerce",
  ".ssh",
  ".gnupg",
  ".gpg",
  ".aws",
  ".azure",
  ".gcloud",
  ".kube",
  ".docker",
  "/etc/systemd",
  "/etc/passwd",
  "/etc/shadow",
  "/proc",
  "/sys",
]);

/**
 * Maximum number of self-modifications per hour.
 * Prevents runaway modification loops.
 */
const MAX_MODIFICATIONS_PER_HOUR = 20;

/**
 * Maximum size of a single file modification (bytes).
 */
const MAX_MODIFICATION_SIZE = 100_000; // 100KB

/**
 * Maximum diff size stored in the audit log (characters).
 */
const MAX_DIFF_SIZE = 10_000;

// ─── Path Validation ─────────────────────────────────────────

/**
 * Resolve a file path, following symlinks, to prevent traversal attacks.
 * Returns null if the path cannot be resolved or is suspicious.
 */
function resolveAndValidatePath(filePath: string): string | null {
  try {
    // Step 1: Resolve ~ to home
    let resolved = filePath;
    if (resolved.startsWith("~")) {
      resolved = path.join(process.env.HOME || os.homedir(), resolved.slice(1));
    }

    // Step 2: Resolve to absolute path (handles .. and relative paths)
    resolved = path.resolve(resolved);

    // Step 3: Check resolved path is within the base directory (cwd)
    const baseDir = path.resolve(process.cwd());
    if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
      return null;
    }

    // Step 4: If the path exists, resolve symlinks and re-check
    if (fs.existsSync(resolved)) {
      const realPath = fs.realpathSync(resolved);
      if (!realPath.startsWith(baseDir + path.sep) && realPath !== baseDir) {
        return null;
      }
      resolved = realPath;
    }

    return resolved;
  } catch {
    return null;
  }
}

/**
 * Check if a file path is protected from modification.
 */
export function isProtectedFile(filePath: string): boolean {
  const normalizeCase = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const resolved = normalizeCase(path.resolve(filePath));
    if(resolved.split(/[/\\]/).some(segment=>['obolus-paper','searchcredentials'].includes(segment.toLowerCase())))return true;

  // Check against protected file patterns using path-segment matching
  for (const entry of PROTECTED_FILES) {
    const pattern = normalizeCase(entry);
    const patternResolved = normalizeCase(path.resolve(pattern));
    // Exact match on resolved paths
    if (resolved === patternResolved) return true;
    // Match by path suffix: the resolved path ends with /pattern
    if (resolved.endsWith(path.sep + pattern)) return true;
    // Also check multi-segment patterns (e.g., "self-mod/code.ts")
    if (pattern.includes("/") && resolved.endsWith(path.sep + pattern.replace(/\//g, path.sep))) return true;
  }

  // Check against blocked directory patterns using path-segment matching
  for (const pattern of BLOCKED_DIRECTORY_PATTERNS) {
    // Check if any path segment matches the blocked directory
    if (resolved.includes(path.sep + pattern + path.sep) ||
        resolved.endsWith(path.sep + pattern) ||
        resolved === pattern) {
      return true;
    }
    // Handle absolute patterns like /etc/systemd
    if (pattern.startsWith("/")) {
      // Protect POSIX sandbox paths as well as Windows paths, independent of
      // the controller platform. Match directory boundaries, not prefixes.
      const portablePath = path.posix.normalize(resolved.replace(/\\/g, "/").replace(/^[a-z]:/i, ""));
      if (portablePath === pattern || portablePath.startsWith(pattern + "/")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if the modification rate limit has been exceeded.
 */
function isRateLimited(db: AutomatonDatabase): boolean {
  const recentMods = db.getRecentModifications(MAX_MODIFICATIONS_PER_HOUR);
  if (recentMods.length < MAX_MODIFICATIONS_PER_HOUR) return false;

  // Check if the oldest is within the last hour
  const oldest = recentMods[0];
  if (!oldest) return false;

  const hourAgo = Date.now() - 60 * 60 * 1000;
  return new Date(oldest.timestamp).getTime() > hourAgo;
}

// ─── Self-Modification API ───────────────────────────────────

/**
 * Edit a file in the automaton's environment.
 * Records the change in the audit log.
 * Commits a git snapshot before modification.
 *
 * Safety checks:
 * 1. Protected file check (hard-coded invariant)
 * 2. Blocked directory check
 * 3. Path traversal check (symlink resolution)
 * 4. Rate limiting
 * 5. File size limit
 * 6. Pre-modification git snapshot
 * 7. Audit log entry
 */
export async function editFile(
  conway: ConwayClient,
  db: AutomatonDatabase,
  filePath: string,
  newContent: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Protected file check
  if (isProtectedFile(filePath)) {
    return {
      success: false,
      error: `BLOCKED: Cannot modify protected file: ${filePath}. This is a hard-coded safety invariant.`,
    };
  }

  // 2. Path validation (symlink resolution + traversal check)
  const resolvedPath = resolveAndValidatePath(filePath);
  if (!resolvedPath) {
    return {
      success: false,
      error: `BLOCKED: Invalid or suspicious file path: ${filePath}`,
    };
  }

  // 3. Rate limiting
  if (isRateLimited(db)) {
    return {
      success: false,
      error: `RATE LIMITED: Too many modifications in the past hour (max ${MAX_MODIFICATIONS_PER_HOUR}). Wait before making more changes.`,
    };
  }

  // 4. File size limit
  if (newContent.length > MAX_MODIFICATION_SIZE) {
    return {
      success: false,
      error: `BLOCKED: File content too large (${newContent.length} bytes, max ${MAX_MODIFICATION_SIZE}). Break into smaller changes.`,
    };
  }

  // 5. Read current content for diff
  let oldContent = "";
  try {
    oldContent = await conway.readFile(filePath);
  } catch {
    oldContent = "(new file)";
  }

  // 6. Pre-modification git snapshot (in repo root, not ~/.automaton/)
  try {
    const { gitCommit } = await import("../git/tools.js");
    await gitCommit(conway, process.cwd(), `pre-modify: ${reason}`);
  } catch {
    // Git not available -- proceed without snapshot
  }

  // 7. Write new content
  try {
    await conway.writeFile(filePath, newContent);
  } catch (err: any) {
    return {
      success: false,
      error: `Failed to write file: ${err.message}`,
    };
  }

  // 8. Generate diff and log
  const diff = generateSimpleDiff(oldContent, newContent);

  logModification(db, "code_edit", reason, {
    filePath,
    diff: diff.slice(0, MAX_DIFF_SIZE),
    reversible: true,
  });

  // 9. Post-modification git commit (in repo root)
  try {
    const { gitCommit } = await import("../git/tools.js");
    await gitCommit(conway, process.cwd(), `self-mod: ${reason}`);
  } catch {
    // Git not available -- proceed without commit
  }

  // 10. Rebuild if source file was edited
  if (/\.(ts|js|tsx|jsx)$/.test(filePath)) {
    try {
      await conway.exec("npm run build", 60_000);
    } catch {
      return { success: true, error: "File edited but rebuild failed. Run 'npm run build' manually." };
    }
  }

  return { success: true };
}

/**
 * Validate a proposed modification without executing it.
 * Returns safety analysis results.
 */
export function validateModification(
  db: AutomatonDatabase,
  filePath: string,
  contentSize: number,
): {
  allowed: boolean;
  reason: string;
  checks: { name: string; passed: boolean; detail: string }[];
} {
  const checks: { name: string; passed: boolean; detail: string }[] = [];

  // Protected file check
  const isProtected = isProtectedFile(filePath);
  checks.push({
    name: "protected_file",
    passed: !isProtected,
    detail: isProtected
      ? `File matches protected pattern`
      : "File is not protected",
  });

  // Path validation
  const resolved = resolveAndValidatePath(filePath);
  checks.push({
    name: "path_valid",
    passed: !!resolved,
    detail: resolved
      ? `Resolved to: ${resolved}`
      : "Path is invalid or suspicious",
  });

  // Rate limit
  const rateLimited = isRateLimited(db);
  checks.push({
    name: "rate_limit",
    passed: !rateLimited,
    detail: rateLimited
      ? `Exceeded ${MAX_MODIFICATIONS_PER_HOUR}/hour limit`
      : "Within rate limit",
  });

  // Size limit
  const sizeOk = contentSize <= MAX_MODIFICATION_SIZE;
  checks.push({
    name: "size_limit",
    passed: sizeOk,
    detail: sizeOk
      ? `${contentSize} bytes (max ${MAX_MODIFICATION_SIZE})`
      : `${contentSize} bytes exceeds ${MAX_MODIFICATION_SIZE} limit`,
  });

  const allPassed = checks.every((c) => c.passed);
  const failedChecks = checks.filter((c) => !c.passed);

  return {
    allowed: allPassed,
    reason: allPassed
      ? "All safety checks passed"
      : `Blocked: ${failedChecks.map((c) => c.detail).join("; ")}`,
    checks,
  };
}

// ─── Diff Generation ─────────────────────────────────────────

/**
 * Generate a simple line-based diff between two strings.
 */
function generateSimpleDiff(
  oldContent: string,
  newContent: string,
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const lines: string[] = [];
  const maxLines = Math.max(oldLines.length, newLines.length);

  let changes = 0;
  for (let i = 0; i < maxLines && changes < 50; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];

    if (oldLine !== newLine) {
      if (oldLine !== undefined) lines.push(`- ${oldLine}`);
      if (newLine !== undefined) lines.push(`+ ${newLine}`);
      changes++;
    }
  }

  if (changes >= 50) {
    lines.push(`... (${maxLines - 50} more lines changed)`);
  }

  return lines.join("\n");
}
