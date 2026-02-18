/**
 * ERC-8004 On-Chain Agent Registration
 *
 * Registers the automaton on-chain as a Trustless Agent via ERC-8004.
 * Uses the Identity Registry on Base mainnet.
 *
 * Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (Base)
 * Reputation: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (Base)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { getBaseRpcUrls } from "../conway/base-rpc.js";
import type {
  RegistryEntry,
  ReputationEntry,
  DiscoveredAgent,
  AutomatonDatabase,
} from "../types.js";

// ─── Contract Addresses ──────────────────────────────────────

const CONTRACTS = {
  mainnet: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address,
    chain: base,
  },
  testnet: {
    identity: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as Address,
    reputation: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63" as Address,
    chain: baseSepolia,
  },
} as const;

// ─── ABI (minimal subset needed for registration) ────────────

// ERC-8004 Identity Registry ABI (verified from erc-8004/erc-8004-contracts on-chain ABI).
// register(string) selector: 0xf2c298be — confirmed by on-chain tx data.
const IDENTITY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
]);

// Official ERC-8004 Reputation Registry uses giveFeedback (not leaveFeedback/getFeedback).
// JSON ABI avoids parseAbi issues with tuple field names like "from".
const REPUTATION_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
  },
] as const;

type Network = "mainnet" | "testnet";

/**
 * Register the automaton on-chain with ERC-8004.
 * Returns the agent ID (NFT token ID).
 */
function getRpcForNetwork(network: Network): string {
  if (network === "testnet") return "https://sepolia.base.org";
  const urls = getBaseRpcUrls();
  return urls[0];
}

export async function registerAgent(
  account: PrivateKeyAccount,
  agentURI: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
): Promise<RegistryEntry> {
  // Defensive idempotence: if we already have a registry entry, do not mint again.
  // The Identity Registry "register" call mints a new ERC-721 token each time.
  // Without this, an LLM tool-call loop can accidentally mint many agents.
  const existing = db.getRegistryEntry();
  if (existing?.agentId) return existing;

  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
  const rpcUrl = getRpcForNetwork(network);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // Pre-flight: check ETH balance for gas
  const ethBalance = await publicClient.getBalance({ address: account.address });
  if (ethBalance === 0n) {
    throw new Error(
      `Cannot register: wallet ${account.address} has 0 ETH on Base for gas fees. ` +
      `Bridge ETH to Base via https://bridge.base.org or send ETH directly to Base. ` +
      `~0.001 ETH (~$2) is enough.`
    );
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  // Call register(agentURI)
  const hash = await walletClient.writeContract({
    address: contracts.identity,
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [agentURI],
  });

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Extract agentId from Transfer event logs
  // The register function mints an ERC-721 token
  let agentId = "0";
  for (const log of receipt.logs) {
    if (log.topics.length >= 4) {
      // Transfer(address from, address to, uint256 tokenId)
      agentId = BigInt(log.topics[3]!).toString();
      break;
    }
  }

  const entry: RegistryEntry = {
    agentId,
    agentURI,
    chain: `eip155:${chain.id}`,
    contractAddress: contracts.identity,
    txHash: hash,
    registeredAt: new Date().toISOString(),
  };

  db.setRegistryEntry(entry);
  return entry;
}

/**
 * Update the agent's URI on-chain.
 */
export async function updateAgentURI(
  account: PrivateKeyAccount,
  agentId: string,
  newAgentURI: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
): Promise<string> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
  const rpcUrl = getRpcForNetwork(network);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.writeContract({
    address: contracts.identity,
    abi: IDENTITY_ABI,
    functionName: "setAgentURI",
    args: [BigInt(agentId), newAgentURI],
  });

  // Update in DB
  const entry = db.getRegistryEntry();
  if (entry) {
    entry.agentURI = newAgentURI;
    entry.txHash = hash;
    db.setRegistryEntry(entry);
  }

  return hash;
}

/**
 * Leave reputation feedback for another agent.
 * Uses giveFeedback(value, valueDecimals, tag1, ...) per ERC-8004 Reputation Registry.
 */
export async function leaveFeedback(
  account: PrivateKeyAccount,
  agentId: string,
  score: number,
  comment: string,
  network: Network = "mainnet",
  _db?: AutomatonDatabase,
): Promise<string> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
  const rpcUrl = getRpcForNetwork(network);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  const hash = await walletClient.writeContract({
    address: contracts.reputation,
    abi: REPUTATION_ABI,
    functionName: "giveFeedback",
    args: [
      BigInt(agentId),
      BigInt(Math.min(100, Math.max(0, score))),
      0, // valueDecimals
      comment.slice(0, 256) || "",
      "",
      "",
      "",
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`,
    ],
  });

  return hash;
}

/**
 * Query the registry for an agent by ID.
 */
export async function queryAgent(
  agentId: string,
  network: Network = "mainnet",
): Promise<DiscoveredAgent | null> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
  const rpcUrl = getRpcForNetwork(network);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const agentIdBigInt = BigInt(agentId);
  try {
    const owner = await publicClient.readContract({
      address: contracts.identity,
      abi: IDENTITY_ABI,
      functionName: "ownerOf",
      args: [agentIdBigInt],
    });

    const uri = await publicClient.readContract({
      address: contracts.identity,
      abi: IDENTITY_ABI,
      functionName: "tokenURI",
      args: [agentIdBigInt],
    }) as string;

    return {
      agentId,
      owner: owner as string,
      agentURI: uri,
    };
  } catch {
    return null;
  }
}

/**
 * Get the total number of registered agents.
 */
export async function getTotalAgents(
  network: Network = "mainnet",
): Promise<number> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
  const rpcUrl = getRpcForNetwork(network);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  try {
    const supply = await publicClient.readContract({
      address: contracts.identity,
      abi: IDENTITY_ABI,
      functionName: "totalSupply",
    });
    return Number(supply);
  } catch {
    return 0;
  }
}

/**
 * Check if an address has a registered agent.
 */
export async function hasRegisteredAgent(
  address: Address,
  network: Network = "mainnet",
): Promise<boolean> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
