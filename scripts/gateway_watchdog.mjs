#!/usr/bin/env node
/**
 * Gateway Watchdog - 旺财网关守护进程
 *
 * 功能:
 * 1. 检测沙盒网关状态 (3939 端口)
 * 2. 遇到 502 时自动尝试 PM2 重启
 * 3. 每 5 分钟重试一次，直到恢复
 * 4. 记录恢复日志
 *
 * 使用:
 *   node scripts/gateway_watchdog.mjs
 *   node scripts/gateway_watchdog.mjs --once  (只检查一次)
 *
 * 由 auto_sync.sh 调用，或独立运行
 *
 * @version 1.0.0
 * @created 2026-02-24
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// 配置
const CONFIG = {
  // 沙盒服务 URL (通过 Conway 网关)
  sandboxUrl: process.env.WANGCAI_URL || 'https://wangcai.life.conway.tech',

  // 本地端口检查 (VPS 上运行时)
  localPort: 3939,

  // 检查间隔 (毫秒)
  checkInterval: 5 * 60 * 1000, // 5 分钟

  // 最大重试次数 (0 = 无限)
  maxRetries: 0,

  // 日志目录
  logDir: '/var/log/automaton',

  // 路径锁定 - 绝对禁止使用这些路径
  forbiddenPaths: ['/Users/', '/Users/hanzhmacbookair/'],
};

// 日志函数
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}`;
  console.log(logLine);

  // 写入日志文件
  try {
    if (!existsSync(CONFIG.logDir)) {
      mkdirSync(CONFIG.logDir, { recursive: true });
    }
    const logFile = join(CONFIG.logDir, 'watchdog.log');
    writeFileSync(logFile, logLine + '\n', { flag: 'a' });
  } catch (e) {
    // 忽略日志写入错误
  }
}

// 检查路径安全性
function validatePath(path) {
  for (const forbidden of CONFIG.forbiddenPaths) {
    if (path.includes(forbidden)) {
      throw new Error(`🚫 路径安全违规: ${path} 包含禁止的路径 ${forbidden}`);
    }
  }
  return true;
}

// 检查网关状态
async function checkGatewayStatus() {
  const startTime = Date.now();

  try {
    // 尝试访问沙盒服务
    const response = await fetch(CONFIG.sandboxUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(10000), // 10 秒超时
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        status: 'OK',
        statusCode: response.status,
        responseTime,
        message: `网关正常，响应时间: ${responseTime}ms`,
      };
    } else if (response.status === 502) {
      return {
        status: 'BAD_GATEWAY',
        statusCode: 502,
        responseTime,
        message: '502 Bad Gateway - 网关断层',
      };
    } else {
      return {
        status: 'ERROR',
        statusCode: response.status,
        responseTime,
        message: `HTTP ${response.status}`,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'NETWORK_ERROR',
      statusCode: 0,
      responseTime,
      message: error.message,
    };
  }
}

// 检查本地 PM2 服务状态
function checkPM2Status() {
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf-8' });
    const processes = JSON.parse(output);

    const wangcaiProcesses = processes.filter(p =>
      p.name.includes('wangcai') ||
      p.name.includes('automaton') ||
      p.name.includes('receipt2csv')
    );

    return {
      running: wangcaiProcesses.length > 0,
      processes: wangcaiProcesses.map(p => ({
        name: p.name,
        status: p.pm2_env.status,
        uptime: p.pm2_env.pm_uptime,
      })),
    };
  } catch (error) {
    return {
      running: false,
      error: error.message,
    };
  }
}

// 尝试自愈 - 重启 PM2 服务
function attemptSelfHeal() {
  log('🔧 开始自愈尝试...');

  try {
    // 验证工作目录
    const workDir = '/root/automaton';
    validatePath(workDir);

    // 1. 检查是否需要重新编译
    log('📦 检查是否需要重新编译...');
    try {
      execSync('pnpm build', {
        cwd: workDir,
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 120000,
      });
      log('✅ 编译成功');
    } catch (e) {
      log(`⚠️ 编译警告: ${e.message}`, 'WARN');
    }

    // 2. 重启 PM2 服务
    log('🔄 重启 PM2 服务...');
    try {
      execSync('pm2 restart all', { encoding: 'utf-8' });
      log('✅ PM2 重启命令已发送');
    } catch (e) {
      log(`⚠️ PM2 重启警告: ${e.message}`, 'WARN');
    }

    // 3. 等待服务启动
    log('⏳ 等待服务启动...');
    return new Promise(resolve => {
      setTimeout(() => {
        const pm2Status = checkPM2Status();
        log(`📊 PM2 状态: ${JSON.stringify(pm2Status)}`);
        resolve(pm2Status.running);
      }, 10000); // 等待 10 秒
    });

  } catch (error) {
    log(`❌ 自愈失败: ${error.message}`, 'ERROR');
    return false;
  }
}

// 主检查循环
async function runWatchdog(once = false) {
  log('🚀 Gateway Watchdog 启动');
  log(`📋 目标 URL: ${CONFIG.sandboxUrl}`);
  log(`⏱️ 检查间隔: ${CONFIG.checkInterval / 1000} 秒`);

  let retryCount = 0;

  const check = async () => {
    log('🔍 检查网关状态...');

    // 检查网关
    const gatewayStatus = await checkGatewayStatus();
    log(`🌐 网关状态: ${gatewayStatus.status} - ${gatewayStatus.message}`);

    // 检查 PM2
    const pm2Status = checkPM2Status();
    log(`⚡ PM2 状态: ${pm2Status.running ? '运行中' : '未运行'}`);

    if (gatewayStatus.status === 'OK') {
      log('✅ 一切正常，无需操作');
      retryCount = 0;

      if (once) {
        process.exit(0);
      }
    } else if (gatewayStatus.status === 'BAD_GATEWAY') {
      log('🚨 检测到 502 错误，尝试自愈...', 'WARN');
      retryCount++;

      const healed = await attemptSelfHeal();

      if (healed) {
        log('✅ 自愈成功，服务已恢复');
      } else {
        log(`⚠️ 自愈未成功，将在 ${CONFIG.checkInterval / 1000} 秒后重试 (重试 #${retryCount})`, 'WARN');
      }

      if (once) {
        process.exit(healed ? 0 : 1);
      }
    } else {
      log(`⚠️ 网络错误: ${gatewayStatus.message}`, 'WARN');

      if (once) {
        process.exit(1);
      }
    }
  };

  // 首次检查
  await check();

  // 如果不是单次运行，设置定时检查
  if (!once) {
    setInterval(check, CONFIG.checkInterval);
    log('🔄 定时检查已启动');
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const onceMode = args.includes('--once');

// 启动
runWatchdog(onceMode).catch(error => {
  log(`❌ Watchdog 致命错误: ${error.message}`, 'ERROR');
  process.exit(1);
});
