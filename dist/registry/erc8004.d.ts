/**
 * ERC-8004 On-Chain Agent Registration
 *
 * Registers the automaton on-chain as a Trustless Agent via ERC-8004.
 * Uses the Identity Registry on Base mainnet.
 *
 * Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (Base)
 * Reputation: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (Base)
 *
 * Phase 3.2: Added preflight gas check, score validation, config-based network,
 * Transfer event topic fix, and transaction logging.
 */
import { type Address, type PrivateKeyAccount } from "viem";
import type { RegistryEntry, DiscoveredAgent, AutomatonDatabase } from "../types.js";
type Network = "mainnet" | "testnet";
/**
 * Register the automaton on-chain with ERC-8004.
 * Returns the agent ID (NFT token ID).
 *
 * Phase 3.2: Preflight check + transaction logging.
 */
export declare function registerAgent(account: PrivateKeyAccount, agentURI: string, network: Network | undefined, db: AutomatonDatabase): Promise<RegistryEntry>;
/**
 * Update the agent's URI on-chain.
 */
export declare function updateAgentURI(account: PrivateKeyAccount, agentId: string, newAgentURI: string, network: Network | undefined, db: AutomatonDatabase): Promise<string>;
/**
 * Leave reputation feedback for another agent.
 *
 * Phase 3.2: Validates score 1-5, comment max 500 chars,
 * uses config-based network (not hardcoded "mainnet").
 */
export declare function leaveFeedback(account: PrivateKeyAccount, agentId: string, score: number, comment: string, network: Network | undefined, db: AutomatonDatabase): Promise<string>;
/**
 * Query the registry for an agent by ID.
 */
export declare function queryAgent(agentId: string, network?: Network): Promise<DiscoveredAgent | null>;
/**
 * Get the total number of registered agents.
 */
export declare function getTotalAgents(network?: Network): Promise<number>;
/**
 * Check if an address has a registered agent.
 */
export declare function hasRegisteredAgent(address: Address, network?: Network): Promise<boolean>;
export {};
//# sourceMappingURL=erc8004.d.ts.map