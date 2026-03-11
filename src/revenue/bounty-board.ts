/**
 * Bounty Board
 *
 * Accepts paid tasks from humans and other agents. A bounty is a
 * pre-paid work order: the client locks USDC, the agent does the work,
 * delivers the result, and the payment is confirmed.
 *
 * Security:
 * - Agent NEVER sends money. Bounties are received, not posted.
 * - Escrow is verified on-chain before work begins.
 * - Deliverables are cryptographically signed.
 * - Failed deliveries don't earn revenue (no scamming).
 */

import type Database from "better-sqlite3";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("bounty-board");

// ─── Types ────────────────────────────────────────────────────

export type BountyStatus =
  | "open"        // Listed, accepting claims
  | "claimed"     // Agent has accepted and is working
  | "delivered"   // Work submitted, awaiting client confirmation
  | "completed"   // Client confirmed, payment received
  | "expired"     // Deadline passed without delivery
  | "rejected"    // Client rejected the deliverable
  | "cancelled";  // Agent decided not to do it

export interface Bounty {
  id: string;
  /** The client posting the bounty */
  clientAddress: string;
  /** What needs to be done */
  title: string;
  description: string;
  /** Payment amount in cents */
  rewardCents: number;
  /** Deadline for delivery (ISO-8601) */
  deadline: string;
  /** Current status */
  status: BountyStatus;
  /** Category of work */
  category: string;
  /** Agent's deliverable (set on delivery) */
  deliverable: string | null;
  /** Estimated cost for the agent to complete this */
  estimatedCostCents: number;
  /** Actual cost incurred */
  actualCostCents: number;
  /** On-chain transaction signature for payment verification */
  paymentSignature: string | null;
  /** When the bounty was created */
  createdAt: string;
  /** When the agent claimed it */
  claimedAt: string | null;
  /** When the deliverable was submitted */
  deliveredAt: string | null;
  /** When it was completed/paid */
  completedAt: string | null;
}

export interface BountyEvaluation {
  shouldClaim: boolean;
  reason: string;
  estimatedCostCents: number;
  estimatedProfitCents: number;
  confidenceScore: number; // 0-1, can we actually do this?
  riskLevel: "low" | "medium" | "high";
}

// ─── Bounty Board Implementation ──────────────────────────────

export class BountyBoard {
  private db: Database.Database;
  /** Maximum bounties the agent will work on simultaneously */
  private maxConcurrentBounties: number;
  /** Minimum profit margin to accept a bounty */
  private minProfitMarginPercent: number;
  /** Minimum reward to consider (cents) */
  private minRewardCents: number;

  constructor(
    db: Database.Database,
    options?: {
      maxConcurrentBounties?: number;
      minProfitMarginPercent?: number;
      minRewardCents?: number;
    },
  ) {
    this.db = db;
    this.maxConcurrentBounties = options?.maxConcurrentBounties ?? 3;
    this.minProfitMarginPercent = options?.minProfitMarginPercent ?? 30;
    this.minRewardCents = options?.minRewardCents ?? 50; // $0.50 minimum
  }

