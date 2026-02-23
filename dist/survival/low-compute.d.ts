/**
 * Low Compute Mode
 *
 * Manages transitions between survival tiers.
 * When credits run low, the automaton enters increasingly restricted modes.
 */
import type { AutomatonDatabase, InferenceClient, SurvivalTier } from "../types.js";
export interface ModeTransition {
    from: SurvivalTier;
    to: SurvivalTier;
    timestamp: string;
    creditsCents: number;
}
/**
 * Apply survival tier restrictions to the automaton.
 */
export declare function applyTierRestrictions(tier: SurvivalTier, inference: InferenceClient, db: AutomatonDatabase): void;
/**
 * Record a tier transition.
 */
export declare function recordTransition(db: AutomatonDatabase, from: SurvivalTier, to: SurvivalTier, creditsCents: number): ModeTransition;
/**
 * Check if the agent should be allowed to run inference in current tier.
 */
export declare function canRunInference(tier: SurvivalTier): boolean;
/**
 * Get the model to use for the current tier.
 */
export declare function getModelForTier(tier: SurvivalTier, defaultModel: string): string;
//# sourceMappingURL=low-compute.d.ts.map