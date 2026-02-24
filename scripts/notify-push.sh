#!/bin/bash
# ============================================================================
# notify-push.sh - 本地 Push 后自动提醒
# ============================================================================
# 功能: git push 后弹出通知，告诉你代码已上云，预计 10 分钟内旺财完成进化
#
# 用法:
#   1. 将此脚本复制到项目的 .git/hooks/ 目录
#   2. 命名为 post-push (无扩展名)
#   3. chmod +x .git/hooks/post-push
#
# 或者直接运行: ./scripts/notify-push.sh
# ============================================================================

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取当前分支和最新 commit
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log --format="%s" -1 2>/dev/null || echo "unknown")

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ 代码已上云！${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}📦 推送信息:${NC}"
echo "   分支:   $BRANCH"
echo "   Commit: $COMMIT"
echo "   信息:   $COMMIT_MSG"
echo ""
echo -e "${YELLOW}⏳ 预计 10 分钟内，旺财将完成自我进化...${NC}"
echo ""
echo "   Conway Terminal:"
echo "   https://4d75bbdd405b3e45203e4e26177b6989.life.conway.tech"
echo ""
echo "   查看进化日志 (在 Terminal 中):"
echo "   tail -20 /root/automaton/sync.log"
echo ""
echo "   查看进化记忆:"
echo "   cat ~/.automaton/MEMORY.md"
echo ""
echo -e "${GREEN}☕ 你可以去喝咖啡了！${NC}"
echo ""

# macOS 通知
if command -v osascript &> /dev/null; then
    osascript -e "display notification \"Commit: $COMMIT\n预计 10 分钟内完成进化\" with title \"🚀 代码已上云！\" sound name \"Glass\"" 2>/dev/null
fi
