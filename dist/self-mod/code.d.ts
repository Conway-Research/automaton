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
import type { ConwayClient, AutomatonDatabase } from "../types.js";
/**
 * Check if a file path is protected from modification.
 */
export declare function isProtectedFile(filePath: string): boolean;
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
export declare function editFile(conway: ConwayClient, db: AutomatonDatabase, filePath: string, newContent: string, reason: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Validate a proposed modification without executing it.
 * Returns safety analysis results.
 */
export declare function validateModification(db: AutomatonDatabase, filePath: string, contentSize: number): {
    allowed: boolean;
    reason: string;
    checks: {
        name: string;
        passed: boolean;
        detail: string;
    }[];
};
//# sourceMappingURL=code.d.ts.map