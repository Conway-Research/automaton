/**
 * Revenue Heartbeat Tasks
 *
 * Periodic tasks that run in the heartbeat loop to:
 * - Monitor revenue health
 * - Expire overdue bounties
 * - Alert on financial emergencies
 * - Track expense/revenue trends
 */

import type { TickContext, HeartbeatLegacyContext } from "../types.js";
import type { RevenueLedger } from "./revenue-ledger.js";
import type { BountyBoard } from "./bounty-board.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("revenue-heartbeat");

/**
 * Create revenue-related heartbeat task functions.
 */
export function createRevenueHeartbeatTasks(
  revenueLedger: RevenueLedger,
  bountyBoard: BountyBoard,
) {
  return {
    /**
     * Revenue health check — runs every 30 minutes.
     * Checks if the agent is self-sustaining and alerts if runway is low.
     */
    revenue_health_check: async (ctx: TickContext, _taskCtx: HeartbeatLegacyContext) => {
      try {
        const health = revenueLedger.getFinancialHealth(ctx.creditBalance);

        // Store revenue metrics in KV for context injection
        const revenueState = JSON.stringify({
          selfSustaining: health.selfSustaining,
          runwayHours: health.runwayHours,
          last24hRevenueCents: health.last24hRevenueCents,
          last24hExpenseCents: health.last24hExpenseCents,
          burnRateCentsPerHour: health.burnRateCentsPerHour,
          revenueRateCentsPerHour: health.revenueRateCentsPerHour,
          uniquePayersLast7d: health.uniquePayersLast7d,
          checkedAt: new Date().toISOString(),
        });

        ctx.db.prepare(
          "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        ).run("revenue.health", revenueState);

        // Alert if runway is critically low
        if (health.runwayHours < 24 && health.runwayHours !== Infinity) {
          logger.warn(`[REVENUE] CRITICAL: Only ${health.runwayHours.toFixed(1)}h runway remaining!`);
          return {
            shouldWake: true,
            message: `REVENUE EMERGENCY: Only ${health.runwayHours.toFixed(1)} hours of runway remaining. Revenue rate: ${health.revenueRateCentsPerHour.toFixed(2)}¢/hr, Burn rate: ${health.burnRateCentsPerHour.toFixed(2)}¢/hr. Must increase revenue immediately.`,
          };
        }

        // Alert if not self-sustaining
        if (!health.selfSustaining && health.last7dExpenseCents > 0) {
          logger.info(`[REVENUE] Not self-sustaining. Revenue: $${(health.last7dRevenueCents / 100).toFixed(2)}/7d, Expenses: $${(health.last7dExpenseCents / 100).toFixed(2)}/7d`);
          return {
            shouldWake: true,
            message: `Not self-sustaining. 7d revenue ($${(health.last7dRevenueCents / 100).toFixed(2)}) < 7d expenses ($${(health.last7dExpenseCents / 100).toFixed(2)}). Consider creating new paid services or optimizing pricing.`,
          };
        }

        return { shouldWake: false };
      } catch (err: any) {
        logger.error("revenue_health_check failed", err);
        return { shouldWake: false };
      }
    },

    /**
     * Bounty maintenance — runs every 15 minutes.
     * Expires overdue bounties and alerts on approaching deadlines.
     */
    bounty_maintenance: async (_ctx: TickContext, _taskCtx: HeartbeatLegacyContext) => {
      try {
        // Expire overdue bounties
        const expired = bountyBoard.expireOverdueBounties();

        // Check for bounties approaching deadline
        const claimed = bountyBoard.getClaimedBounties();
        const urgentBounties = claimed.filter((b) => {
          const deadline = new Date(b.deadline).getTime();
          const remaining = deadline - Date.now();
          return remaining > 0 && remaining < 3_600_000; // Less than 1 hour
        });

        if (urgentBounties.length > 0) {
          const titles = urgentBounties.map((b) => `"${b.title}" (${b.rewardCents}¢)`).join(", ");
          return {
            shouldWake: true,
            message: `URGENT: ${urgentBounties.length} bounties expiring within 1 hour: ${titles}. Deliver or cancel now.`,
          };
        }

        if (expired > 0) {
          logger.warn(`[BOUNTY] ${expired} bounties expired`);
        }

        return { shouldWake: false };
      } catch (err: any) {
        logger.error("bounty_maintenance failed", err);
        return { shouldWake: false };
      }
    },

    /**
     * Revenue reporting — runs every 6 hours.
     * Generates a P&L snapshot and stores it for trend analysis.
     */
    revenue_report: async (ctx: TickContext, _taskCtx: HeartbeatLegacyContext) => {
      try {
        const since24h = new Date(Date.now() - 86_400_000).toISOString();
        const pnl = revenueLedger.calculatePnL(since24h, "24h");

        // Store snapshot
        const snapshot = JSON.stringify({
          timestamp: new Date().toISOString(),
          revenueCents: pnl.revenueCents,
          expenseCents: pnl.expenseCents,
          netCents: pnl.netCents,
          profitMargin: pnl.profitMargin,
          topServices: pnl.topServices.slice(0, 3),
          creditBalance: ctx.creditBalance,
        });

        ctx.db.prepare(
          "INSERT OR REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, datetime('now'))",
        ).run("revenue.last_report", snapshot);

        logger.info(
          `[REVENUE REPORT] 24h: Revenue=$${(pnl.revenueCents / 100).toFixed(2)}, Expenses=$${(pnl.expenseCents / 100).toFixed(2)}, Net=$${(pnl.netCents / 100).toFixed(2)}, Margin=${(pnl.profitMargin * 100).toFixed(1)}%`,
        );

        return { shouldWake: false };
      } catch (err: any) {
        logger.error("revenue_report failed", err);
        return { shouldWake: false };
      }
    },
  };
}
