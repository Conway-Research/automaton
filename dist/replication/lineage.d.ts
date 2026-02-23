/**
 * Lineage Tracking
 *
 * Track parent-child relationships between automatons.
 * The parent records children in SQLite.
 * Children record their parent in config.
 * ERC-8004 registration includes parentAgent field.
 *
 * Phase 3.1: Actual pruning + concurrency-limited refresh.
 */
import type { AutomatonDatabase, ChildAutomaton, AutomatonConfig, ConwayClient } from "../types.js";
import type { ChildHealthMonitor } from "./health.js";
import type { SandboxCleanup } from "./cleanup.js";
/**
 * Get the full lineage tree (parent -> children).
 */
export declare function getLineage(db: AutomatonDatabase): {
    children: ChildAutomaton[];
    alive: number;
    dead: number;
    total: number;
};
/**
 * Check if this automaton has a parent (is itself a child).
 */
export declare function hasParent(config: AutomatonConfig): boolean;
/**
 * Get a summary of the lineage for the system prompt.
 */
export declare function getLineageSummary(db: AutomatonDatabase, config: AutomatonConfig): string;
/**
 * Prune dead children: actually delete from DB and clean up sandboxes.
 * Phase 3.1 fix: was previously a no-op.
 */
export declare function pruneDeadChildren(db: AutomatonDatabase, cleanup?: SandboxCleanup, keepLast?: number): Promise<number>;
/**
 * Refresh status of all children using health monitor.
 * Concurrency limited to 3 simultaneous checks.
 */
export declare function refreshChildrenStatus(conway: ConwayClient, db: AutomatonDatabase, healthMonitor?: ChildHealthMonitor): Promise<void>;
//# sourceMappingURL=lineage.d.ts.map