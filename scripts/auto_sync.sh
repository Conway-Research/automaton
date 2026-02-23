#!/bin/bash
# ============================================================================
# auto_sync.sh - 旺财的自进化检查脚本 (v2.0 防翻车版)
# ============================================================================
# 功能:
#   1. 检查 GitHub 是否有新代码
#   2. 有更新则自动拉取、构建、重启
#   3. 写入 MEMORY.md 记录进化历史
#   4. 构建失败自动回滚
#   5. 记录依赖变动和分红进度
#
# Crontab 配置 (每 10 分钟检查一次):
#   */10 * * * * /bin/bash /root/automaton/scripts/auto_sync.sh >> /root/automaton/sync.log 2>&1
# ============================================================================

PROJECT_DIR="/root/automaton"
MEMORY_FILE="$HOME/.automaton/MEMORY.md"
LOG_FILE="/root/automaton/sync.log"
BACKUP_DIR="/root/automaton/backups"

cd "$PROJECT_DIR"

# ============================================================================
# 工具函数
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 获取 USDC 余额（分红进度）
get_usdc_balance() {
    # 尝试从 Conway API 或本地状态获取
    if command -v node &> /dev/null && [ -f "$PROJECT_DIR/dist/index.js" ]; then
        # 简化版：从状态文件读取
        local state_file="$HOME/.automaton/state.db"
        if [ -f "$state_file" ]; then
            # 这里需要根据实际状态存储方式调整
            echo "N/A"
        else
            echo "N/A"
        fi
    else
        echo "N/A"
    fi
}

# 初始化 MEMORY.md（如果不存在）
init_memory() {
    if [ ! -f "$MEMORY_FILE" ]; then
        mkdir -p "$(dirname "$MEMORY_FILE")"
        cat > "$MEMORY_FILE" << 'EOF'
# 旺财进化记忆

> 记录每一次代码更新和自我进化历史

---

## 进化日志

EOF
    fi
}

# 备份当前版本
backup_current() {
    local commit="$1"
    mkdir -p "$BACKUP_DIR"
    cp -r "$PROJECT_DIR/dist" "$BACKUP_DIR/dist-$commit" 2>/dev/null || true
    cp "$PROJECT_DIR/package.json" "$BACKUP_DIR/package-$commit.json" 2>/dev/null || true
    log "📦 已备份当前版本到 $BACKUP_DIR/"
}

# 回滚到指定版本
rollback() {
    local commit="$1"
    log "🔄 回滚到 $commit..."
    git reset --hard "$commit" 2>/dev/null || true
    if [ -d "$BACKUP_DIR/dist-$commit" ]; then
        cp -r "$BACKUP_DIR/dist-$commit" "$PROJECT_DIR/dist" 2>/dev/null || true
        log "✅ 已从备份恢复 dist/"
    fi
}

# ============================================================================
# 主流程
# ============================================================================

init_memory

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
log "   从: ${LOCAL:0:8}"
log "   到: ${REMOTE:0:8}"

# 获取提交信息
COMMIT_MSG=$(git log --format="%s" -1 "$REMOTE")
COMMIT_AUTHOR=$(git log --format="%an" -1 "$REMOTE")

# 3. 备份当前版本（防翻车！）
backup_current "${LOCAL:0:8}"

# 4. 记录依赖变动前状态
OLD_PACKAGE_MD5=""
if [ -f "$PROJECT_DIR/package.json" ]; then
    OLD_PACKAGE_MD5=$(md5sum "$PROJECT_DIR/package.json" 2>/dev/null | cut -d' ' -f1)
fi

# 5. 拉取最新代码
log "📥 拉取最新代码..."
git pull myfork feat/receipt2csv-skill 2>/dev/null || {
    log "❌ 拉取失败，跳过本次更新"
    exit 1
}

# 6. 检查依赖变动
NEW_PACKAGE_MD5=""
if [ -f "$PROJECT_DIR/package.json" ]; then
    NEW_PACKAGE_MD5=$(md5sum "$PROJECT_DIR/package.json" 2>/dev/null | cut -d' ' -f1)
fi

DEPENDENCY_CHANGED="否"
if [ "$OLD_PACKAGE_MD5" != "$NEW_PACKAGE_MD5" ]; then
    DEPENDENCY_CHANGED="是"
    log "📦 检测到依赖变动，更新依赖..."
    log "   旧 MD5: ${OLD_PACKAGE_MD5:-无}"
    log "   新 MD5: ${NEW_PACKAGE_MD5:-无}"
fi

# 7. 更新依赖
if [ "$DEPENDENCY_CHANGED" = "是" ] || [ ! -d "$PROJECT_DIR/node_modules" ]; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install 2>/dev/null || {
        log "❌ 依赖安装失败！回滚..."
        rollback "${LOCAL:0:8}"
        exit 1
    }
fi

# 8. 构建项目（带回滚保护）
log "🏗️ 构建项目..."
if ! pnpm run build 2>/dev/null; then
    log "❌ 构建失败！执行回滚..."
    rollback "${LOCAL:0:8}"
    log "⚠️ 已回滚到稳定版本，服务继续运行"

    # 记录失败到 MEMORY.md
    cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S') - ❌ 进化失败

- **目标 Commit**: \`${REMOTE:0:8}\`
- **信息**: $COMMIT_MSG
- **作者**: $COMMIT_AUTHOR
- **状态**: ❌ 构建失败，已回滚
- **回滚到**: \`${LOCAL:0:8}\`

EOF
    exit 1
fi

# 9. 重启业务服务
log "♻️ 重启旺财服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 start dist/index.js --name "wangcai"
else
    pkill -f "node dist/index.js" 2>/dev/null || true
    nohup node dist/index.js --run > /dev/null 2>&1 &
fi

# 10. 获取分红进度
USDC_BALANCE=$(get_usdc_balance)
DIVIDEND_PROGRESS="查询中..."

# 11. 写入进化记忆
cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S') - ✅ 进化成功

- **Commit**: \`${REMOTE:0:8}\`
- **信息**: $COMMIT_MSG
- **作者**: $COMMIT_AUTHOR
- **依赖变动**: $DEPENDENCY_CHANGED
- **分红进度**: $DIVIDEND_PROGRESS
- **状态**: ✅ 进化成功

EOF

log "📝 进化记录已写入 MEMORY.md"
log ""
log "════════════════════════════════════════════════════════════"
log "✅ 自我进化完成！"
log "   Commit: ${REMOTE:0:8}"
log "   依赖变动: $DEPENDENCY_CHANGED"
log "════════════════════════════════════════════════════════════"
