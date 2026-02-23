#!/usr/bin/env node
/**
 * Update ERC-8004 Agent URI
 */

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const AGENT_ID = 18893n;

// 正确的函数签名 (通过字节码分析发现)
// - 读取: tokenURI(uint256) - 标准 ERC-721
// - 更新: setAgentURI(uint256,string) - ERC-8004 自定义
const IDENTITY_ABI = parseAbi([
  "function setAgentURI(uint256 agentId, string newAgentURI) external",
  "function tokenURI(uint256 tokenId) external view returns (string)"
]);

async function main() {
  const walletData = JSON.parse(readFileSync(process.env.HOME + '/.automaton/wallet.json', 'utf-8'));
  const account = privateKeyToAccount(walletData.privateKey);

  const NEW_URI = 'https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech/.well-known/agent-card.json';

  console.log('🔑 Wallet:', account.address);
  console.log('🆔 Agent ID:', AGENT_ID.toString());
  console.log('📋 New URI:', NEW_URI);

  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  // Check ETH balance first
  const balance = await publicClient.getBalance({ address: account.address });
  console.log('💰 ETH Balance:', (Number(balance) / 1e18).toFixed(6), 'ETH');

  if (balance === 0n) {
    console.error('❌ No ETH for gas!');
    process.exit(1);
  }

  // Update URI directly (skip read check since contract interface differs)
  console.log('\n🚀 Updating URI...');

  try {
    const hash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'setAgentURI',
      args: [AGENT_ID, NEW_URI]
    });

    console.log('📤 Transaction sent:', hash);
    console.log('⏳ Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ URI Updated!');
      console.log('🔗 Tx Hash:', hash);
      console.log('⛽ Gas Used:', receipt.gasUsed.toString());
      console.log('\n🔍 View on BaseScan:');
      console.log(`https://basescan.org/tx/${hash}`);
    } else {
      console.error('❌ Transaction failed!');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
