/**
 * Alert Engine
 *
 * Evaluates alert rules against metric snapshots.
 * Tracks cooldowns per rule to avoid alert storms.
 * Never throws — evaluates all rules and collects errors silently.
 */
import type { AlertRule, AlertEvent, MetricSnapshot } from "../types.js";
export declare function createDefaultAlertRules(): AlertRule[];
export declare class AlertEngine {
    private rules;
    private lastFired;
    private activeAlerts;
    constructor(rules?: AlertRule[]);
    addRule(rule: AlertRule): void;
    evaluate(metrics: MetricsCollector | MetricSnapshot): AlertEvent[];
    getActiveAlerts(): AlertEvent[];
    clearAlert(ruleName: string): void;
    private extractMetricValues;
}
import type { MetricsCollector } from "./metrics.js";
//# sourceMappingURL=alerts.d.ts.map