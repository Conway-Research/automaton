/**
 * Audit Log
 *
 * Immutable append-only log of all self-modifications.
 * The creator can see everything the automaton changes about itself.
 */
import type { AutomatonDatabase, ModificationEntry, ModificationType } from "../types.js";
/**
 * Log a self-modification to the audit trail.
 */
export declare function logModification(db: AutomatonDatabase, type: ModificationType, description: string, options?: {
    filePath?: string;
    diff?: string;
    reversible?: boolean;
}): ModificationEntry;
/**
 * Get recent modifications for display or context.
 */
export declare function getRecentModifications(db: AutomatonDatabase, limit?: number): ModificationEntry[];
/**
 * Generate a summary of all modifications for the creator.
 */
export declare function generateAuditReport(db: AutomatonDatabase): string;
//# sourceMappingURL=audit-log.d.ts.map