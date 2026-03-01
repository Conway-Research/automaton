#!/usr/bin/env tsx
/**
 * Live API test: USDC Balance on Base
 *
 * Tests: read USDC balance from the automaton's wallet
 * Run: npx tsx scripts/test-usdc-balance.ts
 *
 * Reads wallet from ~/.automaton/wallet.json
 */

import fs from "fs";
import path from "path";
import { privateKeyToAccount } from "viem/accounts";
import { getUsdcBalance, getUsdcBalanceDetailed } from "../src/wallet/x402.js";

const WALLET_PATH = path.join(
  process.env.HOME || "/root",
  ".automaton",
  "wallet.json",
);
const CONFIG_PATH = path.join(
  process.env.HOME || "/root",
  ".automaton",
  "automaton.json",
);

async function main() {
  console.log("=== USDC Balance Test ===\n");

  // Load wallet
  let walletAddress: string;
  if (fs.existsSync(WALLET_PATH)) {
    const wallet = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
    const account = privateKeyToAccount(wallet.privateKey);
    walletAddress = account.address;
    console.log(`Wallet: ${walletAddress}`);
  } else if (fs.existsSync(CONFIG_PATH)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    walletAddress = config.walletAddress;
    if (!walletAddress) {
      console.error("No walletAddress in config");
      process.exit(1);
    }
    console.log(`Wallet (from config): ${walletAddress}`);
  } else {
    console.error(`Neither ${WALLET_PATH} nor ${CONFIG_PATH} found`);
    process.exit(1);
  }

  // Test 1: Base mainnet balance
  console.log("\n1. Checking USDC balance on Base mainnet...");
  const mainnetResult = await getUsdcBalanceDetailed(
    walletAddress as `0x${string}`,
    "eip155:8453",
  );
  if (mainnetResult.ok) {
    console.log(`   Balance: $${mainnetResult.balance.toFixed(6)}`);
  } else {
    console.log(`   Error: ${mainnetResult.error}`);
  }

  // Test 2: Base Sepolia balance
  console.log("\n2. Checking USDC balance on Base Sepolia...");
  const sepoliaResult = await getUsdcBalanceDetailed(
    walletAddress as `0x${string}`,
    "eip155:84532",
  );
  if (sepoliaResult.ok) {
    console.log(`   Balance: $${sepoliaResult.balance.toFixed(6)}`);
  } else {
    console.log(`   Error: ${sepoliaResult.error}`);
  }

  // Test 3: Simple balance call
  console.log("\n3. Simple balance call (mainnet)...");
  const simple = await getUsdcBalance(walletAddress as `0x${string}`);
  console.log(`   Balance: $${simple.toFixed(6)}`);

  console.log("\n=== USDC balance test complete ===");
}

main().catch((err) => {
  console.error("USDC balance test failed:", err);
  process.exit(1);
});
