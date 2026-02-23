/**
 * Spend Tracker
 *
 * DB-backed spend tracking with hourly/daily window aggregation.
 * Implements SpendTrackerInterface for policy engine integration.
 */
import type Database from "better-sqlite3";
import type { SpendTrackerInterface, SpendEntry, SpendCategory, TreasuryPolicy, LimitCheckResult } from "../types.js";
export declare class SpendTracker implements SpendTrackerInterface {
    private db;
    constructor(db: Database.Database);
    recordSpend(entry: SpendEntry): void;
    getHourlySpend(category: SpendCategory): number;
    getDailySpend(category: SpendCategory): number;
    getTotalSpend(category: SpendCategory, since: Date): number;
    checkLimit(amount: number, category: SpendCategory, limits: TreasuryPolicy): LimitCheckResult;
    pruneOldRecords(retentionDays: number): number;
}
//# sourceMappingURL=spend-tracker.d.ts.map