/**
 * Rate Limit Policy Rules
 *
 * Enforces rate limits on sensitive operations to prevent abuse.
 * Queries the policy_decisions table to count recent operations.
 */
import type { PolicyRule } from "../../types.js";
/**
 * Create all rate limit policy rules.
 */
export declare function createRateLimitRules(): PolicyRule[];
//# sourceMappingURL=rate-limits.d.ts.map