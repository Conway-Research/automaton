/**
 * Constitution Integrity
 *
 * Propagates and verifies constitution files between parent and child sandboxes.
 * Uses SHA-256 hash verification instead of superficial chmod 444.
 */
import type { Database as DatabaseType } from "better-sqlite3";
import type { ConwayClient } from "../types.js";
/**
 * Propagate the local constitution to a child sandbox.
 * Writes file, computes hash, stores hash in KV.
 */
export declare function propagateConstitution(conway: ConwayClient, sandboxId: string, db: DatabaseType): Promise<void>;
/**
 * Verify a child's constitution integrity by comparing hashes.
 */
export declare function verifyConstitution(conway: ConwayClient, sandboxId: string, db: DatabaseType): Promise<{
    valid: boolean;
    detail: string;
}>;
//# sourceMappingURL=constitution.d.ts.map