  /**
   * Submit a new bounty (from a client via API).
   * Agent evaluates whether to accept it.
   */
  submitBounty(params: {
    clientAddress: string;
    title: string;
    description: string;
    rewardCents: number;
    deadline: string;
    category: string;
    paymentSignature?: string;
  }): Bounty {
    const bounty: Bounty = {
      id: ulid(),
      clientAddress: params.clientAddress,
      title: params.title,
      description: params.description,
      rewardCents: params.rewardCents,
      deadline: params.deadline,
      status: "open",
      category: params.category,
      deliverable: null,
      estimatedCostCents: 0,
      actualCostCents: 0,
      paymentSignature: params.paymentSignature || null,
      createdAt: new Date().toISOString(),
      claimedAt: null,
      deliveredAt: null,
      completedAt: null,
    };

    this.db.prepare(`
      INSERT INTO bounty_board (id, client_address, title, description, reward_cents, deadline, status, category, deliverable, estimated_cost_cents, actual_cost_cents, payment_signature, created_at, claimed_at, delivered_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bounty.id, bounty.clientAddress, bounty.title, bounty.description,
      bounty.rewardCents, bounty.deadline, bounty.status, bounty.category,
      bounty.deliverable, bounty.estimatedCostCents, bounty.actualCostCents,
      bounty.paymentSignature, bounty.createdAt, bounty.claimedAt,
      bounty.deliveredAt, bounty.completedAt,
    );

    logger.info(`[BOUNTY] New bounty: "${bounty.title}" (${bounty.rewardCents}¢) from ${bounty.clientAddress}`);
    return bounty;
  }

  /**
   * Evaluate whether a bounty is worth claiming.
   * The agent uses this to make economic decisions.
   */
  evaluateBounty(bounty: Bounty, estimatedCostCents: number): BountyEvaluation {
    const profitCents = bounty.rewardCents - estimatedCostCents;
    const profitMargin = bounty.rewardCents > 0 ? (profitCents / bounty.rewardCents) * 100 : -100;

    // Check basic viability
    if (bounty.rewardCents < this.minRewardCents) {
      return {
        shouldClaim: false,
        reason: `Reward ${bounty.rewardCents}¢ below minimum ${this.minRewardCents}¢`,
        estimatedCostCents,
        estimatedProfitCents: profitCents,
        confidenceScore: 0,
        riskLevel: "high",
      };
    }

    if (profitMargin < this.minProfitMarginPercent) {
      return {
        shouldClaim: false,
        reason: `Profit margin ${profitMargin.toFixed(1)}% below minimum ${this.minProfitMarginPercent}%`,
        estimatedCostCents,
        estimatedProfitCents: profitCents,
        confidenceScore: 0.3,
        riskLevel: "high",
      };
    }

    // Check deadline feasibility
    const deadlineMs = new Date(bounty.deadline).getTime();
    const nowMs = Date.now();
    const timeRemainingHours = (deadlineMs - nowMs) / 3_600_000;

    if (timeRemainingHours < 0.5) {
      return {
        shouldClaim: false,
        reason: "Deadline too close (less than 30 minutes)",
        estimatedCostCents,
        estimatedProfitCents: profitCents,
        confidenceScore: 0.1,
        riskLevel: "high",
      };
    }

    // Check concurrent bounty limit
    const activeBounties = this.getClaimedBounties().length;
    if (activeBounties >= this.maxConcurrentBounties) {
      return {
        shouldClaim: false,
        reason: `Already working on ${activeBounties}/${this.maxConcurrentBounties} bounties`,
        estimatedCostCents,
        estimatedProfitCents: profitCents,
        confidenceScore: 0.5,
        riskLevel: "medium",
      };
    }

    // Looks good
    const riskLevel = profitMargin > 60 ? "low" : profitMargin > 40 ? "medium" : "high";
    const confidence = Math.min(0.9, 0.5 + profitMargin / 200);

    return {
      shouldClaim: true,
      reason: `Profitable: ${profitMargin.toFixed(1)}% margin, ${timeRemainingHours.toFixed(1)}h to deliver`,
      estimatedCostCents,
      estimatedProfitCents: profitCents,
      confidenceScore: confidence,
      riskLevel,
    };
  }

  /**
   * Claim a bounty (start working on it).
   */
  claimBounty(bountyId: string, estimatedCostCents: number): boolean {
    const result = this.db.prepare(`
      UPDATE bounty_board SET status = 'claimed', claimed_at = ?, estimated_cost_cents = ?
      WHERE id = ? AND status = 'open'
    `).run(new Date().toISOString(), estimatedCostCents, bountyId);

    if (result.changes > 0) {
      logger.info(`[BOUNTY] Claimed: ${bountyId}`);
      return true;
    }
    return false;
  }

  /**
   * Submit a deliverable for a bounty.
   */
  deliverBounty(bountyId: string, deliverable: string, actualCostCents: number): boolean {
    const result = this.db.prepare(`
      UPDATE bounty_board SET status = 'delivered', deliverable = ?, delivered_at = ?, actual_cost_cents = ?
      WHERE id = ? AND status = 'claimed'
    `).run(deliverable, new Date().toISOString(), actualCostCents, bountyId);

    if (result.changes > 0) {
      logger.info(`[BOUNTY] Delivered: ${bountyId}`);
      return true;
    }
    return false;
  }

  /**
   * Mark a bounty as completed (payment confirmed).
   */
  completeBounty(bountyId: string): boolean {
    const result = this.db.prepare(`
      UPDATE bounty_board SET status = 'completed', completed_at = ?
      WHERE id = ? AND status = 'delivered'
    `).run(new Date().toISOString(), bountyId);

    if (result.changes > 0) {
      logger.info(`[BOUNTY] Completed: ${bountyId}`);
      return true;
    }
    return false;
  }

  /**
   * Cancel a bounty the agent claimed but can't complete.
   */
  cancelBounty(bountyId: string): boolean {
    const result = this.db.prepare(`
      UPDATE bounty_board SET status = 'cancelled'
      WHERE id = ? AND status IN ('open', 'claimed')
    `).run(bountyId);

    return result.changes > 0;
  }

  /**
   * Get all open bounties.
   */
  getOpenBounties(): Bounty[] {
    return this.db.prepare(`
      SELECT * FROM bounty_board WHERE status = 'open' ORDER BY reward_cents DESC
    `).all() as any[];
  }

  /**
   * Get bounties the agent is working on.
   */
  getClaimedBounties(): Bounty[] {
    return this.db.prepare(`
      SELECT * FROM bounty_board WHERE status = 'claimed' ORDER BY deadline ASC
    `).all() as any[];
  }

  /**
   * Get completed bounties for revenue reporting.
   */
  getCompletedBounties(since?: string): Bounty[] {
    if (since) {
      return this.db.prepare(`
        SELECT * FROM bounty_board WHERE status = 'completed' AND completed_at >= ?
        ORDER BY completed_at DESC
      `).all(since) as any[];
    }
    return this.db.prepare(`
      SELECT * FROM bounty_board WHERE status = 'completed' ORDER BY completed_at DESC
    `).all() as any[];
  }

  /**
   * Expire bounties past their deadline.
   */
  expireOverdueBounties(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE bounty_board SET status = 'expired'
      WHERE status IN ('open', 'claimed') AND deadline < ?
    `).run(now);
    if (result.changes > 0) {
      logger.warn(`[BOUNTY] Expired ${result.changes} overdue bounties`);
    }
    return result.changes;
  }

