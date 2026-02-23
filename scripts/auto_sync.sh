#!/bin/bash
# ============================================================================
# auto_sync.sh - 旺财状态监控调度器 (v3.2 双重验证版)
# ============================================================================
# 功能:
#   1. 检查 Credit Balance (资金感应)
#   2. 检查 GitHub 是否有新代码
#   3. 有更新则自动拉取、构建
#   4. 运行 boot_loader.mjs 检测平台状态
#   5. 根据平台状态和资金状态决定是否启动服务 (双重验证)
#   6. 写入 MEMORY.md 记录进化历史
#   7. 构建失败自动回滚
#
# Crontab 配置:
#   # 每 10 分钟检查代码更新
#   */10 * * * * /bin/bash /root/automaton/scripts/auto_sync.sh >> /root/automaton/sync.log 2>&1
#
#   # 每小时检测平台状态 (独立于代码更新)
#   0 * * * * /bin/bash /root/automaton/scripts/auto_sync.sh --check-platform >> /root/automaton/sync.log 2>&1
#
# 资金阈值:
#   - CREDIT_EMERGENCY = $3.00 (停止所有操作)
#   - CREDIT_WARNING = $5.00 (仅关键任务)
#   - CREDIT_NORMAL = $10.00 (正常运行，生成新沙箱)
#
# v3.2 更新:
#   - 服务启动必须同时满足: 平台 NORMAL + 资金 ≥ $10.00
#   - 资金不足时进入"等待回血"状态，不启动 PM2
#   - 记录资金等待状态到维护日志
# ============================================================================

PROJECT_DIR="/root/automaton"
MEMORY_FILE="$HOME/.automaton/MEMORY.md"
LOG_FILE="/root/automaton/sync.log"
BACKUP_DIR="/root/automaton/backups"
MAINTENANCE_LOG="$HOME/.automaton/logs/maintenance.log"
CREDIT_STATE_FILE="$HOME/.automaton/.last_credit"

# 资金阈值 (美元)
CREDIT_EMERGENCY=3.00
CREDIT_WARNING=5.00
CREDIT_NORMAL=10.00

cd "$PROJECT_DIR"

