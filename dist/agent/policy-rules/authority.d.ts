/**
 * Authority Policy Rules
 *
 * Controls what actions are allowed based on input authority level.
 * External/heartbeat-initiated turns cannot use dangerous tools
 * or modify protected files.
 */
import type { PolicyRule } from "../../types.js";
/**
 * Create all authority policy rules.
 */
export declare function createAuthorityRules(): PolicyRule[];
//# sourceMappingURL=authority.d.ts.map