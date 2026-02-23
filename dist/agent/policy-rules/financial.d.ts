/**
 * Financial Policy Rules
 *
 * Enforces spend limits, domain allowlists, and transfer caps
 * to prevent iterative credit drain and unauthorized payments.
 */
import type { PolicyRule, TreasuryPolicy } from "../../types.js";
/**
 * Create all financial policy rules.
 */
export declare function createFinancialRules(treasuryPolicy: TreasuryPolicy): PolicyRule[];
//# sourceMappingURL=financial.d.ts.map