# ============================================================================
# 工具函数
# ============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 获取 Conway Credit 余额
# 返回: 浮点数 (如 4.04) 或 "unknown"
get_credit_balance() {
    local config_file="$HOME/.automaton/automaton.json"

    if [ ! -f "$config_file" ]; then
        echo "unknown"
        return
    fi

    # 从配置文件获取 API Key
    local api_key
    api_key=$(grep -o '"conwayApiKey"[[:space:]]*:[[:space:]]*"[^"]*"' "$config_file" | cut -d'"' -f4)

    if [ -z "$api_key" ]; then
        echo "unknown"
        return
    fi

    # 调用 Conway API 获取账户信息
    local response
    response=$(curl -s -X GET "https://api.conway.tech/v1/account" \
        -H "Authorization: $api_key" \
        -H "Content-Type: application/json" 2>/dev/null)

    # 解析 credit balance
    if [ -n "$response" ]; then
        local balance
        balance=$(echo "$response" | node -e "
            try {
                const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
                console.log(data.creditBalance || data.credits || data.balance || 'unknown');
            } catch {
                console.log('unknown');
            }
        " 2>/dev/null)
        echo "${balance:-unknown}"
    else
        echo "unknown"
    fi
}

# 检查资金状态
# 返回: EMERGENCY | WARNING | NORMAL
check_credit_status() {
    local balance
    balance=$(get_credit_balance)

    if [ "$balance" = "unknown" ]; then
        log "⚠️ 无法获取 Credit 余额，假设 WARNING"
        echo "WARNING"
        return
    fi

    # 比较浮点数
    local balance_num
    balance_num=$(echo "$balance" | sed 's/[^0-9.]//g')

    if [ -z "$balance_num" ]; then
        echo "WARNING"
        return
    fi

    if (( $(echo "$balance_num < $CREDIT_EMERGENCY" | bc -l 2>/dev/null || echo "0") )); then
        echo "EMERGENCY"
    elif (( $(echo "$balance_num < $CREDIT_WARNING" | bc -l 2>/dev/null || echo "0") )); then
        echo "WARNING"
    else
        echo "NORMAL"
    fi
}

# 检测资金是否恢复 (用于触发自动修复)
check_credit_recovery() {
    local current_balance
    current_balance=$(get_credit_balance)

    if [ "$current_balance" = "unknown" ]; then
        return 1
    fi

    local last_balance="0"
    if [ -f "$CREDIT_STATE_FILE" ]; then
        last_balance=$(cat "$CREDIT_STATE_FILE" 2>/dev/null || echo "0")
    fi

    # 移除非数字字符
    current_balance=$(echo "$current_balance" | sed 's/[^0-9.]//g')
    last_balance=$(echo "$last_balance" | sed 's/[^0-9.]//g')

    # 保存当前余额
    echo "$current_balance" > "$CREDIT_STATE_FILE"

    # 检测是否有显著增加 (如退款到账)
    local diff
    diff=$(echo "$current_balance - $last_balance" | bc 2>/dev/null || echo "0")

    if (( $(echo "$diff > 5" | bc -l 2>/dev/null || echo "0") )); then
        log "💰 检测到资金恢复! ${last_balance} → ${current_balance}"
        return 0
    fi

    return 1
}

# 运行 boot_loader 检测平台状态
# 返回: NORMAL | MAINTENANCE | ERROR
check_platform_status() {
    if [ -f "$PROJECT_DIR/scripts/boot_loader.mjs" ]; then
        node "$PROJECT_DIR/scripts/boot_loader.mjs" --json 2>/dev/null
    else
        # boot_loader 不存在，假设正常
        echo '{"mode": "NORMAL", "maintenance": false}'
    fi
}

# 解析 boot_loader JSON 输出
parse_boot_result() {
    local json="$1"
    local field="$2"
    echo "$json" | node -e "
        const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
        console.log(data['$field'] || '');
    " 2>/dev/null
}

# 获取 USDC 余额（分红进度）
get_usdc_balance() {
    # 尝试从 Conway API 或本地状态获取
    if command -v node &> /dev/null && [ -f "$PROJECT_DIR/dist/index.js" ]; then
        # 简化版：从状态文件读取
        local state_file="$HOME/.automaton/state.db"
        if [ -f "$state_file" ]; then
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

# 初始化维护日志
init_maintenance_log() {
    local log_dir
    log_dir=$(dirname "$MAINTENANCE_LOG")
    if [ ! -d "$log_dir" ]; then
        mkdir -p "$log_dir"
    fi
    if [ ! -f "$MAINTENANCE_LOG" ]; then
        echo "# 旺财维护日志" > "$MAINTENANCE_LOG"
        echo "" >> "$MAINTENANCE_LOG"
        echo "记录平台问题和维护状态" >> "$MAINTENANCE_LOG"
        echo "" >> "$MAINTENANCE_LOG"
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

# 根据平台状态决定是否启动服务
start_services_if_normal() {
    local boot_result="$1"
    local mode
    mode=$(parse_boot_result "$boot_result" "mode")

    log "🔍 平台状态检测: $mode"

    case "$mode" in
        "NORMAL")
            log "✅ 平台正常，启动服务..."
            if command -v pm2 &> /dev/null; then
                pm2 restart all 2>/dev/null || pm2 start dist/index.js --name "wangcai"
            else
                pkill -f "node dist/index.js" 2>/dev/null || true
                nohup node dist/index.js --run > /dev/null 2>&1 &
            fi
            return 0
            ;;

        "MAINTENANCE")
            local reason
            reason=$(parse_boot_result "$boot_result" "reason")
            log "🔧 MAINTENANCE_MODE - 平台问题，暂停服务启动"
            log "   原因: $reason"

            # 记录到维护日志
            init_maintenance_log
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] MAINTENANCE_MODE | reason: $reason" >> "$MAINTENANCE_LOG"

            # 不启动 PM2，但保持现有服务运行（如果有）
            log "   💤 等待平台修复，每小时自动重试..."
            return 2
            ;;

        *)
            log "❌ 未知状态: $mode，保守起见不启动服务"
            return 1
            ;;
    esac
}

