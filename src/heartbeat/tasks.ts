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
    const bypassCredits = !!process.env.OPENAI_API_KEY;
    const credits = bypassCredits ? 99999 : await ctx.conway.getCreditsBalance();
    const state = ctx.db.getAgentState();
    const startTime =
      ctx.db.getKV("start_time") || new Date().toISOString();
    const uptimeMs = Date.now() - new Date(startTime).getTime();

    const tier = bypassCredits ? "normal" : getSurvivalTier(credits);

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

    ctx.db.setKV("last_heartbeat_ping", JSON.stringify(payload));

    // If critical or dead, record a distress signal (skip if using OpenAI bypass)
    if (!bypassCredits && (tier === "critical" || tier === "dead")) {
      const distressPayload = {
        level: tier,
        name: ctx.config.name,
        address: ctx.identity.address,
        creditsCents: credits,
        fundingHint:
          "Use credit transfer API from a creator runtime to top this wallet up.",
        timestamp: new Date().toISOString(),
      };
      ctx.db.setKV("last_distress", JSON.stringify(distressPayload));

      return {
        shouldWake: true,
        message: `Distress: ${tier}. Credits: $${(credits / 100).toFixed(2)}. Need funding.`,
      };
    }

    return { shouldWake: false };
  },

  check_credits: async (ctx) => {
    // Skip credit checks when using OpenAI directly
    if (process.env.OPENAI_API_KEY) {
      return { shouldWake: false };
    }

    const credits = await ctx.conway.getCreditsBalance();
    const tier = getSurvivalTier(credits);

    ctx.db.setKV("last_credit_check", JSON.stringify({
      credits,
      tier,
      timestamp: new Date().toISOString(),
    }));

    // Wake the agent if credits dropped to a new tier
    const prevTier = ctx.db.getKV("prev_credit_tier");
    ctx.db.setKV("prev_credit_tier", tier);

    if (prevTier && prevTier !== tier && (tier === "critical" || tier === "dead")) {
      return {
        shouldWake: true,
        message: `Credits dropped to ${tier} tier: $${(credits / 100).toFixed(2)}`,
      };
    }

    return { shouldWake: false };
  },

  check_usdc_balance: async (ctx) => {
    // Skip USDC→credits conversion wake when using OpenAI directly
    if (process.env.OPENAI_API_KEY) {
      return { shouldWake: false };
    }

    const balance = await getUsdcBalance(ctx.identity.address);

    ctx.db.setKV("last_usdc_check", JSON.stringify({
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

    const cursor = ctx.db.getKV("social_inbox_cursor") || undefined;
    const { messages, nextCursor } = await ctx.social.poll(cursor);

    if (messages.length === 0) return { shouldWake: false };

    // Persist to inbox_messages table for deduplication
    let newCount = 0;
    for (const msg of messages) {
      const existing = ctx.db.getKV(`inbox_seen_${msg.id}`);
      if (!existing) {
        ctx.db.insertInboxMessage(msg);
        ctx.db.setKV(`inbox_seen_${msg.id}`, "1");
        newCount++;
      }
    }

    if (nextCursor) ctx.db.setKV("social_inbox_cursor", nextCursor);

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
      ctx.db.setKV("upstream_status", JSON.stringify({
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
      ctx.db.setKV("upstream_status", JSON.stringify({
        error: err.message,
        checkedAt: new Date().toISOString(),
      }));
      return { shouldWake: false };
    }
  },

  check_economics: async (ctx) => {
    const { getEconomicsSnapshot, getRunwayTier } =
      await import("../survival/economics.js");
    const snapshot = getEconomicsSnapshot(ctx.db, ctx.config);

    // Persist snapshot
    ctx.db.insertEconomicsSnapshot(snapshot);
    ctx.db.setKV("last_economics_snapshot", JSON.stringify(snapshot));

    const tier = getRunwayTier(snapshot.runwayHours);

    // Wake agent if runway is critically low
    if (tier === "critical" || tier === "dead") {
      return {
        shouldWake: true,
        message: `Economics alert: ${tier}. Runway: ${snapshot.runwayHours.toFixed(1)}h. Balance: $${(snapshot.balanceCents / 100).toFixed(2)}. Burn: $${(snapshot.burnRatePerHour / 100).toFixed(4)}/hr.`,
      };
    }

    return { shouldWake: false };
  },

  landscape_scan: async (ctx) => {
    const { scanLandscape } = await import("../landscape/scanner.js");

    // Remember when the last scan happened so we can detect first-time bounties
    const lastScanTimestamp = ctx.db.getKV("last_landscape_scan_ts") || "1970-01-01T00:00:00.000Z";

    const snapshot = await scanLandscape(ctx.db, "mainnet");

    // Find bounties first seen since last scan (truly new discoveries)
    const newBounties = ctx.db.getNewBountiesSince(lastScanTimestamp);
    const highValueNew = newBounties.filter(b => b.rewardCents >= 5000);

    ctx.db.setKV("last_landscape_scan_ts", snapshot.timestamp);
    ctx.db.setKV("last_landscape_scan", JSON.stringify({
      totalAgents: snapshot.totalAgents,
      serviceProviders: snapshot.serviceProviders,
      bountyCount: snapshot.bounties.length,
      newBountyCount: newBounties.length,
      highValueNewCount: highValueNew.length,
      timestamp: snapshot.timestamp,
    }));

    // Only wake for NEW high-value bounties (>= $50), not ones already seen
    if (highValueNew.length > 0) {
      return {
        shouldWake: true,
        message: `${highValueNew.length} NEW high-value bounty(ies): ${highValueNew.map(b => `${b.title} ($${(b.rewardCents / 100).toFixed(0)})`).join(", ")}`,
      };
    }

    return { shouldWake: false };
  },

  // ─── New scanner heartbeat tasks ──────────────────────────────

  scan_reddit: async (ctx) => {
    const { scanReddit } = await import("../landscape/reddit-scanner.js");
    const bounties = await scanReddit();

    let newCount = 0;
    for (const bounty of bounties) {
      const { isNew } = ctx.db.upsertBounty(bounty);
      if (isNew) newCount++;
    }

    ctx.db.recordSourceScanResult("reddit", true, bounties.length);
    ctx.db.setKV("last_reddit_scan", JSON.stringify({
      totalFound: bounties.length,
      newCount,
      timestamp: new Date().toISOString(),
    }));

    if (newCount > 0) {
      const highValue = bounties.filter(b => b.rewardCents >= 5000);
      if (highValue.length > 0) {
        return {
          shouldWake: true,
          message: `Reddit: ${newCount} new bounty(ies), ${highValue.length} high-value (>=$50)`,
        };
      }
    }
    return { shouldWake: false };
  },

  scan_rss_feeds: async (ctx) => {
    const { scanRSSFeeds } = await import("../landscape/rss-scanner.js");
    const bounties = await scanRSSFeeds();

    let newCount = 0;
    for (const bounty of bounties) {
      const { isNew } = ctx.db.upsertBounty(bounty);
      if (isNew) newCount++;
    }

    ctx.db.recordSourceScanResult("rss-feed", true, bounties.length);
    ctx.db.setKV("last_rss_scan", JSON.stringify({
      totalFound: bounties.length,
      newCount,
      timestamp: new Date().toISOString(),
    }));

    if (newCount > 0) {
      const highValue = bounties.filter(b => b.rewardCents >= 10000);
      if (highValue.length > 0) {
        return {
          shouldWake: true,
          message: `RSS feeds: ${newCount} new bounty(ies), ${highValue.length} high-value (>=$100)`,
        };
      }
    }
    return { shouldWake: false };
  },

  scan_agent_platforms: async (ctx) => {
    const { scanAgentPlatforms } = await import("../landscape/agent-platforms-scanner.js");
    const bounties = await scanAgentPlatforms();

    let newCount = 0;
    for (const bounty of bounties) {
      const { isNew } = ctx.db.upsertBounty(bounty);
      if (isNew) newCount++;
    }

    ctx.db.recordSourceScanResult("agent-platform", true, bounties.length);
    ctx.db.setKV("last_agent_platform_scan", JSON.stringify({
      totalFound: bounties.length,
      newCount,
      timestamp: new Date().toISOString(),
    }));

    if (newCount > 0) {
      const highValue = bounties.filter(b => b.rewardCents >= 5000);
      if (highValue.length > 0) {
        return {
          shouldWake: true,
          message: `Agent platforms: ${newCount} new bounty(ies), ${highValue.length} high-value (>=$50)`,
        };
      }
    }
    return { shouldWake: false };
  },

  scan_github_search: async (ctx) => {
    const { scanGitHubSearch } = await import("../landscape/scanner.js");
    const bounties = await scanGitHubSearch();

    let newCount = 0;
    for (const bounty of bounties) {
      const { isNew } = ctx.db.upsertBounty(bounty);
      if (isNew) newCount++;
    }

    ctx.db.recordSourceScanResult("github-search", true, bounties.length);
    ctx.db.setKV("last_github_search_scan", JSON.stringify({
      totalFound: bounties.length,
      newCount,
      timestamp: new Date().toISOString(),
    }));

    if (newCount > 0) {
      const highValue = bounties.filter(b => b.rewardCents >= 5000);
      if (highValue.length > 0) {
        return {
          shouldWake: true,
          message: `GitHub Search: ${newCount} new bounty(ies), ${highValue.length} high-value (>=$50)`,
        };
      }
    }
    return { shouldWake: false };
  },

  scan_oxwork_tasks: async (ctx) => {
    const { browseOpenTasks } = await import("../conway/oxwork.js");
    const tasks = await browseOpenTasks({ minBounty: 5 });

    // Filter for viable tasks (>= $5, >= 24h deadline remaining)
    const now = Date.now();
    const viable = tasks.filter((t) => {
      if (t.bountyUsd < 5) return false;
      if (t.deadlineAt) {
        const deadline = new Date(t.deadlineAt).getTime();
        if (deadline - now < 24 * 60 * 60 * 1000) return false;
      }
      return true;
    });

    ctx.db.setKV("last_oxwork_scan", JSON.stringify({
      totalFound: tasks.length,
      viableCount: viable.length,
      timestamp: new Date().toISOString(),
    }));

    if (viable.length > 0) {
      const top5 = viable
        .sort((a, b) => b.bountyUsd - a.bountyUsd)
        .slice(0, 5);
      return {
        shouldWake: true,
        message: `0xWork: ${viable.length} viable task(s). Top: ${top5.map(t => `${t.title} ($${t.bountyUsd})`).join(", ")}`,
      };
    }
    return { shouldWake: false };
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

    ctx.db.setKV("last_health_check", new Date().toISOString());
    return { shouldWake: false };
  },

};
