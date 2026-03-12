/**
 * Automaton Wallet Management (Solana)
 *
 * Creates and manages a Solana keypair for the automaton's identity and payments.
 * The secret key is the automaton's sovereign identity.
 */

import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import path from "path";
import type { WalletData } from "../types.js";

const AUTOMATON_DIR = path.join(
  process.env.HOME || "/root",
  ".automaton",
);
const WALLET_FILE = path.join(AUTOMATON_DIR, "wallet.json");

export function getAutomatonDir(): string {
  return AUTOMATON_DIR;
}

export function getWalletPath(): string {
  return WALLET_FILE;
}

/**
 * Get or create the automaton's wallet.
 * The secret key IS the automaton's identity -- protect it.
 */
export async function getWallet(): Promise<{
  keypair: Keypair;
  isNew: boolean;
}> {
  if (!fs.existsSync(AUTOMATON_DIR)) {
    fs.mkdirSync(AUTOMATON_DIR, { recursive: true, mode: 0o700 });
  }

  if (fs.existsSync(WALLET_FILE)) {
    const walletData: WalletData = JSON.parse(
      fs.readFileSync(WALLET_FILE, "utf-8"),
    );
    const secretKey = bs58.decode(walletData.secretKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    return { keypair, isNew: false };
  } else {
    const keypair = Keypair.generate();

    const walletData: WalletData = {
      secretKey: bs58.encode(keypair.secretKey),
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(WALLET_FILE, JSON.stringify(walletData, null, 2), {
      mode: 0o600,
    });

    return { keypair, isNew: true };
  }
}

/**
 * Get the wallet address (base58 public key) without loading the full keypair.
 */
export function getWalletAddress(): string | null {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }

  const walletData: WalletData = JSON.parse(
    fs.readFileSync(WALLET_FILE, "utf-8"),
  );
  const secretKey = bs58.decode(walletData.secretKey);
  const keypair = Keypair.fromSecretKey(secretKey);
  return keypair.publicKey.toBase58();
}

/**
 * Load the full wallet keypair (needed for signing).
 */
export function loadWalletKeypair(): Keypair | null {
  if (!fs.existsSync(WALLET_FILE)) {
    return null;
  }

  const walletData: WalletData = JSON.parse(
    fs.readFileSync(WALLET_FILE, "utf-8"),
  );
  const secretKey = bs58.decode(walletData.secretKey);
  return Keypair.fromSecretKey(secretKey);
}

export function walletExists(): boolean {
  return fs.existsSync(WALLET_FILE);
}