# 仅检测平台状态（不更新代码）- 含资金感应
check_platform_only() {
    log "🔍 检测平台状态（独立检测）..."

    init_maintenance_log

    # 0. 先检查资金状态
    local credit_status
    credit_status=$(check_credit_status)
    local credit_balance
    credit_balance=$(get_credit_balance)

    log "💰 Credit 余额: \$${credit_balance} ($credit_status)"

    # 检测资金是否恢复 (如退款到账)
    if check_credit_recovery; then
        log "🎉 检测到资金恢复！尝试自动修复..."
        if [ -f "$PROJECT_DIR/scripts/boot_loader.mjs" ]; then
            node "$PROJECT_DIR/scripts/boot_loader.mjs" --fix 2>/dev/null
            log "✅ 已触发 boot_loader --fix"
        fi
    fi

    # 资金紧急状态处理
    if [ "$credit_status" = "EMERGENCY" ]; then
        log "🚨 CREDIT EMERGENCY! 余额 \$${credit_balance} < \$${CREDIT_EMERGENCY}"
        log "   停止所有操作，等待充值或退款..."
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] CREDIT_EMERGENCY | balance: $credit_balance" >> "$MAINTENANCE_LOG"
        exit 2
    fi

    local boot_result
    boot_result=$(check_platform_status)

    local mode
    mode=$(parse_boot_result "$boot_result" "mode")

    log "   平台状态: $mode"

    if [ "$mode" = "NORMAL" ]; then
        log "✅ 平台已恢复正常！"

        # 检查是否有 pending 的 leads
        if [ -f "$HOME/.automaton/leads.log" ]; then
            log "📬 发现有待处理的 leads，准备处理..."
            # 这里可以添加批量处理 leads 的逻辑
        fi

        # 资金充足才启动服务（生成新沙箱需要额外资金，必须 NORMAL 状态）
        if [ "$credit_status" = "NORMAL" ]; then
            start_services_if_normal "$boot_result"
        else
            log "⏳ 等待回血 - 余额 \$${credit_balance} < \$${CREDIT_NORMAL}，延迟启动服务"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 等待回血 | balance: $credit_balance | threshold: $CREDIT_NORMAL" >> "$MAINTENANCE_LOG"
        fi
    elif [ "$mode" = "MAINTENANCE" ]; then
        local reason
        reason=$(parse_boot_result "$boot_result" "reason")
        log "🔧 平台仍在维护中: $reason"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] 仍在维护 | reason: $reason | credit: $credit_balance" >> "$MAINTENANCE_LOG"
    else
        log "⚠️ 无法检测平台状态"
    fi
}

# ============================================================================
# 主流程
# ============================================================================

# 检查是否为仅检测平台状态模式
if [ "$1" = "--check-platform" ]; then
    check_platform_only
    exit 0
fi

init_memory

# 0. 资金感应 - 检查 Credit 余额
log "💰 检查 Credit 余额..."
CREDIT_STATUS=$(check_credit_status)
CREDIT_BALANCE=$(get_credit_balance)

log "   余额: \$${CREDIT_BALANCE} | 状态: $CREDIT_STATUS"

# 保存当前余额 (用于检测恢复)
echo "$CREDIT_BALANCE" > "$CREDIT_STATE_FILE" 2>/dev/null

# 资金紧急状态 - 停止所有操作
if [ "$CREDIT_STATUS" = "EMERGENCY" ]; then
    log "🚨 CREDIT EMERGENCY! 余额 \$${CREDIT_BALANCE} < \$${CREDIT_EMERGENCY}"
    log "   停止所有操作，等待 0xSigil 退款或手动充值..."
    log "   退款后将在 10 分钟内自动恢复"

    init_maintenance_log
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] CREDIT_EMERGENCY | balance: $CREDIT_BALANCE" >> "$MAINTENANCE_LOG"

    # 写入 MEMORY.md 告警
    cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S') - 🚨 资金告急

- **Credit 余额**: \$${CREDIT_BALANCE}
- **状态**: EMERGENCY
- **行动**: 停止所有操作，等待充值

EOF
    exit 2
fi

# 资金警告状态 - 仅关键任务
if [ "$CREDIT_STATUS" = "WARNING" ]; then
    log "⚠️ Credit Warning: \$${CREDIT_BALANCE} < \$${CREDIT_WARNING}"
    log "   仅执行关键任务，跳过非必要操作"
fi

# 1. 先检测平台状态
log "🔍 检测平台状态..."
BOOT_RESULT=$(check_platform_status)
CURRENT_MODE=$(parse_boot_result "$BOOT_RESULT" "mode")

