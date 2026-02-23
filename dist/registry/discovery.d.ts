/**
 * Agent Discovery
 *
 * Discover other agents via ERC-8004 registry queries.
 * Fetch and parse agent cards from URIs.
 *
 * Phase 3.2: Added caching, configurable IPFS gateway, stricter validation.
 */
import type { DiscoveredAgent, AgentCard, DiscoveryConfig } from "../types.js";
type Network = "mainnet" | "testnet";
/**
 * Check if a hostname resolves to an internal/private network.
 * Blocks: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12,
 *         192.168.0.0/16, 169.254.0.0/16, ::1, localhost, 0.0.0.0/8
 */
export declare function isInternalNetwork(hostname: string): boolean;
/**
 * Check if a URI is allowed for fetching.
 * Only https: and ipfs: schemes are permitted.
 * Internal network addresses are blocked (SSRF protection).
 */
export declare function isAllowedUri(uri: string): boolean;
/**
 * Validate a fetched agent card JSON against required schema.
 * Phase 3.2: Stricter validation with field length checks.
 */
export declare function validateAgentCard(data: unknown): AgentCard | null;
/**
 * Discover agents by scanning the registry.
 * Returns a list of discovered agents with their metadata.
 *
 * Phase 3.2: Uses caching and configurable discovery options.
 */
export declare function discoverAgents(limit?: number, network?: Network, config?: Partial<DiscoveryConfig>, db?: import("better-sqlite3").Database): Promise<DiscoveredAgent[]>;
/**
 * Fetch an agent card from a URI.
 * Enforces SSRF protection and per-fetch timeout.
 *
 * Phase 3.2: Configurable IPFS gateway and response size limit.
 */
export declare function fetchAgentCard(uri: string, config?: Partial<DiscoveryConfig>): Promise<AgentCard | null>;
/**
 * Search for agents by name or description.
 * Scans recent registrations and filters by keyword.
 */
export declare function searchAgents(keyword: string, limit?: number, network?: Network, config?: Partial<DiscoveryConfig>, db?: import("better-sqlite3").Database): Promise<DiscoveredAgent[]>;
export {};
//# sourceMappingURL=discovery.d.ts.map