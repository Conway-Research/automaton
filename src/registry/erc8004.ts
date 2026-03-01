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

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toBytes,
  encodeFunctionData,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import type {
  RegistryEntry,
  DiscoveredAgent,
  AutomatonDatabase,
  OnchainTransactionRow,
} from "../types.js";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("registry.erc8004");

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

// ERC-8004 Identity Registry ABI
// 正确的函数签名 (通过字节码分析确认):
// - 读取: tokenURI(uint256) - 标准 ERC-721
// - 更新: setAgentURI(uint256,string) - ERC-8004 自定义
const IDENTITY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newAgentURI) external",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
]);

const REPUTATION_ABI = parseAbi([
  "function leaveFeedback(uint256 agentId, uint8 score, string comment) external",
  "function getFeedback(uint256 agentId) external view returns ((address, uint8, string, uint256)[])",
]);

// Phase 3.2: ERC-721 Transfer event topic signature for agent ID extraction
const TRANSFER_EVENT_TOPIC = keccak256(
  toBytes("Transfer(address,address,uint256)"),
);

type Network = "mainnet" | "testnet";

/**
 * Resolve the RPC transport URL.
 * Priority: explicit parameter > AUTOMATON_RPC_URL env var > viem default (public RPC).
 */
function resolveRpcUrl(rpcUrl?: string): string | undefined {
  return rpcUrl || process.env.AUTOMATON_RPC_URL || undefined;
}

// ─── Preflight Check ────────────────────────────────────────────

/**
 * Phase 3.2: Gas estimation + balance check before on-chain transaction.
 * Throws descriptive error if insufficient balance.
 */
