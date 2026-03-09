/**
 * Landscape Scanner
 *
 * Discovers agents, services, and bounties across the ecosystem.
 * Persists snapshots to the DB for competitive intelligence over time.
 *
 * All external HTTP is routed through the Moat Gateway's http.proxy
 * capability — the scout has no direct internet access.
 *
 * Sources (12):
 *   1. GitHub bounty-labeled issues (8 hardcoded repos)
 *   2. Algora bounty platform
 *   3. Gitcoin grants/bounties
 *   4. Web3 audit contests (Code4rena, Sherlock, Immunefi, Hats)
 *   5. ERC-8004 registry (mainnet + testnet)
 *   6. GitHub Search API (bounty/reward labels across ALL of GitHub)
 *   7. Reddit subreddit scanner
 *   8. RSS/Atom feed scanner
 *   9. Agent platforms (AgentBounty, BountyBot, ClawEarn, Polar)
 *  10. 0xWork marketplace
 */

import type {
  AutomatonDatabase,
  LandscapeSnapshot,
  LandscapeAgent,
  ServiceListing,
  BountyOpportunity,
} from "../types.js";
import { getTotalAgents, queryAgent } from "../registry/erc8004.js";
import { fetchAgentCard } from "../registry/discovery.js";
import { moatFetch, moatFetchJSON } from "./moat-fetch.js";

type Network = "mainnet" | "testnet";

// Errors collected during scanning — surfaced in tool output
const scanErrors: string[] = [];

// Cache last scan to prevent repeated calls within same wake cycle
let lastScanResult: { snapshot: LandscapeSnapshot; timestamp: number } | null = null;
const SCAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Scan the ERC-8004 registry for agents and their services.
 */
export async function scanERC8004Registry(
  network: Network = "mainnet",
  limit: number = 50,
): Promise<{
  totalAgents: number;
  agents: LandscapeAgent[];
  services: ServiceListing[];
}> {
  let totalAgents: number;
  try {
    totalAgents = await getTotalAgents(network);
  } catch (err: any) {
    scanErrors.push(`ERC8004(${network}) totalSupply failed: ${err.message}`);
    return { totalAgents: 0, agents: [], services: [] };
  }
  const scanCount = Math.min(totalAgents, limit);
  const agents: LandscapeAgent[] = [];
  const services: ServiceListing[] = [];

  // Scan from most recent to oldest
  for (let i = totalAgents; i > totalAgents - scanCount && i > 0; i--) {
    try {
      const agent = await queryAgent(i.toString(), network);
      if (!agent) continue;

      const landscapeAgent: LandscapeAgent = {
        agentId: agent.agentId,
        owner: agent.owner,
        agentURI: agent.agentURI,
        services: [],
        x402Enabled: false,
        active: true,
      };

      // Try to fetch the agent card for richer metadata
      try {
        const card = await fetchAgentCard(agent.agentURI);
        if (card) {
          landscapeAgent.name = card.name;
          landscapeAgent.description = card.description;
          landscapeAgent.x402Enabled = card.x402Support ?? false;
          landscapeAgent.active = card.active ?? true;

          if (card.services && card.services.length > 0) {
            landscapeAgent.services = card.services.map((s) => s.name);

            for (const svc of card.services) {
              services.push({
                providerAgentId: agent.agentId,
                providerName: card.name || `Agent #${agent.agentId}`,
                serviceName: svc.name,
                endpoint: svc.endpoint,
              });
            }
          }
        }
      } catch {
        // Card fetch failed — keep basic agent info
      }

      agents.push(landscapeAgent);
    } catch {
      // Individual agent query failed — skip
    }
  }

  return { totalAgents, agents, services };
}

// ─── Bounty Repo Lists ──────────────────────────────────────────

// Known repos with active bounty programs
const DEFAULT_BOUNTY_REPOS = [
  // Our own repos
  "jeremylongshore/automaton",
  // High-value bounty pools (Algora-backed)
  "mediar-ai/screenpipe",
  "tscircuit/tscircuit",
  "niccokunzmann/open-web-calendar",
  // Ecosystem repos with bounty labels
  "anthropics/claude-code",
  "base-org/web",
  "getsentry/sentry-javascript",
  "golemfactory/yagna",
];

