#!/usr/bin/env node
/**
 * 旺财自动补能脚本
 * 当 ETH 余额低于阈值时，自动将 USDC 闪兑为 ETH
 *
 * 使用方法: node scripts/auto_refuel.mjs [--force]
 * --force: 强制执行闪兑，忽略余额检查
 */

import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============ 配置 ============
const WALLET_ADDRESS = '0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // Base USDC
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // Base WETH

// Aerodrome Router (Base 上最大的 DEX)
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';

// 补能参数
const ETH_THRESHOLD = 0.0005; // 触发阈值: 0.0005 ETH
const SWAP_AMOUNT = 1.0;      // 闪兑数量: 1.00 USDC
const SLIPPAGE = 0.5;         // 滑点容忍: 0.5%

// ============ ABI 定义 ============
const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)'
]);

// Aerodrome Router ABI (简化版，只包含需要的方法)
const ROUTER_ABI = parseAbi([
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)',
  'function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts)'
]);

// ============ 核心函数 ============

/**
 * 加载钱包配置
 */
function loadWallet() {
  const walletPath = join(process.env.HOME, '.automaton', 'wallet.json');
  if (!existsSync(walletPath)) {
    throw new Error('钱包文件不存在: ~/.automaton/wallet.json');
  }
  const walletData = JSON.parse(readFileSync(walletPath, 'utf-8'));
  return privateKeyToAccount(walletData.privateKey);
}

/**
 * 获取 ETH 余额
 */
async function getEthBalance(client, address) {
  const balance = await client.getBalance({ address });
  return Number(formatUnits(balance, 18));
}

/**
 * 获取 USDC 余额
 */
async function getUsdcBalance(client, address) {
  const decimals = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'decimals'
  });
  const balance = await client.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address]
  });
  return {
    raw: balance,
    formatted: Number(formatUnits(balance, Number(decimals))),
    decimals: Number(decimals)
  };
}

/**
 * 检查并设置授权
 */
