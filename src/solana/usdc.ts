/**
 * Solana USDC Operations
 *
 * Balance checking and SPL USDC transfers on Solana.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

// USDC mint addresses on Solana
const USDC_MINT: Record<string, string> = {
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  testnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

export type SolanaNetwork = "mainnet-beta" | "devnet" | "testnet";

const RPC_URLS: Record<SolanaNetwork, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

export interface UsdcBalanceResult {
  balance: number;
  network: string;
  ok: boolean;
  error?: string;
}

/**
 * Get USDC balance for a Solana address.
 */
export async function getUsdcBalance(
  address: string,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<number> {
  const result = await getUsdcBalanceDetailed(address, network, rpcUrl);
  return result.balance;
}

/**
 * Get USDC balance with full diagnostics.
 */
export async function getUsdcBalanceDetailed(
  address: string,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<UsdcBalanceResult> {
  const usdcMint = USDC_MINT[network];
  if (!usdcMint) {
    return { balance: 0, network, ok: false, error: `Unsupported network: ${network}` };
  }

  const rpc = rpcUrl || RPC_URLS[network];
  const connection = new Connection(rpc, "confirmed");

  try {
    const owner = new PublicKey(address);
    const mint = new PublicKey(usdcMint);
    const ata = await getAssociatedTokenAddress(mint, owner);

    const info = await connection.getTokenAccountBalance(ata);
    const balance = Number(info.value.uiAmount) || 0;

    return { balance, network, ok: true };
  } catch (err: any) {
    // Account doesn't exist = zero balance
    if (err?.message?.includes("could not find account")) {
      return { balance: 0, network, ok: true };
    }
    return {
      balance: 0,
      network,
      ok: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Transfer USDC to another address.
 * Auto-creates the recipient's Associated Token Account if needed.
 * Safety: refuses to send more than 50% of balance in a single call.
 */
export async function transferUsdc(
  keypair: Keypair,
  recipientAddress: string,
  amountUSDC: number,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const usdcMint = USDC_MINT[network];
  if (!usdcMint) {
    return { success: false, error: `Unsupported network: ${network}` };
  }

  const rpc = rpcUrl || RPC_URLS[network];
  const connection = new Connection(rpc, "confirmed");
  const mint = new PublicKey(usdcMint);
  const recipient = new PublicKey(recipientAddress);

  try {
    // Get sender ATA (create if needed)
    const senderATA = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      keypair.publicKey,
    );

    // Safety check: refuse to send more than 50% of balance
    const balance = Number(senderATA.amount) / 1_000_000;
    if (amountUSDC > balance * 0.5) {
      return {
        success: false,
        error: `Safety limit: cannot send more than 50% of balance (${balance.toFixed(4)} USDC) in one transfer`,
      };
    }

    // Get recipient ATA (create if needed — sender pays)
    const recipientATA = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mint,
      recipient,
    );

    const txSig = await transfer(
      connection,
      keypair,
      senderATA.address,
      recipientATA.address,
      keypair.publicKey,
      BigInt(Math.floor(amountUSDC * 1_000_000)), // Convert to 6-decimal units
    );

    return { success: true, txSignature: txSig };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Transfer native SOL to another address.
 */
export async function transferSol(
  keypair: Keypair,
  recipientAddress: string,
  amountSol: number,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const rpc = rpcUrl || RPC_URLS[network];
  const connection = new Connection(rpc, "confirmed");
  const recipient = new PublicKey(recipientAddress);

  try {
    const balance = await connection.getBalance(keypair.publicKey);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

    // Safety: refuse to send more than 50% of balance
    if (lamports > balance * 0.5) {
      return {
        success: false,
        error: `Safety limit: cannot send more than 50% of SOL balance`,
      };
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: recipient,
        lamports,
      }),
    );

    const txSig = await sendAndConfirmTransaction(connection, tx, [keypair]);
    return { success: true, txSignature: txSig };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Get native SOL balance.
 */
export async function getSolBalance(
  address: string,
  network: SolanaNetwork = "mainnet-beta",
  rpcUrl?: string,
): Promise<number> {
  const rpc = rpcUrl || RPC_URLS[network];
  const connection = new Connection(rpc, "confirmed");
  try {
    const balance = await connection.getBalance(new PublicKey(address));
    return balance / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}
