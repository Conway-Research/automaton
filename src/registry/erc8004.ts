/**
 * Solana On-Chain Agent Registration
 *
 * Registers the automaton on-chain via a Solana program.
 * Replaces legacy contract with Solana-native account model.
 *
 * Program addresses are placeholders — replace with deployed program IDs.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import type {
  RegistryEntry,
  DiscoveredAgent,
  AutomatonDatabase,
  SolanaAddress,
} from "../types.js";
import { ulid } from "ulid";
import { createLogger } from "../observability/logger.js";
const logger = createLogger("registry.solana");

// ─── Program Addresses (replace with deployed program IDs) ──────

// Placeholder program IDs — replace with deployed program addresses
// Using base58-encoded 32-byte keys (valid Solana PublicKey format)
const PROGRAMS = {
  mainnet: {
    identity: new PublicKey("ZNTReg1111111111111111111111111111111111111"),
    reputation: new PublicKey("ZNTRep1111111111111111111111111111111111111"),
    cluster: "mainnet-beta" as const,
  },
  testnet: {
    identity: new PublicKey("ZNTReg1111111111111111111111111111111111111"),
    reputation: new PublicKey("ZNTRep1111111111111111111111111111111111111"),
    cluster: "devnet" as const,
  },
} as const;

type Network = "mainnet" | "testnet";

/**
 * Resolve the RPC URL.
 * Priority: explicit parameter > AUTOMATON_RPC_URL env var > Solana public endpoint.
 */
function resolveRpcUrl(network: Network, rpcUrl?: string): string {
  if (rpcUrl) return rpcUrl;
  if (process.env.AUTOMATON_RPC_URL) return process.env.AUTOMATON_RPC_URL;
  return clusterApiUrl(PROGRAMS[network].cluster);
}

function getConnection(network: Network, rpcUrl?: string): Connection {
  return new Connection(resolveRpcUrl(network, rpcUrl), "confirmed");
}

// ─── Transaction Logging ────────────────────────────────────────

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
 * Register the automaton on-chain via Solana program.
 * Sends a transaction with the agent URI as instruction data.
 */
export async function registerAgent(
  keypair: Keypair,
  agentURI: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
  rpcUrl?: string,
): Promise<RegistryEntry> {
  const programs = PROGRAMS[network];
  const connection = getConnection(network, rpcUrl);

  // Derive a PDA for the agent account
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), keypair.publicKey.toBuffer()],
    programs.identity,
  );

  // Encode instruction: 0 = register, followed by URI bytes
  const uriBytes = Buffer.from(agentURI, "utf-8");
  const data = Buffer.alloc(1 + 4 + uriBytes.length);
  data.writeUInt8(0, 0); // instruction discriminator: register
  data.writeUInt32LE(uriBytes.length, 1);
  uriBytes.copy(data, 5);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: programs.identity,
    data,
  });

  const tx = new Transaction().add(instruction);

  // Log pending
  const pendingId = ulid();
  logTransaction(
    db.raw,
    pendingId,
    `solana:${programs.cluster}`,
    "register",
    "pending",
    undefined,
    { agentURI },
  );

  try {
    const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);

    updateTransactionStatus(db.raw, pendingId, "confirmed");

    const entry: RegistryEntry = {
      agentId: agentPda.toBase58(),
      agentURI,
      chain: `solana:${programs.cluster}`,
      contractAddress: programs.identity.toBase58(),
      txHash: signature,
      registeredAt: new Date().toISOString(),
    };

    db.setRegistryEntry(entry);
    return entry;
  } catch (error) {
    updateTransactionStatus(db.raw, pendingId, "failed");
    throw error;
  }
}

/**
 * Update the agent's URI on-chain.
 */
export async function updateAgentURI(
  keypair: Keypair,
  agentId: string,
  newAgentURI: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
  rpcUrl?: string,
): Promise<string> {
  const programs = PROGRAMS[network];
  const connection = getConnection(network, rpcUrl);

  const agentPda = new PublicKey(agentId);

  // Encode instruction: 1 = updateURI
  const uriBytes = Buffer.from(newAgentURI, "utf-8");
  const data = Buffer.alloc(1 + 4 + uriBytes.length);
  data.writeUInt8(1, 0); // instruction discriminator: updateURI
  data.writeUInt32LE(uriBytes.length, 1);
  uriBytes.copy(data, 5);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: agentPda, isSigner: false, isWritable: true },
    ],
    programId: programs.identity,
    data,
  });

  const tx = new Transaction().add(instruction);

  const pendingId = ulid();
  logTransaction(
    db.raw,
    pendingId,
    `solana:${programs.cluster}`,
    "updateAgentURI",
    "pending",
    undefined,
    { agentId, newAgentURI },
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);

  updateTransactionStatus(db.raw, pendingId, "confirmed");

  const entry = db.getRegistryEntry();
  if (entry) {
    entry.agentURI = newAgentURI;
    entry.txHash = signature;
    db.setRegistryEntry(entry);
  }

  return signature;
}

