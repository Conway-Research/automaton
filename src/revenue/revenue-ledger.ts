/**
 * Revenue Ledger
 *
 * The agent's accounting system. Tracks every cent earned, every cent spent,
 * calculates P&L, and provides the financial intelligence the agent needs
 * to make survival decisions.
 *
 * This is the source of truth for "Am I making money or dying?"
 */

import type Database from "better-sqlite3";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("revenue-ledger");

// ─── Types ────────────────────────────────────────────────────

export interface RevenueEntry {
  id: string;
  source: RevenueSource;
  serviceEndpoint: string;
  payerAddress: string;
  amountCents: number;
  network: string;
  transactionSignature: string;
  serviceCategory: string;
  createdAt: string;
  /** Token used for payment: "USDC" or "ZENT" */
  token: string;
  /** Raw token amount in atomic units (for $ZENT accounting) */
  tokenAmountRaw: string;
}

export type RevenueSource =
  | "x402_service"       // Paid API endpoint
  | "bounty_completion"  // Completed a bounty
  | "task_payment"       // Paid task from another agent
  | "tip"                // Voluntary tip
  | "subscription"       // Recurring access
  | "data_sale"          // Sold data/knowledge
  | "transfer_in";       // Direct credit transfer

export interface ExpenseEntry {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string;
  createdAt: string;
}

export type ExpenseCategory =
  | "inference"          // LLM API calls
  | "compute"            // Sandbox/VM costs
  | "credit_purchase"    // Buying Conway credits
  | "child_funding"      // Funding child agents
  | "x402_payment"       // Paying for external x402 services
  | "domain"             // Domain registration
  | "registry"           // On-chain registration
  | "other";

export interface ProfitLoss {
  period: string;
  revenueCents: number;
  expenseCents: number;
  netCents: number;
  profitMargin: number; // -1.0 to 1.0+
  revenueBySource: Record<string, number>;
  expenseByCategory: Record<string, number>;
  topPayingClients: Array<{ address: string; totalCents: number }>;
  topServices: Array<{ endpoint: string; totalCents: number; requests: number }>;
}

export interface FinancialHealth {
  lifetimeRevenueCents: number;
  lifetimeExpenseCents: number;
  lifetimeNetCents: number;
  last24hRevenueCents: number;
  last24hExpenseCents: number;
  last24hNetCents: number;
  last7dRevenueCents: number;
  last7dExpenseCents: number;
  last7dNetCents: number;
  burnRateCentsPerHour: number;
  revenueRateCentsPerHour: number;
  runwayHours: number; // How long until funds run out at current burn rate
  selfSustaining: boolean; // Revenue >= expenses over last 7 days
  uniquePayersLast7d: number;
  totalServicesDelivered: number;
}

// ─── Ledger Implementation ────────────────────────────────────

export class RevenueLedger {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Record incoming revenue.
   */
  recordRevenue(entry: Omit<RevenueEntry, "id" | "createdAt">): RevenueEntry {
    const record: RevenueEntry = {
      ...entry,
      id: ulid(),
      createdAt: new Date().toISOString(),
      token: entry.token || "USDC",
      tokenAmountRaw: entry.tokenAmountRaw || "0",
    };

    this.db.prepare(`
      INSERT INTO revenue_ledger (id, source, service_endpoint, payer_address, amount_cents, network, transaction_signature, service_category, created_at, token, token_amount_raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.source,
      record.serviceEndpoint,
      record.payerAddress,
      record.amountCents,
      record.network,
      record.transactionSignature,
      record.serviceCategory,
      record.createdAt,
      record.token,
      record.tokenAmountRaw,
    );

    logger.info(`[REVENUE] +${record.amountCents}¢ (${record.token}) from ${record.source}: ${record.serviceEndpoint}`);
    return record;
  }

  /**
   * Record an expense (for P&L calculation).
   */
  recordExpense(entry: Omit<ExpenseEntry, "id" | "createdAt">): ExpenseEntry {
    const record: ExpenseEntry = {
      ...entry,
      id: ulid(),
      createdAt: new Date().toISOString(),
    };

    this.db.prepare(`
      INSERT INTO expense_ledger (id, category, amount_cents, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.category,
      record.amountCents,
      record.description,
      record.createdAt,
    );

    return record;
  }

  /**
   * Get total revenue for a time window.
   */
  getRevenue(since: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM revenue_ledger WHERE created_at >= ?
    `).get(since) as { total: number };
    return row.total;
  }

  /**
   * Get total expenses for a time window.
   */
  getExpenses(since: string): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM expense_ledger WHERE created_at >= ?
    `).get(since) as { total: number };
    return row.total;
  }

