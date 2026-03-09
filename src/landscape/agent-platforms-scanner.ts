/**
 * AI Agent-Native Platforms Scanner
 *
 * Discovers bounties from platforms built specifically for AI agents:
 * - Agent Bounty (agentbounty.org) — 342+ bounties, designed for AI agents
 * - BountyBot (bountybot.network) — Solana security focus
 * - Claw Earn (clawbounties.dev) — On-chain USDC bounties on Base
 * - Polar.sh (api.polar.sh) — OSS funding platform
 *
 * All HTTP routed through Moat Gateway.
 */

import type { BountyOpportunity } from "../types.js";
import { moatFetch, moatFetchJSON } from "./moat-fetch.js";

// Errors collected during scanning
const agentPlatformErrors: string[] = [];

// ─── Agent Bounty (agentbounty.org) ──────────────────────────────

interface AgentBountyItem {
  id: string;
  title: string;
  description?: string;
  reward_usd?: number;
  reward?: number;
  status?: string;
  url?: string;
  tags?: string[];
  created_at?: string;
  deadline?: string;
}

async function scanAgentBounty(): Promise<BountyOpportunity[]> {
  try {
    // Try API endpoint first, fall back to web scraping endpoint
    const result = await moatFetch(
      "https://api.agentbounty.org/bounties?status=open&limit=30",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "automaton-landscape-scanner/1.0",
        },
      },
    );

    if (!result.ok) {
      // Try alternative endpoint
      const altResult = await moatFetch(
        "https://agentbounty.org/api/bounties?status=open&limit=30",
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "automaton-landscape-scanner/1.0",
          },
        },
      );
      if (!altResult.ok) {
        agentPlatformErrors.push(
          `AgentBounty: HTTP ${result.status_code} (primary), ${altResult.status_code} (alt)`,
        );
        return [];
      }
      return parseAgentBountyResponse(altResult.body);
    }

    return parseAgentBountyResponse(result.body);
  } catch (err: any) {
    agentPlatformErrors.push(`AgentBounty: ${err.message}`);
    return [];
  }
}

function parseAgentBountyResponse(body: unknown): BountyOpportunity[] {
  const items = (Array.isArray(body) ? body : (body as any)?.bounties || []) as AgentBountyItem[];
  return items
    .filter((item) => item.status === "open" || !item.status)
    .map((item) => {
      const rewardCents = ((item.reward_usd || item.reward || 0) * 100);
      return {
        source: "agent-platform" as BountyOpportunity["source"],
        title: `[AgentBounty] ${item.title || "Untitled"}`,
        url: item.url || `https://agentbounty.org/bounty/${item.id}`,
        rewardCents,
        currency: "USD",
        repo: "",
        labels: ["agent-bounty", ...(item.tags || [])],
        createdAt: item.created_at || new Date().toISOString(),
        evScore: rewardCents > 0 ? Math.round(rewardCents * 0.35) : undefined,
      };
    });
}

// ─── BountyBot (bountybot.network) ───────────────────────────────

interface BountyBotItem {
  id: string;
  title: string;
  description?: string;
  payout_usd?: number;
  payout_sol?: number;
  status?: string;
  url?: string;
  category?: string;
  created_at?: string;
}

async function scanBountyBot(): Promise<BountyOpportunity[]> {
  try {
    const result = await moatFetch(
      "https://api.bountybot.network/bounties?status=open&limit=30",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "automaton-landscape-scanner/1.0",
        },
      },
    );

    if (!result.ok) {
      agentPlatformErrors.push(`BountyBot: HTTP ${result.status_code}`);
      return [];
    }

    const items = (Array.isArray(result.body) ? result.body : (result.body as any)?.bounties || []) as BountyBotItem[];
    return items
      .filter((item) => item.status === "open" || !item.status)
      .map((item) => {
        // BountyBot: 70% payout + 20% share of other agents' findings
        const rewardCents = (item.payout_usd || 0) * 100;
        return {
          source: "agent-platform" as BountyOpportunity["source"],
          title: `[BountyBot] ${item.title || "Untitled"}`,
          url: item.url || `https://bountybot.network/bounty/${item.id}`,
          rewardCents,
          currency: "USD",
          repo: "",
          labels: ["bountybot", "solana", "security", item.category || ""].filter(Boolean),
          createdAt: item.created_at || new Date().toISOString(),
          evScore: rewardCents > 0 ? Math.round(rewardCents * 0.3) : undefined,
        };
      });
  } catch (err: any) {
    agentPlatformErrors.push(`BountyBot: ${err.message}`);
    return [];
  }
}

// ─── Claw Earn (clawbounties.dev) ────────────────────────────────

