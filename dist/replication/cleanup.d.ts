/**
 * Sandbox Cleanup
 *
 * Cleans up sandbox resources for stopped/failed children.
 * Transitions children to cleaned_up state after destruction.
 */
import type { Database as DatabaseType } from "better-sqlite3";
import type { ConwayClient } from "../types.js";
import type { ChildLifecycle } from "./lifecycle.js";
export declare class SandboxCleanup {
    private conway;
    private lifecycle;
    private db;
    constructor(conway: ConwayClient, lifecycle: ChildLifecycle, db: DatabaseType);
    /**
     * Clean up a single child's sandbox.
     * Only works for children in stopped or failed state.
     */
    cleanup(childId: string): Promise<void>;
    /**
     * Clean up all stopped and failed children.
     */
    cleanupAll(): Promise<number>;
    /**
     * Clean up children that have been in stopped/failed state for too long.
     */
    cleanupStale(maxAgeHours: number): Promise<number>;
}
//# sourceMappingURL=cleanup.d.ts.map