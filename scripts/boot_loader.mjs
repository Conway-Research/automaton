#!/usr/bin/env node
/**
 * boot_loader.mjs - 旺财启动检测脚本 (v4.2)
 *
 * 基于 SOUL.md v4.2 的动态路由逻辑：
 * 1. 读取 automaton.json 获取当前 sandbox_id
 * 2. 调用 Conway API 检查 sandbox 状态
 * 3. 检测 short_id 是否存在
 * 4. 验证端点可达性
 * 5. 决定进入 NORMAL 或 MAINTENANCE_MODE
 *
 * 用法:
 *   node scripts/boot_loader.mjs
 *   node scripts/boot_loader.mjs --json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── 配置 ─────────────────────────────────────────────────────────────

const CONWAY_API_URL = 'https://api.conway.tech';
const SANDBOX_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 小时重试间隔

// ─── 工具函数 ─────────────────────────────────────────────────────────

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = {
    'info': '📊',
    'warn': '⚠️',
    'error': '❌',
    'success': '✅',
    'mode': '🔧'
  }[level] || '📊';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function getAutomatonConfig() {
  const configPath = path.join(os.homedir(), '.automaton', 'automaton.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function getVersion() {
  const versionPath = path.join(process.cwd(), 'src', 'version.ts');
  if (fs.existsSync(versionPath)) {
    const content = fs.readFileSync(versionPath, 'utf-8');
    const match = content.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : 'unknown';
  }
  return 'unknown';
}

async function conwayApiRequest(endpoint, apiKey) {
  const url = `${CONWAY_API_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Conway API 错误: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function checkEndpointHealth(url) {
  try {
    const response = await fetch(url, { method: 'GET', timeout: 10000 });
    return response.ok;
  } catch (error) {
    return false;
  }
}

// ─── 核心逻辑 ─────────────────────────────────────────────────────────

async function bootstrap() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');

  const result = {
    version: getVersion(),
    soulVersion: '4.2',
    timestamp: new Date().toISOString(),
    mode: 'UNKNOWN',
    sandbox: null,
    url: null,
    services: [],
    maintenance: false,
    reason: null
  };

  try {
    // Step 1: 读取配置
    log('读取 automaton.json 配置...');
    const config = getAutomatonConfig();
    const sandboxId = config.sandboxId;
    const apiKey = config.conwayApiKey;

    if (!sandboxId || !apiKey) {
      throw new Error('缺少 sandboxId 或 conwayApiKey');
    }

    result.sandbox = {
      id: sandboxId,
      shortId: null
    };

    // Step 2: 查询 sandbox 状态
    log(`查询 Sandbox 状态: ${sandboxId}`);
    const sandboxInfo = await conwayApiRequest(`/v1/sandboxes/${sandboxId}`, apiKey);

    result.sandbox.shortId = sandboxInfo.short_id || null;
    result.sandbox.status = sandboxInfo.status || 'unknown';

    // Step 3: 检测 short_id
    const hasShortId = !!sandboxInfo.short_id;

    if (!hasShortId) {
      log('short_id 为 null - 平台网关问题', 'warn');
      result.maintenance = true;
      result.reason = 'short_id: null - 平台网关问题';

      // 尝试自定义子域名
      log('尝试自定义子域名...', 'warn');
      // 这里可以添加自定义子域名逻辑
      // 目前直接进入维护模式
    }

    // Step 4: 构建服务 URL
    const services = [
      { port: 8080, name: 'Receipt2CSV', path: '/health' },
      { port: 3006, name: 'URL Metadata', path: '/health' }
    ];

    for (const service of services) {
      let serviceUrl;

      if (hasShortId) {
        // 使用默认域名
        serviceUrl = `https://${service.port}-${sandboxId}.life.conway.tech`;
      } else {
        // 使用 sandbox_id (可能 404)
        serviceUrl = `https://${service.port}-${sandboxId}.life.conway.tech`;
      }

      const healthUrl = `${serviceUrl}${service.path}`;
      const isHealthy = !result.maintenance && await checkEndpointHealth(healthUrl);

      result.services.push({
        name: service.name,
        port: service.port,
        url: serviceUrl,
        healthUrl,
        healthy: isHealthy
      });
    }

    // Step 5: 决定模式
    if (result.maintenance) {
      result.mode = 'MAINTENANCE';
      log('进入 MAINTENANCE_MODE - 平台问题，等待修复', 'mode');

      // 记录到维护日志
      const logDir = path.join(os.homedir(), '.automaton', 'logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const logPath = path.join(logDir, 'maintenance.log');
      const logEntry = `${result.timestamp} | MAINTENANCE_MODE | reason: ${result.reason}\n`;
      fs.appendFileSync(logPath, logEntry);

    } else {
      const allHealthy = result.services.every(s => s.healthy);
      if (allHealthy) {
        result.mode = 'NORMAL';
        result.url = result.services[0].url;
        log('所有服务健康 - 进入 NORMAL 模式', 'success');
      } else {
        result.mode = 'DEGRADED';
        result.reason = '部分服务不健康';
        log('部分服务不健康 - 进入 DEGRADED 模式', 'warn');
      }
    }

    // 版本一致性检查
    if (result.version !== result.soulVersion) {
      log(`版本不一致: 代码=${result.version}, 灵魂=${result.soulVersion}`, 'warn');
      result.versionMismatch = true;
    }

  } catch (error) {
    result.mode = 'ERROR';
    result.reason = error.message;
    log(`启动失败: ${error.message}`, 'error');

    // 检查是否为平台问题
    if (error.message.includes('5') || error.message.includes('Conway API')) {
      result.maintenance = true;
      result.mode = 'MAINTENANCE';
      result.reason = `平台 API 错误: ${error.message}`;
      log('平台 API 错误 - 进入 MAINTENANCE_MODE', 'mode');
    }
  }

  // 输出结果
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + '═'.repeat(60));
    console.log('🚀 旺财启动检测结果 (v4.2)');
    console.log('═'.repeat(60));
    console.log(`\n📍 模式: ${result.mode}`);
    console.log(`📦 版本: 代码=${result.version}, 灵魂=${result.soulVersion}`);

    if (result.sandbox) {
      console.log(`\n🌐 Sandbox:`);
      console.log(`   ID: ${result.sandbox.id}`);
      console.log(`   short_id: ${result.sandbox.shortId || 'null ⚠️'}`);
      console.log(`   状态: ${result.sandbox.status || 'unknown'}`);
    }

    if (result.services.length > 0) {
      console.log(`\n📊 服务状态:`);
      for (const svc of result.services) {
        const status = svc.healthy ? '🟢' : '🔴';
        console.log(`   ${status} ${svc.name} (${svc.port}): ${svc.url}`);
      }
    }

    if (result.maintenance) {
      console.log(`\n⚠️ 维护原因: ${result.reason}`);
      console.log(`   将每小时重试检测平台状态`);
    }

    if (result.url) {
      console.log(`\n✅ 主服务 URL: ${result.url}`);
    }

    console.log('\n' + '═'.repeat(60));
  }

  // 返回退出码
  process.exit(result.mode === 'NORMAL' ? 0 : (result.maintenance ? 2 : 1));
}

// ─── 入口 ─────────────────────────────────────────────────────────────

bootstrap().catch(error => {
  console.error('❌ 启动脚本崩溃:', error);
  process.exit(1);
});
