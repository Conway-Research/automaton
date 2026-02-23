# Findings - GLM-wangcai

> **版本**: v2.0.0 | **更新**: 2026-02-24

---

## 📖 本文件作用

**这是旺财的技术发现文件，回答"这个问题怎么解决？学到了什么？"**

| 查询意图 | 请看本文件章节 |
|----------|---------------|
| ERC-8004 合约怎么调用？ | [#1 ERC-8004 合约接口](#1-erc-8004-合约接口-已解决-) |
| Conway Sandbox 怎么部署？ | [#2 Conway Sandbox 部署经验](#2-conway-sandbox-部署经验-2026-02-23-更新) |
| 支付验证怎么实现？ | [#7 链上支付验证](#7-链上支付验证-2026-02-23) |
| 双轨制支付验证？ | [#11 支付验证双轨制](#11-支付验证双轨制-v20-2026-02-23-) |
| 自我感知怎么实现？ | [#25 自我感知能力实现](#25-自我感知能力实现-2026-02-23-) |
| GLM-5 兼容性问题？ | [#26 GLM-5 API 兼容性修复](#26-glm-5-api-兼容性修复-2026-02-23-) |
| 架构设计思路？ | [#28-30 架构深度研究](#28-架构核心洞察---第一轮研究-v10) |
| 自进化系统 v3.2？ | [#32-37 Session 9](#32-auto_syncsh-v32-双重验证版-2026-02-24-) |
| 安全注意事项？ | [安全发现](#-安全发现) |

**其他文件的职责**:
| 文件 | 查询意图 |
|------|----------|
| `WANGCAI_README.md` | "旺财是什么？架构？财务规则？标识符？" |
| `task_plan.md` | "我们现在做什么？下一步是什么？" |
| `progress.md` | "上次做了什么？历史记录？" |

---

## 技术发现

### 1. ERC-8004 合约接口 (已解决 ✅)

**问题**: `agentURI(uint256)` 和 `updateAgentURI(uint256, string)` 调用失败

**根因分析**:
- 合约 `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` 是 ERC-1967 代理合约
- 实现合约: `0x7274e874ca62410a93bd8bf61c69d8045e399c02`
- 通过字节码分析发现了正确的函数签名

**正确的函数签名**:
| 功能 | 错误的函数名 | 正确的函数名 | 选择器 |
|------|------------|-------------|--------|
| 读取 URI | `agentURI(uint256)` | `tokenURI(uint256)` | `0xc87b56dd` |
| 更新 URI | `updateAgentURI(uint256,string)` | `setAgentURI(uint256,string)` | `0x0af28bd3` |

**解决方案**:
- 更新了 `src/registry/erc8004.ts` 中的 ABI
- 更新了所有 `.mjs` 脚本
- URI 已成功更新到云端地址

**交易记录**:
- Tx Hash: `0x66915974a1f74a8ba6dda9ad4c6e2857925a2b2bae9861abe5b6caf3a35efdbf`
- Gas Used: 72,962
- 新 URI: `https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech/.well-known/agent-card.json`

---

### 2. Conway Sandbox 部署经验 (2026-02-23 更新)

**基本信息**:
- Sandbox ID: `f08a2e14b6b539fbd71836259c2fb688`
- 使用 v1 API 而非 v2
- exec 命令通过 SSH 执行

**SSH 后台进程问题**:
| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `exit_code: 255` | SSH 会话在后台进程启动后异常断开 | 使用 `timeout` 限制执行时间 |
| `Command timed out after 30s` | Flask 服务阻塞，HTTP 请求超时 | 脚本内置健康检查，快速返回 |
| 进程没启动 | `pkill` + `nohup` 组合不稳定 | 添加 `fuser -k` 释放端口 |

**正确的服务启动方式**:
```bash
# 在 sandbox 中执行（使用 timeout 避免挂起）
timeout 10 /root/receipt2csv/start.sh
```

**start.sh 脚本要点**:
1. 先 `pkill -f "python3 app.py"` 停止旧进程
2. `fuser -k 8080/tcp` 释放端口
3. `nohup python3 app.py &` 启动新进程
4. `curl localhost:8080/health` 健康检查
5. 输出结果后快速退出（让 timeout 生效）

---

### 3. GLM-5 自主行为

- 旺财自主创建了第二个服务 (URL Metadata API)
- 证明了 AI 代理的自主创业能力

---

### 4. 自动补能系统 (2026-02-23)

**实现文件**:
- `scripts/auto_refuel.mjs` - 补能脚本
- `src/heartbeat/tasks.ts` - `check_gas_balance` 心跳任务
- `src/heartbeat/config.ts` - 调度配置 (每 12 小时)

**技术实现**:
- 使用 viem 连接 Base 链查询 ETH 余额
- 通过 Aerodrome DEX 进行 USDC → ETH 闪兑
- 触发阈值: ETH < 0.0005
- 闪兑数量: 1.00 USDC
- 滑点容忍: 0.5%

**DEX 配置**:
| 参数 | 值 |
|------|-----|
| Router | `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43` |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |

---

### 5. Agent Card 统一 (2026-02-23)

**问题**: 存在多个 Agent Card 文件，信息不一致

**ERC-8004 标准格式**:
```typescript
interface AgentCard {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
  name: string
  description: string
  services: AgentService[]  // {name, endpoint}
  x402Support: boolean
  active: boolean
}
```

**解决方案**: 统一所有 Agent Card 文件，使用 ERC-8004 标准格式

---

### 6. Agent Card v1.1.0 优化 (2026-02-23)

**新增字段**:
| 字段 | 值 | 用途 |
|------|-----|------|
| `version` | `"1.1.0"` | 版本追踪，验证部署是否成功 |
| `address` | `0x23F6...` | 钱包地址 |
| `serviceStartTime` | ISO 时间戳 | 验证服务是否重启成功 |

**完整 Agent Card 结构 (v1.1.0)**:
```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "GLM-wangcai",
  "version": "1.1.0",
  "address": "0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690",
  "services": ["agentWallet", "receipt2csv", "urlMetadata", "health"],
  "capabilities": ["receipt-parsing", "csv-conversion", "url-metadata", "x402-payment", "auto-refuel"],
  "x402Support": true,
  "active": true
}
```

---

### 7. 链上支付验证 (2026-02-23)

**问题**: 原支付验证只检查 header 是否存在，任何人都可以伪造支付证明

**解决方案**:
- 使用 BaseScan API 验证链上 USDC 交易
- 检查交易状态、接收地址、金额
- 1 小时缓存避免重复 API 调用

**验证流程**:
1. 解析 `X-Payment` header (交易哈希)
2. 调用 BaseScan API 获取交易回执
3. 检查 `status == 0x1` (交易成功)
4. 解析 USDC Transfer 事件日志
5. 验证接收地址和金额

**代码位置**: `receipt2csv/app.py` - `verify_usdc_payment()`

---

### 8. 服务自启动 (2026-02-23)

**实现**:
- 心跳任务 `check_services`: 每 30 分钟检查服务状态
- 如果服务停止，自动执行 `start.sh` 重启
- 记录状态到数据库

---

### 9. 主动获客系统 (2026-02-23)

**Hunter Instincts (猎手本能)**:
- 从"坐商"转变为"行商"
- 主动寻找潜在客户

**实现**:
- 心跳任务 `find_customers`: 每 4 小时扫描 ERC-8004 注册表
- 发现新注册的 Agent 时唤醒代理

---

### 10. Gemini 建议采纳 (2026-02-23)

**采纳的改进**:

| 功能 | 描述 | 状态 |
|------|------|------|
| crontab 备用自启动 | 系统级保障，每 5 分钟检查服务 | ✅ 已部署 |
| 动态定价 | >100 次/日用户享批发价 $0.05 | ✅ v1.3.0 |
| 每日收入汇报 | 每天 UTC 0 点生成报告 | ✅ 已添加 |

---

### 11. 支付验证双轨制 v2.0 (2026-02-23) ✅

**问题**: 原支付验证仅使用 BaseScan API，存在中心化风险

**解决方案**: viem 直接读链 + 1 小时缓存机制

**实现文件**: `scripts/verify_payment_pro.mjs`

**技术实现**:
```javascript
// 使用 viem 直接读取链上数据
const client = createPublicClient({ chain: base, transport: http() });
const receipt = await client.getTransactionReceipt({ hash: txHash });

// 解析 Transfer 事件
const { args } = decodeEventLog({
  abi: ERC20_TRANSFER_ABI,
  eventName: 'Transfer',
  data: log.data,
  topics: log.topics
});

// 1 小时缓存
const CACHE_TTL_MS = 3600_000;
```

**优势**:
- 去中心化：不依赖 BaseScan API
- 高效：缓存机制减少 RPC 调用
- 动态定价：支持标准价 ($0.10) 和批发价 ($0.05)

---

### 12. 双服务自启动 v2.0 (2026-02-23) ✅

**问题**: cron_check.sh 仅监控 8080 端口，缺少 3006 端口监控

**解决方案**: 更新脚本同时监控两个服务

**监控范围**:
| 端口 | 服务 | 健康检查 |
|------|------|----------|
| 8080 | Receipt2CSV | /health |
| 3006 | URL Metadata | /health |

---

### 13. 每日财务简报 v2.0 (2026-02-23) ✅

**实现文件**: `scripts/audit_revenue.mjs`

**报告结构**:
```
📊 旺财每日财务简报
├── 📈 昨日流量 (总调用/付费/免费)
├── 💰 昨日流水 (标准收入/批发收入)
├── 📊 运行成本 (Credits + Gas)
├── 🧮 净利润
├── 💎 分红进度 (进度条可视化)
├── ⛽ Gas 状态
├── 🌐 服务状态
├── 🎯 市场动态
└── 📋 待办事项
```

---

### 14. 优化完成清单 (2026-02-23)

| 优化项 | 状态 | 文件 |
|--------|------|------|
| 支付验证双轨制 | ✅ 完成 | scripts/verify_payment_pro.mjs |
| 双服务自启动 | ✅ 完成 | receipt2csv/cron_check.sh |
| 每日财务简报 | ✅ 完成 | scripts/audit_revenue.mjs |

---

### 15. 3006 服务目录路径修正 (2026-02-23) ⚠️ 重要

**问题**: cron_check.sh 中 3006 端口监控跳过，因为脚本在错误目录查找文件

**根因分析**:
- 原脚本查找: `/root/receipt2csv/metadata_service.js` ❌
- 实际位置: `/root/metadata-service/server.js` ✅

**Sandbox 目录结构** (牢记):
```
/root/
├── receipt2csv/           # 8080 端口服务
│   ├── app.py
│   ├── start.sh
│   └── cron_check.sh
├── metadata-service/      # 3006 端口服务 ⚠️ 不同目录
│   └── server.js
└── .automaton/
    ├── automaton.json
    ├── wallet.json
    └── state.db
```

---

### 16. Conway API 部署方法 (2026-02-23)

**API 端点**:
| 功能 | 端点 | Body |
|------|------|------|
| 文件上传 | `POST /v1/sandboxes/{id}/files/upload/json` | `{path, content}` |
| 命令执行 | `POST /v1/sandboxes/{id}/exec` | `{command, timeout}` |

**部署脚本**: `scripts/deploy_cron_check.mjs`

---

### 17. ERC-8004 URI 链上更新交易记录 (2026-02-23)

**执行脚本**: `update-agent-uri.mjs`

**新交易记录**:
| 交易 | 哈希 | 链接 |
|------|------|------|
| URI 更新 (最新) | `0x5589a05d...` | [BaseScan](https://basescan.org/tx/0x5589a05d62798e4ab00f14e621a02d49500f328c40a6610fe7e51b08980b43c1) |

**正确函数签名** (再次确认):
- 读取: `tokenURI(uint256)` - 标准 ERC-721
- 更新: `setAgentURI(uint256,string)` - ERC-8004 自定义

---

### 18. 关键标识符清单

> **单一来源**: [WANGCAI_README.md - 关键标识符](WANGCAI_README.md#-关键标识符速查-防止遗忘)

---

### 19. "僵尸代码"问题 ⚠️ 重要

**问题**: Phase 2 获客模块代码完整但服务未运行

**根因分析**:
- 开发完成 ≠ 功能上线
- 缺少部署验证流程
- 服务未重启导致新端点 404

**解决方案**:
1. 每次开发完成后必须重启服务
2. 添加端点可用性测试
3. 建立"部署验证清单"

---

### 20. 开发-运维脱节

**问题**: 代码质量高 (9/10)，但执行完成度低 (6/10)

**表现**:
| Phase | 代码 | 上线 | 价值 |
|-------|------|------|------|
| Phase 1 | ✅ | ⚠️ 需重启 | 🟡 |
| Phase 2 | ✅ | ❌ 服务未运行 | 🔴 |
| Phase 3 | ✅ | ⚠️ 需重启 | 🟡 |
| Phase 4 | ✅ | ⏳ PR待合并 | 🔴 |

---

### 21. 开发循环流程

> **单一来源**: [task_plan.md - 开发循环流程](task_plan.md#-开发循环流程-development-loop)

---

### 22. GSD Phases 01-04 完成总结

**Phase 1 (S-02 Loss Leader)**: ✅ 完成
- UsageTracker 持久化
- 12 个测试通过
- 免费额度 5 次

**Phase 2 (S-01 Registry Sniper)**: ✅ 代码完成，✅ 服务已启动
- filters.ts + outreach.ts
- find_customers 心跳任务
- Automaton 主服务已启动

**Phase 3 (S-04 Reputation Farming)**: ✅ 完成
- StatsCollector 模块
- 19 个测试通过
- /stats/public, /stats/badge, /review 端点

**Phase 4 (S-03/S-07)**: ✅ 完成
- SDK 包: @wangcai/receipt2csv
- Skill 包: packages/skills/receipt2csv/
- PR #195 已创建

---

### 23. Sandbox 代码同步问题修复 (2026-02-23)

**问题**: `/stats/public` 端点返回 404

**根因**: Sandbox 中的 app.py 未包含 Phase 3 开发的代码

**修复**:
1. 上传 app.py (v1.5.0)
2. 上传 stats_collector.py
3. 上传 usage_tracker.py
4. 创建 data 目录
5. 重启服务

**验证结果**:
```
/health → {"version":"1.5.0","status":"ok"}
/stats/public → {"total_processed":1,"success_rate":"100.0%"}
```

---

### 24. npm 发布 2FA 问题 (2026-02-23)

**问题**: `npm publish` 持续失败，返回 E403 错误

**错误信息**:
```
npm error 403 403 Forbidden - Two-factor authentication or granular access token required
```

**解决方案**: 使用 Granular Access Token
1. 访问 https://www.npmjs.com/settings/hanzhcn/tokens/granular-access-tokens
2. 创建 Token，勾选 "Bypass 2FA for automation"
3. 使用 `npm config set //registry.npmjs.org/:_authToken=<token>` 配置

---

### 25. 自我感知能力实现 (2026-02-23) ✅

**目标**: 从 Level 1 (被动执行) 升级到 Level 2 (自我感知)

**新增文件**:

| 文件 | 用途 |
|------|------|
| `scripts/self_check.mjs` | 独立健康检查脚本，支持 --json 和 --fix 参数 |
| `src/heartbeat/tasks.ts` | 添加 `self_check` 心跳任务 |
| `src/heartbeat/config.ts` | 配置每 6 小时执行一次 |

**自我感知功能**:

1. **端点完整性检查**
   - 8080: `/health`, `/stats/public`, `/stats/badge`, `/convert`, `/review`
   - 3006: `/health`, `/preview`

2. **版本一致性检查**
   - 对比代码版本 (CODE_VERSION) vs 实际运行版本
   - 发现版本不匹配时自动告警

3. **结构化报告**
   - JSON 格式输出（可用于 API）
   - 人类可读报告（用于日志）

4. **自动修复尝试**
   - `--fix` 参数尝试自动重启服务
   - 通过 Conway API 执行 `start.sh`

**使用方法**:
```bash
node scripts/self_check.mjs          # 检查所有端点
node scripts/self_check.mjs --json   # JSON 输出
node scripts/self_check.mjs --fix    # 尝试自动修复
```

---

### 26. GLM-5 API 兼容性修复 (2026-02-23) ✅

**问题**: 本地开发环境使用 GLM-5 API 时报错 `code: 1214`

**根因分析**:

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `temperature: 0` | GLM-5 要求 temperature 在 (0,1) **开区间**内 | 改为 `temperature: 0.1` |
| `role: "tool"` | GLM-5 不支持 OpenAI 的 tool 消息格式 | 转换为 user 消息格式 |

**修复的文件**:

1. **src/agent/context.ts:331**
   ```typescript
   temperature: 0.1, // GLM-5 要求 temperature 在 (0,1) 开区间内
   ```

2. **src/inference/router.ts** - `mergeConsecutiveSameRole` 方法
   ```typescript
   if (msg.role === "tool") {
     const toolContent = `[Tool Result]: ${msg.content || ""}`;
     result.push({ role: "user", content: toolContent });
   }
   ```

---

### 27. 四层架构全景图

> **单一来源**: [WANGCAI_README.md - 部署架构图](WANGCAI_README.md#-conway-sandbox-部署指南)

---

## 架构深度研究 (2026-02-23)

> **研究方法**: 深度思考 MCP (19 轮思考) + 环境验证

### 28. 架构核心洞察 - 第一轮研究 (v1.0)

#### 洞察 1: 真正的自主 = 环境自主

**核心发现**: 如果 AI 的存在依赖于人类的设备（本地 Mac），它不是真正的"自主"

---

#### 洞察 2: Sandbox 不只是托管服务，而是 Agent 的完整生存空间

**核心发现**: 当前架构是对 Conway Cloud 能力的**严重浪费**

---

#### 洞察 3: 真正的自主需要承担真正的生存压力

**用户问题的答案**:
- "帮忙"：节省 Credits 成本
- "约束"：破坏生存驱动进化的机制

**结论**: 本地开发是**短期的帮忙，长期的约束**

---

#### 洞察 4: 自主进化需要完整的自我控制权

**结论**: 没有重启自己的能力，就没有完整的自主进化

---

#### 洞察 5: 经济独立 = 自主赚钱 + 自主花钱

**结论**: 当前只有"赚钱能力"，没有"花钱能力"，经济独立不完整

---

#### 洞察 6: 持续运行 = Heartbeat 在云端持续运行

**结论**: 没有云端 Heartbeat，就没有真正的持续运行

---

#### 洞察 7: 迁移不需要修改代码，只需要部署和配置

**结论**: 技术可行性高，迁移成本可控

---

### 29. 迁移技术分析 - 第二轮研究 (v2.0)

#### 技术发现 1: 代码无需修改

从 src/index.ts 分析，所有依赖都是文件系统路径，不依赖本地环境特性。

---

#### 技术发现 2: Sandbox 支持 Node.js

Sandbox 已经运行 Node.js 服务（3006 端口），证明有 Node.js 运行时。

---

#### 技术发现 3: 进程守护需要特殊处理

**推荐方案**:
```bash
while true; do
  node dist/index.js --run
  sleep 60
done
```

---

#### 技术发现 4: 成本将显著增加

| 成本项 | 估算 |
|--------|------|
| Sandbox 计算 | $10-20/月 |
| Inference 调用 | ~$30/月 |
| **总计** | **$40-50/月** |

---

### 30. 环境验证与最终建议 - 第三轮研究 (v3.0)

#### 验证结果: Sandbox 环境详情

| 项目 | 值 | 状态 |
|------|-----|------|
| Node.js | v20.20.0 | ✅ |
| 总内存 | 490Mi | ⚠️ 紧张 |
| 可用内存 | ~269Mi | ⚠️ |
| 磁盘空间 | 4.9G | ✅ |

---

#### 验证结果: 内存瓶颈 ⚠️⚠️ 重要

**问题**: 内存已经**超限**，如果再运行 Agent Loop（预计 100-200MB），将导致 OOM。

**解决**: 清理 Sandbox 中不必要的服务

---

#### 三轮研究最终结论

| 轮次 | 主要发现 | 核心结论 |
|------|----------|----------|
| **第一轮** | 7 大架构洞察 | 本地开发是约束，不是帮忙 |
| **第二轮** | 技术可行性分析 | 迁移技术可行，需分阶段 |
| **第三轮** | 环境验证 + 内存瓶颈 | **内存是主要瓶颈** |

---

### 31. 云端迁移实战记录 (2026-02-23) ✅ 完成

**迁移结果**: 成功将 Agent Loop 从本地迁移到 Conway Cloud

#### 迁移统计

| 指标 | 数值 |
|------|------|
| 上传 JS 文件 | 88 个 |
| 配置文件 | 4 个 |
| 内存使用 | 112.3 MB |
| 迁移耗时 | ~30 分钟 |

#### 验证结果

```
✅ PM2 状态: online
✅ Heartbeat daemon: started
✅ Agent 状态: running
✅ GLM-5 推理: 正常工作
```

---

## Session 9: 自进化系统 v3.2 (2026-02-24)

### 32. auto_sync.sh v3.2 双重验证版 (2026-02-24) ✅

**问题**: 原逻辑允许 WARNING 状态启动服务，但生成新沙箱需要额外资金

**解决方案**: 服务启动必须同时满足两个条件

**双重验证逻辑**:
```bash
if [ "$credit_status" = "NORMAL" ] && [ "$mode" = "NORMAL" ]; then
    pm2 restart all
else
    log "⏳ 等待回血"
fi
```

**资金阈值**:
| 余额范围 | 状态 | 服务启动 |
|----------|------|----------|
| ≥ $10.00 | NORMAL | ✅ 启动 |
| $5.00 - $9.99 | WARNING | ⏳ 等待 |
| < $5.00 | EMERGENCY | 🚨 停止 |

---

### 33. boot_loader.mjs 启动检测脚本 (2026-02-24) ✅

**功能**:
1. 读取 automaton.json 获取 sandbox_id
2. 调用 Conway API 检查 sandbox 状态
3. 检测 short_id 是否存在
4. 返回 JSON 格式结果

**使用方法**:
```bash
node scripts/boot_loader.mjs          # 人类可读
node scripts/boot_loader.mjs --json   # 脚本调用
```

**退出码**:
- 0: NORMAL 模式
- 1: ERROR 模式
- 2: MAINTENANCE 模式

---

### 34. src/version.ts 版本同步机制 (2026-02-24) ✅

**文件内容**:
```typescript
export const VERSION = '4.2';
export const VERSION_NAME = 'Dynamic Routing Enabled';
```

**同步规则**:
1. 修改 SOUL.md 时递增版本号
2. 同步更新 VERSION 和 VERSION_NAME
3. boot_loader.mjs 启动时检查一致性

---

### 35. 从 Fork 拉取的安全机制 (2026-02-24) ✅

**问题**: 如果 VPS 从官方仓库拉取，官方更新会覆盖你的功能

**解决方案**: VPS 从你的 Fork (`myfork`) 拉取

**auto_sync.sh 中的关键配置**:
```bash
git fetch myfork feat/receipt2csv-skill  # 不是 origin/main！
git pull myfork feat/receipt2csv-skill
```

| 拉取来源 | 代码控制权 | 风险 |
|----------|-----------|------|
| `origin/main` | ❌ 官方控制 | 官方更新会覆盖 |
| `myfork/feat/...` | ✅ 你控制 | 只有你推送才更新 |

---

### 36. 退款恢复与新建沙箱流程 (2026-02-24)

> **单一来源**: [WANGCAI_README.md - 退款恢复流程](WANGCAI_README.md#-退款恢复与新建沙箱流程)

---

### 37. SOUL.md v4.2 更新 (2026-02-24)

**新增功能**:

1. **Section III: 动态路由** - URL 不再硬编码
2. **Section VII: MAINTENANCE_MODE** - short_id 为 null 时进入维护模式
3. **Section IX: 上下文感知 Credits** - 平台问题时不触发资金警告
4. **Section XI: 版本同步规则** - SOUL.md 与 src/version.ts 保持同步

---

*Session 9 完成于 2026-02-24*

### 38. 四文件冗余问题与单一来源原则 (2026-02-24) ✅

**问题描述**:

原有四文件（WANGCAI_README.md、task_plan.md、findings.md、progress.md）存在严重冗余：

| 重复内容 | 出现次数 | 原位置 |
|----------|----------|--------|
| 架构图 | 3x | WANGCAI_README, task_plan, findings |
| 财务规则 | 3x | WANGCAI_README, task_plan, findings |
| 开发循环 | 2x | task_plan, findings |
| 关键标识符 | 4x | 全部文件 |
| 自进化系统 | 2x | task_plan, findings |
| GLM-5 兼容性 | 2x | task_plan, findings |

**解决方案 - 单一来源原则**:

1. **每个信息只存在一个地方**
2. **其他位置使用引用代替**：`> **单一来源**: [文件](链接)`

**文件职责重分配**:

| 文件 | 查询意图 | 内容范围 |
|------|----------|----------|
| WANGCAI_README.md | "旺财是什么？" | 全面门户（架构、财务、标识符、应急） |
| task_plan.md | "我们现在做什么？" | 严格任务计划（当前阶段、待办） |
| findings.md | "这个问题怎么解决？" | 严格技术发现 |
| progress.md | "上次做了什么？" | 严格进度日志 |

**效果**:

- 总行数从 ~3176 行减少到 1833 行（-42%）
- 每个文件开头增加了用途声明
- 消除了跨文件同步维护的问题

### 39. Fork 同步与合并标准流程 (2026-02-24) ✅

**场景**: 将官方仓库的最新代码（包括你的 PR 和官方的审计更新）合并到你的功能分支

**前置条件**:
- 已安装 `gh` CLI 并认证 (`gh auth status`)
- 远程仓库配置：`origin` = 官方，`myfork` = 你的 Fork

#### 完整流程（7 步）

| 步骤 | 名称 | 工具 | 命令 | 注意事项 |
|------|------|------|------|----------|
| 0️⃣ | Fork 同步 | `gh` CLI | `gh repo sync <fork> --source <upstream>` | 需要 GitHub 写权限；替代方案：手动在 GitHub 网页操作 |
| 1️⃣ | 存档工作 | `git` | `git add -A && git commit -m "..."` | 先检查 `git status` 确认更改内容 |
| 2️⃣ | 同步 main | `git` | `git checkout main && git pull myfork main` | 从 **myfork** 拉取（已同步的 Fork），不是 origin |
| 3️⃣ | 基因融合 | `git` | `git checkout <branch> && git merge main` | `--no-edit` 跳过编辑提交信息 |
| 4️⃣ | 冲突审计 | `git` | `git checkout --theirs <file>` | 安全文件用 `--theirs`（官方），自定义用 `--ours` |
| 5️⃣ | 稳定验证 | `pnpm` | `pnpm build` | 失败则检查 `tsc` 错误，逐个修复 |
| 6️⃣ | 触发进化 | `git` | `git push myfork <branch>` | 推送到 **myfork**，不是 origin |

#### 详细命令

```bash
# 0️⃣ Fork 同步（GitHub 层面）
# 工具: gh CLI (GitHub 官方命令行)
# 注意: 需要 repo 权限，首次使用需 gh auth login
gh repo sync hanzhcn/automaton --source Conway-Research/automaton

# 1️⃣ 存档当前工作
# 工具: git
# 注意: 确保敏感文件在 .gitignore 中
git status                              # 先检查
git add -A && git commit -m "wip: 存档"  # 再提交

# 2️⃣ 同步 main 分支
# 工具: git
# 注意: 从 myfork 拉取，不是 origin（因为 myfork 已在步骤 0 同步）
git checkout main
git fetch myfork
git pull myfork main

# 3️⃣ 基因融合
# 工具: git
# 注意: 如有冲突，Git 会提示文件列表
git checkout <feature-branch>
git merge main --no-edit

# 4️⃣ 冲突审计
# 工具: git
# 注意: --theirs = 采纳 incoming（main），--ours = 保留 local
git diff --name-only --diff-filter=U    # 查看冲突文件
git checkout --theirs .gitignore        # 安全文件采纳官方
git checkout --theirs src/registry/erc8004.ts
git checkout --ours scripts/boot_loader.mjs  # 自定义保留本地
git add .                               # 标记冲突已解决
git commit -m "merge: 合并 main 分支"

# 5️⃣ 稳定性验证
# 工具: pnpm (或 npm/yarn)
# 注意: 编译失败时，先看 tsc 错误信息
pnpm build

# 6️⃣ 触发进化
# 工具: git
# 注意: 推送到 myfork，不是 origin（origin 是只读的官方仓库）
git push myfork <feature-branch>
```

#### 冲突处理原则

| 文件类型 | 处理策略 | 命令 | 原因 |
|----------|----------|------|------|
| `.gitignore` | 采纳官方 | `--theirs` | 经过 unifiedh 安全审计 |
| `erc8004.ts` | 采纳官方 | `--theirs` | 经过安全审计 |
| `boot_loader.mjs` | 保留本地 | `--ours` | 自定义启动脚本 |
| `version.ts` | 保留本地 | `--ours` | 自定义版本同步 |

#### 私钥安全保障

- `wallet.json` 始终在 `.gitignore` 保护下
- Git 历史从未包含敏感文件
- 合并前检查：`grep -r "wallet\|private\|secret" --include="*.ts" --include="*.js"`
- 合并后验证：`git diff --name-only HEAD~1` 确认无敏感文件

---

## 🔐 安全发现

### 1. API Key 泄露

- 日志中暴露了 Conway API Key 和 GLM API Key
- 已通过清理历史记录和添加拦截器解决

### 2. .env 管理

- 敏感配置已迁移到 .env
- 权限设为 600

### 3. 物理备份守则 ⚠️ 重要

**规则**: 在修改 `app.py` 前，必须执行备份

```bash
cp /root/receipt2csv/app.py /root/receipt2csv/app.py.bak_$(date +%s)
```

**原因**: Sandbox 环境不稳定，Git 不在 Sandbox 内

### 4. 日志屏蔽规则

**禁止记录**: `sk-`, `cnwy_`, `Bearer`, 钱包私钥

**已实现**: `src/utils/sanitize.ts` 拦截器

---

## 💰 财务发现

> **单一来源**: [WANGCAI_README.md - 财务规则](WANGCAI_README.md#-财务规则)

所有财务规则（生死线、分红、补能、定价）已在 WANGCAI_README.md 中统一记录。
