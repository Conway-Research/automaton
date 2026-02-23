#!/bin/bash
# ============================================================================
# setup-local-hooks.sh - 本地一键配置 Git Hooks
# ============================================================================
# 用法: ./scripts/setup-local-hooks.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$PROJECT_DIR/.git/hooks"

echo "════════════════════════════════════════════════════════════"
echo "🔧 配置本地 Git Hooks"
echo "════════════════════════════════════════════════════════════"

# 检查 .git 目录是否存在
if [ ! -d "$PROJECT_DIR/.git" ]; then
    echo "❌ 未找到 .git 目录，请确保在 Git 仓库中运行此脚本"
    exit 1
fi

# 创建 hooks 目录（如果不存在）
mkdir -p "$HOOKS_DIR"

# 创建 post-push hook
cat > "$HOOKS_DIR/post-push" << 'EOF'
#!/bin/bash
# Post-push hook - 推送后显示通知

# 获取当前分支和最新 commit
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log --format="%s" -1 2>/dev/null || echo "unknown")

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 代码已上云！"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📦 推送信息:"
echo "   分支:   $BRANCH"
echo "   Commit: $COMMIT"
echo "   信息:   $COMMIT_MSG"
echo ""
echo "⏳ 预计 10 分钟内，旺财将完成自我进化..."
echo ""
echo "   查看进化日志:"
echo "   ssh root@107.175.6.137 'tail -20 /root/automaton/sync.log'"
echo ""
echo "☕ 你可以去喝咖啡了！"
echo ""

# macOS 通知
if command -v osascript &> /dev/null; then
    osascript -e "display notification \"Commit: $COMMIT\n预计 10 分钟内完成进化\" with title \"🚀 代码已上云！\" sound name \"Glass\"" 2>/dev/null
fi
EOF

chmod +x "$HOOKS_DIR/post-push"

echo ""
echo "✅ Git Hooks 配置完成！"
echo ""
echo "   已安装:"
echo "   • post-push: 推送后自动提醒"
echo ""
echo "   测试方法:"
echo "   git push myfork feat/receipt2csv-skill"
echo ""
echo "════════════════════════════════════════════════════════════"
