#!/bin/bash
# ============================================================================
# setup-auto-deploy.sh - 配置云端自动拉取
# ============================================================================
# 在云端执行此脚本，设置每 5 分钟自动检查并拉取更新
#
# 用法 (在云端执行):
#   curl -sSL https://raw.githubusercontent.com/hanzhcn/automaton/feat/receipt2csv-skill/scripts/setup-auto-deploy.sh | bash
# ============================================================================

PROJECT_DIR="/root/automaton"
SCRIPT_PATH="$PROJECT_DIR/scripts/auto-pull.sh"

# 创建自动拉取脚本
cat > "$SCRIPT_PATH" << 'PULL_SCRIPT'
#!/bin/bash
# auto-pull.sh - 定时检查并拉取更新

cd /root/automaton

# 获取本地和远程的 commit hash
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse myfork/feat/receipt2csv-skill 2>/dev/null)

if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] 检测到新代码，开始自动部署..."
    /root/automaton/scripts/deploy.sh feat/receipt2csv-skill >> /var/log/wangcai-auto-deploy.log 2>&1
fi
PULL_SCRIPT

chmod +x "$SCRIPT_PATH"

# 添加 crontab 任务
(crontab -l 2>/dev/null | grep -v "auto-pull.sh"; echo "*/5 * * * * $SCRIPT_PATH") | crontab -

echo "✅ 自动部署已配置！"
echo "   - 检查间隔: 每 5 分钟"
echo "   - 日志文件: /var/log/wangcai-auto-deploy.log"
echo ""
echo "查看日志: tail -f /var/log/wangcai-auto-deploy.log"
