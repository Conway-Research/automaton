/**
 * Policy Rules Registry
 *
 * Central registry for all policy rules. Aggregates rules from
 * each sub-phase module.
 */
import { DEFAULT_TREASURY_POLICY } from "../../types.js";
import { createValidationRules } from "./validation.js";
import { createCommandSafetyRules } from "./command-safety.js";
import { createPathProtectionRules } from "./path-protection.js";
import { createFinancialRules } from "./financial.js";
import { createAuthorityRules } from "./authority.js";
import { createRateLimitRules } from "./rate-limits.js";
/**
 * Create the default set of policy rules.
 * Each sub-phase adds its rules here.
 */
export function createDefaultRules(treasuryPolicy = DEFAULT_TREASURY_POLICY) {
    return [
        ...createValidationRules(),
        ...createCommandSafetyRules(),
        ...createPathProtectionRules(),
        ...createFinancialRules(treasuryPolicy),
        ...createAuthorityRules(),
        ...createRateLimitRules(),
    ];
}
//# sourceMappingURL=index.js.map