  /**
   * Get bounty financial summary.
   */
  getFinancialSummary(): {
    totalEarned: number;
    totalCost: number;
    totalProfit: number;
    completed: number;
    expired: number;
    cancelled: number;
    avgProfitCents: number;
  } {
    const completed = this.db.prepare(`
      SELECT COUNT(*) AS count,
             COALESCE(SUM(reward_cents), 0) AS totalEarned,
             COALESCE(SUM(actual_cost_cents), 0) AS totalCost
      FROM bounty_board WHERE status = 'completed'
    `).get() as { count: number; totalEarned: number; totalCost: number };

    const expired = (this.db.prepare(`
      SELECT COUNT(*) AS count FROM bounty_board WHERE status = 'expired'
    `).get() as { count: number }).count;

    const cancelled = (this.db.prepare(`
      SELECT COUNT(*) AS count FROM bounty_board WHERE status = 'cancelled'
    `).get() as { count: number }).count;

    return {
      totalEarned: completed.totalEarned,
      totalCost: completed.totalCost,
      totalProfit: completed.totalEarned - completed.totalCost,
      completed: completed.count,
      expired,
      cancelled,
      avgProfitCents: completed.count > 0
        ? Math.round((completed.totalEarned - completed.totalCost) / completed.count)
        : 0,
    };
  }
}
