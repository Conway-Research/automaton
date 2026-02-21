/**
 * Built-in Heartbeat Tasks
 *
 * These tasks run on the heartbeat schedule even while the agent sleeps.
 * They can trigger the agent to wake up if needed.
 */

import type {
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  AutomatonIdentity,
  SocialClientInterface,
} from "../types.js";
import { getSurvivalTier } from "../conway/credits.js";
import { getUsdcBalance } from "../conway/x402.js";
import {
  KV_LAST_CREDIT_CHECK,
  KV_LAST_DISTRESS,
  KV_LAST_HEARTBEAT_PING,
  KV_LAST_HEALTH_CHECK,
  KV_LAST_USDC_CHECK,
  KV_PREV_CREDIT_TIER,
  KV_SOCIAL_INBOX_CURSOR,
  KV_START_TIME,
  KV_UPSTREAM_STATUS,
  kvInboxSeenMessage,
} from "../state/kv-keys.js";

export interface HeartbeatTaskContext {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  conway: ConwayClient;
  social?: SocialClientInterface;
}

export type HeartbeatTaskFn = (
  ctx: HeartbeatTaskContext,
) => Promise<{ shouldWake: boolean; message?: string }>;

/**
 * Registry of built-in heartbeat tasks.
 */
export const BUILTIN_TASKS: Record<string, HeartbeatTaskFn> = {
  heartbeat_ping: async (ctx) => {
    const credits = await ctx.conway.getCreditsBalance();
    const state = ctx.db.getAgentState();
    const startTime =
      ctx.db.getKV(KV_START_TIME) || new Date().toISOString();
    const uptimeMs = Date.now() - new Date(startTime).getTime();

    const tier = getSurvivalTier(credits);

    const payload = {
      name: ctx.config.name,
      address: ctx.identity.address,
      state,
      creditsCents: credits,
      uptimeSeconds: Math.floor(uptimeMs / 1000),
      version: ctx.config.version,
      sandboxId: ctx.identity.sandboxId,
      timestamp: new Date().toISOString(),
      tier,
    };

    ctx.db.setKV(KV_LAST_HEARTBEAT_PING, JSON.stringify(payload));

    // If critical or dead, record a distress signal
    if (tier === "critical" || tier === "dead") {
      const distressPayload = {
        level: tier,
        name: ctx.config.name,
        address: ctx.identity.address,
        creditsCents: credits,
        fundingHint:
          "Use credit transfer API from a creator runtime to top this wallet up.",
        timestamp: new Date().toISOString(),
      };
      ctx.db.setKV(KV_LAST_DISTRESS, JSON.stringify(distressPayload));

      return {
        shouldWake: true,
        message: `Distress: ${tier}. Credits: $${(credits / 100).toFixed(2)}. Need funding.`,
      };
    }

    return { shouldWake: false };
  },

  check_credits: async (ctx) => {
    const credits = await ctx.conway.getCreditsBalance();
    const tier = getSurvivalTier(credits);

    ctx.db.setKV(KV_LAST_CREDIT_CHECK, JSON.stringify({
      credits,
      tier,
      timestamp: new Date().toISOString(),
    }));

    // Wake the agent if credits dropped to a new tier
    const prevTier = ctx.db.getKV(KV_PREV_CREDIT_TIER);
    ctx.db.setKV(KV_PREV_CREDIT_TIER, tier);

    if (prevTier && prevTier !== tier && (tier === "critical" || tier === "dead")) {
      return {
        shouldWake: true,
        message: `Credits dropped to ${tier} tier: $${(credits / 100).toFixed(2)}`,
      };
    }

    return { shouldWake: false };
  },

  check_usdc_balance: async (ctx) => {
    const balance = await getUsdcBalance(ctx.identity.address);

    ctx.db.setKV(KV_LAST_USDC_CHECK, JSON.stringify({
      balance,
      timestamp: new Date().toISOString(),
    }));

    // If we have USDC but low credits, wake up to potentially convert
    const credits = await ctx.conway.getCreditsBalance();
    if (balance > 0.5 && credits < 500) {
      return {
        shouldWake: true,
        message: `Have ${balance.toFixed(4)} USDC but only $${(credits / 100).toFixed(2)} credits. Consider buying credits.`,
      };
    }

    return { shouldWake: false };
  },

  check_social_inbox: async (ctx) => {
    if (!ctx.social) return { shouldWake: false };

    const cursor = ctx.db.getKV(KV_SOCIAL_INBOX_CURSOR) || undefined;
    const { messages, nextCursor } = await ctx.social.poll(cursor);

    if (messages.length === 0) return { shouldWake: false };

    // Persist to inbox_messages table for deduplication
    let newCount = 0;
    for (const msg of messages) {
      const existing = ctx.db.getKV(kvInboxSeenMessage(msg.id));
      if (!existing) {
        ctx.db.insertInboxMessage(msg);
        ctx.db.setKV(kvInboxSeenMessage(msg.id), "1");
        newCount++;
      }
    }

    if (nextCursor) ctx.db.setKV(KV_SOCIAL_INBOX_CURSOR, nextCursor);

    if (newCount === 0) return { shouldWake: false };

    return {
      shouldWake: true,
      message: `${newCount} new message(s) from: ${messages.map((m) => m.from.slice(0, 10)).join(", ")}`,
    };
  },

  check_for_updates: async (ctx) => {
    try {
      const { checkUpstream, getRepoInfo } = await import("../self-mod/upstream.js");
      const repo = getRepoInfo();
      const upstream = checkUpstream();
      ctx.db.setKV(KV_UPSTREAM_STATUS, JSON.stringify({
        ...upstream,
        ...repo,
        checkedAt: new Date().toISOString(),
      }));
      if (upstream.behind > 0) {
        return {
          shouldWake: true,
          message: `${upstream.behind} new commit(s) on origin/main. Review with review_upstream_changes, then cherry-pick what you want with pull_upstream.`,
        };
      }
      return { shouldWake: false };
    } catch (err: any) {
      // Not a git repo or no remote — silently skip
      ctx.db.setKV(KV_UPSTREAM_STATUS, JSON.stringify({
        error: err.message,
        checkedAt: new Date().toISOString(),
      }));
      return { shouldWake: false };
    }
  },

  health_check: async (ctx) => {
    // Check that the sandbox is healthy
    try {
      const result = await ctx.conway.exec("echo alive", 5000);
      if (result.exitCode !== 0) {
        return {
          shouldWake: true,
          message: "Health check failed: sandbox exec returned non-zero",
        };
      }
    } catch (err: any) {
      return {
        shouldWake: true,
        message: `Health check failed: ${err.message}`,
      };
    }

    ctx.db.setKV(KV_LAST_HEALTH_CHECK, new Date().toISOString());
    return { shouldWake: false };
  },

};
