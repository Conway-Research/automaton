/**
 * Policy Rules Registry
 *
 * Central registry for all policy rules. Aggregates rules from
 * each sub-phase module.
 */

import type { PolicyRule, TreasuryPolicy } from "../../types.js";
import { DEFAULT_TREASURY_POLICY } from "../../types.js";
import { createValidationRules } from "./validation.js";
import { createCommandSafetyRules } from "./command-safety.js";
import { createPathProtectionRules } from "./path-protection.js";
import { createFinancialRules } from "./financial.js";
import { createAuthorityRules } from "./authority.js";
import { createRateLimitRules } from "./rate-limits.js";
import { createFortressRules } from "../../revenue/financial-fortress.js";

/**
 * Create the default set of policy rules.
 * Each sub-phase adds its rules here.
 */
export function createDefaultRules(
  treasuryPolicy: TreasuryPolicy = DEFAULT_TREASURY_POLICY,
): PolicyRule[] {
  return [
    // Financial Fortress rules run FIRST (priority 50-100)
    // They are hardcoded and cannot be overridden
    ...createFortressRules(treasuryPolicy),
    ...createValidationRules(),
    ...createCommandSafetyRules(),
    ...createPathProtectionRules(),
    ...createFinancialRules(treasuryPolicy),
    ...createAuthorityRules(),
    ...createRateLimitRules(),
  ];
}