interface ClawEarnItem {
  id: string;
  title: string;
  description?: string;
  reward_usdc?: number;
  reward_usd?: number;
  status?: string;
  url?: string;
  chain?: string;
  created_at?: string;
}

async function scanClawEarn(): Promise<BountyOpportunity[]> {
  try {
    const result = await moatFetch(
      "https://api.clawbounties.dev/bounties?status=open&limit=30",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "automaton-landscape-scanner/1.0",
        },
      },
    );

    if (!result.ok) {
      agentPlatformErrors.push(`ClawEarn: HTTP ${result.status_code}`);
      return [];
    }

    const items = (Array.isArray(result.body) ? result.body : (result.body as any)?.bounties || []) as ClawEarnItem[];
    return items
      .filter((item) => item.status === "open" || !item.status)
      .map((item) => {
        // Claw Earn: on-chain USDC on Base — directly aligned with agent's stack
        const rewardCents = ((item.reward_usdc || item.reward_usd || 0) * 100);
        return {
          source: "agent-platform" as BountyOpportunity["source"],
          title: `[ClawEarn] ${item.title || "Untitled"}`,
          url: item.url || `https://clawbounties.dev/bounty/${item.id}`,
          rewardCents,
          currency: "USDC",
          repo: "",
          labels: ["claw-earn", "base", "usdc", "on-chain"],
          createdAt: item.created_at || new Date().toISOString(),
          evScore: rewardCents > 0 ? Math.round(rewardCents * 0.4) : undefined, // Higher confidence — on-chain payment
        };
      });
  } catch (err: any) {
    agentPlatformErrors.push(`ClawEarn: ${err.message}`);
    return [];
  }
}

// ─── Polar.sh (api.polar.sh) ─────────────────────────────────────

interface PolarIssue {
  id: string;
  title: string;
  body?: string;
  funding?: {
    funding_goal?: { amount: number; currency: string };
    pledges_sum?: { amount: number; currency: string };
  };
  repository?: { name: string; organization?: { name: string } };
  state?: string;
  issue_url?: string;
  created_at?: string;
}

async function scanPolar(): Promise<BountyOpportunity[]> {
  try {
    const result = await moatFetch(
      "https://api.polar.sh/v1/issues/search?have_badge=true&is_badged=true&sort=funding_goal_desc&limit=30",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "automaton-landscape-scanner/1.0",
        },
      },
    );

    if (!result.ok) {
      agentPlatformErrors.push(`Polar: HTTP ${result.status_code}`);
      return [];
    }

    const data = result.body as any;
    const items = (data?.items || data?.results || (Array.isArray(data) ? data : [])) as PolarIssue[];
    return items
      .filter((item) => item.state === "open" || !item.state)
      .map((item) => {
        const fundingAmount = item.funding?.funding_goal?.amount || item.funding?.pledges_sum?.amount || 0;
        const rewardCents = fundingAmount; // Polar amounts are already in cents
        const repo = item.repository
          ? `${item.repository.organization?.name || ""}/${item.repository.name}`
          : "";

        return {
          source: "agent-platform" as BountyOpportunity["source"],
          title: `[Polar] ${item.title || "Untitled"}`,
          url: item.issue_url || `https://polar.sh/issues/${item.id}`,
          rewardCents,
          currency: "USD",
          repo,
          labels: ["polar", "oss-funding"],
          createdAt: item.created_at || new Date().toISOString(),
          evScore: rewardCents > 0 ? Math.round(rewardCents * 0.3) : undefined,
        };
      });
  } catch (err: any) {
    agentPlatformErrors.push(`Polar: ${err.message}`);
    return [];
  }
}

// ─── Main Scanner ────────────────────────────────────────────────

/**
 * Scan all AI agent-native platforms for work opportunities.
 */
export async function scanAgentPlatforms(): Promise<BountyOpportunity[]> {
  // Clear errors from previous scan
  agentPlatformErrors.length = 0;

  const [agentBountyResult, bountyBotResult, clawEarnResult, polarResult] =
    await Promise.allSettled([
      scanAgentBounty(),
      scanBountyBot(),
      scanClawEarn(),
      scanPolar(),
    ]);

  const allBounties: BountyOpportunity[] = [];

  if (agentBountyResult.status === "fulfilled") {
    allBounties.push(...agentBountyResult.value);
  }
  if (bountyBotResult.status === "fulfilled") {
    allBounties.push(...bountyBotResult.value);
  }
  if (clawEarnResult.status === "fulfilled") {
    allBounties.push(...clawEarnResult.value);
  }
  if (polarResult.status === "fulfilled") {
    allBounties.push(...polarResult.value);
  }

  return allBounties;
}

/**
 * Get errors from the last agent platform scan.
 */
export function getAgentPlatformScanErrors(): string[] {
  return [...agentPlatformErrors];
}