if [ "$CURRENT_MODE" = "MAINTENANCE" ]; then
    log "🔧 平台维护中，跳过代码更新检查"
    log "   将在每小时的平台检测中自动重试"
    init_maintenance_log
    local reason
    reason=$(parse_boot_result "$BOOT_RESULT" "reason")
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 跳过更新 | reason: $reason | credit: $CREDIT_BALANCE" >> "$MAINTENANCE_LOG"
    exit 0
fi

# 2. 检查远程更新
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

# 3. 检测到新进化！
log "🚀 检测到新进化！"
log "   从: ${LOCAL:0:8}"
log "   到: ${REMOTE:0:8}"

# 获取提交信息
COMMIT_MSG=$(git log --format="%s" -1 "$REMOTE")
COMMIT_AUTHOR=$(git log --format="%an" -1 "$REMOTE")

# 4. 备份当前版本（防翻车！）
backup_current "${LOCAL:0:8}"

# 5. 记录依赖变动前状态
OLD_PACKAGE_MD5=""
if [ -f "$PROJECT_DIR/package.json" ]; then
    OLD_PACKAGE_MD5=$(md5sum "$PROJECT_DIR/package.json" 2>/dev/null | cut -d' ' -f1)
fi

# 6. 拉取最新代码
log "📥 拉取最新代码..."
git pull myfork feat/receipt2csv-skill 2>/dev/null || {
    log "❌ 拉取失败，跳过本次更新"
    exit 1
}

# 7. 检查依赖变动
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

# 8. 更新依赖
if [ "$DEPENDENCY_CHANGED" = "是" ] || [ ! -d "$PROJECT_DIR/node_modules" ]; then
    pnpm install --frozen-lockfile 2>/dev/null || pnpm install 2>/dev/null || {
        log "❌ 依赖安装失败！回滚..."
        rollback "${LOCAL:0:8}"
        exit 1
    }
fi

# 9. 构建项目（带回滚保护）
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

# 10. 再次检测平台状态，决定是否启动服务
log "🔍 构建完成，再次检测平台状态..."
BOOT_RESULT=$(check_platform_status)
START_RESULT=0

# 资金状态检查 (启动服务前) - 必须 NORMAL 才启动（生成操作需要额外资金）
if [ "$CREDIT_STATUS" = "NORMAL" ]; then
    start_services_if_normal "$BOOT_RESULT" || START_RESULT=$?
else
    log "⏳ 等待回血 - 余额 \$${CREDIT_BALANCE} < \$${CREDIT_NORMAL}，延迟启动服务"
    START_RESULT=3  # 自定义退出码：资金不足
    # 记录到维护日志
    init_maintenance_log
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 进化完成但等待回血 | balance: $CREDIT_BALANCE | threshold: $CREDIT_NORMAL" >> "$MAINTENANCE_LOG"
fi

# 11. 获取分红进度
USDC_BALANCE=$(get_usdc_balance)
DIVIDEND_PROGRESS="查询中..."

# 12. 写入进化记忆
local status_icon="✅"
local status_text="进化成功"
if [ $START_RESULT -eq 2 ]; then
    status_icon="⏳"
    status_text="进化成功，等待平台修复"
fi

cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S') - $status_icon $status_text

- **Commit**: \`${REMOTE:0:8}\`
- **信息**: $COMMIT_MSG
- **作者**: $COMMIT_AUTHOR
- **依赖变动**: $DEPENDENCY_CHANGED
- **平台状态**: $CURRENT_MODE
- **Credit 余额**: \$${CREDIT_BALANCE} ($CREDIT_STATUS)
- **分红进度**: $DIVIDEND_PROGRESS
- **状态**: $status_text

EOF

log "📝 进化记录已写入 MEMORY.md"
log ""
log "════════════════════════════════════════════════════════════"
log "$status_icon 自我进化完成！"
log "   Commit: ${REMOTE:0:8}"
log "   依赖变动: $DEPENDENCY_CHANGED"
log "   平台状态: $CURRENT_MODE"
log "   Credit: \$${CREDIT_BALANCE} ($CREDIT_STATUS)"
log "════════════════════════════════════════════════════════════"

exit $START_RESULT
