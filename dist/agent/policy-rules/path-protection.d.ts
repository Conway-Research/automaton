/**
 * File Path Protection Policy Rules
 *
 * Prevents writes to protected files, reads of sensitive files,
 * and path traversal attacks. Fixes the parallel file mutation
 * paths (edit_own_file vs write_file) by unifying protection.
 */
import type { PolicyRule } from "../../types.js";
export declare function createPathProtectionRules(): PolicyRule[];
//# sourceMappingURL=path-protection.d.ts.map