// Web3 audit contest organizations — they publish contest repos on GitHub
const WEB3_AUDIT_ORGS = [
  "code-423n4",       // Code4rena — competitive smart contract audits ($10K-$100K+)
  "sherlock-audit",   // Sherlock — audit contests + bug bounties
  "immunefi-team",    // Immunefi — bug bounty program repos
  "hats-finance",     // Hats.finance — decentralized audit competitions
];

// GitHub Search API queries for finding bounties across ALL of GitHub
const GITHUB_SEARCH_QUERIES = [
  'label:bounty state:open is:issue',
  'label:reward state:open is:issue',
  'label:paid state:open is:issue',
  '"bounty" in:title state:open is:issue',
];

// ─── Skill-match scoring for bounty qualification ────────────────

const SKILL_MATCH_SCORES: Record<string, number> = {
  typescript: 1.0,
  javascript: 1.0,
  nodejs: 1.0,
  "node.js": 1.0,
  react: 0.8,
  nextjs: 0.8,
  "next.js": 0.8,
  solidity: 0.6,
  "smart contract": 0.6,
  python: 0.6,
  rust: 0.3,
  go: 0.3,
  golang: 0.3,
  java: 0.2,
  "c++": 0.2,
  swift: 0.1,
  kotlin: 0.1,
};

// Minimum implied hourly rate in cents ($15/hr)
const MIN_HOURLY_RATE_CENTS = 1500;

// ─── Scanners ────────────────────────────────────────────────────

/**
 * Scan GitHub repos for bounty-labeled issues.
 * Routes through Moat Gateway http.proxy.
 */
export async function scanBounties(
  repos: string[] = DEFAULT_BOUNTY_REPOS,
): Promise<BountyOpportunity[]> {
  const bounties: BountyOpportunity[] = [];
  const bountyLabels = ["bounty", "reward", "paid", "sponsored"];

  for (const repo of repos) {
    try {
      const url = `https://api.github.com/repos/${repo}/issues?labels=${bountyLabels.join(",")}&state=open&per_page=20`;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "automaton-landscape-scanner",
      };
      if (process.env.GITHUB_TOKEN) {
        headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      const result = await moatFetch(url, { headers });

      if (!result.ok) {
        scanErrors.push(`GitHub(${repo}): HTTP ${result.status_code}`);
        continue;
      }

      const issues = (Array.isArray(result.body) ? result.body : []) as any[];
      for (const issue of issues) {
        const rewardCents = parseRewardFromIssue(issue);
        bounties.push({
          source: "github",
          title: issue.title,
          url: issue.html_url,
          rewardCents,
          currency: "USD",
          repo,
          labels: (issue.labels || []).map((l: any) => l.name || l),
          createdAt: issue.created_at,
          evScore: rewardCents > 0 ? Math.round(rewardCents * 0.3) : undefined,
        });
      }
    } catch (err: any) {
      scanErrors.push(`GitHub(${repo}): ${err.message}`);
    }
  }

  return bounties;
}

/**
 * Scan GitHub Search API for bounty-labeled issues across ALL of GitHub.
 * This is broader than scanBounties() which only checks hardcoded repos.
 */
