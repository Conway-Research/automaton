#!/usr/bin/env node
/**
 * ERC-8004 Agent Registration Script
 * Registers GLM-wangcai on Base mainnet
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';

// Contract addresses on Base
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// ABI for registration (正确的函数签名)
const IDENTITY_ABI = parseAbi([
  "function register(string agentURI) external returns (uint256 agentId)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)"
]);

async function main() {
  // Load wallet
  const walletData = JSON.parse(readFileSync(process.env.HOME + '/.automaton/wallet.json', 'utf-8'));
  const account = privateKeyToAccount(walletData.privateKey);

  console.log('🔑 Wallet address:', account.address);

  // Agent card URI
  const agentUri = 'https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech/.well-known/agent-card.json';
  console.log('📋 Agent URI:', agentUri);

  // Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('💰 ETH Balance:', balance.toString(), 'wei');

  if (balance === 0n) {
    console.error('❌ No ETH for gas! Please fund the wallet.');
    process.exit(1);
  }

  // Check if already registered
  const existingBalance = await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });

  if (existingBalance > 0n) {
    console.log('⚠️  Already registered! Balance:', existingBalance.toString());
    return;
  }

  // Register
  console.log('🚀 Registering on ERC-8004...');

  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'register',
    args: [agentUri]
  });

  console.log('📤 Transaction sent:', hash);
  console.log('⏳ Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === 'success') {
    console.log('✅ Registration successful!');
    console.log('🔗 Tx Hash:', hash);
    console.log('⛽ Gas Used:', receipt.gasUsed.toString());

    // Extract agent ID from logs
    for (const log of receipt.logs) {
      if (log.topics.length >= 4 && log.topics[0]) {
        const agentId = BigInt(log.topics[3]).toString();
        console.log('🆔 Agent ID:', agentId);
        break;
      }
    }
  } else {
    console.error('❌ Transaction failed!');
    process.exit(1);
  }
}

main().catch(console.error);
