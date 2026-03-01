#!/usr/bin/env tsx
/**
 * Live API test: USDC Transfer on Base Sepolia
 *
 * Tests: transfer 0.01 USDC to self on Base Sepolia testnet
 * Run: npx tsx scripts/test-usdc-transfer.ts
 *
 * Reads wallet from ~/.automaton/wallet.json
 * SAFETY: Uses Sepolia testnet only — no real funds at risk
 */

import fs from "fs";
import path from "path";
import { privateKeyToAccount } from "viem/accounts";
import { getUsdcBalance } from "../src/wallet/x402.js";
import { transferUsdc, normalizeNetwork } from "../src/wallet/transfer.js";

const WALLET_PATH = path.join(
  process.env.HOME || "/root",
  ".automaton",
  "wallet.json",
);

async function main() {
  console.log("=== USDC Transfer Test (Base Sepolia) ===\n");

  // Load wallet
  if (!fs.existsSync(WALLET_PATH)) {
    console.error(`Wallet not found: ${WALLET_PATH}`);
    process.exit(1);
  }
  const wallet = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
  const account = privateKeyToAccount(wallet.privateKey);
  console.log(`Wallet: ${account.address}`);

  const network = normalizeNetwork("base-sepolia")!;
  console.log(`Network: ${network}`);

  // Check pre-transfer balance
  console.log("\n1. Pre-transfer USDC balance (Sepolia)...");
  const balanceBefore = await getUsdcBalance(account.address, network);
  console.log(`   Balance: $${balanceBefore.toFixed(6)}`);

  if (balanceBefore < 0.01) {
    console.log("\n   Insufficient Sepolia USDC for transfer test.");
    console.log("   Fund the wallet with Sepolia USDC to run this test.");
    console.log("\n=== USDC transfer test skipped (no funds) ===");
    return;
  }

  // Transfer 0.01 USDC to self
  console.log("\n2. Transferring 0.01 USDC to self...");
  const result = await transferUsdc(account, account.address, "0.01", network);
  console.log(`   Tx hash: ${result.txHash}`);
  console.log(`   From: ${result.from}`);
  console.log(`   To: ${result.to}`);
  console.log(`   Amount: $${result.amountUsd}`);

  // Check post-transfer balance
  console.log("\n3. Post-transfer USDC balance (Sepolia)...");
  const balanceAfter = await getUsdcBalance(account.address, network);
  console.log(`   Balance: $${balanceAfter.toFixed(6)}`);

  console.log("\n=== USDC transfer test complete ===");
}

main().catch((err) => {
  console.error("USDC transfer test failed:", err);
  process.exit(1);
});
