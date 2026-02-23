#!/bin/bash
# ============================================================================
# auto_sync.sh - 旺财的自进化检查脚本
# ============================================================================
# 功能:
#   1. 检查 GitHub 是否有新代码
#   2. 有更新则自动拉取、构建、重启
#   3. 写入 MEMORY.md 记录进化历史
#
# Crontab 配置 (每 10 分钟检查一次):
#   */10 * * * * /bin/bash /root/automaton/scripts/auto_sync.sh >> /root/automaton/sync.log 2>&1
# ============================================================================

set -e

PROJECT_DIR="/root/automaton"
MEMORY_FILE="$HOME/.automaton/MEMORY.md"
LOG_FILE="/root/automaton/sync.log"

cd "$PROJECT_DIR"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 初始化 MEMORY.md（如果不存在）
if [ ! -f "$MEMORY_FILE" ]; then
    mkdir -p "$(dirname "$MEMORY_FILE")"
    cat > "$MEMORY_FILE" << 'EOF'
# 旺财进化记忆

> 记录每一次代码更新和自我进化历史

---

## 进化日志

EOF
fi

# 1. 检查远程更新
log "🔍 检查远程更新..."
git fetch myfork feat/receipt2csv-skill 2>/dev/null || {
    log "⚠️ 无法连接 GitHub，跳过本次检查"
    exit 0
}

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse myfork/feat/receipt2csv-skill)

if [ "$LOCAL" = "$REMOTE" ]; then
    log "💤 代码已是最新，继续打工..."
    exit 0
fi

# 2. 检测到新进化！
log "🚀 检测到新进化！"
log "   从: $LOCAL"
log "   到: $REMOTE"

# 获取提交信息
COMMIT_MSG=$(git log --format="%s" -1 "$REMOTE")
COMMIT_AUTHOR=$(git log --format="%an" -1 "$REMOTE")

# 3. 执行拉取与构建
log "📥 拉取最新代码..."
git pull myfork feat/receipt2csv-skill 2>/dev/null || {
    log "❌ 拉取失败，尝试强制同步..."
    git reset --hard "myfork/feat/receipt2csv-skill"
}

log "📦 更新依赖..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

log "🏗️ 构建项目..."
pnpm run build 2>/dev/null || {
    log "❌ 构建失败！"
    exit 1
}

# 4. 重启业务服务
log "♻️ 重启旺财服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 start dist/index.js --name "wangcai"
else
    pkill -f "node dist/index.js" 2>/dev/null || true
    nohup node dist/index.js --run > /dev/null 2>&1 &
fi

# 5. 写入进化记忆（关键！）
cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S')

- **Commit**: \`$REMOTE\`
- **信息**: $COMMIT_MSG
- **作者**: $COMMIT_AUTHOR
- **状态**: ✅ 进化成功

EOF

log "📝 进化记录已写入 MEMORY.md"
log ""
log "════════════════════════════════════════════════════════════"
log "✅ 自我进化完成！"
log "════════════════════════════════════════════════════════════"
