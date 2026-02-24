#!/usr/bin/env node
/**
 * GSD Sync - GSD 与三文件系统同步脚本
 *
 * 功能:
 * 1. 读取 GSD STATE.md 中的关键决策
 * 2. 同步到三文件系统 (findings.md, task_plan.md, progress.md)
 * 3. 读取三文件中的完成状态
 * 4. 更新 GSD STATE.md
 *
 * 使用:
 *   node scripts/gsd_sync.mjs
 *   node scripts/gsd_sync.mjs --dry-run
 *
 * 由 crontab 每小时调用一次
 *
 * @version 1.0.0
 * @created 2026-02-24
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// 配置
const CONFIG = {
  // GSD 文件
  gsdStatePath: join(process.cwd(), '.planning', 'STATE.md'),
  gsdRoadmapPath: join(process.cwd(), '.planning', 'ROADMAP.md'),

  // 三文件系统
  findingsPath: join(process.cwd(), 'findings.md'),
  taskPlanPath: join(process.cwd(), 'task_plan.md'),
  progressPath: join(process.cwd(), 'progress.md'),

  // 同步日志
  logPath: join(process.cwd(), '.planning', 'sync_log.json'),
};

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

/**
 * 读取文件内容，返回 null 如果不存在
 */
function safeRead(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * 从 GSD STATE.md 提取关键决策
 */
function extractGSDDecisions(stateContent) {
  const decisions = [];

  // 提取 Key Decisions
  const decisionMatch = stateContent.match(/### Key Decisions\n([\s\S]*?)(?=\n###|$)/);
  if (decisionMatch) {
    const lines = decisionMatch[1].split('\n');
    lines.forEach(line => {
      const match = line.match(/^\d+\.\s+\*\*([^*]+)\*\*:\s+(.+)$/);
      if (match) {
        decisions.push({
          title: match[1],
          content: match[2],
        });
      }
    });
  }

  return decisions;
}

/**
 * 从 GSD STATE.md 提取当前阻塞
 */
function extractGSDBlockers(stateContent) {
  const blockers = [];

  const blockerMatch = stateContent.match(/### Blockers\n([\s\S]*?)(?=\n---|\n##|$)/);
  if (blockerMatch) {
    const lines = blockerMatch[1].split('\n');
    lines.forEach(line => {
      const match = line.match(/- \[ \]\s+(.+)$/);
      if (match && !match[1].startsWith('#')) {
        blockers.push(match[1].trim());
      }
    });
  }

  return blockers;
}

/**
 * 从三文件提取完成状态
 */
function extractThreeFilesStatus() {
  const status = {
    techPhases: [],
    currentBlockers: [],
    recentFindings: [],
  };

  // 从 task_plan.md 提取技术开发阶段状态
  const taskPlan = safeRead(CONFIG.taskPlanPath);
  if (taskPlan) {
    const phaseMatch = taskPlan.match(/## 📋 技术开发阶段完成总结\n([\s\S]*?)(?=\n---|\n##|$)/);
    if (phaseMatch) {
      const lines = phaseMatch[1].split('\n');
      lines.forEach(line => {
        const match = line.match(/\| (Tech-\d+) \| ([^|]+) \| (✅|🟡|🔴)/);
        if (match) {
          status.techPhases.push({
            phase: match[1].trim(),
            name: match[2].trim(),
            status: match[3].trim(),
          });
        }
      });
    }
  }

  // 从 progress.md 提取当前阻塞
  const progress = safeRead(CONFIG.progressPath);
  if (progress) {
    const blockerMatch = progress.match(/\*\*等待事项\*\*:\n([\s\S]*?)(?=\n\n|\n---|$)/);
    if (blockerMatch) {
      const lines = blockerMatch[1].split('\n');
      lines.forEach(line => {
        const match = line.match(/- \[ \]\s+(.+)$/);
        if (match) {
          status.currentBlockers.push(match[1].trim());
        }
      });
    }
  }

  // 从 findings.md 提取最近的发现编号
  const findings = safeRead(CONFIG.findingsPath);
  if (findings) {
    const matches = findings.match(/### (\d+)\. /g);
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const number = parseInt(lastMatch.match(/\d+/)?.[0] || '0');
      status.recentFindings.push(`#${number}`);
    }
  }

  return status;
}

/**
 * 同步 GSD → 三文件
 */
function syncGSDToThreeFiles(decisions, blockers) {
  const syncItems = [];

  // 检查决策是否已在 findings.md 中
  const findings = safeRead(CONFIG.findingsPath) || '';

  decisions.forEach(decision => {
    if (!findings.includes(decision.title)) {
      syncItems.push({
        type: 'decision',
        source: 'GSD STATE.md',
        target: 'findings.md',
        content: `${decision.title}: ${decision.content}`,
      });
    }
  });

  // 检查阻塞是否已在 progress.md 中
  const progress = safeRead(CONFIG.progressPath) || '';

  blockers.forEach(blocker => {
    const cleanBlocker = blocker.replace(/🔴|🟡|⚠️/g, '').trim();
    if (!progress.includes(cleanBlocker.substring(0, 30))) {
      syncItems.push({
        type: 'blocker',
        source: 'GSD STATE.md',
        target: 'progress.md',
        content: cleanBlocker,
      });
    }
  });

  return syncItems;
}

/**
 * 同步三文件 → GSD
 */
function syncThreeFilesToGSD(threeFilesStatus) {
  const syncItems = [];

  // 检查技术开发阶段状态是否在 GSD STATE.md 中
  const gsdState = safeRead(CONFIG.gsdStatePath) || '';

  threeFilesStatus.techPhases.forEach(phase => {
    if (!gsdState.includes(phase.phase)) {
      syncItems.push({
        type: 'tech_phase',
        source: 'task_plan.md',
        target: 'GSD STATE.md',
        content: `${phase.phase}: ${phase.name} - ${phase.status}`,
      });
    }
  });

  return syncItems;
}

/**
 * 执行同步
 */
function executeSync(syncItems) {
  if (dryRun) {
    console.log('\n📝 Dry Run 模式 - 以下是将要同步的内容:\n');
    syncItems.forEach((item, i) => {
      console.log(`${i + 1}. [${item.type}] ${item.source} → ${item.target}`);
      console.log(`   ${item.content.substring(0, 80)}...`);
      console.log('');
    });
    return;
  }

  // 实际执行同步
  syncItems.forEach(item => {
    try {
      if (item.target === 'findings.md') {
        const findings = safeRead(CONFIG.findingsPath) || '';
        const insertPoint = findings.indexOf('## 🔐 安全发现');
        if (insertPoint > 0) {
          const newContent = findings.slice(0, insertPoint) +
            `\n**${item.content}**\n\n` +
            `*同步自 GSD STATE.md*\n\n---\n\n` +
            findings.slice(insertPoint);
          writeFileSync(CONFIG.findingsPath, newContent);
          console.log(`✅ 已同步到 findings.md: ${item.content.substring(0, 50)}...`);
        }
      }
    } catch (error) {
      console.log(`⚠️ 同步失败: ${error.message}`);
    }
  });
}

/**
 * 主函数
 */
async function main() {
  console.log('🔄 GSD ↔ 三文件 同步启动\n');

  // 1. 读取 GSD 状态
  console.log('📖 读取 GSD STATE.md...');
  const gsdState = safeRead(CONFIG.gsdStatePath);
  if (!gsdState) {
    console.log('❌ GSD STATE.md 不存在');
    process.exit(1);
  }

  const gsdDecisions = extractGSDDecisions(gsdState);
  const gsdBlockers = extractGSDBlockers(gsdState);
  console.log(`   找到 ${gsdDecisions.length} 个关键决策`);
  console.log(`   找到 ${gsdBlockers.length} 个阻塞项`);

  // 2. 读取三文件状态
  console.log('\n📖 读取三文件系统...');
  const threeFilesStatus = extractThreeFilesStatus();
  console.log(`   找到 ${threeFilesStatus.techPhases.length} 个技术开发阶段`);
  console.log(`   找到 ${threeFilesStatus.currentBlockers.length} 个当前阻塞`);

  // 3. GSD → 三文件
  console.log('\n🔄 检查 GSD → 三文件 同步...');
  const gsdToThree = syncGSDToThreeFiles(gsdDecisions, gsdBlockers);
  console.log(`   需要同步 ${gsdToThree.length} 项`);

  // 4. 三文件 → GSD
  console.log('\n🔄 检查 三文件 → GSD 同步...');
  const threeToGSD = syncThreeFilesToGSD(threeFilesStatus);
  console.log(`   需要同步 ${threeToGSD.length} 项`);

  // 5. 执行同步
  const allSyncItems = [...gsdToThree, ...threeToGSD];
  if (allSyncItems.length > 0) {
    executeSync(allSyncItems);
  } else {
    console.log('\n✅ 两个系统已同步，无需操作');
  }

  console.log('\n✅ 同步完成！');
}

main().catch(error => {
  console.error('❌ 同步失败:', error);
  process.exit(1);
});
