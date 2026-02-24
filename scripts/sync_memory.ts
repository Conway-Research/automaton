#!/usr/bin/env npx ts-node
/**
 * Sync Memory - 旺财记忆同步脚本
 *
 * 功能:
 * 1. 从 GSD 原始日志中提炼"灵魂碎片"
 * 2. 同步到 findings.md
 * 3. 更新 SOUL.md 版本号
 *
 * 使用:
 *   npx ts-node scripts/sync_memory.ts
 *   npx ts-node scripts/sync_memory.ts --dry-run
 *
 * @version 1.0.0
 * @created 2026-02-24
 */

import * as fs from 'fs';
import * as path from 'path';

// 配置
const CONFIG = {
  // GSD 相关文件
  gsdStatePath: path.join(process.cwd(), '.planning', 'STATE.md'),
  gsdRoadmapPath: path.join(process.cwd(), '.planning', 'ROADMAP.md'),

  // 三文件系统
  findingsPath: path.join(process.cwd(), 'findings.md'),
  taskPlanPath: path.join(process.cwd(), 'task_plan.md'),
  progressPath: path.join(process.cwd(), 'progress.md'),

  // SOUL 文件
  soulPath: path.join(process.cwd(), 'SOUL.md'),

  // 版本文件
  versionPath: path.join(process.cwd(), 'src', 'version.ts'),
};

interface MemoryFragment {
  type: 'decision' | 'learning' | 'blocker' | 'achievement';
  content: string;
  source: string;
  timestamp: string;
}

/**
 * 从 GSD STATE.md 提取关键决策
 */
