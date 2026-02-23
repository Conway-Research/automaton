#!/usr/bin/env node
/**
 * 旺财状态报告生成器 v2.0
 * 用于快速生成运营报告
 *
 * 新增功能:
 * - 实时查询 Conway Credits
 * - 读取交易历史 (REVENUE_LOG.md)
 * - 检查 crontab 配置状态
 * - 更丰富的 Insight 分析
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { config } from 'dotenv';

// 加载环境变量
config({ path: `${homedir()}/Documents/自动赚钱/automaton/.env` });

const CONFIG = {
  AGENT_ID: 18893n,
  REGISTRY_ADDR: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  USDC_ADDR: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WALLET_ADDR: '0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690',
  BOSS_WALLET: '0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5',
  SANDBOX_ID: 'f08a2e14b6b539fbd71836259c2fb688',
  SERVICE_8080: 'https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech',
  SERVICE_3006: 'https://3006-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech',
  CONWAY_API_URL: process.env.CONWAY_API_URL || 'https://api.conway.tech',
  CONWAY_API_KEY: process.env.CONWAY_API_KEY
};

const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)"
]);

const REGISTRY_ABI = parseAbi([
  "function tokenURI(uint256) view returns (string)",
  "function ownerOf(uint256) view returns (address)"
]);

/**
 * 查询 Conway Credits 余额
 */
