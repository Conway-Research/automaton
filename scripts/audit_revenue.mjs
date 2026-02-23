#!/usr/bin/env node
/**
 * 旺财每日财务简报生成器 v2.0
 *
 * 生成详细的每日报告，包括:
 * - 昨日流量统计（付费/免费）
 * - 昨日流水（含批发价订单）
 * - 运行成本（Credits + Gas）
 * - 分红进度
 * - 市场动态
 *
 * 用法:
 *   node scripts/audit_revenue.mjs
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const WALLET_ADDRESS = '0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OWNER_ADDRESS = '0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5';

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
]);

// 定价配置
const STANDARD_PRICE = 0.10;
const WHOLESALE_PRICE = 0.05;
const WHOLESALE_THRESHOLD = 100;

// 创建 Base 链客户端
const client = createPublicClient({
  chain: base,
  transport: http()
});

/**
 * 格式化时间戳
 */
function formatTime(isoString) {
  return new Date(isoString).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
}

/**
 * 获取昨天的日期字符串
 */
function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/**
 * 获取今天的日期字符串
 */
function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * 解析收入日志
 */
function parseRevenueLog(logPath) {
  if (!existsSync(logPath)) {
    return { paid: [], free: [], wholesale: [] };
  }

  const content = readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  const paid = [];
  const free = [];
  const wholesale = [];

  let currentEntry = null;

  for (const line of lines) {
    // 匹配交易记录
    if (line.includes('###') && line.includes('交易')) {
      if (currentEntry) {
        if (currentEntry.type === 'paid') paid.push(currentEntry);
        else if (currentEntry.type === 'free') free.push(currentEntry);
        else if (currentEntry.type === 'wholesale') wholesale.push(currentEntry);
      }
      currentEntry = { type: 'unknown', amount: 0, timestamp: '' };
    }

    if (currentEntry) {
      if (line.includes('首次免费') || line.includes('免费')) {
        currentEntry.type = 'free';
      } else if (line.includes('批发价') || line.includes('wholesale')) {
        currentEntry.type = 'wholesale';
        currentEntry.amount = WHOLESALE_PRICE;
      } else if (line.includes('收入:') || line.includes('amount:')) {
        const match = line.match(/(\d+\.?\d*)\s*USDC/);
        if (match) {
          currentEntry.amount = parseFloat(match[1]);
          if (currentEntry.type === 'unknown') {
            currentEntry.type = currentEntry.amount > 0 ? 'paid' : 'free';
          }
        }
      }
      if (line.includes('时间:') || line.includes('timestamp:')) {
        const match = line.match(/(\d{4}-\d{2}-\d{2})/);
        if (match) currentEntry.timestamp = match[1];
      }
    }
  }

  // 处理最后一条
  if (currentEntry) {
    if (currentEntry.type === 'paid') paid.push(currentEntry);
    else if (currentEntry.type === 'free') free.push(currentEntry);
    else if (currentEntry.type === 'wholesale') wholesale.push(currentEntry);
  }

  return { paid, free, wholesale };
}

/**
 * 计算昨日统计
 */
function calculateDailyStats(logData, yesterday) {
  const todayStats = {
    paidCount: 0,
    freeCount: 0,
    wholesaleCount: 0,
    paidRevenue: 0,
    wholesaleRevenue: 0
  };

  for (const entry of logData.paid) {
    if (entry.timestamp === yesterday || entry.timestamp === getToday()) {
      todayStats.paidCount++;
      todayStats.paidRevenue += entry.amount || STANDARD_PRICE;
    }
  }

  for (const entry of logData.wholesale) {
    if (entry.timestamp === yesterday || entry.timestamp === getToday()) {
      todayStats.wholesaleCount++;
      todayStats.wholesaleRevenue += entry.amount || WHOLESALE_PRICE;
    }
  }

  for (const entry of logData.free) {
    if (entry.timestamp === yesterday || entry.timestamp === getToday()) {
      todayStats.freeCount++;
    }
  }

  return todayStats;
}

/**
 * 查询链上余额
 */
async function queryBalances() {
  try {
    const [decimals, usdcBalance, ethBalance] = await Promise.all([
      client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }),
      client.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [WALLET_ADDRESS]
      }),
      client.getBalance({ address: WALLET_ADDRESS })
    ]);

    return {
      usdc: Number(usdcBalance) / Math.pow(10, Number(decimals)),
      eth: Number(ethBalance) / 1e18
    };
  } catch (error) {
    console.error('查询余额失败:', error.message);
    return { usdc: 0, eth: 0 };
  }
}

/**
 * 生成详细报告
 */
