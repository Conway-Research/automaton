#!/bin/bash
# ============================================================================
# cloud-repair.sh - 云端环境一键修复脚本
# ============================================================================
# 用法: 在 Conway Terminal 中执行
#   curl -sSL https://raw.githubusercontent.com/hanzhcn/automaton/feat/receipt2csv-skill/scripts/cloud-repair.sh | bash
# ============================================================================

echo "════════════════════════════════════════════════════════════"
echo "🔧 旺财云端环境修复"
echo "════════════════════════════════════════════════════════════"

# 1. 拉取最新代码
echo ""
echo "📥 [1/5] 拉取最新代码..."
cd /root/automaton
git fetch myfork 2>/dev/null || true
git checkout feat/receipt2csv-skill 2>/dev/null || true
git pull myfork feat/receipt2csv-skill 2>/dev/null || git reset --hard myfork/feat/receipt2csv-skill

# 2. 检查 3006 端口服务
echo ""
echo "🔍 [2/5] 检查 3006 端口 (URL Metadata 服务)..."
if lsof -i:3006 > /dev/null 2>&1; then
    echo "   ✅ 3006 端口有进程运行"
    lsof -i:3006
else
    echo "   ⚠️ 3006 端口无进程，尝试启动..."
    # 检查是否有 metadata 服务脚本
    if [ -f "/root/receipt2csv/app.py" ]; then
        cd /root/receipt2csv
        nohup python app.py > /var/log/metadata.log 2>&1 &
        echo "   ✅ 已启动 Metadata 服务"
    else
        echo "   ❌ 未找到 Metadata 服务脚本"
    fi
fi

# 3. 安装依赖并构建
echo ""
echo "📦 [3/5] 更新依赖..."
cd /root/automaton
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo ""
echo "🏗️ [4/5] 构建项目..."
pnpm run build 2>/dev/null || {
    echo "   ❌ 构建失败"
    exit 1
}

# 4. 重启服务
echo ""
echo "♻️ [5/5] 重启服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 start dist/index.js --name "wangcai"
    echo "   ✅ PM2 服务已重启"
    pm2 status
else
    pkill -f "node dist/index.js" 2>/dev/null || true
    nohup node dist/index.js --run > /var/log/wangcai.log 2>&1 &
    echo "   ✅ 服务已后台启动"
fi

# 5. 初始化 MEMORY.md（如果不存在）
MEMORY_FILE="$HOME/.automaton/MEMORY.md"
if [ ! -f "$MEMORY_FILE" ]; then
    mkdir -p "$(dirname "$MEMORY_FILE")"
    cat > "$MEMORY_FILE" << 'EOF'
# 旺财进化记忆

> 记录每一次代码更新和自我进化历史

---

## 进化日志

EOF
    echo ""
    echo "📝 已创建 MEMORY.md"
fi

# 6. 添加进化记录
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log --format="%s" -1 2>/dev/null || echo "unknown")

cat >> "$MEMORY_FILE" << EOF

### $(date '+%Y-%m-%d %H:%M:%S') - 云端修复

- **Commit**: \`$COMMIT\`
- **信息**: $COMMIT_MSG
- **操作**: 云端环境一键修复
- **状态**: ✅ 完成

EOF

# 7. 配置 crontab（如果未配置）
if ! crontab -l 2>/dev/null | grep -q "auto_sync.sh"; then
    (crontab -l 2>/dev/null | grep -v "auto_sync.sh"; echo "*/10 * * * * /bin/bash /root/automaton/scripts/auto_sync.sh >> /root/automaton/sync.log 2>&1") | crontab -
    echo ""
    echo "⏰ 已配置自动同步 (每 10 分钟)"
fi

# 8. 显示服务状态
echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 服务状态"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "   业务端点: https://8080-4d75bbdd405b3e45203e4e26177b6989.life.conway.tech"
echo "   元数据端点: https://3006-4d75bbdd405b3e45203e4e26177b6989.life.conway.tech"
echo "   Conway Terminal: https://4d75bbdd405b3e45203e4e26177b6989.life.conway.tech"
echo ""
echo "   Commit: $COMMIT"
echo "   时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ 修复完成！"
echo "════════════════════════════════════════════════════════════"