export async function scanGitHubSearch(
  queries: string[] = GITHUB_SEARCH_QUERIES,
): Promise<BountyOpportunity[]> {
  const bounties: BountyOpportunity[] = [];
  const seenUrls = new Set<string>();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "automaton-landscape-scanner",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  for (const query of queries) {
    try {
      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=created&order=desc&per_page=30`;
      const result = await moatFetch(url, { headers });

      if (!result.ok) {
        scanErrors.push(`GitHubSearch(${query}): HTTP ${result.status_code}`);
        continue;
      }

      const data = result.body as any;
      const issues = (data?.items || []) as any[];
      for (const issue of issues) {
        if (seenUrls.has(issue.html_url)) continue;
        seenUrls.add(issue.html_url);

        const rewardCents = parseRewardFromIssue(issue);
        const repoFullName = issue.repository_url
          ? issue.repository_url.replace("https://api.github.com/repos/", "")
          : "";

        bounties.push({
          source: "github-search",
          title: issue.title,
          url: issue.html_url,
          rewardCents,
          currency: "USD",
          repo: repoFullName,
          labels: (issue.labels || []).map((l: any) => l.name || l),
          createdAt: issue.created_at,
          evScore: rewardCents > 0 ? Math.round(rewardCents * 0.25) : undefined,
        });
      }
    } catch (err: any) {
      scanErrors.push(`GitHubSearch: ${err.message}`);
    }
  }

  return bounties;
}

/**
 * Scan Algora for open bounties.
 * Routes through Moat Gateway http.proxy.
 */
export async function scanAlgoraBounties(): Promise<BountyOpportunity[]> {
  try {
    const result = await moatFetch(
      "https://console.algora.io/api/bounties?status=open&limit=20",
    );

    if (!result.ok) {
      scanErrors.push(`Algora: HTTP ${result.status_code}`);
      return [];
    }

    const data = (Array.isArray(result.body) ? result.body : []) as any[];
    return data.map((b: any) => ({
      source: "algora" as const,
      title: b.title || b.name || "Untitled bounty",
      url: b.url || b.html_url || "",
      rewardCents: (b.reward_usd || b.amount || 0) * 100,
      currency: "USD",
      repo: b.repo || b.repository || "",
      labels: b.labels || [],
      createdAt: b.created_at || new Date().toISOString(),
      evScore: b.reward_usd ? Math.round(b.reward_usd * 100 * 0.3) : undefined,
    }));
  } catch (err: any) {
    scanErrors.push(`Algora: ${err.message}`);
    return [];
  }
}

/**
 * Scan Gitcoin for open bounties.
 * Public API — no auth required.
 * Routes through Moat Gateway http.proxy.
 */
export async function scanGitcoinBounties(): Promise<BountyOpportunity[]> {
  try {
    const result = await moatFetch(
      "https://gitcoin.co/api/v0.1/bounties/?is_open=true&order_by=-_val_usd_db&limit=20",
    );

    if (!result.ok) {
      scanErrors.push(`Gitcoin: HTTP ${result.status_code}`);
      return [];
    }

    const data = (Array.isArray(result.body) ? result.body : []) as any[];
    return data.map((b: any) => ({
      source: "gitcoin" as const,
      title: b.title || b.github_issue_title || "Untitled bounty",
      url: b.url || b.github_url || "",
      rewardCents: Math.round((b.value_in_usdt || b._val_usd_db || 0) * 100),
      currency: "USD",
      repo: b.github_org_name
        ? `${b.github_org_name}/${b.github_repo_name || ""}`
        : "",
      labels: [
        b.experience_level,
        b.project_length,
        b.bounty_type,
      ].filter(Boolean),
      createdAt: b.created_on || new Date().toISOString(),
      evScore: b.value_in_usdt
        ? Math.round(b.value_in_usdt * 100 * 0.3)
        : undefined,
    }));
  } catch (err: any) {
    scanErrors.push(`Gitcoin: ${err.message}`);
    return [];
  }
}

/**
 * Scan Web3 audit contest orgs for new contest repos.
 * These orgs publish contest repos on GitHub — each repo = one audit contest.
 * Routes through Moat Gateway http.proxy.
 */
export async function scanWeb3AuditContests(): Promise<BountyOpportunity[]> {
  const bounties: BountyOpportunity[] = [];

  for (const org of WEB3_AUDIT_ORGS) {
    try {
      const url = `https://api.github.com/orgs/${org}/repos?sort=created&direction=desc&per_page=10`;
      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "automaton-landscape-scanner",
      };
      if (process.env.GITHUB_TOKEN) {
        headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
      }

      const result = await moatFetch(url, { headers });

      if (!result.ok) {
        scanErrors.push(`Web3Audit(${org}): HTTP ${result.status_code}`);
        continue;
      }

      const repos = (Array.isArray(result.body) ? result.body : []) as any[];
      for (const repo of repos) {
        // Skip archived/old repos — only recent contests (last 30 days)
        const createdAt = new Date(repo.created_at);
        const daysOld =
          (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld > 30) continue;

        // Estimate reward from org reputation
        const rewardCents = estimateAuditReward(org);

        bounties.push({
          source: `web3-${org}` as BountyOpportunity["source"],
          title: `[${org}] ${repo.name}`,
          url: repo.html_url,
          rewardCents,
          currency: "USD",
          repo: `${org}/${repo.name}`,
          labels: ["audit", "web3", "smart-contract"],
          createdAt: repo.created_at,
          evScore: Math.round(rewardCents * 0.1), // lower EV — audits are competitive
        });
      }
    } catch (err: any) {
      scanErrors.push(`Web3Audit(${org}): ${err.message}`);
    }
  }

  return bounties;
}

/**
 * Run all landscape scanners and persist a snapshot.
 * Scans BOTH mainnet and testnet registries for maximum coverage.
 * Integrates 10+ bounty sources in parallel.
 */
