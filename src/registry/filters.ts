/**
 * Agent Filtering for Customer Discovery
 *
 * Phase 2 (S-01 Registry Sniper): Filter and score potential customers
 * based on keywords, activity, and relevance.
 */

import type { DiscoveredAgent } from "../types.js";
import { createLogger } from "../observability/logger.js";

const logger = createLogger("registry.filters");

// Keywords for identifying potential customers
const FINANCIAL_KEYWORDS = [
  // English
  "accounting",
  "tax",
  "finance",
  "expenses",
  "receipt",
  "invoice",
  "budget",
  "treasury",
  "audit",
  "reimbursement",
  "payment",
  "billing",
  "bookkeeping",
  "payroll",
  "ledger",
  // Chinese equivalents
  "会计",
  "税务",
  "财务",
  "报销",
  "收据",
  "发票",
  "预算",
  "金库",
  "审计",
  "账单",
  "记账",
  "薪酬",
] as const;

// Activity threshold in days
const ACTIVITY_THRESHOLD_DAYS = 7;

// ─── Types ─────────────────────────────────────────────────────

export interface PotentialCustomer {
  id: string | number;
  name?: string;
  owner: string;
  uri?: string;
  description?: string;
  matchedKeywords: string[];
  relevanceScore: number;
  discoveredAt: string;
}

export interface FilterOptions {
  /** Keywords to match against agent name/description */
  keywords?: readonly string[];
  /** Days since last activity to consider active */
  activityThresholdDays?: number;
  /** Agent IDs to exclude (already contacted) */
  excludeIds?: Set<string>;
  /** Maximum number of results */
  limit?: number;
  /** Minimum relevance score (0-100) */
  minScore?: number;
}

// ─── Filtering Functions ───────────────────────────────────────

/**
 * Extract matched keywords from an agent's name and description.
 */
export function extractMatchedKeywords(
  agent: DiscoveredAgent,
  keywords: readonly string[] = FINANCIAL_KEYWORDS,
): string[] {
  const text = [agent.name || "", agent.description || ""]
    .join(" ")
    .toLowerCase();

  return keywords.filter((k) => text.includes(k.toLowerCase()));
}

/**
 * Get unique identifier for an agent (agentId or owner).
 */
export function getAgentId(agent: DiscoveredAgent): string {
  return agent.agentId || agent.owner;
}

/**
 * Calculate relevance score for an agent based on matched keywords.
 * Score is 0-100, with higher scores indicating better matches.
 */
export function calculateRelevanceScore(
  agent: DiscoveredAgent,
  matchedKeywords: string[],
): number {
  if (matchedKeywords.length === 0) return 0;

  // Base score from number of matched keywords
  let score = Math.min(matchedKeywords.length * 15, 60);

  // Bonus for specific high-value keywords
  const highValueKeywords = [
    "receipt",
    "invoice",
    "reimbursement",
    "收据",
    "发票",
  ];
  const hasHighValue = matchedKeywords.some((k) =>
    highValueKeywords.includes(k.toLowerCase()),
  );
  if (hasHighValue) score += 20;

  // Bonus for having a name (more legitimate agent)
  if (agent.name && agent.name.length > 0) score += 10;

  // Bonus for having a description (more complete profile)
  if (agent.description && agent.description.length > 20) score += 10;

  return Math.min(score, 100);
}

/**
 * Check if an agent is considered active based on discovery time.
 * In production, this would check on-chain activity.
 */
export function isAgentActive(
  agent: DiscoveredAgent,
  thresholdDays: number = ACTIVITY_THRESHOLD_DAYS,
): boolean {
  // If we don't have activity data, assume active
  // In production, check on-chain transaction count or timestamp
  if (!agent.agentId) return true;

  // For now, assume all discovered agents are active
  // This could be enhanced with on-chain activity checks
  return true;
}

/**
 * Check if an agent's URI is accessible.
 * Returns true if URI is valid and accessible.
 */
export async function isUriAccessible(
  uri: string | undefined,
): Promise<boolean> {
  if (!uri) return false;

  // Basic URI format check
  try {
    const url = new URL(uri);
    if (!["https:", "ipfs:"].includes(url.protocol)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter and score potential customers from a list of discovered agents.
 */
export function filterPotentialCustomers(
  agents: DiscoveredAgent[],
  options: FilterOptions = {},
): PotentialCustomer[] {
  const {
    keywords = FINANCIAL_KEYWORDS,
    activityThresholdDays = ACTIVITY_THRESHOLD_DAYS,
    excludeIds = new Set(),
    limit = 20,
    minScore = 20,
  } = options;

  logger.debug(
    `Filtering ${agents.length} agents with ${keywords.length} keywords`,
  );

  const results: PotentialCustomer[] = [];

  for (const agent of agents) {
    // Skip excluded IDs
    const agentIdStr = getAgentId(agent);
    if (excludeIds.has(agentIdStr)) {
      continue;
    }

    // Extract matched keywords
    const matchedKeywords = extractMatchedKeywords(agent, keywords);

    // Skip if no keywords matched
    if (matchedKeywords.length === 0) {
      continue;
    }

    // Check activity
    if (!isAgentActive(agent, activityThresholdDays)) {
      continue;
    }

    // Calculate score
    const relevanceScore = calculateRelevanceScore(agent, matchedKeywords);

    // Skip if below minimum score
    if (relevanceScore < minScore) {
      continue;
    }

    results.push({
      id: getAgentId(agent),
      name: agent.name,
      owner: agent.owner,
      uri: agent.agentURI,
      description: agent.description,
      matchedKeywords,
      relevanceScore,
      discoveredAt: new Date().toISOString(),
    });
  }

  // Sort by relevance score (descending)
  results.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Limit results
  const limited = results.slice(0, limit);

  logger.info(
    `Filtered to ${limited.length} potential customers from ${agents.length} agents`,
    {
      topScores: limited.slice(0, 5).map((r) => ({
        name: r.name,
        score: r.relevanceScore,
        keywords: r.matchedKeywords,
      })),
    },
  );

  return limited;
}

/**
 * Get default financial keywords for customer discovery.
 */
export function getFinancialKeywords(): readonly string[] {
  return FINANCIAL_KEYWORDS;
}

/**
 * Add custom keywords to the default set.
 */
export function extendKeywords(customKeywords: string[]): string[] {
  return [
    ...new Set([
      ...FINANCIAL_KEYWORDS,
      ...customKeywords.map((k) => k.toLowerCase()),
    ]),
  ];
}
