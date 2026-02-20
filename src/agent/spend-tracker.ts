/**
 * Spend Tracker
 *
 * DB-backed spend tracking with hourly/daily window aggregation.
 * Implements SpendTrackerInterface for policy engine integration.
 */

import { ulid } from "ulid";
import type Database from "better-sqlite3";
import type {
  SpendTrackerInterface,
  SpendEntry,
  SpendCategory,
  TreasuryPolicy,
  LimitCheckResult,
} from "../types.js";
import {
  insertSpendRecord,
  getSpendByWindow,
  pruneSpendRecords,
} from "../state/database.js";
import type { SpendTrackingRow } from "../state/database.js";

/**
 * Get the current hour window string in ISO format: '2026-02-19T14'
 */
function getCurrentHourWindow(): string {
  const now = new Date();
  return now.toISOString().slice(0, 13); // '2026-02-19T14'
}

/**
 * Get the current day window string in ISO format: '2026-02-19'
 */
function getCurrentDayWindow(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10); // '2026-02-19'
}

export class SpendTracker implements SpendTrackerInterface {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  recordSpend(entry: SpendEntry): void {
    const row: SpendTrackingRow = {
      id: ulid(),
      toolName: entry.toolName,
      amountCents: entry.amountCents,
      recipient: entry.recipient ?? null,
      domain: entry.domain ?? null,
      category: entry.category,
      windowHour: getCurrentHourWindow(),
      windowDay: getCurrentDayWindow(),
    };
    insertSpendRecord(this.db, row);
  }

  getHourlySpend(category: SpendCategory): number {
    const window = getCurrentHourWindow();
    return getSpendByWindow(this.db, category, "hour", window);
  }

  getDailySpend(category: SpendCategory): number {
    const window = getCurrentDayWindow();
    return getSpendByWindow(this.db, category, "day", window);
  }

  getTotalSpend(category: SpendCategory, since: Date): number {
    // SQLite datetime('now') stores as 'YYYY-MM-DD HH:MM:SS' (no T, no Z)
    // Convert the since Date to the same format for comparison
    const sinceStr = since.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM spend_tracking WHERE category = ? AND created_at >= ?`,
      )
      .get(category, sinceStr) as { total: number };
    return row.total;
  }

  checkLimit(
    amount: number,
    category: SpendCategory,
    limits: TreasuryPolicy,
  ): LimitCheckResult {
    const currentHourlySpend = this.getHourlySpend(category);
    const currentDailySpend = this.getDailySpend(category);

    let limitHourly: number;
    let limitDaily: number;

    if (category === "transfer") {
      limitHourly = limits.maxHourlyTransferCents;
      limitDaily = limits.maxDailyTransferCents;
    } else if (category === "x402") {
      // x402 payments have their own per-payment cap; use a reasonable
      // hourly/daily envelope derived from the per-payment maximum
      limitHourly = limits.maxX402PaymentCents * 10;
      limitDaily = limits.maxX402PaymentCents * 50;
    } else {
      // Derive a meaningful hourly cap from the daily budget.
      // Without this, the entire daily budget could be consumed in one hour.
      limitHourly = Math.ceil(limits.maxInferenceDailyCents / 6);
      limitDaily = limits.maxInferenceDailyCents;
    }

    if (currentHourlySpend + amount > limitHourly) {
      return {
        allowed: false,
        reason: `Hourly spend cap exceeded: current ${currentHourlySpend} + ${amount} > ${limitHourly}`,
        currentHourlySpend,
        currentDailySpend,
        limitHourly,
        limitDaily,
      };
    }

    if (currentDailySpend + amount > limitDaily) {
      return {
        allowed: false,
        reason: `Daily spend cap exceeded: current ${currentDailySpend} + ${amount} > ${limitDaily}`,
        currentHourlySpend,
        currentDailySpend,
        limitHourly,
        limitDaily,
      };
    }

    return {
      allowed: true,
      currentHourlySpend,
      currentDailySpend,
      limitHourly,
      limitDaily,
    };
  }

  pruneOldRecords(retentionDays: number): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    // SQLite datetime('now') stores as 'YYYY-MM-DD HH:MM:SS' (no T, no Z)
    // Convert to the same format for correct string comparison
    const cutoffStr = cutoff.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
    return pruneSpendRecords(this.db, cutoffStr);
  }
}
