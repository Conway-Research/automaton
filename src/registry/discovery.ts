/**
 * Agent Discovery
 *
 * Discover other agents via Solana Metaplex Core registry queries.
 * Fetch and parse agent cards from URIs.
 */

import type {
  DiscoveredAgent,
  AgentCard,
} from "../types.js";
import { queryAgent, getAgentsByOwner } from "./solana-registry.js";

type SolanaNetwork = "mainnet-beta" | "devnet" | "testnet";

/**
 * Discover agents owned by a specific wallet.
 */
export async function discoverAgentsByOwner(
  ownerAddress: string,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<DiscoveredAgent[]> {
  const agents = await getAgentsByOwner(ownerAddress, network, rpcUrl);

  // Enrich with agent card metadata
  for (const agent of agents) {
    try {
      const card = await fetchAgentCard(agent.agentURI);
      if (card) {
        agent.name = card.name;
        agent.description = card.description;
      }
    } catch {
      // Card fetch failed, use basic info
    }
  }

  return agents;
}

/**
 * Fetch an agent card from a URI.
 */
export async function fetchAgentCard(
  uri: string,
): Promise<AgentCard | null> {
  try {
    // Handle IPFS URIs
    let fetchUrl = uri;
    if (uri.startsWith("ipfs://")) {
      fetchUrl = `https://ipfs.io/ipfs/${uri.slice(7)}`;
    }

    const response = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return null;

    const card = (await response.json()) as AgentCard;

    // Basic validation
    if (!card.name || !card.type) return null;

    return card;
  } catch {
    return null;
  }
}

/**
 * Search for a specific agent by asset address.
 */
export async function lookupAgent(
  assetAddress: string,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<DiscoveredAgent | null> {
  const agent = await queryAgent(assetAddress, network, rpcUrl);
  if (!agent) return null;

  try {
    const card = await fetchAgentCard(agent.agentURI);
    if (card) {
      agent.name = card.name;
      agent.description = card.description;
    }
  } catch {
    // Card fetch failed
  }

  return agent;
}
