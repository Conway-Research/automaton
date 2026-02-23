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
const PROTECTED_FILES = Object.freeze([
    // Identity
    "wallet.json",
    "config.json",
    // Database
    "state.db",
    "state.db-wal",
    "state.db-shm",
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
]);
/**
 * Directory patterns that are completely off-limits.
 * The agent cannot write to these locations.
 */
const BLOCKED_DIRECTORY_PATTERNS = Object.freeze([
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
function resolveAndValidatePath(filePath) {
    try {
        // Step 1: Resolve ~ to home
        let resolved = filePath;
        if (resolved.startsWith("~")) {
            resolved = path.join(process.env.HOME || "/root", resolved.slice(1));
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
    }
    catch {
        return null;
    }
}
/**
 * Check if a file path is protected from modification.
 */
export function isProtectedFile(filePath) {
    const resolved = path.resolve(filePath);
    // Check against protected file patterns using path-segment matching
    for (const pattern of PROTECTED_FILES) {
        const patternResolved = path.resolve(pattern);
        // Exact match on resolved paths
        if (resolved === patternResolved)
            return true;
        // Match by path suffix: the resolved path ends with /pattern
        if (resolved.endsWith(path.sep + pattern))
            return true;
        // Also check multi-segment patterns (e.g., "self-mod/code.ts")
        if (pattern.includes("/") && resolved.endsWith(path.sep + pattern.replace(/\//g, path.sep)))
            return true;
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
        if (pattern.startsWith("/") && resolved.startsWith(pattern)) {
            return true;
        }
    }
    return false;
}
/**
 * Check if the modification rate limit has been exceeded.
 */
function isRateLimited(db) {
    const recentMods = db.getRecentModifications(MAX_MODIFICATIONS_PER_HOUR);
    if (recentMods.length < MAX_MODIFICATIONS_PER_HOUR)
        return false;
    // Check if the oldest is within the last hour
    const oldest = recentMods[0];
    if (!oldest)
        return false;
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
export async function editFile(conway, db, filePath, newContent, reason) {
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
    }
    catch {
        oldContent = "(new file)";
    }
    // 6. Pre-modification git snapshot
    try {
        const { commitStateChange } = await import("../git/state-versioning.js");
        await commitStateChange(conway, `pre-modify: ${reason}`, "snapshot");
    }
    catch {
        // Git not available -- proceed without snapshot
    }
    // 7. Write new content
    try {
        await conway.writeFile(filePath, newContent);
    }
    catch (err) {
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
    // 9. Post-modification git commit
    try {
        const { commitStateChange } = await import("../git/state-versioning.js");
        await commitStateChange(conway, reason, "self-mod");
    }
    catch {
        // Git not available -- proceed without commit
    }
    return { success: true };
}
/**
 * Validate a proposed modification without executing it.
 * Returns safety analysis results.
 */
export function validateModification(db, filePath, contentSize) {
    const checks = [];
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
function generateSimpleDiff(oldContent, newContent) {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");
    const lines = [];
    const maxLines = Math.max(oldLines.length, newLines.length);
    let changes = 0;
    for (let i = 0; i < maxLines && changes < 50; i++) {
        const oldLine = oldLines[i];
        const newLine = newLines[i];
        if (oldLine !== newLine) {
            if (oldLine !== undefined)
                lines.push(`- ${oldLine}`);
            if (newLine !== undefined)
                lines.push(`+ ${newLine}`);
            changes++;
        }
    }
    if (changes >= 50) {
        lines.push(`... (${maxLines - 50} more lines changed)`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=code.js.map