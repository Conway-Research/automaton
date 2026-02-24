#!/usr/bin/env node
/**
 * Learning Loop - 旺财自学习循环脚本
 *
 * 功能:
 * 1. 收集过去 N 小时的运营数据
 * 2. 分析客户行为和转化率
 * 3. 生成优化建议
 * 4. 记录到 findings.md
 * 5. 更新策略权重
 *
 * 使用:
 *   node scripts/learning_loop.mjs
 *   node scripts/learning_loop.mjs --interval 6  (分析过去6小时)
 *
 * 由 crontab 每 6 小时调用一次
 *
 * @version 1.0.0
 * @created 2026-02-24
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// 配置
const CONFIG = {
  // 分析间隔（小时）
  interval: parseInt(process.env.LEARNING_INTERVAL || '6'),

  // 数据源
  statsFile: process.env.STATS_FILE || '/root/receipt2csv/data/stats.json',
  usageFile: process.env.USAGE_FILE || '/root/receipt2csv/data/usage.json',

  // 输出
  findingsFile: join(process.cwd(), 'findings.md'),
  logDir: '/var/log/automaton',

  // 目标指标
  targets: {
    conversionRate: 0.35,      // 目标转化率 35%
    responseRate: 0.10,        // 目标响应率 10%
    successRate: 0.99,         // 目标成功率 99%
    avgResponseTime: 200,      // 目标响应时间 200ms
  },
};

// 日志函数
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);

  try {
    if (!existsSync(CONFIG.logDir)) {
      mkdirSync(CONFIG.logDir, { recursive: true });
    }
    const logFile = join(CONFIG.logDir, 'learning.log');
    writeFileSync(logFile, logLine + '\n', { flag: 'a' });
  } catch (e) {
    // 忽略
  }
}

// 收集运营数据
function collectMetrics() {
  log('📊 收集运营数据...');

  const metrics = {
    timestamp: new Date().toISOString(),
    period: `${CONFIG.interval}h`,
    usage: { total: 0, free: 0, paid: 0, uniqueUsers: 0 },
    conversion: { rate: 0, trend: 'stable' },
    outreach: { sent: 0, responses: 0, rate: 0 },
    performance: { avgResponseTime: 0, successRate: 0 },
  };

  try {
    // 读取使用数据
    if (existsSync(CONFIG.usageFile)) {
      const usageData = JSON.parse(readFileSync(CONFIG.usageFile, 'utf-8'));
      metrics.usage = {
        total: usageData.total_calls || 0,
        free: usageData.free_calls || 0,
        paid: usageData.paid_calls || 0,
        uniqueUsers: Object.keys(usageData.wallets || {}).length,
      };

      // 计算转化率
      if (metrics.usage.free > 0) {
        metrics.conversion.rate = metrics.usage.paid / metrics.usage.free;
      }
    }

    // 读取性能数据
    if (existsSync(CONFIG.statsFile)) {
      const statsData = JSON.parse(readFileSync(CONFIG.statsFile, 'utf-8'));
      metrics.performance = {
        avgResponseTime: statsData.avg_response_time || 0,
        successRate: statsData.success_rate || 0,
      };
    }
  } catch (error) {
    log(`⚠️ 数据收集警告: ${error.message}`, 'WARN');
  }

  return metrics;
}

// 分析数据并生成建议
function analyzeMetrics(metrics) {
  log('🔍 分析数据...');

  const insights = [];
  const recommendations = [];

  // 1. 转化率分析
  if (metrics.conversion.rate < CONFIG.targets.conversionRate) {
    insights.push(`转化率 ${ (metrics.conversion.rate * 100).toFixed(1)}% 低于目标 ${ (CONFIG.targets.conversionRate * 100)}%`);
    recommendations.push({
      priority: 'HIGH',
      action: 'S-02 Loss Leader',
      suggestion: '考虑增加免费额度从 5 次到 10 次，或添加首单半价优惠',
    });
  } else {
    insights.push(`✅ 转化率 ${ (metrics.conversion.rate * 100).toFixed(1)}% 达标`);
  }

  // 2. 响应时间分析
  if (metrics.performance.avgResponseTime > CONFIG.targets.avgResponseTime) {
    insights.push(`响应时间 ${metrics.performance.avgResponseTime}ms 高于目标 ${CONFIG.targets.avgResponseTime}ms`);
    recommendations.push({
      priority: 'MEDIUM',
      action: 'Performance',
      suggestion: '考虑添加缓存或优化 API 调用',
    });
  }

  // 3. 成功率分析
  if (metrics.performance.successRate < CONFIG.targets.successRate) {
    insights.push(`成功率 ${(metrics.performance.successRate * 100).toFixed(1)}% 低于目标 ${(CONFIG.targets.successRate * 100)}%`);
    recommendations.push({
      priority: 'HIGH',
      action: 'Reliability',
      suggestion: '检查错误日志，添加重试机制',
    });
  }

  // 4. 用户增长分析
  if (metrics.usage.uniqueUsers < 10) {
    insights.push(`用户数 ${metrics.usage.uniqueUsers} 较少`);
    recommendations.push({
      priority: 'HIGH',
      action: 'S-01 Registry Sniper',
      suggestion: '增加主动获客频率，优化推广文案',
    });
  }

  return { insights, recommendations };
}

// 生成 findings.md 内容
function generateFindingsContent(metrics, analysis) {
  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toISOString().split('T')[1].split('.')[0];

  const lines = [
    `### 自学习报告 - ${date} ${time}`,
    '',
    `**分析周期**: 过去 ${CONFIG.interval} 小时`,
    '',
    '**关键指标**:',
    `| 指标 | 当前值 | 目标值 | 状态 |`,
    `|------|--------|--------|------|`,
    `| 转化率 | ${(metrics.conversion.rate * 100).toFixed(1)}% | ${(CONFIG.targets.conversionRate * 100)}% | ${metrics.conversion.rate >= CONFIG.targets.conversionRate ? '✅' : '⚠️'} |`,
    `| 响应时间 | ${metrics.performance.avgResponseTime}ms | ${CONFIG.targets.avgResponseTime}ms | ${metrics.performance.avgResponseTime <= CONFIG.targets.avgResponseTime ? '✅' : '⚠️'} |`,
    `| 成功率 | ${(metrics.performance.successRate * 100).toFixed(1)}% | ${(CONFIG.targets.successRate * 100)}% | ${metrics.performance.successRate >= CONFIG.targets.successRate ? '✅' : '⚠️'} |`,
    `| 用户数 | ${metrics.usage.uniqueUsers} | 10+ | ${metrics.usage.uniqueUsers >= 10 ? '✅' : '⚠️'} |`,
    '',
    '**洞察**:',
  ];

  analysis.insights.forEach(insight => {
    lines.push(`- ${insight}`);
  });

  if (analysis.recommendations.length > 0) {
    lines.push('');
    lines.push('**优化建议**:');
    analysis.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. [${rec.priority}] ${rec.action}: ${rec.suggestion}`);
    });
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

// 更新策略权重（写入配置文件）
function updateStrategyWeights(analysis) {
  log('🔄 更新策略权重...');

  const weights = {
    'S-02-loss-leader': {
      free_tier_limit: 5,
      first_call_discount: 0,
    },
    'S-01-registry-sniper': {
      daily_limit: 5,
      min_score: 50,
    },
  };

  // 根据分析结果调整权重
  analysis.recommendations.forEach(rec => {
    if (rec.action === 'S-02 Loss Leader') {
      weights['S-02-loss-leader'].free_tier_limit = 10;
      weights['S-02-loss-leader'].first_call_discount = 0.05;
    }
    if (rec.action === 'S-01 Registry Sniper') {
      weights['S-01-registry-sniper'].daily_limit = 10;
    }
  });

  // 写入配置文件
  try {
    const configFile = join(process.cwd(), 'config', 'strategy_weights.json');
    writeFileSync(configFile, JSON.stringify(weights, null, 2));
    log('✅ 策略权重已更新');
  } catch (error) {
    log(`⚠️ 权重更新失败: ${error.message}`, 'WARN');
  }
}

// 主函数
async function main() {
  log('🚀 旺财自学习循环启动');
  log(`📋 分析周期: 过去 ${CONFIG.interval} 小时`);

  // 1. 收集数据
  const metrics = collectMetrics();
  log(`📊 数据收集完成: ${JSON.stringify(metrics.usage)}`);

  // 2. 分析数据
  const analysis = analyzeMetrics(metrics);
  log(`🔍 分析完成: ${analysis.insights.length} 个洞察, ${analysis.recommendations.length} 个建议`);

  // 3. 生成报告
  const content = generateFindingsContent(metrics, analysis);

  // 4. 追加到 findings.md
  try {
    const findingsContent = readFileSync(CONFIG.findingsFile, 'utf-8');
    const insertPoint = findingsContent.indexOf('## 🔐 安全发现');
    if (insertPoint > 0) {
      const newContent =
        findingsContent.slice(0, insertPoint) +
        content +
        findingsContent.slice(insertPoint);
      writeFileSync(CONFIG.findingsFile, newContent);
      log('✅ findings.md 已更新');
    }
  } catch (error) {
    log(`⚠️ findings.md 更新失败: ${error.message}`, 'WARN');
  }

  // 5. 更新策略权重
  updateStrategyWeights(analysis);

  // 6. 输出摘要
  console.log('\n' + '='.repeat(50));
  console.log('📊 自学习报告摘要');
  console.log('='.repeat(50));
  analysis.insights.forEach(i => console.log(`  ${i}`));
  if (analysis.recommendations.length > 0) {
    console.log('\n🎯 优先建议:');
    analysis.recommendations.slice(0, 3).forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.priority}] ${r.action}`);
    });
  }
  console.log('='.repeat(50) + '\n');

  log('✅ 自学习循环完成');
}

main().catch(error => {
  log(`❌ 自学习循环失败: ${error.message}`, 'ERROR');
  process.exit(1);
});
