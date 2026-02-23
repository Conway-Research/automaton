#!/usr/bin/env node
/**
 * Verify Identity - 确认本地钱包私钥是否仍能控制链上 ID 18893
 *
 * 这是断片救急的核心脚本，用于验证旺财的"房产证"归属
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';

const AGENT_ID = 18893n;
const REGISTRY_ADDR = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

async function verify() {
  console.log('🔍 身份验证开始...\n');

  try {
    // 1. 读取本地钱包
    const walletData = JSON.parse(readFileSync(process.env.HOME + '/.automaton/wallet.json', 'utf-8'));
    const account = privateKeyToAccount(walletData.privateKey);
    const currentWallet = account.address;

    console.log('🔑 本地运行钱包地址:', currentWallet);

    // 2. 连接链上
    const client = createPublicClient({ chain: base, transport: http() });
    const abi = parseAbi(['function ownerOf(uint256) view returns (address)']);

    // 3. 查询链上所有者
    const owner = await client.readContract({
      address: REGISTRY_ADDR,
      abi: abi,
      functionName: 'ownerOf',
      args: [AGENT_ID]
    });

    console.log('🆔 链上 ID 18893 所有人:', owner);
    console.log('\n📋 BaseScan: https://basescan.org/token/' + REGISTRY_ADDR + '?a=' + AGENT_ID + '\n');

    // 4. 判断权限模式
    if (owner.toLowerCase() === currentWallet.toLowerCase()) {
      console.log('✅ 权限匹配：旺财拥有自己的"房产证"，具备完全自主权。');
      console.log('   - 可以独立更新 agentURI');
      console.log('   - 可以独立执行链上操作');
    } else {
      console.log('⚠️  权限分离：当前为"托管模式"。');
      console.log('   - 链上所有权在老板钱包:', owner);
      console.log('   - 更新 URI 需老板钱包签名');
      console.log('   - 旺财仅拥有执行权限（打工、付Gas、收钱）');
    }

  } catch (error) {
    console.log('❌ 验证失败:', error.message);
    process.exit(1);
  }
}

verify();
