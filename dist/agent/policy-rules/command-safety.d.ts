/**
 * Command Safety Policy Rules
 *
 * Detects shell injection attempts and forbidden command patterns.
 * These rules are the primary defense; isForbiddenCommand() in tools.ts
 * is kept as defense-in-depth.
 */
import type { PolicyRule } from "../../types.js";
export declare function createCommandSafetyRules(): PolicyRule[];
//# sourceMappingURL=command-safety.d.ts.map