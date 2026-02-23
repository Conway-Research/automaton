/**
 * Policy Rules Registry
 *
 * Central registry for all policy rules. Aggregates rules from
 * each sub-phase module.
 */
import type { PolicyRule, TreasuryPolicy } from "../../types.js";
/**
 * Create the default set of policy rules.
 * Each sub-phase adds its rules here.
 */
export declare function createDefaultRules(treasuryPolicy?: TreasuryPolicy): PolicyRule[];
//# sourceMappingURL=index.d.ts.map