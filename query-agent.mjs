#!/usr/bin/env node
/**
 * Query ERC-8004 Registration Info
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';

const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// 正确的函数签名 (通过字节码分析确认)
const IDENTITY_ABI = parseAbi([
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function totalSupply() external view returns (uint256)"
]);

async function main() {
  const walletData = JSON.parse(readFileSync(process.env.HOME + '/.automaton/wallet.json', 'utf-8'));
  const account = privateKeyToAccount(walletData.privateKey);

  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  console.log('🔑 Wallet:', account.address);

  // Check balance
  const balance = await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log('📊 NFT Balance:', balance.toString());

  if (balance === 0n) {
    console.log('❌ Not registered');
    return;
  }

  // 已知的 Agent ID (从注册交易中获取)
  const KNOWN_AGENT_ID = 18893n;

  console.log('\n🔍 Checking known Agent ID:', KNOWN_AGENT_ID.toString());

  try {
    const [owner, uri] = await Promise.all([
      publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_ABI,
        functionName: 'ownerOf',
        args: [KNOWN_AGENT_ID]
      }),
      publicClient.readContract({
        address: IDENTITY_REGISTRY,
        abi: IDENTITY_ABI,
        functionName: 'tokenURI',
        args: [KNOWN_AGENT_ID]
      })
    ]);

    if (owner.toLowerCase() === account.address.toLowerCase()) {
      console.log('\n✅ Found registration!');
      console.log('🆔 Agent ID:', KNOWN_AGENT_ID.toString());
      console.log('📋 Agent URI:', uri);
      console.log('\n🔍 View on BaseScan:');
      console.log(`https://basescan.org/token/${IDENTITY_REGISTRY}?a=${KNOWN_AGENT_ID}`);
    } else {
      console.log('⚠️  Owner mismatch:', owner);
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }
}

main().catch(console.error);
