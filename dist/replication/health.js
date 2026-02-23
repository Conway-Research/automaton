/**
 * Child Health Monitor
 *
 * Checks the health of child automatons by querying their sandboxes.
 * Uses JSON parsing (not string matching) for status results.
 * Never throws from health checks -- returns issues array instead.
 */
import { DEFAULT_CHILD_HEALTH_CONFIG } from "../types.js";
export { DEFAULT_CHILD_HEALTH_CONFIG };
export class ChildHealthMonitor {
    db;
    conway;
    lifecycle;
    config;
    constructor(db, conway, lifecycle, config) {
        this.db = db;
        this.conway = conway;
        this.lifecycle = lifecycle;
        this.config = { ...DEFAULT_CHILD_HEALTH_CONFIG, ...config };
    }
    /**
     * Check health of a single child. Never throws.
     */
    async checkHealth(childId) {
        const issues = [];
        let healthy = false;
        let lastSeen = null;
        let uptime = null;
        let creditBalance = null;
        try {
            // Look up child sandbox
            const childRow = this.db
                .prepare("SELECT sandbox_id FROM children WHERE id = ?")
                .get(childId);
            if (!childRow) {
                return { childId, healthy: false, lastSeen: null, uptime: null, creditBalance: null, issues: ["child not found"] };
            }
            // Execute status check in sandbox
            const result = await this.conway.exec(`curl -sf http://localhost:3000/health 2>/dev/null || echo '{"status":"offline"}'`, 10_000);
            // Parse JSON status output (not string matching)
            try {
                const status = JSON.parse(result.stdout.trim());
                if (status.status === "healthy" || status.status === "running") {
                    healthy = true;
                    lastSeen = new Date().toISOString();
                    uptime = status.uptime ?? null;
                    creditBalance = status.creditBalance ?? null;
                }
                else {
                    issues.push(`status: ${status.status}`);
                    if (status.error)
                        issues.push(`error: ${status.error}`);
                }
            }
            catch {
                issues.push("failed to parse health check response");
            }
        }
        catch (error) {
            issues.push(`health check error: ${error instanceof Error ? error.message : String(error)}`);
        }
        // Update last_checked timestamp
        try {
            this.db.prepare("UPDATE children SET last_checked = datetime('now') WHERE id = ?").run(childId);
        }
        catch {
            // Non-critical
        }
        return { childId, healthy, lastSeen, uptime, creditBalance, issues };
    }
    /**
     * Check health of all active children (healthy + unhealthy).
     * Respects concurrency limits. Transitions children based on results.
     */
    async checkAllChildren() {
        const healthyChildren = this.lifecycle.getChildrenInState("healthy");
        const unhealthyChildren = this.lifecycle.getChildrenInState("unhealthy");
        const allChildren = [...healthyChildren, ...unhealthyChildren];
        if (allChildren.length === 0)
            return [];
        const results = [];
        const maxConcurrent = this.config.maxConcurrentChecks;
        // Process in batches for concurrency limiting
        for (let i = 0; i < allChildren.length; i += maxConcurrent) {
            const batch = allChildren.slice(i, i + maxConcurrent);
            const batchResults = await Promise.all(batch.map((child) => this.checkHealth(child.id)));
            for (const result of batchResults) {
                const child = allChildren.find((c) => c.id === result.childId);
                if (!child)
                    continue;
                try {
                    if (!result.healthy && child.status === "healthy") {
                        this.lifecycle.transition(result.childId, "unhealthy", result.issues.join("; "));
                    }
                    else if (result.healthy && child.status === "unhealthy") {
                        this.lifecycle.transition(result.childId, "healthy", "recovered");
                    }
                }
                catch {
                    // Transition may fail if state changed concurrently; non-fatal
                }
                results.push(result);
            }
        }
        return results;
    }
}
//# sourceMappingURL=health.js.map