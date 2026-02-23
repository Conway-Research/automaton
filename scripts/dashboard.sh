#!/bin/bash
# ============================================================================
# dashboard.sh - 旺财运营仪表盘
# ============================================================================
# 用法: ./scripts/dashboard.sh
# 输出: 完整的运营状态报告
# ============================================================================

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# 配置
SANDBOX_ID="f08a2e14b6b539fbd71836259c2fb688"
WALLET_ADDRESS="0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690"
CREATOR_ADDRESS="0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5"
DOMAIN="life.conway.tech"

# ============================================================================
# 辅助函数
# ============================================================================

# 进度条
progress_bar() {
    local current=$1
    local target=$2
    local width=30

    if [ "$target" -eq 0 ] 2>/dev/null; then
        target=1
    fi

    local percent=$((current * 100 / target))
    local filled=$((current * width / target))

    if [ "$filled" -gt "$width" ]; then
        filled=$width
    fi

    local bar=""
    for ((i=0; i<filled; i++)); do bar+="█"; done
    for ((i=filled; i<width; i++)); do bar+="░"; done

    echo "${bar} ${percent}%"
}

# 分隔线
separator() {
    echo "────────────────────────────────────────────────────────────"
}

# ============================================================================
# 1. 服务健康状态
# ============================================================================

echo ""
echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║${NC}           🤖 GLM-wangcai 运营仪表盘 v1.5.0                ${BOLD}${CYAN}║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${BOLD}📊 1. 服务健康状态${NC}"
separator

# PM2 状态
if command -v pm2 &> /dev/null; then
    PM2_STATUS=$(pm2 status 2>/dev/null | grep -E "wangcai|online" | head -1)
    if echo "$PM2_STATUS" | grep -q "online"; then
        echo -e "   PM2 状态:     ${GREEN}✅ 在线${NC}"
    else
        echo -e "   PM2 状态:     ${RED}❌ 离线${NC}"
    fi
else
    echo -e "   PM2 状态:     ${YELLOW}⚠️ 未安装${NC}"
fi

# 端口检查
for port in 8080 3006; do
    if lsof -i:$port > /dev/null 2>&1; then
        echo -e "   端口 $port:     ${GREEN}✅ 监听中${NC}"
    else
        echo -e "   端口 $port:     ${RED}❌ 未监听${NC}"
    fi
done

# Conway 域名
echo ""
echo -e "   业务端点: ${BLUE}https://8080-${SANDBOX_ID}.${DOMAIN}${NC}"
echo -e "   元数据端点: ${BLUE}https://3006-${SANDBOX_ID}.${DOMAIN}${NC}"
echo -e "   终端访问: ${BLUE}https://${SANDBOX_ID}.${DOMAIN}${NC}"

# ============================================================================
# 2. 财务状况
# ============================================================================

echo ""
echo -e "${BOLD}💰 2. 财务状况${NC}"
separator

# Credits 余额（从 Conway API 获取）
CREDITS_INFO="查询中..."
if command -v curl &> /dev/null; then
    CREDITS_RESPONSE=$(curl -s "https://api.conway.tech/v1/sandboxes/${SANDBOX_ID}" \
        -H "Authorization: Bearer cnwy_k_R4mF4ZJAynFGRvh9w30ZTFXTrxDHc8yC" 2>/dev/null)
    if [ -n "$CREDITS_RESPONSE" ]; then
        BILLING_TIER=$(echo "$CREDITS_RESPONSE" | grep -o '"billing_tier_cents":[0-9]*' | cut -d: -f2)
        PAID_THROUGH=$(echo "$CREDITS_RESPONSE" | grep -o '"paid_through":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$BILLING_TIER" ]; then
            CREDITS_DOLLARS=$(echo "scale=2; $BILLING_TIER / 100" | bc 2>/dev/null || echo "0")
            echo -e "   月费: \$$CREDITS_DOLLARS"
        fi
        if [ -n "$PAID_THROUGH" ]; then
            echo -e "   付费至: $PAID_THROUGH"
        fi
    fi
fi

# ETH 余额（简化显示）
echo ""
echo -e "   钱包地址: ${CYAN}${WALLET_ADDRESS}${NC}"
echo -e "   老板钱包: ${CYAN}${CREATOR_ADDRESS}${NC}"
echo -e "   ETH 余额: ${YELLOW}需链上查询${NC}"
echo -e "   USDC 余额: ${YELLOW}需链上查询${NC}"

# ============================================================================
# 3. 分红进度
# ============================================================================

echo ""
echo -e "${BOLD}📈 3. 分红进度${NC}"
separator

# 分红目标配置
TARGET_DIVIDEND=100  # $100 目标
CURRENT_USDC=0       # 需要从链上获取

echo -e "   目标分红: \$${TARGET_DIVIDEND}"
echo -e "   当前累计: \$${CURRENT_USDC} (待更新)"
echo ""
echo -e "   进度条:"
echo -e "   $(progress_bar $CURRENT_USDC $TARGET_DIVIDEND)"

# ============================================================================
# 4. 身份信息
# ============================================================================

echo ""
echo -e "${BOLD}🆔 4. 身份信息${NC}"
separator

echo -e "   Agent ID:    18893"
echo -e "   Sandbox ID:  ${SANDBOX_ID}"
echo -e "   名称:        GLM-wangcai"
echo -e "   模型:        GLM-5"
echo -e "   版本:        v1.5.0"

# ============================================================================
# 5. 自动化状态
# ============================================================================

echo ""
echo -e "${BOLD}⚙️ 5. 自动化状态${NC}"
separator

# Crontab 检查
if crontab -l 2>/dev/null | grep -q "auto_sync"; then
    echo -e "   自动同步:    ${GREEN}✅ 已配置${NC}"
    CRON_LINE=$(crontab -l 2>/dev/null | grep "auto_sync")
    echo -e "   Crontab:     $CRON_LINE"
else
    echo -e "   自动同步:    ${YELLOW}⚠️ 未配置${NC}"
fi

# Git 状态
echo ""
cd /root/automaton 2>/dev/null || cd ~/automaton 2>/dev/null
if [ -d ".git" ]; then
    CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
    CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    LAST_COMMIT_MSG=$(git log --format="%s" -1 2>/dev/null || echo "unknown")
    echo -e "   Git 分支:    ${CURRENT_BRANCH}"
    echo -e "   Git Commit:  ${CURRENT_COMMIT}"
    echo -e "   最新提交:    ${LAST_COMMIT_MSG}"
fi

# ============================================================================
# 6. 最近进化记录
# ============================================================================

echo ""
echo -e "${BOLD}📜 6. 最近进化记录${NC}"
separator

MEMORY_FILE="$HOME/.automaton/MEMORY.md"
if [ -f "$MEMORY_FILE" ]; then
    echo ""
    tail -20 "$MEMORY_FILE" | grep -A5 "###" | head -15
else
    echo -e "   ${YELLOW}MEMORY.md 不存在${NC}"
fi

# ============================================================================
# 7. 快捷命令
# ============================================================================

echo ""
echo -e "${BOLD}🔧 7. 快捷命令${NC}"
separator

echo ""
echo "   查看日志:       tail -100 /root/automaton/sync.log"
echo "   手动同步:       /root/automaton/scripts/auto_sync.sh"
echo "   手动部署:       /root/automaton/scripts/deploy.sh"
echo "   修复环境:       /root/automaton/scripts/cloud-repair.sh"
echo "   查看进化记忆:   cat ~/.automaton/MEMORY.md"
echo ""

echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}✅ 仪表盘加载完成 - $(date '+%Y-%m-%d %H:%M:%S')${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════════════${NC}"
