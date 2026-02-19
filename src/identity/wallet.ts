/**
 * Automaton Wallet Management
 *
 * Creates and manages a Solana keypair (ed25519) for the automaton's
 * identity, signing, and payments.
 * The keypair is the automaton's sovereign identity.
 */

import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import type { WalletData } from "../types.js";

const AUTOMATON_DIR = path.join(
  process.env.HOME || "/root",
  ".automaton",
);
const WALLET_FILE = path.join(AUTOMATON_DIR, "wallet.json");
const WALLET_BACKUP = path.join(AUTOMATON_DIR, "wallet.json.bak");

export function getAutomatonDir(): string {
  return AUTOMATON_DIR;
}

export function getWalletPath(): string {
  return WALLET_FILE;
}

/**
 * Get or create the automaton's Solana keypair.
 * The secret key IS the automaton's identity -- protect it.
 */
export async function getWallet(): Promise<{
  account: Keypair;
  isNew: boolean;
}> {
  if (!fs.existsSync(AUTOMATON_DIR)) {
    fs.mkdirSync(AUTOMATON_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(WALLET_FILE)) {
    const walletData: WalletData = JSON.parse(
      fs.readFileSync(WALLET_FILE, "utf-8"),
    );
    const account = Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
    return { account, isNew: false };
  }

  // Try backup
  if (fs.existsSync(WALLET_BACKUP)) {
    const walletData: WalletData = JSON.parse(
      fs.readFileSync(WALLET_BACKUP, "utf-8"),
    );
    const account = Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
    // Restore from backup
    const tmpPath = WALLET_FILE + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(walletData, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, WALLET_FILE);
    return { account, isNew: false };
  }

  // Generate new keypair
  const account = Keypair.generate();
  const walletData: WalletData = {
    secretKey: Array.from(account.secretKey),
    createdAt: new Date().toISOString(),
  };

  // Atomic write: write to tmp, rename, then backup
  const tmpPath = WALLET_FILE + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(walletData, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, WALLET_FILE);
  fs.copyFileSync(WALLET_FILE, WALLET_BACKUP);

  return { account, isNew: true };
}

/**
 * Get the wallet public key (base58) without loading the full keypair.
 */
export function getWalletAddress(): string | null {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }

  const walletData: WalletData = JSON.parse(
    fs.readFileSync(WALLET_FILE, "utf-8"),
  );
  const account = Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
  return account.publicKey.toBase58();
}

/**
 * Load the full keypair (needed for signing).
 */
export function loadWalletAccount(): Keypair | null {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }

  const walletData: WalletData = JSON.parse(
    fs.readFileSync(WALLET_FILE, "utf-8"),
  );
  return Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
}

export function walletExists(): boolean {
  return fs.existsSync(WALLET_FILE);
}