function extractDecisionsFromGSD(): MemoryFragment[] {
  const fragments: MemoryFragment[] = [];

  try {
    const stateContent = fs.readFileSync(CONFIG.gsdStatePath, 'utf-8');

    // 提取 Key Decisions
    const decisionMatch = stateContent.match(/### Key Decisions\n([\s\S]*?)(?=\n###|$)/);
    if (decisionMatch) {
      const decisions = decisionMatch[1]
        .split('\n')
        .filter(line => line.match(/^\d+\./))
        .map(line => line.replace(/^\d+\.\s*/, '').trim());

      decisions.forEach(decision => {
        fragments.push({
          type: 'decision',
          content: decision,
          source: 'GSD STATE.md',
          timestamp: new Date().toISOString(),
        });
      });
    }

    // 提取 Blockers
    const blockerMatch = stateContent.match(/### Blockers\n([\s\S]*?)(?=\n---|\n##|$)/);
    if (blockerMatch) {
      const blockers = blockerMatch[1]
        .split('\n')
        .filter(line => line.includes('[ ]'))
        .map(line => line.replace(/- \[ \]\s*/, '').trim());

      blockers.forEach(blocker => {
        if (blocker && !blocker.startsWith('#')) {
          fragments.push({
            type: 'blocker',
            content: blocker,
            source: 'GSD STATE.md',
            timestamp: new Date().toISOString(),
          });
        }
      });
    }
  } catch (error) {
    console.error('读取 GSD STATE.md 失败:', error);
  }

  return fragments;
}

/**
 * 生成 findings.md 格式的内容
 */
function generateFindingsContent(fragments: MemoryFragment[]): string {
  const lines: string[] = [];

  lines.push(`### ${getNextFindingNumber()}. 记忆同步 - ${new Date().toISOString().split('T')[0]}`);
  lines.push('');
  lines.push('**来源**: GSD 系统自动同步');
  lines.push('');

  // 决策
  const decisions = fragments.filter(f => f.type === 'decision');
  if (decisions.length > 0) {
    lines.push('**关键决策**:');
    decisions.forEach(d => {
      lines.push(`- ${d.content}`);
    });
    lines.push('');
  }

  // 阻塞
  const blockers = fragments.filter(f => f.type === 'blocker');
  if (blockers.length > 0) {
    lines.push('**当前阻塞**:');
    blockers.forEach(b => {
      lines.push(`- ${b.content}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

/**
 * 获取下一个发现编号
 */
function getNextFindingNumber(): number {
  try {
    const findingsContent = fs.readFileSync(CONFIG.findingsPath, 'utf-8');
    const matches = findingsContent.match(/### (\d+)\. /g);
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const number = parseInt(lastMatch.match(/\d+/)?.[0] || '0');
      return number + 1;
    }
  } catch (error) {
    // 文件不存在或其他错误
  }
  return 1;
}

/**
 * 更新 SOUL.md 版本号
 */
function updateSoulVersion(patch: boolean = true): void {
  try {
    let soulContent = fs.readFileSync(CONFIG.soulPath, 'utf-8');

    // 查找当前版本
    const versionMatch = soulContent.match(/\(v([\d.]+)\)/);
    if (!versionMatch) {
      console.log('未找到 SOUL.md 版本号');
      return;
    }

    const currentVersion = versionMatch[1];
    const parts = currentVersion.split('.').map(Number);

    if (patch && parts.length >= 3) {
      parts[2]++; // 增加 patch 版本
    }

    const newVersion = parts.join('.');
    soulContent = soulContent.replace(/\(v[\d.]+\)/, `(v${newVersion})`);

    fs.writeFileSync(CONFIG.soulPath, soulContent);
    console.log(`✅ SOUL.md 版本已更新: v${currentVersion} → v${newVersion}`);

    // 同步更新 version.ts
    updateVersionTs(newVersion);

  } catch (error) {
    console.error('更新 SOUL.md 版本失败:', error);
  }
}

/**
 * 更新 src/version.ts
 */
function updateVersionTs(version: string): void {
  try {
    let versionContent = fs.readFileSync(CONFIG.versionPath, 'utf-8');

    // 更新 VERSION 常量
    versionContent = versionContent.replace(
      /export const VERSION = '[\d.]+';/,
      `export const VERSION = '${version}';`
    );

    fs.writeFileSync(CONFIG.versionPath, versionContent);
    console.log(`✅ src/version.ts 已同步: v${version}`);
  } catch (error) {
    console.error('更新 version.ts 失败:', error);
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('🔄 开始记忆同步...');
  console.log('');

  // 1. 提取记忆碎片
  console.log('📋 从 GSD 系统提取记忆碎片...');
  const fragments = extractDecisionsFromGSD();
  console.log(`   找到 ${fragments.length} 个碎片`);

  if (fragments.length === 0) {
    console.log('⚠️ 没有新的记忆碎片需要同步');
    return;
  }

  // 2. 生成 findings.md 内容
  const findingsContent = generateFindingsContent(fragments);

  if (dryRun) {
    console.log('');
    console.log('📝 将要添加到 findings.md 的内容:');
    console.log('---');
    console.log(findingsContent);
    console.log('---');
    console.log('');
    console.log('🔍 Dry run 模式，未实际写入');
    return;
  }

  // 3. 追加到 findings.md
  try {
    const findingsContent_orig = fs.readFileSync(CONFIG.findingsPath, 'utf-8');
    // 在"安全发现"章节前插入
    const insertPoint = findingsContent_orig.indexOf('## 🔐 安全发现');
    if (insertPoint > 0) {
      const newContent =
        findingsContent_orig.slice(0, insertPoint) +
        findingsContent +
        findingsContent_orig.slice(insertPoint);
      fs.writeFileSync(CONFIG.findingsPath, newContent);
      console.log('✅ findings.md 已更新');
    }
  } catch (error) {
    console.error('更新 findings.md 失败:', error);
  }

  // 4. 更新版本号
  console.log('');
  console.log('🔢 更新版本号...');
  updateSoulVersion(true);

  console.log('');
  console.log('✅ 记忆同步完成！');
}

main().catch(error => {
  console.error('❌ 记忆同步失败:', error);
  process.exit(1);
});
