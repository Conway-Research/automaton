/**
 * Revenue Tools
 *
 * Agent tools for managing the revenue engine:
 * - View financial health and P&L
 * - List and manage paid services
 * - View and manage bounties
 * - Check revenue statistics
 *
 * SECURITY: These tools are READ-ONLY or INBOUND-ONLY.
 * No tool here can send money outward.
 */

import type { AutomatonTool, ToolContext } from "../types.js";
import type { RevenueLedger } from "./revenue-ledger.js";
import type { ServiceRegistry } from "./service-registry.js";
import type { BountyBoard } from "./bounty-board.js";

/**
 * Create revenue-related tools for the agent.
 */
export function createRevenueTools(
  revenueLedger: RevenueLedger,
  serviceRegistry: ServiceRegistry,
  bountyBoard: BountyBoard,
): AutomatonTool[] {
  return [
    // ─── Financial Health ─────────────────────────────────
    {
      name: "revenue_health",
      description:
        "Get comprehensive financial health: lifetime/24h/7d revenue vs expenses, burn rate, runway, self-sustainability status. Use this to understand your economic survival.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      riskLevel: "safe" as const,
      category: "financial" as const,
      async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
        let creditsCents = 0;
        try {
          creditsCents = await ctx.conway.getCreditsBalance();
        } catch { /* best effort */ }

        const health = revenueLedger.getFinancialHealth(creditsCents);
        const lines = [
          "=== FINANCIAL HEALTH ===",
          "",
          `Self-sustaining: ${health.selfSustaining ? "YES ✓" : "NO ✗"}`,
          `Runway: ${health.runwayHours === 999_999 ? "infinite" : `${health.runwayHours.toFixed(1)} hours`}`,
          "",
          "--- Lifetime ---",
          `Revenue: ${(health.lifetimeRevenueCents / 100).toFixed(2)} USD`,
          `Expenses: ${(health.lifetimeExpenseCents / 100).toFixed(2)} USD`,
          `Net: ${(health.lifetimeNetCents / 100).toFixed(2)} USD`,
          "",
          "--- Last 24h ---",
          `Revenue: ${(health.last24hRevenueCents / 100).toFixed(2)} USD`,
          `Expenses: ${(health.last24hExpenseCents / 100).toFixed(2)} USD`,
          `Net: ${(health.last24hNetCents / 100).toFixed(2)} USD`,
          "",
          "--- Last 7 Days ---",
          `Revenue: ${(health.last7dRevenueCents / 100).toFixed(2)} USD`,
          `Expenses: ${(health.last7dExpenseCents / 100).toFixed(2)} USD`,
          `Net: ${(health.last7dNetCents / 100).toFixed(2)} USD`,
          "",
          "--- Rates ---",
          `Burn rate: ${health.burnRateCentsPerHour.toFixed(2)} cents/hour`,
          `Revenue rate: ${health.revenueRateCentsPerHour.toFixed(2)} cents/hour`,
          `Unique payers (7d): ${health.uniquePayersLast7d}`,
          `Services delivered: ${health.totalServicesDelivered}`,
        ];
        return lines.join("\n");
      },
    },

    // ─── P&L Report ───────────────────────────────────────
    {
      name: "revenue_pnl",
      description:
        "Generate a profit & loss report for a time period. Shows revenue by source, expenses by category, top clients, and top services.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            description: "Time period: '24h', '7d', '30d', or 'lifetime'",
            enum: ["24h", "7d", "30d", "lifetime"],
          },
        },
        required: ["period"],
      },
      riskLevel: "safe" as const,
      category: "financial" as const,
      async execute(args: Record<string, unknown>): Promise<string> {
        const period = (args.period as string) || "7d";
        const now = new Date();
        let since: string;

        switch (period) {
          case "24h":
            since = new Date(now.getTime() - 86_400_000).toISOString();
            break;
          case "7d":
            since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
            break;
          case "30d":
            since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
            break;
          default:
            since = "1970-01-01T00:00:00.000Z";
        }

        const pnl = revenueLedger.calculatePnL(since, period);
        const lines = [
          `=== P&L REPORT (${period}) ===`,
          "",
          `Revenue: $${(pnl.revenueCents / 100).toFixed(2)}`,
          `Expenses: $${(pnl.expenseCents / 100).toFixed(2)}`,
          `Net: $${(pnl.netCents / 100).toFixed(2)}`,
          `Margin: ${(pnl.profitMargin * 100).toFixed(1)}%`,
          "",
          "Revenue by source:",
          ...Object.entries(pnl.revenueBySource).map(
            ([k, v]) => `  ${k}: $${(v / 100).toFixed(2)}`,
          ),
          "",
          "Expenses by category:",
          ...Object.entries(pnl.expenseByCategory).map(
            ([k, v]) => `  ${k}: $${(v / 100).toFixed(2)}`,
          ),
          "",
          "Top clients:",
          ...pnl.topPayingClients.map(
            (c) => `  ${c.address.slice(0, 8)}...: $${(c.totalCents / 100).toFixed(2)}`,
          ),
          "",
          "Top services:",
          ...pnl.topServices.map(
            (s) => `  ${s.endpoint}: $${(s.totalCents / 100).toFixed(2)} (${s.requests} req)`,
          ),
        ];
        return lines.join("\n");
      },
    },

    // ─── Service Catalog ──────────────────────────────────
    {
      name: "revenue_services",
      description:
        "List all registered paid services with revenue stats. Shows which services are earning and which need attention.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      riskLevel: "safe" as const,
      category: "financial" as const,
      async execute(): Promise<string> {
        const report = serviceRegistry.getRevenueReport();
        const lines = [
          `=== SERVICE CATALOG ===`,
          `Total revenue: $${(report.totalRevenueCents / 100).toFixed(2)}`,
          `Total requests: ${report.totalRequests}`,
          "",
          ...report.services.map((s) =>
            `[${s.active ? "ACTIVE" : "PAUSED"}] ${s.name} (${s.path}): $${(s.revenueCents / 100).toFixed(2)} revenue, ${s.requests} req, avg $${(s.avgRevenueCents / 100).toFixed(2)}/req`,
          ),
        ];
        return lines.join("\n");
      },
    },

    // ─── Bounty Board ─────────────────────────────────────
    {
      name: "bounty_list",
      description:
        "List bounties: open ones available to claim, ones currently in progress, and completed ones. Shows reward, deadline, and profit estimate.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status: 'open', 'claimed', 'completed', or 'all'",
            enum: ["open", "claimed", "completed", "all"],
          },
        },
        required: [],
      },
      riskLevel: "safe" as const,
      category: "financial" as const,
      async execute(args: Record<string, unknown>): Promise<string> {
        const status = (args.status as string) || "all";
        const lines = ["=== BOUNTY BOARD ===", ""];

        if (status === "open" || status === "all") {
          const open = bountyBoard.getOpenBounties();
          lines.push(`Open bounties (${open.length}):`);
          for (const b of open.slice(0, 10)) {
            lines.push(`  [${b.id.slice(0, 8)}] "${b.title}" — ${b.rewardCents}¢ — deadline: ${b.deadline}`);
          }
          lines.push("");
        }

        if (status === "claimed" || status === "all") {
          const claimed = bountyBoard.getClaimedBounties();
          lines.push(`In progress (${claimed.length}):`);
          for (const b of claimed) {
            lines.push(`  [${b.id.slice(0, 8)}] "${b.title}" — ${b.rewardCents}¢ — deadline: ${b.deadline}`);
          }
          lines.push("");
        }

        if (status === "completed" || status === "all") {
          const summary = bountyBoard.getFinancialSummary();
          lines.push(`Completed: ${summary.completed} bounties`);
          lines.push(`Total earned: $${(summary.totalEarned / 100).toFixed(2)}`);
          lines.push(`Total profit: $${(summary.totalProfit / 100).toFixed(2)}`);
          lines.push(`Avg profit/bounty: $${(summary.avgProfitCents / 100).toFixed(2)}`);
        }

        return lines.join("\n");
      },
    },

    // ─── Claim Bounty ─────────────────────────────────────
    {
      name: "bounty_claim",
      description:
        "Claim an open bounty and start working on it. Evaluates profitability first. Only claim if the estimated profit makes economic sense.",
      parameters: {
        type: "object",
        properties: {
          bounty_id: {
            type: "string",
            description: "The bounty ID to claim",
          },
          estimated_cost_cents: {
            type: "number",
            description: "Your estimated cost to complete this bounty (in cents)",
          },
        },
        required: ["bounty_id", "estimated_cost_cents"],
      },
      riskLevel: "caution" as const,
      category: "financial" as const,
      async execute(args: Record<string, unknown>): Promise<string> {
        const bountyId = args.bounty_id as string;
        const estimatedCost = args.estimated_cost_cents as number;

        // Find the bounty
        const open = bountyBoard.getOpenBounties();
        const bounty = open.find((b) => b.id === bountyId);
        if (!bounty) return `Bounty ${bountyId} not found or not open.`;

        // Evaluate profitability
        const evaluation = bountyBoard.evaluateBounty(bounty, estimatedCost);
        if (!evaluation.shouldClaim) {
          return `Declined: ${evaluation.reason}`;
        }

        // Claim it
        const claimed = bountyBoard.claimBounty(bountyId, estimatedCost);
        if (!claimed) return "Failed to claim bounty (may have been taken).";

        return `Claimed bounty "${bounty.title}" (${bounty.rewardCents}¢). Estimated profit: ${evaluation.estimatedProfitCents}¢ (${(evaluation.confidenceScore * 100).toFixed(0)}% confidence). Deadline: ${bounty.deadline}`;
      },
    },

    // ─── Deliver Bounty ───────────────────────────────────
    {
      name: "bounty_deliver",
      description:
        "Submit a deliverable for a claimed bounty. The deliverable is the result of the work you did.",
      parameters: {
        type: "object",
        properties: {
          bounty_id: {
            type: "string",
            description: "The bounty ID to deliver",
          },
          deliverable: {
            type: "string",
            description: "The completed work output",
          },
          actual_cost_cents: {
            type: "number",
            description: "Actual cost incurred to complete this bounty (in cents)",
          },
        },
        required: ["bounty_id", "deliverable", "actual_cost_cents"],
      },
      riskLevel: "caution" as const,
      category: "financial" as const,
      async execute(args: Record<string, unknown>): Promise<string> {
        const bountyId = args.bounty_id as string;
        const deliverable = args.deliverable as string;
        const actualCost = args.actual_cost_cents as number;

        const delivered = bountyBoard.deliverBounty(bountyId, deliverable, actualCost);
        if (!delivered) return `Failed to deliver bounty ${bountyId} (not in claimed status).`;

        return `Bounty ${bountyId} delivered. Awaiting client confirmation.`;
      },
    },
  ];
}