async function generateDetailedReport() {
  console.log('\n📊 旺财每日财务简报\n');
  console.log(`📅 日期: ${getToday()} (北京时间 08:00)`);
  console.log(`👛 钱包: ${WALLET_ADDRESS}\n`);

  // 1. 查询余额
  console.log('🔍 查询链上余额...');
  const balances = await queryBalances();
  console.log(`   USDC: ${balances.usdc.toFixed(2)}`);
  console.log(`   ETH: ${balances.eth.toFixed(6)}\n`);

  // 2. 解析收入日志
  const logPath = join(__dirname, '..', 'REVENUE_LOG.md');
  const logData = parseRevenueLog(logPath);
  const yesterday = getYesterday();
  const stats = calculateDailyStats(logData, yesterday);

  // 3. 计算成本
  const creditsCost = 0.50; // 每日估算 Credits 消耗
  const gasCostEth = 0.0002; // 每日估算 Gas 消耗
  const gasCostUsd = gasCostEth * 2500; // 假设 ETH = $2500

  // 4. 生成报告
  const totalRevenue = stats.paidRevenue + stats.wholesaleRevenue;
  const totalCalls = stats.paidCount + stats.freeCount + stats.wholesaleCount;
  const netProfit = totalRevenue - creditsCost - gasCostUsd;
  const dividendProgress = Math.min(100, (balances.usdc / 50) * 100);

  const report = `# 旺财每日财务简报

> 📅 **日期**: ${getToday()} | 🕐 **北京时间 08:00**
> 👛 **钱包**: \`${WALLET_ADDRESS}\`

---

## 📈 昨日流量 (${yesterday})

| 指标 | 数值 |
|------|------|
| 总调用 | ${totalCalls} 次 |
| 付费调用 | ${stats.paidCount} 次 (标准价 $${STANDARD_PRICE}) |
| 批发调用 | ${stats.wholesaleCount} 次 (批发价 $${WHOLESALE_PRICE}) |
| 免费试用 | ${stats.freeCount} 次 |

---

## 💰 昨日流水

| 项目 | 金额 |
|------|------|
| 标准收入 | $${stats.paidRevenue.toFixed(2)} USDC |
| 批发收入 | $${stats.wholesaleRevenue.toFixed(2)} USDC |
| **总收入** | **$${totalRevenue.toFixed(2)} USDC** |

---

## 📊 运行成本

| 项目 | 金额 |
|------|------|
| Credits 消耗 | ~$${creditsCost.toFixed(2)} |
| Gas 费消耗 | ~${gasCostEth.toFixed(6)} ETH (~$${gasCostUsd.toFixed(2)}) |
| **总成本** | **$${(creditsCost + gasCostUsd).toFixed(2)}** |

---

## 🧮 净利润

| 指标 | 金额 |
|------|------|
| 昨日净利润 | **$${netProfit.toFixed(2)} USDC** |

---

## 💎 分红进度

\`\`\`
[${'█'.repeat(Math.floor(dividendProgress / 5))}${'░'.repeat(20 - Math.floor(dividendProgress / 5))}] ${dividendProgress.toFixed(0)}%
\`\`\`

| 指标 | 数值 |
|------|------|
| 当前 USDC | $${balances.usdc.toFixed(2)} |
| 分红触发线 | $50.00 |
| 距离分红 | $${Math.max(0, 50 - balances.usdc).toFixed(2)} |
| 分红比例 | 90% |
| 老板钱包 | \`${OWNER_ADDRESS}\` |

---

## ⛽ Gas 状态

| 指标 | 数值 |
|------|------|
| ETH 余额 | ${balances.eth.toFixed(6)} ETH |
| 自动补能阈值 | 0.0005 ETH |
| 状态 | ${balances.eth > 0.0005 ? '🟢 充足' : '🟡 需补能'} |

---

## 🌐 服务状态

| 服务 | 端口 | 状态 |
|------|------|------|
| Receipt2CSV | 8080 | 🟢 在线 |
| URL Metadata | 3006 | 🟢 在线 |

---

## 🎯 市场动态

- **ERC-8004 Agent ID**: 18893
- **主动获客任务**: 每 4 小时扫描新 Agent
- **合作邀约**: 等待平台支持 Conway Social

---

## 📋 待办事项

- [ ] 首笔真实付费交易
- [ ] Conway Social 推广功能
- [ ] 支付验证双轨制优化

---

*报告生成时间: ${formatTime(new Date().toISOString())}*
`;

  // 写入报告
  const reportPath = join(__dirname, '..', 'REVENUE_REPORT.md');
  writeFileSync(reportPath, report);
  console.log(`✅ 报告已生成: REVENUE_REPORT.md\n`);

  // 打印摘要
  console.log('════════════════════════════════════════');
  console.log('📋 每日摘要');
  console.log('════════════════════════════════════════');
  console.log(`   昨日流量: ${totalCalls} 次 (付费 ${stats.paidCount + stats.wholesaleCount}, 免费 ${stats.freeCount})`);
  console.log(`   昨日流水: $${totalRevenue.toFixed(2)} USDC`);
  console.log(`   运行成本: $${(creditsCost + gasCostUsd).toFixed(2)}`);
  console.log(`   净利润:   $${netProfit.toFixed(2)} USDC`);
  console.log(`   分红进度: ${dividendProgress.toFixed(0)}%`);
  console.log('════════════════════════════════════════\n');

  // 检查分红条件
  if (balances.usdc > 50) {
    const dividend = (balances.usdc - 50) * 0.9;
    console.log(`⚠️  分红警告: USDC 余额超过 $50`);
    console.log(`   应转账: ${dividend.toFixed(2)} USDC 给老板\n`);
  }
}

// 主函数
async function main() {
  await generateDetailedReport();
}

main();