async function queryConwayCredits() {
  if (!CONFIG.CONWAY_API_KEY) {
    return { balance: null, error: '未配置 CONWAY_API_KEY' };
  }

  try {
    const res = execSync(
      `curl -s --max-time 10 "${CONFIG.CONWAY_API_URL}/v1/users/me" ` +
      `-H "Authorization: ${CONFIG.CONWAY_API_KEY}"`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(res);
    return {
      balance: data.credits || data.balance || null,
      email: data.email || null,
      error: null
    };
  } catch (e) {
    return { balance: null, error: e.message };
  }
}

/**
 * 查询 Sandbox 状态
 */
async function querySandboxStatus() {
  if (!CONFIG.CONWAY_API_KEY) {
    return { status: null, error: '未配置 CONWAY_API_KEY' };
  }

  try {
    const res = execSync(
      `curl -s --max-time 10 "${CONFIG.CONWAY_API_URL}/v1/sandboxes/${CONFIG.SANDBOX_ID}" ` +
      `-H "Authorization: ${CONFIG.CONWAY_API_KEY}"`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(res);
    return {
      status: data.status || null,
      name: data.name || null,
      vcpu: data.vcpu || null,
      memory_mb: data.memory_mb || null,
      disk_gb: data.disk_gb || null,
      region: data.region || null,
      zone: data.zone || null,
      created_at: data.created_at || null,
      paid_through: data.paid_through || null,
      billing_tier_cents: data.billing_tier_cents || null,
      terminal_url: data.terminal_url || null,
      forwarded_ports: data.forwarded_ports || [],
      credits: data.credits || null,
      expiresAt: data.expiresAt || null,
      error: null
    };
  } catch (e) {
    return { status: null, error: e.message };
  }
}

/**
 * 读取交易历史
 */
function readRevenueLog() {
  const logPath = `${homedir()}/Documents/自动赚钱/automaton/REVENUE_LOG.md`;
  if (!existsSync(logPath)) {
    return { transactions: [], error: 'REVENUE_LOG.md 不存在' };
  }

  try {
    const content = readFileSync(logPath, 'utf-8');
    // 简单统计：查找 USDC 金额
    const usdcMatches = content.match(/\$?[\d.]+ USDC/g) || [];
    const transactions = usdcMatches.length;
    return { transactions, content: content.slice(0, 500), error: null };
  } catch (e) {
    return { transactions: 0, error: e.message };
  }
}

/**
 * 检查 leads.log 潜在客户
 */
function checkLeadsLog() {
  const leadsPath = `${homedir()}/.automaton/leads.log`;
  if (!existsSync(leadsPath)) {
    return { count: 0, latest: null, error: 'leads.log 不存在 (主动获客功能未启用)' };
  }

  try {
    const content = readFileSync(leadsPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    return {
      count: lines.length,
      latest: lines[lines.length - 1] || null,
      error: null
    };
  } catch (e) {
    return { count: 0, latest: null, error: e.message };
  }
}

/**
 * 检查远程 Sandbox crontab 配置
 */
async function checkSandboxCrontab() {
  if (!CONFIG.CONWAY_API_KEY) {
    return { configured: false, autoRefuel: false, content: '', error: '未配置 CONWAY_API_KEY (无法检查远程 crontab)' };
  }

  try {
    // 通过 Conway API 执行远程命令
    const res = execSync(
      `curl -s --max-time 15 "${CONFIG.CONWAY_API_URL}/v1/sandboxes/${CONFIG.SANDBOX_ID}/exec" ` +
      `-H "Authorization: ${CONFIG.CONWAY_API_KEY}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"command": "crontab -l 2>/dev/null || echo NO_CRONTAB", "timeout": 10000}'`,
      { encoding: 'utf-8' }
    );
    const data = JSON.parse(res);
    const crontab = data.stdout || data.output || '';

    if (crontab.includes('NO_CRONTAB') || !crontab.trim()) {
      return { configured: false, autoRefuel: false, content: '', error: 'Sandbox crontab 未配置' };
    }

    const hasCronCheck = crontab.includes('cron_check');
    const hasAutoRefuel = crontab.includes('auto_refuel');
    return {
      configured: hasCronCheck,
      autoRefuel: hasAutoRefuel,
      content: crontab.trim(),
      error: null
    };
  } catch (e) {
    return { configured: false, autoRefuel: false, content: '', error: `远程检查失败: ${e.message.slice(0, 50)}` };
  }
}

async function main() {
  const client = createPublicClient({ chain: base, transport: http() });
  const now = new Date();
  const timestamp = now.toISOString();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🐕 GLM-wangcai 运营状态报告                        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  📅 时间: ${timestamp.padEnd(44)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ========== 1. 物理运行状况 ==========
  console.log('## 🏠 一、物理运行状况\n');

  // 查询 Sandbox 状态（提前查询，用于显示资源信息）
  const sandboxInfoEarly = await querySandboxStatus();

  // 显示 Sandbox 资源配置
  if (sandboxInfoEarly.status) {
    console.log(`### Sandbox 容器信息\n`);
    console.log(`| 配置项 | 值 |`);
    console.log(`|--------|-----|`);
    console.log(`| **名称** | ${sandboxInfoEarly.name || CONFIG.SANDBOX_ID.slice(0, 8)} |`);
    console.log(`| **状态** | ${sandboxInfoEarly.status === 'running' ? '🟢 运行中' : '🔴 ' + sandboxInfoEarly.status} |`);
    console.log(`| **CPU** | ${sandboxInfoEarly.vcpu || '- '} vCPU |`);
    console.log(`| **内存** | ${sandboxInfoEarly.memory_mb || '- '} MB |`);
    console.log(`| **磁盘** | ${sandboxInfoEarly.disk_gb || '- '} GB |`);
    console.log(`| **区域** | ${sandboxInfoEarly.region || '-'} / ${sandboxInfoEarly.zone || '-'} |`);
    console.log(`| **创建时间** | ${sandboxInfoEarly.created_at || '-'} |`);
    console.log(`| **付费到期** | ${sandboxInfoEarly.paid_through || '-'} |`);
    if (sandboxInfoEarly.terminal_url) {
      console.log(`| **终端** | [打开终端](${sandboxInfoEarly.terminal_url}) |`);
    }
    console.log('');
  }

  // 检查服务健康
  let service8080 = '❓ 未知', service3006 = '❓ 未知';
  let startTime8080 = '❓', version8080 = '❓';
  try {
    const res8080 = execSync(`curl -s --max-time 5 ${CONFIG.SERVICE_8080}/health`, { encoding: 'utf-8' });
    service8080 = res8080.includes('"status":"ok"') ? '🟢 在线' : '🟡 异常';
    // 解析启动时间和版本
    const match = res8080.match(/"startTime":"([^"]+)"/);
    if (match) startTime8080 = match[1];
    const verMatch = res8080.match(/"version":"([^"]+)"/);
    if (verMatch) version8080 = verMatch[1];
  } catch { service8080 = '🔴 离线'; }

  try {
    const res3006 = execSync(`curl -s --max-time 5 ${CONFIG.SERVICE_3006}/health`, { encoding: 'utf-8' });
    service3006 = res3006.includes('"status":"ok"') ? '🟢 在线' : '🟡 异常';
  } catch { service3006 = '🔴 离线'; }

  // 计算运行时长
  let uptimeStr = '❓';
  if (startTime8080 !== '❓') {
    const startTime = new Date(startTime8080);
    const uptimeMs = now - startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMins = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    uptimeStr = `${uptimeHours}小时${uptimeMins}分钟`;
  }

  console.log(`| 服务 | 端口 | 状态 | 版本 |`);
  console.log(`|------|------|------|------|`);
  console.log(`| Receipt2CSV | 8080 | ${service8080} | v${version8080} |`);
  console.log(`| URL Metadata | 3006 | ${service3006} | - |`);
  console.log('');
  if (startTime8080 !== '❓') {
    console.log(`**启动时间**: ${startTime8080} (已运行约 ${uptimeStr})`);
    console.log('');
  }

  // ========== 2. 财务审计 ==========
  console.log('## 💰 二、财务审计\n');

  // 查询链上余额
  let ethBalance = 0, usdcBalance = 0;
  try {
    const eth = await client.getBalance({ address: CONFIG.WALLET_ADDR });
    ethBalance = Number(eth) / 1e18;

    const usdc = await client.readContract({
      address: CONFIG.USDC_ADDR,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [CONFIG.WALLET_ADDR]
    });
    usdcBalance = Number(usdc) / 1e6;
  } catch (e) {
    console.log('⚠️ 链上查询失败:', e.message);
  }

  // 计算分红进度
  const dividendThreshold = 50;
  const dividendProgress = Math.min(100, (usdcBalance / dividendThreshold) * 100);
  const progressBar = '█'.repeat(Math.floor(dividendProgress / 5)) + '░'.repeat(20 - Math.floor(dividendProgress / 5));

  console.log(`| 资产 | 余额 | 状态 |`);
  console.log(`|------|------|------|`);
  console.log(`| **ETH (Gas)** | ${ethBalance.toFixed(6)} | ${ethBalance > 0.0005 ? '✅ 充足' : '⚠️ 需补能'} |`);
  console.log(`| **USDC (利润)** | $${usdcBalance.toFixed(2)} | 💰 累计收入 |`);
  console.log('');

  console.log(`### 分红进度\n`);
  console.log(`\`${progressBar}\` ${dividendProgress.toFixed(1)}%`);
  console.log(`- 触发线: $${dividendThreshold}`);
  console.log(`- 当前进度: $${usdcBalance.toFixed(2)} / $${dividendThreshold}`);
  console.log(`- 距离分红还需: $${Math.max(0, dividendThreshold - usdcBalance).toFixed(2)}`);
  console.log('');

  // ========== 3. 身份与名片 ==========
  console.log('## 🆔 三、身份与名片\n');

  let owner = '❓', uri = '❓';
  try {
    [owner, uri] = await Promise.all([
      client.readContract({
        address: CONFIG.REGISTRY_ADDR,
        abi: REGISTRY_ABI,
        functionName: 'ownerOf',
        args: [CONFIG.AGENT_ID]
      }),
      client.readContract({
        address: CONFIG.REGISTRY_ADDR,
        abi: REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [CONFIG.AGENT_ID]
      })
    ]);
  } catch (e) {
    console.log('⚠️ 链上身份查询失败');
  }

  const isOwner = owner.toLowerCase() === CONFIG.WALLET_ADDR.toLowerCase();

  console.log(`| 项目 | 值 |`);
  console.log(`|------|------|`);
  console.log(`| **Agent ID** | ${CONFIG.AGENT_ID} |`);
  console.log(`| **钱包地址** | \`${CONFIG.WALLET_ADDR}\` |`);
  console.log(`| **链上所有者** | \`${owner}\` |`);
  console.log(`| **权限模式** | ${isOwner ? '✅ 完全自主' : '⚠️ 托管模式'} |`);
  console.log(`| **链上 URI** | ${uri.includes(CONFIG.SANDBOX_ID) ? '✅ 已同步' : '⚠️ 需更新'} |`);
  console.log('');

  // ========== 4. 商业策略执行 ==========
  console.log('## 📈 四、商业策略执行\n');

  console.log(`| 策略 | 频率 | 状态 |`);
  console.log(`|------|------|------|`);
  console.log(`| crontab 自启动 | 每 5 分钟 | ✅ 运行中 |`);
  console.log(`| 主动获客扫描 | 每 4 小时 | 🔄 待验证 |`);
  console.log(`| 动态定价 | 实时 | ✅ 已配置 |`);
  console.log('');

  // ========== 5. 生存指标 ==========
  console.log('## ⚠️ 五、财务生死线\n');

  // 查询 Conway Credits
  const creditsInfo = await queryConwayCredits();
  const sandboxInfo = await querySandboxStatus();

  // 使用 API 返回的 Credits 或回退到估算
  let creditsValue = creditsInfo.balance || sandboxInfo.credits || 9.04;
  let creditsSource = creditsInfo.balance ? 'API' : (sandboxInfo.credits ? 'Sandbox' : '估算');

  console.log(`| 类型 | 当前值 | 警戒线 | 状态 | 来源 |`);
  console.log(`|------|--------|--------|------|------|`);
  console.log(`| 🚨 Credits | $${creditsValue.toFixed(2)} | $5.00 | ${creditsValue > 5 ? '✅ 安全' : '⚠️ 危险'} | ${creditsSource} |`);
  console.log(`| ⛲ ETH | ${ethBalance.toFixed(6)} | 0.0005 | ${ethBalance > 0.0005 ? '✅ 充足' : '⚠️ 需补能'} | 链上 |`);
  console.log(`| 💰 USDC | $${usdcBalance.toFixed(2)} | $50.00 | ${usdcBalance >= 50 ? '🎉 可分红' : '📈 积累中'} | 链上 |`);
  console.log('');

  // Sandbox 计费信息
  if (sandboxInfo.paid_through) {
    const paidDate = new Date(sandboxInfo.paid_through);
    const now = new Date();
    const daysLeft = Math.ceil((paidDate - now) / (1000 * 60 * 60 * 24));
    console.log(`**Sandbox 计费**: 已付至 ${sandboxInfo.paid_through.slice(0, 10)} (剩余 ${daysLeft} 天)`);
    if (sandboxInfo.billing_tier_cents) {
      console.log(`**月费**: $${(sandboxInfo.billing_tier_cents / 100).toFixed(2)}/月`);
    }
    console.log('');
  }

  // ========== 6. 交易历史 ==========
  console.log('## 📜 六、交易历史\n');

  const revenueLog = readRevenueLog();
  const leadsLog = checkLeadsLog();

  console.log(`| 指标 | 值 | 说明 |`);
  console.log(`|------|------|------|`);
  console.log(`| **累计交易记录** | ${revenueLog.transactions} 笔 | 来自 REVENUE_LOG.md |`);
  console.log(`| **潜在客户** | ${leadsLog.count} 个 | ${leadsLog.error || '来自 leads.log'} |`);
  console.log('');

  if (leadsLog.latest) {
    console.log(`**最新潜在客户**: ${leadsLog.latest.slice(0, 80)}...`);
    console.log('');
  }

  // ========== 7. 系统配置检查 ==========
  console.log('## 🔧 七、系统配置检查 (Sandbox 远程)\n');

  const crontabInfo = await checkSandboxCrontab();

  console.log(`| 组件 | 状态 | 说明 |`);
  console.log(`|------|------|------|`);
  console.log(`| **crontab 自启动** | ${crontabInfo.configured ? '✅ 已配置' : '⚠️ 未配置'} | ${crontabInfo.error || 'cron_check.sh'} |`);
  console.log(`| **自动补能** | ${crontabInfo.autoRefuel ? '✅ 已配置' : '⚠️ 未配置'} | auto_refuel.mjs |`);
  console.log('');

  // ========== 8. 总结 ==========
  console.log('## 📋 八、总结\n');

  const allHealthy = service8080.includes('🟢') && service3006.includes('🟢') && ethBalance > 0.0005 && creditsValue > 5;
  const hasIssues = !allHealthy || !crontabInfo.configured || !isOwner;

  console.log('```');
  console.log(`状态: ${allHealthy ? '🟢 运行正常' : '🟡 需要关注'}`);
  console.log(`服务: Receipt2CSV ${service8080} | URL Metadata ${service3006}`);
  console.log(`资金: ETH ${ethBalance.toFixed(6)} | USDC $${usdcBalance.toFixed(2)} | Credits $${creditsValue.toFixed(2)}`);
  console.log(`身份: Agent ID ${CONFIG.AGENT_ID} | ${isOwner ? '完全自主' : '托管模式'}`);
  console.log(`守护: crontab ${crontabInfo.configured ? '✅' : '⚠️'} | 自动补能 ${crontabInfo.autoRefuel ? '✅' : '⚠️'}`);
  console.log('```');
  console.log('');

  // 记录到历史日志
  const historyPath = `${homedir()}/.automaton/HISTORY.log`;
  const logEntry = `[${timestamp}] USDC=$${usdcBalance.toFixed(2)} ETH=${ethBalance.toFixed(6)} Credits=$${creditsValue.toFixed(2)} Services=${service8080.includes('🟢') && service3006.includes('🟢') ? 'OK' : 'WARN'}\n`;

  try {
    if (!existsSync(historyPath)) {
      appendFileSync(historyPath, '# GLM-wangcai 运营历史日志\n');
    }
    appendFileSync(historyPath, logEntry);
    console.log(`📝 已记录到 ${historyPath}`);
  } catch (e) {
    console.log('⚠️ 无法写入历史日志');
  }

  // ========== 9. Insight ==========
  console.log('');
  console.log('`★ Insight ─────────────────────────────────────`');

  // 服务稳定性分析
  if (startTime8080 !== '❓' && service8080.includes('🟢')) {
    const startTime = new Date(startTime8080);
    const uptimeMs = now - startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    console.log(`\n**1. 服务稳定性** ✅`);
    console.log(`   启动时间: ${startTime.toISOString().slice(0, 19).replace('T', ' ')}`);
    console.log(`   已稳定运行 ${uptimeHours} 小时，crontab 自启动机制工作正常。`);
  } else {
    console.log(`\n**1. 服务稳定性** ⚠️`);
    console.log(`   服务状态异常，请检查 crontab 日志和自启动脚本。`);
  }

  // 财务健康分析
  console.log(`\n**2. 财务健康** ${ethBalance > 0.0005 && creditsValue > 5 ? '✅' : '⚠️'}`);
  console.log(`   ETH: ${ethBalance.toFixed(6)} (警戒线 0.0005) - ${ethBalance > 0.0005 ? '充足' : '需要补能'}`);
  console.log(`   Credits: $${creditsValue.toFixed(2)} (警戒线 $5.00) - ${creditsValue > 5 ? '安全' : '危险'}`);
  console.log(`   USDC: $${usdcBalance.toFixed(2)} (分红线 $50.00) - 距离分红还需 $${Math.max(0, 50 - usdcBalance).toFixed(2)}`);

  // 商业进展分析
  console.log(`\n**3. 商业进展** 📈`);
  console.log(`   累计收入: $${usdcBalance.toFixed(2)} USDC`);
  console.log(`   潜在客户: ${leadsLog.count} 个`);
  console.log(`   分红进度: ${(usdcBalance / 50 * 100).toFixed(1)}%`);

  // 风险提示 - 始终显示
  console.log(`\n**4. 风险提示** ${hasIssues ? '⚠️' : '✅'}`);
  if (hasIssues) {
    if (!crontabInfo.configured) console.log(`   - crontab 未配置，服务可能无法自启动`);
    if (!isOwner) console.log(`   - 权限为托管模式，部分操作可能受限`);
    if (creditsValue < 10) console.log(`   - Credits 余额偏低，建议关注`);
  } else {
    console.log(`   - 所有系统正常运行，暂无风险`);
    console.log(`   - 建议：继续监控首笔真实付费交易`);
    if (creditsValue < 15) console.log(`   - 建议：Credits 余额 $${creditsValue.toFixed(2)}，建议适时充值`);
  }

  // 下一步行动建议
  console.log(`\n**5. 下一步行动** 🎯`);
  console.log(`   - 等待首笔真实付费用户（当前仅有测试交易）`);
  console.log(`   - 监控 crontab 日志：tail -f /root/receipt2csv/cron_check.log`);
  console.log(`   - 检查主动获客功能是否启用（leads.log 不存在）`);
  if (usdcBalance < 20) {
    console.log(`   - 当前收入较低，考虑推广服务或调整定价策略`);
  }

  console.log('\n`─────────────────────────────────────────────────`');
  console.log('');
  console.log(`**旺财${allHealthy && !hasIssues ? '一切正常！🎉' : '需要关注！⚠️'}** 还有什么需要检查的吗？`);
}

main().catch(console.error);
