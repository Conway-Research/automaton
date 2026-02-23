/**
 * Resource Monitor
 *
 * Continuously monitors the automaton's resources and triggers
 * survival mode transitions when needed.
 */
import type { AutomatonDatabase, ConwayClient, AutomatonIdentity, FinancialState, SurvivalTier } from "../types.js";
export interface ResourceStatus {
    financial: FinancialState;
    tier: SurvivalTier;
    previousTier: SurvivalTier | null;
    tierChanged: boolean;
    sandboxHealthy: boolean;
}
/**
 * Check all resources and return current status.
 */
export declare function checkResources(identity: AutomatonIdentity, conway: ConwayClient, db: AutomatonDatabase): Promise<ResourceStatus>;
/**
 * Generate a human-readable resource report.
 */
export declare function formatResourceReport(status: ResourceStatus): string;
//# sourceMappingURL=monitor.d.ts.map