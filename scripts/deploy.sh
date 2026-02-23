#!/bin/bash
# ============================================================================
# deploy.sh - 旺财云端自动化部署脚本
# ============================================================================
# 用法: ./scripts/deploy.sh [branch]
# 示例: ./scripts/deploy.sh feat/receipt2csv-skill
#
# 功能:
#   1. 从 GitHub 拉取最新代码
#   2. 安装/更新依赖
#   3. 编译 TypeScript → dist/
#   4. 重启 PM2 服务
#   5. 显示部署状态
# ============================================================================

set -e  # 遇到错误立即退出

# 配置
BRANCH="${1:-feat/receipt2csv-skill}"
REMOTE="myfork"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "════════════════════════════════════════════════════════════"
echo "🚀 旺财云端部署开始"
echo "════════════════════════════════════════════════════════════"
echo "📁 项目目录: $PROJECT_DIR"
echo "🌿 目标分支: $BRANCH"
echo "🌐 远程仓库: $REMOTE"
echo ""

# Step 1: 同步代码
echo "📥 [1/5] 同步代码..."
git fetch "$REMOTE" 2>/dev/null || {
    echo "❌ 无法 fetch 远程仓库，请检查网络连接"
    exit 1
}

git checkout "$BRANCH" 2>/dev/null || {
    echo "❌ 无法切换到分支 $BRANCH"
    exit 1
}

git pull "$REMOTE" "$BRANCH" 2>/dev/null || {
    echo "⚠️ pull 失败，尝试强制同步..."
    git reset --hard "$REMOTE/$BRANCH"
}

echo "   ✅ 代码同步完成"
echo ""

# Step 2: 更新依赖
echo "📦 [2/5] 更新依赖..."
if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install
else
    pnpm install
fi
echo "   ✅ 依赖更新完成"
echo ""

# Step 3: 构建项目
echo "🏗️ [3/5] 构建项目..."
pnpm run build 2>/dev/null || {
    echo "❌ 构建失败，请检查 TypeScript 错误"
    exit 1
}
echo "   ✅ 构建完成"
echo ""

# Step 4: 重启服务
echo "♻️ [4/5] 重启旺财服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 start dist/index.js --name "wangcai"
    echo "   ✅ PM2 服务已重启"
else
    echo "   ⚠️ PM2 未安装，尝试直接启动..."
    nohup node dist/index.js --run > /dev/null 2>&1 &
    echo "   ✅ 服务已后台启动"
fi
echo ""

# Step 5: 显示状态
echo "📊 [5/5] 部署状态"
echo "────────────────────────────────────────────────────────────"
echo "   Commit: $(git rev-parse --short HEAD)"
echo "   分支:   $(git branch --show-current)"
echo "   时间:   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

if command -v pm2 &> /dev/null; then
    echo "   PM2 状态:"
    pm2 status 2>/dev/null | head -10
fi
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ 部署完成！"
echo "════════════════════════════════════════════════════════════"
