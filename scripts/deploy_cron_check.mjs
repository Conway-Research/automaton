#!/usr/bin/env node
/**
 * 部署 cron_check.sh 到 Conway Sandbox
 *
 * 用法:
 *   node scripts/deploy_cron_check.mjs
 *
 * 功能:
 *   1. 读取本地 cron_check.sh
 *   2. 上传到 Sandbox 的 /root/receipt2csv/
 *   3. 设置执行权限
 *   4. 更新 crontab
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const SANDBOX_ID = 'f08a2e14b6b539fbd71836259c2fb688';
const API_URL = 'https://api.conway.tech';
const API_KEY = process.env.CONWAY_API_KEY || '';

// 文件路径
const LOCAL_CRON_CHECK = join(__dirname, '..', '..', 'receipt2csv', 'cron_check.sh');
const REMOTE_CRON_CHECK = '/root/receipt2csv/cron_check.sh';

/**
 * Conway API 请求
 */
async function conwayRequest(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Conway API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * 上传文件到 Sandbox
 */
async function uploadFile(remotePath, content) {
  console.log(`📤 上传文件: ${remotePath}`);
  await conwayRequest(`/v1/sandboxes/${SANDBOX_ID}/files/upload/json`, {
    path: remotePath,
    content: content
  });
  console.log(`   ✅ 上传成功`);
}

/**
 * 在 Sandbox 中执行命令
 */
async function execCommand(command, timeout = 30000) {
  console.log(`🔧 执行命令: ${command}`);
  const result = await conwayRequest(`/v1/sandboxes/${SANDBOX_ID}/exec`, {
    command,
    timeout
  });

  if (result.exit_code !== 0) {
    console.log(`   ⚠️ 退出码: ${result.exit_code}`);
    if (result.stderr) console.log(`   错误: ${result.stderr}`);
  } else {
    console.log(`   ✅ 执行成功`);
  }

  return result;
}

/**
 * 主函数
 */
async function main() {
  console.log('\n🚀 部署 cron_check.sh 到 Conway Sandbox\n');
  console.log(`   Sandbox ID: ${SANDBOX_ID}`);
  console.log(`   本地文件: ${LOCAL_CRON_CHECK}`);
  console.log(`   远程路径: ${REMOTE_CRON_CHECK}\n`);

  // 检查 API Key
  if (!API_KEY) {
    console.error('❌ 错误: 未设置 CONWAY_API_KEY 环境变量');
    process.exit(1);
  }

  try {
    // 1. 读取本地文件
    console.log('📖 读取本地 cron_check.sh...');
    const cronContent = readFileSync(LOCAL_CRON_CHECK, 'utf-8');
    console.log(`   文件大小: ${cronContent.length} 字节\n`);

    // 2. 上传到 Sandbox
    await uploadFile(REMOTE_CRON_CHECK, cronContent);

    // 3. 设置执行权限
    await execCommand(`chmod +x ${REMOTE_CRON_CHECK}`);

    // 4. 验证文件
    const verifyResult = await execCommand(`ls -la ${REMOTE_CRON_CHECK}`);
    console.log(`   ${verifyResult.stdout?.trim()}\n`);

    // 5. 更新 crontab (如果还没有)
    const crontabCheck = await execCommand('crontab -l 2>/dev/null || echo "empty"');
    const cronLine = '*/5 * * * * /bin/bash /root/receipt2csv/cron_check.sh';

    if (crontabCheck.stdout?.includes(cronLine)) {
      console.log('✅ crontab 已配置，无需更新\n');
    } else {
      console.log('📝 更新 crontab...');
      await execCommand(`(crontab -l 2>/dev/null; echo '${cronLine}') | crontab -`);

      // 验证 crontab
      const verifyCron = await execCommand('crontab -l');
      console.log(`   当前 crontab:\n${verifyCron.stdout}\n`);
    }

    // 6. 手动执行一次测试
    console.log('🧪 手动执行测试...');
    const testResult = await execCommand('/bin/bash /root/receipt2csv/cron_check.sh', 60000);
    console.log(`   输出:\n${testResult.stdout || '(无输出)'}\n`);

    console.log('════════════════════════════════════════');
    console.log('✅ 部署完成！');
    console.log('════════════════════════════════════════\n');
    console.log('📋 后续步骤:');
    console.log('   1. 等待 5 分钟让 crontab 自动执行');
    console.log('   2. 检查日志: cat /root/receipt2csv/cron_check.log');
    console.log('   3. 验证服务: curl localhost:8080/health\n');

  } catch (error) {
    console.error(`\n❌ 部署失败: ${error.message}\n`);
    process.exit(1);
  }
}

main();
