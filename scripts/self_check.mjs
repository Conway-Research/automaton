#!/usr/bin/env node
/**
 * 旺财自我感知能力 - 端点健康检查 v1.1
 *
 * 功能:
 * 1. 端点完整性检查 - 对比预期端点 vs 实际响应
 * 2. 版本一致性检查 - 代码版本 vs 运行版本
 * 3. 功能可用性验证 - 实际调用测试
 * 4. 动态服务发现 - 从 Agent Card 读取服务列表 (v1.1 新增)
 * 5. 生成结构化报告 - 可用于心跳任务
 *
 * 使用:
 *   node scripts/self_check.mjs [--json] [--fix] [--dynamic]
 *
 * 参数:
 *   --json     输出 JSON 格式
 *   --fix      尝试自动修复（重启服务）
 *   --dynamic  从 Agent Card 动态发现服务 (v1.1)
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { config } from 'dotenv';

config({ path: `${homedir()}/Documents/自动赚钱/automaton/.env` });

// ========== 配置 ==========
const CONFIG = {
  SANDBOX_ID: '4d75bbdd405b3e45203e4e26177b6989',
  BASE_URL: 'https://wangcai.life.conway.tech',
  SERVICE_8080: 'https://wangcai.life.conway.tech',
  SERVICE_3006: 'https://3006-4d75bbdd405b3e45203e4e26177b6989.life.conway.tech',
  CONWAY_API_URL: process.env.CONWAY_API_URL || 'https://api.conway.tech',
  CONWAY_API_KEY: process.env.CONWAY_API_KEY,
  CODE_VERSION: '1.5.0',  // 当前代码版本
  STATE_DB: `${homedir()}/.automaton/state.db`,
  AGENT_CARD_URL: 'https://wangcai.life.conway.tech/.well-known/agent-card.json'
};

/**
 * 从 Agent Card 动态发现服务 (v1.1 新增)
 * 当旺财创建新服务时，只需更新 Agent Card，自我感知会自动发现
 */