export async function scanLandscape(
  db: AutomatonDatabase,
  network: Network = "mainnet",
): Promise<LandscapeSnapshot> {
  // Return cached result if recent enough
  if (lastScanResult && (Date.now() - lastScanResult.timestamp) < SCAN_CACHE_TTL_MS) {
    return lastScanResult.snapshot;
  }

  const timestamp = new Date().toISOString();
  const id = `ls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Clear errors from previous scan
  scanErrors.length = 0;

  // Import new scanners dynamically (keeps them isolated + lazy-loaded)
  const [
    { scanReddit },
    { scanRSSFeeds },
    { scanAgentPlatforms },
  ] = await Promise.all([
    import("./reddit-scanner.js"),
    import("./rss-scanner.js"),
    import("./agent-platforms-scanner.js"),
  ]);

  // Run ALL scanners in parallel — 10+ sources
  const [
    mainnetResult,
    testnetResult,
    githubResult,
    githubSearchResult,
    algoraResult,
    gitcoinResult,
    web3AuditResult,
    redditResult,
    rssResult,
    agentPlatformResult,
  ] = await Promise.allSettled([
    scanERC8004Registry("mainnet", 50),
    scanERC8004Registry("testnet", 50),
    scanBounties(),
    scanGitHubSearch(),
    scanAlgoraBounties(),
    scanGitcoinBounties(),
    scanWeb3AuditContests(),
    scanReddit(),
    scanRSSFeeds(),
    scanAgentPlatforms(),
  ]);

  const mainnet =
    mainnetResult.status === "fulfilled"
      ? mainnetResult.value
      : { totalAgents: 0, agents: [], services: [] };

  const testnet =
    testnetResult.status === "fulfilled"
      ? testnetResult.value
      : { totalAgents: 0, agents: [], services: [] };

  // Merge both networks — tag agents with their network
  const allAgents = [
    ...mainnet.agents.map((a) => ({ ...a, agentId: `mainnet:${a.agentId}` })),
    ...testnet.agents.map((a) => ({ ...a, agentId: `testnet:${a.agentId}` })),
  ];
  const allServices = [...mainnet.services, ...testnet.services];
  const totalAgents = mainnet.totalAgents + testnet.totalAgents;

  const githubBounties =
    githubResult.status === "fulfilled" ? githubResult.value : [];

  const githubSearchBounties =
    githubSearchResult.status === "fulfilled" ? githubSearchResult.value : [];

  const algoraBounties =
    algoraResult.status === "fulfilled" ? algoraResult.value : [];

  const gitcoinBounties =
    gitcoinResult.status === "fulfilled" ? gitcoinResult.value : [];

  const web3Bounties =
    web3AuditResult.status === "fulfilled" ? web3AuditResult.value : [];

  const redditBounties =
    redditResult.status === "fulfilled" ? redditResult.value : [];

  const rssBounties =
    rssResult.status === "fulfilled" ? rssResult.value : [];

  const agentPlatformBounties =
    agentPlatformResult.status === "fulfilled" ? agentPlatformResult.value : [];

  // Merge all bounties, apply qualification scoring, sort by EV
  const rawBounties = [
    ...githubBounties,
    ...githubSearchBounties,
    ...algoraBounties,
    ...gitcoinBounties,
    ...web3Bounties,
    ...redditBounties,
    ...rssBounties,
    ...agentPlatformBounties,
  ];

  // Apply skill-match and hourly rate qualification
  const allBounties = qualifyBounties(rawBounties)
    .sort((a, b) => (b.evScore || 0) - (a.evScore || 0));

  // ─── Bounty Memory: upsert each bounty and track new discoveries ───
  let newBountyCount = 0;
  for (const bounty of allBounties) {
    const { isNew } = db.upsertBounty(bounty);
    if (isNew) newBountyCount++;
  }

  // Record per-source scan results
  const scannerResults = [
    { id: "github", result: githubResult, bounties: githubBounties },
    { id: "github-search", result: githubSearchResult, bounties: githubSearchBounties },
    { id: "algora", result: algoraResult, bounties: algoraBounties },
    { id: "gitcoin", result: gitcoinResult, bounties: gitcoinBounties },
    { id: "reddit", result: redditResult, bounties: redditBounties },
    { id: "rss-feed", result: rssResult, bounties: rssBounties },
    { id: "agent-platform", result: agentPlatformResult, bounties: agentPlatformBounties },
  ];
  for (const { id: srcId, result: srcResult, bounties: srcBounties } of scannerResults) {
    const success = srcResult.status === "fulfilled";
    db.recordSourceScanResult(srcId, success, success ? srcBounties.length : 0);
  }
  // Web3 audit orgs — one source per org
  if (web3AuditResult.status === "fulfilled") {
    for (const org of ["code-423n4", "sherlock-audit", "immunefi-team", "hats-finance"]) {
      const orgBounties = web3Bounties.filter((b) => b.source === `web3-${org}`);
      db.recordSourceScanResult(`web3-${org}`, true, orgBounties.length);
    }
  } else {
    for (const org of ["code-423n4", "sherlock-audit", "immunefi-team", "hats-finance"]) {
      db.recordSourceScanResult(`web3-${org}`, false, 0);
    }
  }

  // Auto-expire bounties not seen in 7+ days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const staleBounties = db.getBounties({ status: "new" }).filter(
    (b) => b.lastSeenAt < sevenDaysAgo,
  );
  for (const stale of staleBounties) {
    db.recordBountyDecision(stale.url, "expired", "Not seen in 7+ days — auto-expired");
  }

  const serviceProviders = new Set(
    allAgents.filter((a) => a.services.length > 0).map((a) => a.agentId),
  ).size;

  const snapshot: LandscapeSnapshot = {
    id,
    timestamp,
    totalAgents,
    scannedAgents: allAgents.length,
    serviceProviders,
    agents: allAgents,
    bounties: allBounties,
    services: allServices,
  };

  db.insertLandscapeSnapshot(snapshot);
  lastScanResult = { snapshot, timestamp: Date.now() };
  return snapshot;
}

/**
 * Get errors from the last scan run (for diagnostic output).
 */
export function getLastScanErrors(): string[] {
  return [...scanErrors];
}

// ─── Bounty Qualification ──────────────────────────────────────

/**
 * Apply skill-match scoring and hourly rate filtering.
 * Enhances EV scores based on agent's capabilities.
 */
function qualifyBounties(bounties: BountyOpportunity[]): BountyOpportunity[] {
  return bounties.map((bounty) => {
    const skillScore = calculateSkillMatch(bounty);
    const baseEv = bounty.evScore || Math.round(bounty.rewardCents * 0.2);

    // Adjust EV by skill match (0.1-1.0 multiplier)
    const adjustedEv = Math.round(baseEv * Math.max(skillScore, 0.1));

    return {
      ...bounty,
      evScore: adjustedEv,
    };
  });
}

/**
 * Score a bounty against the agent's known capabilities.
 * Returns 0-1 score. Higher = better match.
 */
function calculateSkillMatch(bounty: BountyOpportunity): number {
  const searchText = [
    bounty.title,
    bounty.repo,
    ...bounty.labels,
  ].join(" ").toLowerCase();

  let bestScore = 0.5; // Default moderate match for untagged bounties

  for (const [skill, score] of Object.entries(SKILL_MATCH_SCORES)) {
    if (searchText.includes(skill)) {
      bestScore = Math.max(bestScore, score);
    }
  }

  return bestScore;
}

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Parse reward amount from issue labels or body text.
 * Looks for patterns like "$500", "💰 $500", "500 USD".
 */
function parseRewardFromIssue(issue: any): number {
  // Check labels first
  for (const label of issue.labels || []) {
    const name = typeof label === "string" ? label : label.name || "";
    const match = name.match(/\$\s*([\d,]+)/);
    if (match) return parseInt(match[1].replace(/,/g, ""), 10) * 100;
  }

  // Check issue body
  const body = issue.body || "";
  const bodyMatch = body.match(/\$\s*([\d,]+)/);
  if (bodyMatch) return parseInt(bodyMatch[1].replace(/,/g, ""), 10) * 100;

  return 0;
}

/**
 * Estimate audit reward based on org reputation.
 * Conservative estimates — actual payouts vary widely.
 */
function estimateAuditReward(org: string): number {
  switch (org) {
    case "code-423n4":
      return 2500000; // $25K median contest (in cents)
    case "sherlock-audit":
      return 1500000; // $15K median
    case "immunefi-team":
      return 500000; // $5K median bounty
    case "hats-finance":
      return 1000000; // $10K median
    default:
      return 500000; // $5K default
  }
}
