#!/usr/bin/env node
/**
 * 旺财支付验证双轨制 - viem 链上核实 + 动态定价
 *
 * 核心特性:
 * 1. 使用 viem 直接读取链上数据 (去中心化)
 * 2. 1 小时缓存机制 (节省 RPC 调用)
 * 3. 支持动态定价 (标准价/批发价)
 *
 * 用法:
 *   node scripts/verify_payment_pro.mjs <tx_hash> [expected_amount]
 */

import { createPublicClient, http, decodeEventLog, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AGENT_WALLET = '0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690';

const ERC20_TRANSFER_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

// 缓存文件路径
const CACHE_FILE = join(__dirname, '..', '.payment_cache.json');
const CACHE_TTL_MS = 3600_000; // 1 小时

// 创建 Base 链客户端
const client = createPublicClient({
  chain: base,
  transport: http()
});

/**
 * 加载缓存
 */
function loadCache() {
  if (!existsSync(CACHE_FILE)) {
    return {};
  }
  try {
    const data = readFileSync(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

/**
 * 保存缓存
 */
function saveCache(cache) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache(cache) {
  const now = Date.now();
  const cleaned = {};
  for (const [txHash, entry] of Object.entries(cache)) {
    if (now - entry.timestamp < CACHE_TTL_MS) {
      cleaned[txHash] = entry;
    }
  }
  return cleaned;
}

/**
 * 验证支付逻辑：viem 链上核实 + 动态定价判断
 *
 * @param {string} txHash - 交易哈希
 * @param {number} requiredAmountUSDC - 期望的 USDC 金额
 * @returns {Promise<{success: boolean, amount?: number, reason?: string, cached?: boolean}>}
 */
export async function verifyPayment(txHash, requiredAmountUSDC = 0.10) {
  // 1. 检查缓存
  let cache = loadCache();
  cache = cleanExpiredCache(cache);

  if (cache[txHash]) {
    const cached = cache[txHash];
    console.log(`[CACHE] Using cached result for ${txHash.slice(0, 10)}...`);
    return {
      success: cached.success,
      amount: cached.amount,
      reason: cached.reason,
      cached: true,
      fromAddress: cached.fromAddress
    };
  }

  try {
    // 2. 获取交易回执
    const receipt = await client.getTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      const result = { success: false, reason: 'Transaction failed' };
      cache[txHash] = { ...result, timestamp: Date.now() };
      saveCache(cache);
      return result;
    }

    // 3. 解析 Transfer 事件
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        try {
          const { args } = decodeEventLog({
            abi: ERC20_TRANSFER_ABI,
            eventName: 'Transfer',
            data: log.data,
            topics: log.topics
          });

          const amountInUSDC = Number(args.value) / 1e6; // USDC 有 6 位小数

          // 检查接收地址和金额
          if (args.to.toLowerCase() === AGENT_WALLET.toLowerCase() && amountInUSDC >= requiredAmountUSDC) {
            const result = {
              success: true,
              amount: amountInUSDC,
              fromAddress: args.from,
              cached: false
            };

            // 缓存成功结果
            cache[txHash] = { ...result, timestamp: Date.now() };
            saveCache(cache);

            console.log(`[SUCCESS] Payment verified: ${amountInUSDC} USDC from ${args.from.slice(0, 10)}...`);
            return result;
          }
        } catch (decodeError) {
          // 不是 Transfer 事件，继续
          continue;
        }
      }
    }

    // 没有找到符合条件的 USDC 转账
    const result = { success: false, reason: 'Payment not found or insufficient amount' };
    cache[txHash] = { ...result, timestamp: Date.now() };
    saveCache(cache);
    return result;

  } catch (e) {
    console.error(`[ERROR] Verification failed: ${e.message}`);
    return { success: false, reason: e.message };
  }
}

/**
 * 获取用户动态价格
 * 高频用户 (>100 次/日) 享受批发价
 *
 * @param {string} userAddress - 用户地址
 * @param {object} usageData - 使用量数据
 * @returns {number} 价格 (USDC)
 */
export function getDynamicPrice(userAddress, usageData = {}) {
  const today = new Date().toISOString().split('T')[0];
  const userData = usageData[userAddress] || { date: today, count: 0 };

  // 重置新的一天
  if (userData.date !== today) {
    return 0.10; // 标准价
  }

  // 日调用 >100 次享受批发价
  if (userData.count >= 100) {
    return 0.05; // 批发价
  }

  return 0.10; // 标准价
}

// CLI 入口
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log(`
旺财支付验证工具 v1.0

用法:
  node verify_payment_pro.mjs <tx_hash> [expected_amount]

参数:
  tx_hash        - 交易哈希 (0x...)
  expected_amount - 期望的 USDC 金额 (默认: 0.10)

示例:
  node verify_payment_pro.mjs 0x66915974a1f74a8ba6dda9ad4c6e2857925a2b2bae9861abe5b6caf3a35efdbf 0.10
`);
    process.exit(1);
  }

  const txHash = args[0];
  const expectedAmount = parseFloat(args[1]) || 0.10;

  console.log(`\n🔍 验证支付`);
  console.log(`   交易: ${txHash}`);
  console.log(`   期望: ${expectedAmount} USDC\n`);

  const result = await verifyPayment(txHash, expectedAmount);

  console.log('\n📊 验证结果:');
  console.log(JSON.stringify(result, null, 2));

  process.exit(result.success ? 0 : 1);
}

main();