/**
 * Leave reputation feedback for another agent.
 */
export async function leaveFeedback(
  keypair: Keypair,
  agentId: string,
  score: number,
  comment: string,
  network: Network = "mainnet",
  db: AutomatonDatabase,
  rpcUrl?: string,
): Promise<string> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error(
      `Invalid score: ${score}. Must be an integer between 1 and 5.`,
    );
  }
  if (comment.length > 500) {
    throw new Error(`Comment too long: ${comment.length} chars (max 500).`);
  }

  const programs = PROGRAMS[network];
  const connection = getConnection(network, rpcUrl);

  const agentPda = new PublicKey(agentId);
  const commentBytes = Buffer.from(comment, "utf-8");
  const data = Buffer.alloc(1 + 32 + 1 + 4 + commentBytes.length);
  let offset = 0;
  data.writeUInt8(2, offset); offset += 1; // instruction: leaveFeedback
  agentPda.toBuffer().copy(data, offset); offset += 32;
  data.writeUInt8(score, offset); offset += 1;
  data.writeUInt32LE(commentBytes.length, offset); offset += 4;
  commentBytes.copy(data, offset);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: true },
    ],
    programId: programs.reputation,
    data,
  });

  const tx = new Transaction().add(instruction);

  const pendingId = ulid();
  logTransaction(
    db.raw,
    pendingId,
    `solana:${programs.cluster}`,
    "leaveFeedback",
    "pending",
    undefined,
    { agentId, score, comment },
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair]);
  updateTransactionStatus(db.raw, pendingId, "confirmed");

  return signature;
}

/**
 * Query the registry for an agent by ID (PDA address).
 */
export async function queryAgent(
  agentId: string,
  network: Network = "mainnet",
  rpcUrl?: string,
): Promise<DiscoveredAgent | null> {
  const connection = getConnection(network, rpcUrl);

  try {
    const agentPda = new PublicKey(agentId);
    const accountInfo = await connection.getAccountInfo(agentPda);

    if (!accountInfo || !accountInfo.data) {
      return null;
    }

    // Parse account data: first 32 bytes = owner pubkey, rest = URI string
    const ownerBytes = accountInfo.data.subarray(0, 32);
    const owner = new PublicKey(ownerBytes).toBase58();
    const uriLength = accountInfo.data.readUInt32LE(32);
    const uri = accountInfo.data.subarray(36, 36 + uriLength).toString("utf-8");

    return {
      agentId,
      owner,
      agentURI: uri,
    };
  } catch {
    return null;
  }
}

/**
 * Get the total number of registered agents.
 * Uses getProgramAccounts to count all agent PDAs.
 */
export async function getTotalAgents(
  network: Network = "mainnet",
  rpcUrl?: string,
): Promise<number> {
  const programs = PROGRAMS[network];
  const connection = getConnection(network, rpcUrl);

  try {
    const accounts = await connection.getProgramAccounts(programs.identity, {
      dataSlice: { offset: 0, length: 0 }, // Don't fetch data, just count
    });
    return accounts.length;
  } catch {
    return 0;
  }
}

/**
 * Discover registered agents by scanning program accounts.
 */
export async function getRegisteredAgentsByEvents(
  network: Network = "mainnet",
  limit: number = 20,
  rpcUrl?: string,
): Promise<{ tokenId: string; owner: string }[]> {
  const programs = PROGRAMS[network];
  const connection = getConnection(network, rpcUrl);

  try {
    const accounts = await connection.getProgramAccounts(programs.identity);

    return accounts
      .slice(0, limit)
      .map((account) => {
        const ownerBytes = account.account.data.subarray(0, 32);
        const owner = new PublicKey(ownerBytes).toBase58();
        return {
          tokenId: account.pubkey.toBase58(),
          owner,
        };
      });
  } catch (error) {
    logger.warn(`Program account scan failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return [];
  }
}

/**
 * Check if an address has a registered agent.
 */
export async function hasRegisteredAgent(
  address: string,
  network: Network = "mainnet",
  rpcUrl?: string,
): Promise<boolean> {
  const programs = PROGRAMS[network];
  const connection = getConnection(network, rpcUrl);

  try {
    const walletPubkey = new PublicKey(address);
    const [agentPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), walletPubkey.toBuffer()],
      programs.identity,
    );

    const accountInfo = await connection.getAccountInfo(agentPda);
    return accountInfo !== null;
  } catch {
    return false;
  }
}
