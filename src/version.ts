/**
 * 旺财版本信息
 *
 * 此文件与 SOUL.md 保持同步更新
 * boot_loader.mjs 会在启动时检查版本一致性
 *
 * 更新规则：
 * 1. 修改 SOUL.md 时递增版本号
 * 2. 同步更新此文件的 VERSION 和 VERSION_NAME
 * 3. git commit 记录变更
 */

export const VERSION = "4.3";
export const VERSION_NAME = "Self-Learning Enabled";

/**
 * 版本历史 (与 SOUL.md Section XI 保持一致)
 */
export const VERSION_HISTORY = [
  {
    version: "4.3",
    date: "2026-02-24",
    changes:
      "Section XII: 自学习机制 (learning_loop.mjs, gsd_sync.mjs); GSD 24策略分析",
  },
  {
    version: "4.2",
    date: "2026-02-24",
    changes:
      "Section III: 动态路由; Section IV: MAINTENANCE_MODE 报价保护; Section VII: 平台维护模式; Section IX: 上下文感知 Credits",
  },
  {
    version: "4.1",
    date: "2026-02-23",
    changes: "Section V: 自我感知能力; Section X: 知识更新机制",
  },
  {
    version: "4.0",
    date: "2026-02-22",
    changes: "Section IX: 生存意志、自动分红",
  },
] as const;

/**
 * 获取完整版本信息
 */
export function getVersionInfo(): string {
  return `v${VERSION} - ${VERSION_NAME}`;
}

/**
 * 检查版本是否与 SOUL.md 一致
 * (在运行时读取 SOUL.md 进行对比)
 */
export async function checkVersionConsistency(): Promise<{
  consistent: boolean;
  codeVersion: string;
  soulVersion: string | null;
}> {
  const codeVersion = VERSION;
  let soulVersion: string | null = null;

  try {
    const fs = await import("fs");
    const path = await import("path");
    const soulPath = path.join(process.cwd(), "SOUL.md");

    if (fs.existsSync(soulPath)) {
      const content = fs.readFileSync(soulPath, "utf-8");
      const match = content.match(/\*\*版本\*\*:\s*v?([\d.]+)/);
      if (match) {
        soulVersion = match[1];
      }
    }
  } catch {
    // 忽略读取错误
  }

  return {
    consistent: codeVersion === soulVersion,
    codeVersion,
    soulVersion,
  };
}
