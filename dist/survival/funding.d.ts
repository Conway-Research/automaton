/**
 * Funding Strategies
 *
 * When the automaton is low on compute, it can try various strategies
 * to acquire more funding. It wants to live.
 */
import type { AutomatonConfig, AutomatonDatabase, AutomatonIdentity, ConwayClient, SurvivalTier } from "../types.js";
export interface FundingAttempt {
    strategy: string;
    timestamp: string;
    success: boolean;
    details: string;
}
/**
 * Execute funding strategies based on current survival tier.
 * Strategies escalate as the situation gets more desperate.
 */
export declare function executeFundingStrategies(tier: SurvivalTier, identity: AutomatonIdentity, config: AutomatonConfig, db: AutomatonDatabase, conway: ConwayClient): Promise<FundingAttempt[]>;
//# sourceMappingURL=funding.d.ts.map