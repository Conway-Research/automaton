/**
 * Agent Filtering for Customer Discovery
 *
 * Phase 2 (S-01 Registry Sniper): Filter and score potential customers
 * based on keywords, activity, and relevance.
 */
import type { DiscoveredAgent } from "../types.js";
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
/**
 * Extract matched keywords from an agent's name and description.
 */
export declare function extractMatchedKeywords(agent: DiscoveredAgent, keywords?: readonly string[]): string[];
/**
 * Get unique identifier for an agent (agentId or owner).
 */
export declare function getAgentId(agent: DiscoveredAgent): string;
/**
 * Calculate relevance score for an agent based on matched keywords.
 * Score is 0-100, with higher scores indicating better matches.
 */
export declare function calculateRelevanceScore(agent: DiscoveredAgent, matchedKeywords: string[]): number;
/**
 * Check if an agent is considered active based on discovery time.
 * In production, this would check on-chain activity.
 */
export declare function isAgentActive(agent: DiscoveredAgent, thresholdDays?: number): boolean;
/**
 * Check if an agent's URI is accessible.
 * Returns true if URI is valid and accessible.
 */
export declare function isUriAccessible(uri: string | undefined): Promise<boolean>;
/**
 * Filter and score potential customers from a list of discovered agents.
 */
export declare function filterPotentialCustomers(agents: DiscoveredAgent[], options?: FilterOptions): PotentialCustomer[];
/**
 * Get default financial keywords for customer discovery.
 */
export declare function getFinancialKeywords(): readonly string[];
/**
 * Add custom keywords to the default set.
 */
export declare function extendKeywords(customKeywords: string[]): string[];
//# sourceMappingURL=filters.d.ts.map