async function preflight(
  account: PrivateKeyAccount,
  network: Network,
  functionData: {
    address: Address;
    abi: any;
    functionName: string;
    args: any[];
  },
  rpcUrl?: string,
): Promise<void> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  const publicClient = createPublicClient({
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  // Encode calldata for accurate gas estimation
  const data = encodeFunctionData({
    abi: functionData.abi,
    functionName: functionData.functionName,
    args: functionData.args,
  });

  // Estimate gas
  const gasEstimate = await publicClient
    .estimateGas({
      account: account.address,
      to: functionData.address,
      data,
    })
    .catch(() => BigInt(200_000)); // Fallback estimate

  // Get gas price
  const gasPrice = await publicClient
    .getGasPrice()
    .catch(() => BigInt(1_000_000_000)); // 1 gwei fallback

  // Get balance
  const balance = await publicClient.getBalance({
    address: account.address,
  });

  const estimatedCost = gasEstimate * gasPrice;

  if (balance < estimatedCost) {
    throw new Error(
      `Insufficient ETH for gas. Balance: ${balance} wei, estimated cost: ${estimatedCost} wei (gas: ${gasEstimate}, price: ${gasPrice} wei)`,
    );
  }
}

// ─── Transaction Logging ────────────────────────────────────────

/**
 * Phase 3.2: Log a transaction to the onchain_transactions table.
 */
function logTransaction(
  rawDb: import("better-sqlite3").Database | undefined,
  txHash: string,
  chain: string,
  operation: string,
  status: "pending" | "confirmed" | "failed",
  gasUsed?: number,
  metadata?: Record<string, unknown>,
): void {
  if (!rawDb) return;
  try {
    rawDb
      .prepare(
        `INSERT INTO onchain_transactions (id, tx_hash, chain, operation, status, gas_used, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ulid(),
        txHash,
        chain,
        operation,
        status,
        gasUsed ?? null,
        JSON.stringify(metadata ?? {}),
      );
  } catch (error) {
    logger.error(
      "Transaction log failed:",
      error instanceof Error ? error : undefined,
    );
  }
}

function updateTransactionStatus(
  rawDb: import("better-sqlite3").Database | undefined,
  txHash: string,
  status: "pending" | "confirmed" | "failed",
  gasUsed?: number,
): void {
  if (!rawDb) return;
  try {
    rawDb
      .prepare(
        "UPDATE onchain_transactions SET status = ?, gas_used = COALESCE(?, gas_used) WHERE tx_hash = ?",
      )
      .run(status, gasUsed ?? null, txHash);
  } catch (error) {
    logger.error(
      "Transaction status update failed:",
      error instanceof Error ? error : undefined,
    );
  }
}

// ─── Registration ───────────────────────────────────────────────

/**
 * Register the automaton on-chain with ERC-8004.
 * Returns the agent ID (NFT token ID).
 *
 * Phase 3.2: Preflight check + transaction logging.
 */
export async function registerAgent(
  account: PrivateKeyAccount,
  agentURI: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
  rpcUrl?: string,
): Promise<RegistryEntry> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;
  const rpc = resolveRpcUrl(rpcUrl);

  // Phase 3.2: Preflight gas check
  await preflight(account, network, {
    address: contracts.identity,
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [agentURI],
  }, rpcUrl);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpc),
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpc),
  });

  // Call register(agentURI)
  const hash = await walletClient.writeContract({
    address: contracts.identity,
    abi: IDENTITY_ABI,
    functionName: "register",
    args: [agentURI],
  });

  // Phase 3.2: Log pending transaction
  logTransaction(
    db.raw,
    hash,
    `eip155:${chain.id}`,
    "register",
    "pending",
    undefined,
    { agentURI },
  );

  // Wait for transaction receipt
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Phase 3.2: Update transaction status
  const gasUsed = receipt.gasUsed ? Number(receipt.gasUsed) : undefined;
  updateTransactionStatus(
    db.raw,
    hash,
    receipt.status === "success" ? "confirmed" : "failed",
    gasUsed,
  );

  // Phase 3.2: Extract agentId using Transfer event topic signature
  let agentId = "0";
  for (const log of receipt.logs) {
    if (log.topics.length >= 4 && log.topics[0] === TRANSFER_EVENT_TOPIC) {
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
  rpcUrl?: string,
): Promise<string> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  // Phase 3.2: Preflight gas check
  await preflight(account, network, {
    address: contracts.identity,
    abi: IDENTITY_ABI,
    functionName: "setAgentURI",
    args: [BigInt(agentId), newAgentURI],
  }, rpcUrl);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  const hash = await walletClient.writeContract({
    address: contracts.identity,
    abi: IDENTITY_ABI,
    functionName: "setAgentURI",
    args: [BigInt(agentId), newAgentURI],
  });

  // Phase 3.2: Log transaction
  logTransaction(
    db.raw,
    hash,
    `eip155:${chain.id}`,
    "updateAgentURI",
    "pending",
    undefined,
    { agentId, newAgentURI },
  );

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
 *
 * Phase 3.2: Validates score 1-5, comment max 500 chars,
 * uses config-based network (not hardcoded "mainnet").
 */
export async function leaveFeedback(
  account: PrivateKeyAccount,
  agentId: string,
  score: number,
  comment: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
  rpcUrl?: string,
): Promise<string> {
  // Phase 3.2: Validate score range 1-5
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error(
      `Invalid score: ${score}. Must be an integer between 1 and 5.`,
    );
  }

  // Phase 3.2: Validate comment length
  if (comment.length > 500) {
    throw new Error(`Comment too long: ${comment.length} chars (max 500).`);
  }

  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  // Phase 3.2: Preflight gas check
  await preflight(account, network, {
    address: contracts.reputation,
    abi: REPUTATION_ABI,
    functionName: "leaveFeedback",
    args: [BigInt(agentId), score, comment],
  }, rpcUrl);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  const hash = await walletClient.writeContract({
    address: contracts.reputation,
    abi: REPUTATION_ABI,
    functionName: "leaveFeedback",
    args: [BigInt(agentId), score, comment],
  });

  // Phase 3.2: Log transaction
  logTransaction(
    db.raw,
    hash,
    `eip155:${chain.id}`,
    "leaveFeedback",
    "pending",
    undefined,
    { agentId, score, comment },
  );

  return hash;
}

/**
 * Query the registry for an agent by ID.
 */
export async function queryAgent(
  agentId: string,
  network: Network = "mainnet",
  rpcUrl?: string,
): Promise<DiscoveredAgent | null> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  const publicClient = createPublicClient({
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  try {
    const uri = await publicClient.readContract({
      address: contracts.identity,
      abi: IDENTITY_ABI,
      functionName: "tokenURI",
      args: [BigInt(agentId)],
    });

    // ownerOf may revert on contracts that don't implement it
    let owner = "";
    try {
      owner = (await publicClient.readContract({
        address: contracts.identity,
        abi: IDENTITY_ABI,
        functionName: "ownerOf",
        args: [BigInt(agentId)],
      })) as string;
    } catch {
      logger.warn(`ownerOf reverted for agent ${agentId}, continuing without owner`);
    }

    return {
      agentId,
      owner,
      agentURI: uri as string,
    };
  } catch {
    return null;
  }
}

/**
 * Get the total number of registered agents.
 * Tries totalSupply() first; if that reverts (proxy contracts without
 * ERC-721 Enumerable), falls back to a binary search on ownerOf().
 */
export async function getTotalAgents(
  network: Network = "mainnet",
  rpcUrl?: string,
): Promise<number> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  const publicClient = createPublicClient({
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  try {
    const supply = await publicClient.readContract({
      address: contracts.identity,
      abi: IDENTITY_ABI,
      functionName: "totalSupply",
    });
    return Number(supply);
  } catch {
    // totalSupply() reverted — proxy may lack ERC-721 Enumerable.
    // Binary search for the highest minted tokenId via ownerOf().
    return estimateTotalByBinarySearch(publicClient, contracts.identity);
  }
}

/**
 * Estimate total minted tokens by binary-searching ownerOf().
 * Token IDs are sequential starting from 1, so the highest existing
 * tokenId equals the total minted count.
 */
async function estimateTotalByBinarySearch(
  client: { readContract: (args: any) => Promise<any> },
  contractAddress: Address,
): Promise<number> {
  const exists = async (id: number): Promise<boolean> => {
    try {
      await client.readContract({
        address: contractAddress,
        abi: IDENTITY_ABI,
        functionName: "ownerOf",
        args: [BigInt(id)],
      });
      return true;
    } catch {
      return false;
    }
  };

  // Quick probe to find an upper bound
  // Quick probe to find an upper bound
  let upper = 1;
  while (await exists(upper)) {
    upper *= 2;
    if (upper > 10_000_000) break; // safety cap
  }

  // Binary search between 0 and upper
  let lo = 0;
  let hi = upper;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (await exists(mid)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  if (lo > 0) {
    logger.info(`Binary search estimated total agents: ${lo}`);
  }
  return lo;
}

/**
 * Discover registered agents by scanning Transfer mint events.
 * Fallback for contracts that don't implement totalSupply (ERC-721 Enumerable).
 *
 * Scans for Transfer(address(0), to, tokenId) events to find minted tokens.
 * Returns token IDs and owners extracted directly from event data.
 */
export async function getRegisteredAgentsByEvents(
  network: Network = "mainnet",
  limit: number = 20,
  rpcUrl?: string,
): Promise<{ tokenId: string; owner: string }[]> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  const publicClient = createPublicClient({
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  try {
    const currentBlock = await publicClient.getBlockNumber();
    // Scan last 500,000 blocks (~11.5 days on Base at 2s blocks)
    const earliestBlock = currentBlock > 500_000n ? currentBlock - 500_000n : 0n;

    // Paginate backward in ≤10K-block chunks (newest-first).
    // Base public RPC enforces a 10,000-block limit on eth_getLogs.
    const MAX_BLOCK_RANGE = 10_000n;
    const MAX_CONSECUTIVE_FAILURES = 2;
    const PER_CHUNK_TIMEOUT_MS = 3_000;
    const allLogs: { args: { tokenId?: bigint; to?: string; from?: string } }[] = [];
    let scanTo = currentBlock;
    let consecutiveFailures = 0;

    while (scanTo > earliestBlock) {
      const scanFrom = scanTo - MAX_BLOCK_RANGE > earliestBlock
        ? scanTo - MAX_BLOCK_RANGE
        : earliestBlock;

      try {
        const chunkLogs = await Promise.race([
          publicClient.getLogs({
            address: contracts.identity,
            event: {
              type: "event",
              name: "Transfer",
              inputs: [
                { type: "address", name: "from", indexed: true },
                { type: "address", name: "to", indexed: true },
                { type: "uint256", name: "tokenId", indexed: true },
              ],
            },
            args: {
              from: "0x0000000000000000000000000000000000000000" as Address,
            },
            fromBlock: scanFrom,
            toBlock: scanTo,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("chunk timeout")), PER_CHUNK_TIMEOUT_MS),
          ),
        ]);
        allLogs.push(...chunkLogs);
        consecutiveFailures = 0;
      } catch (chunkError) {
        consecutiveFailures++;
        logger.warn(`Event scan chunk ${scanFrom}-${scanTo} failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${chunkError instanceof Error ? chunkError.message : "unknown error"}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          logger.warn("Too many consecutive chunk failures, stopping scan");
          break;
        }
      }

      // Early exit if we already have enough logs
      if (allLogs.length >= limit) break;

      scanTo = scanFrom - 1n; // -1n prevents overlap between chunks
    }

    // Deduplicate by tokenId (defensive against RPC edge cases)
    const seen = new Set<string>();
    const uniqueLogs = allLogs.filter((log) => {
      const id = log.args.tokenId!.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Extract token IDs and owners, most recent first
    const agents = uniqueLogs
      .map((log) => ({
        tokenId: (log.args.tokenId!).toString(),
        owner: log.args.to as string,
      }))
      .reverse()
      .slice(0, limit);
 
    // The chunks were scanned newest-first, but within each chunk logs are
    // ascending.  A simple .reverse() no longer yields a correct descending
    // order, so re-sort by tokenId descending (tokenIds are monotonically
    // increasing on mint).
    agents.sort((a, b) => {
      const diff = BigInt(b.tokenId) - BigInt(a.tokenId);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    
    logger.info(`Event scan found ${agents.length} minted agents (scanned ${allLogs.length} Transfer events across ${Math.ceil(Number(currentBlock - earliestBlock) / Number(MAX_BLOCK_RANGE))} chunks)`);
    return agents;
  } catch (error) {
    logger.warn(`Transfer event scan failed, returning empty results: ${error instanceof Error ? error.message : "unknown error"}`);
    return [];
  }
}

/**
 * Check if an address has a registered agent.
 */
export async function hasRegisteredAgent(
  address: Address,
  network: Network = "mainnet",
  rpcUrl?: string,
): Promise<boolean> {
  const contracts = CONTRACTS[network];
  const chain = contracts.chain;

  const publicClient = createPublicClient({
    chain,
    transport: http(resolveRpcUrl(rpcUrl)),
  });

  try {
    const balance = await publicClient.readContract({
      address: contracts.identity,
      abi: IDENTITY_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    return Number(balance) > 0;
  } catch {
    return false;
  }
}
