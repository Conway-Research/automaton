#!/bin/bash
# 安全检查脚本 - 在提交前运行

echo "🔍 检查敏感信息泄露..."

# 检查是否有未屏蔽的 API 密钥
if grep -r "cnwy_k_" --include="*.ts" --include="*.js" --include="*.json" . 2>/dev/null | grep -v ".env" | grep -v "node_modules"; then
    echo "❌ 发现 Conway API 密钥泄露！"
    exit 1
fi

if grep -r "sk-" --include="*.ts" --include="*.js" --include="*.json" . 2>/dev/null | grep -v ".env" | grep -v "node_modules"; then
    echo "❌ 发现 OpenAI API 密钥泄露！"
    exit 1
fi

# 检查私钥
if grep -r "privateKey" --include="*.ts" --include="*.js" . 2>/dev/null | grep -v ".env" | grep -v "node_modules" | grep -v "types.ts"; then
    echo "⚠️  发现 privateKey 引用，请确保不是硬编码的私钥"
fi

echo "✅ 安全检查通过"