async function discoverServicesFromAgentCard() {
  try {
    const response = execSync(
      `curl -s --max-time 10 "${CONFIG.AGENT_CARD_URL}"`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    const agentCard = JSON.parse(response);

    // 从 services 数组构建服务映射
    const discoveredServices = {};

    if (agentCard.services && Array.isArray(agentCard.services)) {
      for (const service of agentCard.services) {
        // 跳过 agentWallet 类型的服务（不是 HTTP 服务）
        if (service.name === 'agentWallet') continue;

        // 解析服务端点
        if (service.endpoint && service.endpoint.startsWith('http')) {
          const url = new URL(service.endpoint);

          // 从 Conway Sandbox 子域名提取端口号
          // 格式: https://8080-{sandbox_id}.life.conway.tech/path
          const hostname = url.hostname;
          const portMatch = hostname.match(/^(\d+)-/);

          let port;
          if (portMatch) {
            port = portMatch[1];  // 从子域名提取端口
          } else {
            port = url.port || (url.protocol === 'https:' ? '443' : '80');
          }

          if (!discoveredServices[port]) {
            discoveredServices[port] = {
              name: service.name || `Service ${port}`,
              baseUrl: `${url.protocol}//${url.host}`,
              endpoints: []
            };
          }

          // 添加健康检查端点
          discoveredServices[port].endpoints.push({
            method: 'GET',
            path: '/health',
            expectStatus: 200,
            dynamic: true,
            serviceName: service.name
          });
        }
      }
    }

    // 如果没有发现服务，回退到默认配置
    if (Object.keys(discoveredServices).length === 0) {
      console.log('⚠️ Agent Card 未包含 HTTP 服务端点，使用默认配置');
      return null;
    }

    return discoveredServices;
  } catch (e) {
    console.log(`⚠️ 无法从 Agent Card 发现服务: ${e.message}`);
    return null;
  }
}

// ========== 预期端点定义 ==========
const EXPECTED_ENDPOINTS = {
  '8080': {
    name: 'Receipt2CSV',
    endpoints: [
      { method: 'GET', path: '/health', expectStatus: 200, expectFields: ['status', 'version', 'startTime'] },
      { method: 'GET', path: '/stats/public', expectStatus: 200, expectFields: ['service', 'stats'] },  // 嵌套结构
      { method: 'GET', path: '/stats/badge', expectStatus: 200, expectType: 'image/svg+xml' },
      { method: 'POST', path: '/convert', expectStatus: [200, 402], body: { text: 'test' } },
      { method: 'POST', path: '/review', expectStatus: [200, 400], body: { rating: 5, comment: 'test' } }
    ]
  },
  '3006': {
    name: 'URL Metadata',
    endpoints: [
      { method: 'GET', path: '/health', expectStatus: 200 },  // 可能没有 JSON 响应
      { method: 'POST', path: '/preview', expectStatus: [200, 400, 500], body: { url: 'https://example.com' } }  // 500 = Sandbox 无外网
    ]
  }
};

// ========== 检查结果类 ==========
class CheckResult {
  constructor() {
    this.timestamp = new Date().toISOString();
    this.healthy = true;
    this.issues = [];
    this.passed = [];
    this.versionMismatch = false;
    this.services = {};
  }

  addIssue(port, endpoint, message) {
    this.healthy = false;
    this.issues.push({ port, endpoint, message });
  }

  addPassed(port, endpoint, details) {
    this.passed.push({ port, endpoint, details });
  }
}

/**
 * 检查单个端点
 */
async function checkEndpoint(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  const method = endpoint.method || 'GET';

  try {
    let response;
    if (method === 'GET') {
      response = execSync(
        `curl -s -w "\\n%{http_code}\\n%{content_type}" --max-time 10 "${url}"`,
        { encoding: 'utf-8', timeout: 15000 }
      );
    } else {
      const body = JSON.stringify(endpoint.body || {});
      response = execSync(
        `curl -s -w "\\n%{http_code}\\n%{content_type}" --max-time 10 -X POST -H "Content-Type: application/json" -d '${body}' "${url}"`,
        { encoding: 'utf-8', timeout: 15000 }
      );
    }

    // 解析响应
    const lines = response.trim().split('\n');
    const httpCode = parseInt(lines[lines.length - 2] || '0');
    const contentType = lines[lines.length - 1] || '';
    const body = lines.slice(0, -2).join('\n');

    // 检查状态码
    const expectedStatus = Array.isArray(endpoint.expectStatus)
      ? endpoint.expectStatus
      : [endpoint.expectStatus];

    if (!expectedStatus.includes(httpCode)) {
      return {
        success: false,
        error: `状态码 ${httpCode} 不在预期 ${expectedStatus} 中`,
        httpCode,
        body: body.slice(0, 200)
      };
    }

    // 检查 Content-Type
    if (endpoint.expectType && !contentType.includes(endpoint.expectType)) {
      return {
        success: false,
        error: `Content-Type ${contentType} 不匹配预期 ${endpoint.expectType}`,
        httpCode
      };
    }

    // 检查响应字段
    if (endpoint.expectFields && httpCode === 200) {
      try {
        const json = JSON.parse(body);
        const missingFields = endpoint.expectFields.filter(f => !(f in json));
        if (missingFields.length > 0) {
          return {
            success: false,
            error: `缺少字段: ${missingFields.join(', ')}`,
            httpCode,
            receivedFields: Object.keys(json)
          };
        }
        return { success: true, httpCode, data: json };
      } catch (e) {
        // 非 JSON 响应（如 SVG）
        return { success: true, httpCode, contentType };
      }
    }

    return { success: true, httpCode };

  } catch (e) {
    return {
      success: false,
      error: e.message.slice(0, 100),
      httpCode: 0
    };
  }
}

/**
 * 检查版本一致性
 */
function checkVersionConsistency(healthData) {
  if (!healthData || !healthData.version) {
    return { match: false, codeVersion: CONFIG.CODE_VERSION, runningVersion: 'unknown' };
  }

  const runningVersion = healthData.version;
  const match = runningVersion === CONFIG.CODE_VERSION;

  return {
    match,
    codeVersion: CONFIG.CODE_VERSION,
    runningVersion
  };
}

/**
 * 尝试自动修复（重启服务）
 */
async function attemptAutoFix(result) {
  if (!CONFIG.CONWAY_API_KEY) {
    return { success: false, error: '未配置 CONWAY_API_KEY' };
  }

  try {
    // 通过 Conway API 执行远程重启
    const res = execSync(
      `curl -s --max-time 30 "${CONFIG.CONWAY_API_URL}/v1/sandboxes/${CONFIG.SANDBOX_ID}/exec" ` +
      `-H "Authorization: ${CONFIG.CONWAY_API_KEY}" ` +
      `-H "Content-Type: application/json" ` +
      `-d '{"command": "timeout 15 /root/receipt2csv/start.sh", "timeout": 20000}'`,
      { encoding: 'utf-8', timeout: 35000 }
    );

    const data = JSON.parse(res);

    // 检查重启是否成功
    if (data.stdout && data.stdout.includes('started')) {
      return { success: true, output: data.stdout };
    }

    return { success: false, error: data.stderr || '重启输出异常' };

  } catch (e) {
    return { success: false, error: e.message.slice(0, 100) };
  }
}

/**
 * 保存检查结果到状态数据库
 */
function saveResult(result) {
  try {
    const dbPath = CONFIG.STATE_DB;
    let db = { selfChecks: [] };

    if (existsSync(dbPath)) {
      const content = readFileSync(dbPath, 'utf-8');
      try {
        db = JSON.parse(content);
        if (!db.selfChecks) db.selfChecks = [];
      } catch { /* ignore */ }
    }

    // 保留最近 100 条记录
    db.selfChecks.push({
      timestamp: result.timestamp,
      healthy: result.healthy,
      issueCount: result.issues.length,
      versionMismatch: result.versionMismatch
    });
    db.selfChecks = db.selfChecks.slice(-100);
    db.lastSelfCheck = result;

    writeFileSync(dbPath, JSON.stringify(db, null, 2));
    return true;
  } catch (e) {
    console.error('保存结果失败:', e.message);
    return false;
  }
}

/**
 * 生成人类可读报告
 */
function generateReport(result) {
  const lines = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push('║           🔮 旺财自我感知报告                                 ║');
  lines.push('╠══════════════════════════════════════════════════════════════╣');
  lines.push(`║  📅 时间: ${result.timestamp.padEnd(44)}║`);
  lines.push(`║  📊 状态: ${(result.healthy ? '✅ 健康' : '⚠️ 发现问题').padEnd(44)}║`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');

  // 服务状态
  lines.push('## 🏥 服务端点检查\n');
  lines.push('| 端口 | 端点 | 状态 | 说明 |');
  lines.push('|------|------|------|------|');

  for (const issue of result.issues) {
    lines.push(`| ${issue.port} | ${issue.endpoint} | ❌ 失败 | ${issue.message.slice(0, 30)} |`);
  }

  for (const pass of result.passed) {
    lines.push(`| ${pass.port} | ${pass.endpoint} | ✅ 正常 | ${pass.details || '-'} |`);
  }

  lines.push('');

  // 版本检查
  if (result.versionCheck) {
    lines.push('## 📦 版本一致性\n');
    lines.push(`| 类型 | 版本 |`);
    lines.push(`|------|------|`);
    lines.push(`| 代码版本 | ${result.versionCheck.codeVersion} |`);
    lines.push(`| 运行版本 | ${result.versionCheck.runningVersion} |`);
    lines.push(`| 一致性 | ${result.versionCheck.match ? '✅ 匹配' : '⚠️ 不匹配'} |`);
    lines.push('');
  }

  // 总结
  lines.push('## 📋 总结\n');
  lines.push('```');
  lines.push(`状态: ${result.healthy ? '🟢 所有端点正常' : '🔴 发现 ' + result.issues.length + ' 个问题'}`);
  lines.push(`通过: ${result.passed.length} 个端点`);
  lines.push(`失败: ${result.issues.length} 个端点`);

  if (result.versionMismatch) {
    lines.push(`警告: 版本不一致，可能需要重启服务`);
  }

  lines.push('```');
  lines.push('');

  // 建议操作
  if (!result.healthy) {
    lines.push('## 🔧 建议操作\n');
    lines.push('```bash');
    lines.push('# 尝试自动修复');
    lines.push('node scripts/self_check.mjs --fix');
    lines.push('');
    lines.push('# 手动重启服务（在 Sandbox 中）');
    lines.push('timeout 15 /root/receipt2csv/start.sh');
    lines.push('```');
  }

  return lines.join('\n');
}

// ========== 主函数 ==========
async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const shouldFix = args.includes('--fix');
  const useDynamic = args.includes('--dynamic');

  const result = new CheckResult();
  result.mode = useDynamic ? 'dynamic' : 'static';

  // 确定要检查的服务列表
  let servicesToCheck = EXPECTED_ENDPOINTS;

  if (useDynamic) {
    console.log('🔍 从 Agent Card 动态发现服务...\n');
    const discovered = await discoverServicesFromAgentCard();
    if (discovered) {
      servicesToCheck = discovered;
      result.dynamicDiscovery = true;
      console.log(`✅ 发现 ${Object.keys(discovered).length} 个服务\n`);
    } else {
      console.log('⚠️ 使用静态配置\n');
      result.dynamicDiscovery = false;
    }
  }

  // 检查所有服务
  for (const [port, service] of Object.entries(servicesToCheck)) {
    // 动态发现的服务需要构建 baseUrl
    let baseUrl;
    if (service.baseUrl) {
      baseUrl = service.baseUrl;
    } else if (port === '8080' || port === '443') {
      baseUrl = CONFIG.SERVICE_8080;
    } else if (port === '3006') {
      baseUrl = CONFIG.SERVICE_3006;
    } else {
      // 根据端口号构建 URL (Sandbox 模式)
      baseUrl = `https://${port}-${CONFIG.SANDBOX_ID}.life.conway.tech`;
    }

    result.services[port] = { name: service.name, endpoints: {} };

    for (const endpoint of service.endpoints) {
      const check = await checkEndpoint(baseUrl, endpoint);

      if (check.success) {
        result.addPassed(port, endpoint.path, `HTTP ${check.httpCode}`);
        result.services[port].endpoints[endpoint.path] = { status: 'ok', httpCode: check.httpCode };

        // 如果是 /health 端点，检查版本（仅 8080 端口）
        if (endpoint.path === '/health' && check.data && port === '8080') {
          const versionCheck = checkVersionConsistency(check.data);
          result.versionCheck = versionCheck;
          result.versionMismatch = !versionCheck.match;

          if (!versionCheck.match) {
            result.addIssue(port, '/health version',
              `版本不一致: 代码 ${versionCheck.codeVersion} vs 运行 ${versionCheck.runningVersion}`);
          }
        }
      } else {
        result.addIssue(port, endpoint.path, check.error);
        result.services[port].endpoints[endpoint.path] = { status: 'error', error: check.error };
      }
    }
  }

  // 尝试自动修复
  if (shouldFix && !result.healthy) {
    console.log('\n🔧 尝试自动修复...\n');
    const fixResult = await attemptAutoFix(result);
    result.autoFix = fixResult;

    if (fixResult.success) {
      console.log('✅ 服务重启成功，重新检查...\n');
      // 递归重新检查（不带 --fix 避免无限循环）
      process.argv = process.argv.filter(a => a !== '--fix');
      return main();
    } else {
      console.log('❌ 自动修复失败:', fixResult.error);
    }
  }

  // 保存结果
  saveResult(result);

  // 输出
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(generateReport(result));
  }

  // 返回退出码
  process.exit(result.healthy ? 0 : 1);
}

main().catch(e => {
  console.error('检查失败:', e);
  process.exit(2);
});