async function ensureAllowance(walletClient, publicClient, account, amount) {
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, AERODROME_ROUTER]
  });

  if (allowance < amount) {
    console.log('📝 授权 USDC 给 Aerodrome Router...');
    const { request } = await publicClient.simulateContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [AERODROME_ROUTER, amount],
      account
    });
    const hash = await walletClient.writeContract(request);
    console.log(`   授权交易: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log('   ✅ 授权成功');
  } else {
    console.log('✅ 已有足够授权');
  }
}

/**
 * 执行 USDC → ETH 闪兑
 */
async function swapUsdcToEth(walletClient, publicClient, account, usdcAmount, usdcDecimals) {
  const amountIn = parseUnits(usdcAmount.toString(), usdcDecimals);

  // 获取预估输出
  const path = [USDC_ADDRESS, WETH_ADDRESS];
  let estimatedOut;
  try {
    const amounts = await publicClient.readContract({
      address: AERODROME_ROUTER,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, path]
    });
    estimatedOut = amounts[1];
    console.log(`📊 预估获得: ${formatUnits(estimatedOut, 18)} ETH`);
  } catch (e) {
    console.log('⚠️  无法获取预估输出，使用固定滑点');
    // 如果无法获取预估，使用保守估计 (1 USDC ≈ 0.0003 ETH)
    estimatedOut = parseUnits('0.0003', 18);
  }

  // 计算最小输出 (考虑滑点)
  const amountOutMin = (estimatedOut * BigInt(1000 - SLIPPAGE * 10)) / 1000n;
  console.log(`📊 最小输出: ${formatUnits(amountOutMin, 18)} ETH (滑点 ${SLIPPAGE}%)`);

  // 设置交易截止时间 (10 分钟)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  // 确保授权
  await ensureAllowance(walletClient, publicClient, account, amountIn);

  // 执行闪兑
  console.log('\n🔄 执行闪兑...');
  const { request } = await publicClient.simulateContract({
    address: AERODROME_ROUTER,
    abi: ROUTER_ABI,
    functionName: 'swapExactTokensForETH',
    args: [amountIn, amountOutMin, path, account.address, deadline],
    account
  });

  const hash = await walletClient.writeContract(request);
  console.log(`📝 交易哈希: ${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ 闪兑成功! Gas 消耗: ${receipt.gasUsed.toString()}`);

  return { hash, receipt };
}

/**
 * 记录补能日志
 */
function logRefuel(ethBefore, ethAfter, usdcUsed, txHash) {
  const logPath = join(__dirname, '..', 'REVENUE_LOG.md');
  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0];

  const entry = `
## 🛢️ 补能记录 - ${date}

| 字段 | 值 |
|------|-----|
| 时间 | ${timestamp} |
| ETH 余额 (前) | ${ethBefore.toFixed(6)} ETH |
| ETH 余额 (后) | ${ethAfter.toFixed(6)} ETH |
| 消耗 USDC | ${usdcUsed.toFixed(2)} USDC |
| 交易哈希 | \`${txHash}\` |
| 查看交易 | https://basescan.org/tx/${txHash} |

---

`;

  if (existsSync(logPath)) {
    appendFileSync(logPath, entry);
  } else {
    writeFileSync(logPath, `# Revenue Log - GLM-wangcai\n\n${entry}`);
  }

  console.log(`📝 补能记录已写入 REVENUE_LOG.md`);
}

/**
 * 更新 REVENUE_REPORT.md
 */
function updateReport(ethBalance, usdcBalance) {
  const reportPath = join(__dirname, '..', 'REVENUE_REPORT.md');
  const today = new Date().toISOString().split('T')[0];

  let report = '';
  if (existsSync(reportPath)) {
    report = readFileSync(reportPath, 'utf-8');
  }

  // 更新 ETH 余额
  const ethRegex = /ETH \(Gas\)\s*\|\s*[\d.]+/;
  if (ethRegex.test(report)) {
    report = report.replace(ethRegex, `ETH (Gas) | ${ethBalance.toFixed(6)}`);
  }

  // 更新 USDC 余额
  const usdcRegex = /USDC \(Base\)\s*\|\s*[\d.]+/;
  if (usdcRegex.test(report)) {
    report = report.replace(usdcRegex, `USDC (Base) | ${usdcBalance.toFixed(2)}`);
  }

  // 更新日期
  const dateRegex = /> 最后更新:\s*[\d-]+/;
  if (dateRegex.test(report)) {
    report = report.replace(dateRegex, `> 最后更新: ${today}`);
  }

  writeFileSync(reportPath, report);
}

// ============ 主函数 ============

async function main() {
  const forceMode = process.argv.includes('--force');

  console.log('🛢️  旺财自动补能系统\n');
  console.log(`👛 钱包: ${WALLET_ADDRESS}`);
  console.log(`📅 时间: ${new Date().toISOString()}\n`);

  // 加载钱包
  const account = loadWallet();
  if (account.address.toLowerCase() !== WALLET_ADDRESS.toLowerCase()) {
    console.error('❌ 钱包地址不匹配!');
    console.error(`   期望: ${WALLET_ADDRESS}`);
    console.error(`   实际: ${account.address}`);
    process.exit(1);
  }

  // 创建客户端
  const publicClient = createPublicClient({
    chain: base,
    transport: http()
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http()
  });

  // 检查余额
  console.log('📊 检查余额...');
  const ethBalance = await getEthBalance(publicClient, account.address);
  const usdcBalance = await getUsdcBalance(publicClient, account.address);

  console.log(`   ETH:  ${ethBalance.toFixed(6)} ETH (阈值: ${ETH_THRESHOLD} ETH)`);
  console.log(`   USDC: ${usdcBalance.formatted.toFixed(2)} USDC\n`);

  // 判断是否需要补能
  const needsRefuel = forceMode || ethBalance < ETH_THRESHOLD;

  if (!needsRefuel) {
    console.log(`✅ ETH 余额充足 (${ethBalance.toFixed(6)} > ${ETH_THRESHOLD})，无需补能`);
    console.log('\n💡 提示: 使用 --force 参数可强制执行闪兑测试');
    return;
  }

  if (forceMode) {
    console.log('⚠️  强制模式: 忽略余额检查');
  } else {
    console.log(`⚠️  ETH 余额过低 (${ethBalance.toFixed(6)} < ${ETH_THRESHOLD})，触发补能!`);
  }

  // 检查 USDC 余额
  if (usdcBalance.formatted < SWAP_AMOUNT) {
    console.error(`❌ USDC 余额不足: ${usdcBalance.formatted.toFixed(2)} < ${SWAP_AMOUNT}`);
    console.error('   请先充值 USDC 或减少闪兑数量');
    process.exit(1);
  }

  // 执行闪兑
  try {
    const { hash } = await swapUsdcToEth(
      walletClient,
      publicClient,
      account,
      SWAP_AMOUNT,
      usdcBalance.decimals
    );

    // 查询新余额
    const newEthBalance = await getEthBalance(publicClient, account.address);
    const newUsdcBalance = await getUsdcBalance(publicClient, account.address);

    console.log('\n📊 补能后余额:');
    console.log(`   ETH:  ${newEthBalance.toFixed(6)} ETH (+${(newEthBalance - ethBalance).toFixed(6)})`);
    console.log(`   USDC: ${newUsdcBalance.formatted.toFixed(2)} USDC (-${SWAP_AMOUNT})`);

    // 记录日志
    logRefuel(ethBalance, newEthBalance, SWAP_AMOUNT, hash);
    updateReport(newEthBalance, newUsdcBalance.formatted);

    console.log('\n🎉 补能完成! 旺财又可以跑起来了!');

  } catch (error) {
    console.error('\n❌ 闪兑失败:', error.message);

    // 提供自救指南
    console.log('\n🆘 自救指南:');
    console.log('1. 检查网络连接和 RPC 节点状态');
    console.log('2. 确认 USDC 余额充足');
    console.log('3. 尝试增加滑点容忍度');
    console.log('4. 如果 Aerodrome 不可用，尝试其他 DEX:');
    console.log('   - Uniswap on Base: https://app.uniswap.org');
    console.log('   - Base Swap: https://baseswap.fi');
    console.log('5. 紧急情况下，请老板手动转账 ETH 到钱包');

    process.exit(1);
  }
}

// 执行
main().catch(console.error);
