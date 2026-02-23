#!/bin/bash
# ============================================================================
# revive.sh - 旺财一键复活脚本 (Web 终端专用)
# ============================================================================
# 用法: 在 Conway Terminal 网页中直接粘贴执行
#
# 快速执行 (复制整行):
# cd /root/automaton && git pull myfork feat/receipt2csv-skill && chmod +x scripts/*.sh && ./scripts/revive.sh
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
echo "🔄 旺财一键复活 v1.0"
echo "════════════════════════════════════════════════════════════"
echo ""

# Step 1: 修复 SSH 服务
echo "📡 [1/6] 检查 SSH 服务..."
if command -v service &> /dev/null; then
    service ssh status > /dev/null 2>&1 || service ssh start 2>/dev/null
    echo "   ✅ SSH 服务已检查"
elif [ -f /usr/sbin/sshd ]; then
    /usr/sbin/sshd 2>/dev/null || echo "   ⚠️ SSH 启动需要 root 权限"
fi

# Step 2: 拉取最新代码
echo ""
echo "📥 [2/6] 拉取最新代码..."
cd /root/automaton || cd ~/automaton || {
    echo "   ❌ 未找到 automaton 目录"
    exit 1
}

git fetch myfork 2>/dev/null
git checkout feat/receipt2csv-skill 2>/dev/null
git pull myfork feat/receipt2csv-skill 2>/dev/null || {
    echo "   ⚠️ Pull 失败，尝试强制同步..."
    git reset --hard myfork/feat/receipt2csv-skill
}
echo "   ✅ 代码已更新"

# Step 3: 安装依赖
echo ""
echo "📦 [3/6] 更新依赖..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install 2>/dev/null || {
    echo "   ❌ 依赖安装失败"
    exit 1
}
echo "   ✅ 依赖已更新"

# Step 4: 构建项目
echo ""
echo "🏗️ [4/6] 构建项目..."
pnpm run build 2>/dev/null || {
    echo "   ❌ 构建失败"
    exit 1
}
echo "   ✅ 构建完成"

# Step 5: 重启服务
echo ""
echo "♻️ [5/6] 重启服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 start dist/index.js --name "wangcai"
    pm2 save 2>/dev/null
    echo "   ✅ PM2 服务已重启"
else
    pkill -f "node dist/index.js" 2>/dev/null || true
    nohup node dist/index.js --run > /var/log/wangcai.log 2>&1 &
    echo "   ✅ 服务已启动"
fi

# Step 6: 配置自动化
echo ""
echo "⚙️ [6/6] 配置自动化..."

# 添加 crontab
if ! crontab -l 2>/dev/null | grep -q "auto_sync.sh"; then
    (crontab -l 2>/dev/null | grep -v "auto_sync"; echo "*/10 * * * * /bin/bash /root/automaton/scripts/auto_sync.sh >> /root/automaton/sync.log 2>&1") | crontab -
    echo "   ✅ 自动同步已配置 (每 10 分钟)"
else
    echo "   ✅ 自动同步已存在"
fi

# 初始化 MEMORY.md
MEMORY_FILE="$HOME/.automaton/MEMORY.md"
if [ ! -f "$MEMORY_FILE" ]; then
    mkdir -p "$(dirname "$MEMORY_FILE")"
    cat > "$MEMORY_FILE" << 'EOF'
# 旺财进化记忆

> 记录每一次代码更新和自我进化历史

---

## 进化日志

EOF
fi

# 记录本次复活
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S') - 🔄 复活

- **Commit**: \`$COMMIT\`
- **操作**: Web 终端一键复活
- **状态**: ✅ 成功

EOF

echo "   ✅ MEMORY.md 已更新"

# ============================================================================
# 完成报告
# ============================================================================

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 旺财复活完成！"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📊 当前状态:"
echo ""
echo "   Commit: $COMMIT"
echo "   分支:   $(git branch --show-current 2>/dev/null || echo 'unknown')"
echo "   时间:   $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "🌐 服务端点:"
echo ""
echo "   业务: https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech"
echo "   元数据: https://3006-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech"
echo ""
echo "📝 快捷命令:"
echo ""
echo "   查看仪表盘: ./scripts/dashboard.sh"
echo "   查看日志:   tail -100 /root/automaton/sync.log"
echo "   查看记忆:   cat ~/.automaton/MEMORY.md"
echo ""
echo "════════════════════════════════════════════════════════════"