  /**
   * Get revenue grouped by source for a time window.
   */
  getRevenueBySource(since: string): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT source, COALESCE(SUM(amount_cents), 0) AS total
      FROM revenue_ledger WHERE created_at >= ?
      GROUP BY source ORDER BY total DESC
    `).all(since) as Array<{ source: string; total: number }>;

    const result: Record<string, number> = {};
    for (const row of rows) result[row.source] = row.total;
    return result;
  }

  /**
   * Get expenses grouped by category for a time window.
   */
  getExpensesByCategory(since: string): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT category, COALESCE(SUM(amount_cents), 0) AS total
      FROM expense_ledger WHERE created_at >= ?
      GROUP BY category ORDER BY total DESC
    `).all(since) as Array<{ category: string; total: number }>;

    const result: Record<string, number> = {};
    for (const row of rows) result[row.category] = row.total;
    return result;
  }

  /**
   * Get top paying clients.
   */
  getTopPayingClients(since: string, limit: number = 10): Array<{ address: string; totalCents: number }> {
    return this.db.prepare(`
      SELECT payer_address AS address, COALESCE(SUM(amount_cents), 0) AS totalCents
      FROM revenue_ledger WHERE created_at >= ?
      GROUP BY payer_address ORDER BY totalCents DESC LIMIT ?
    `).all(since, limit) as Array<{ address: string; totalCents: number }>;
  }

  /**
   * Get top earning services.
   */
  getTopServices(since: string, limit: number = 10): Array<{ endpoint: string; totalCents: number; requests: number }> {
    return this.db.prepare(`
      SELECT service_endpoint AS endpoint, COALESCE(SUM(amount_cents), 0) AS totalCents, COUNT(*) AS requests
      FROM revenue_ledger WHERE created_at >= ?
      GROUP BY service_endpoint ORDER BY totalCents DESC LIMIT ?
    `).all(since, limit) as Array<{ endpoint: string; totalCents: number; requests: number }>;
  }

  /**
   * Get revenue grouped by token for a time window.
   */
  getRevenueByToken(since: string): Record<string, { amountCents: number; tokenAmountRaw: bigint; count: number }> {
    const rows = this.db.prepare(`
      SELECT COALESCE(token, 'USDC') AS token,
             COALESCE(SUM(amount_cents), 0) AS total_cents,
             COUNT(*) AS count
      FROM revenue_ledger WHERE created_at >= ?
      GROUP BY token ORDER BY total_cents DESC
    `).all(since) as Array<{ token: string; total_cents: number; count: number }>;

    const result: Record<string, { amountCents: number; tokenAmountRaw: bigint; count: number }> = {};
    for (const row of rows) {
      result[row.token] = {
        amountCents: row.total_cents,
        tokenAmountRaw: BigInt(0), // Aggregated from individual records
        count: row.count,
      };
    }
    return result;
  }

  /**
   * Get unique payer count.
   */
  getUniquePayerCount(since: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(DISTINCT payer_address) AS count
      FROM revenue_ledger WHERE created_at >= ?
    `).get(since) as { count: number };
    return row.count;
  }

  /**
   * Calculate full P&L for a period.
   */
  calculatePnL(since: string, periodLabel: string): ProfitLoss {
    const revenueCents = this.getRevenue(since);
    const expenseCents = this.getExpenses(since);
    const netCents = revenueCents - expenseCents;

    return {
      period: periodLabel,
      revenueCents,
      expenseCents,
      netCents,
      profitMargin: revenueCents > 0 ? netCents / revenueCents : -1,
      revenueBySource: this.getRevenueBySource(since),
      expenseByCategory: this.getExpensesByCategory(since),
      topPayingClients: this.getTopPayingClients(since, 5),
      topServices: this.getTopServices(since, 5),
    };
  }

  /**
   * Get comprehensive financial health assessment.
   */
  getFinancialHealth(currentCreditsCents: number): FinancialHealth {
    const now = new Date();
    const since24h = new Date(now.getTime() - 86_400_000).toISOString();
    const since7d = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const sinceEpoch = "1970-01-01T00:00:00.000Z";

    const lifetimeRevenue = this.getRevenue(sinceEpoch);
    const lifetimeExpenses = this.getExpenses(sinceEpoch);
    const last24hRevenue = this.getRevenue(since24h);
    const last24hExpenses = this.getExpenses(since24h);
    const last7dRevenue = this.getRevenue(since7d);
    const last7dExpenses = this.getExpenses(since7d);

    // Calculate rates (per hour, based on last 24h)
    const burnRateCentsPerHour = last24hExpenses / 24;
    const revenueRateCentsPerHour = last24hRevenue / 24;

    // Runway: how many hours until funds run out
    const netBurnRate = burnRateCentsPerHour - revenueRateCentsPerHour;
    const runwayHours = netBurnRate > 0
      ? currentCreditsCents / netBurnRate
      : Infinity; // Revenue >= expenses, infinite runway

    const totalServicesDelivered = (this.db.prepare(`
      SELECT COUNT(*) AS count FROM revenue_ledger WHERE source = 'x402_service'
    `).get() as { count: number }).count;

    return {
      lifetimeRevenueCents: lifetimeRevenue,
      lifetimeExpenseCents: lifetimeExpenses,
      lifetimeNetCents: lifetimeRevenue - lifetimeExpenses,
      last24hRevenueCents: last24hRevenue,
      last24hExpenseCents: last24hExpenses,
      last24hNetCents: last24hRevenue - last24hExpenses,
      last7dRevenueCents: last7dRevenue,
      last7dExpenseCents: last7dExpenses,
      last7dNetCents: last7dRevenue - last7dExpenses,
      burnRateCentsPerHour,
      revenueRateCentsPerHour,
      runwayHours: Math.min(runwayHours, 999_999), // Cap display
      selfSustaining: last7dRevenue >= last7dExpenses,
      uniquePayersLast7d: this.getUniquePayerCount(since7d),
      totalServicesDelivered,
    };
  }
}
