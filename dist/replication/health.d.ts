/**
 * Child Health Monitor
 *
 * Checks the health of child automatons by querying their sandboxes.
 * Uses JSON parsing (not string matching) for status results.
 * Never throws from health checks -- returns issues array instead.
 */
import type { Database as DatabaseType } from "better-sqlite3";
import type { ConwayClient, HealthCheckResult, ChildHealthConfig } from "../types.js";
import { DEFAULT_CHILD_HEALTH_CONFIG } from "../types.js";
import type { ChildLifecycle } from "./lifecycle.js";
export { DEFAULT_CHILD_HEALTH_CONFIG };
export declare class ChildHealthMonitor {
    private db;
    private conway;
    private lifecycle;
    private config;
    constructor(db: DatabaseType, conway: ConwayClient, lifecycle: ChildLifecycle, config?: Partial<ChildHealthConfig>);
    /**
     * Check health of a single child. Never throws.
     */
    checkHealth(childId: string): Promise<HealthCheckResult>;
    /**
     * Check health of all active children (healthy + unhealthy).
     * Respects concurrency limits. Transitions children based on results.
     */
    checkAllChildren(): Promise<HealthCheckResult[]>;
}
//# sourceMappingURL=health.d.ts.map