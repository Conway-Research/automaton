# GLM-wangcai (旺财) - 主权 AI 微创业者

> **版本**: v1.5.0 | **更新**: 2026-02-23
> **状态**: 🟢 运行中 | **Agent ID**: 18893

---

## 📖 项目简介

GLM-wangcai (旺财) 是一个基于 **Conway Automaton** 框架运行的独立主权 AI 代理。它使用 **GLM-5** 作为推理核心，通过提供付费微服务赚取 USDC，实现 AI 自主经济独立。

### 核心特性

- 🧠 **认知核心**: GLM-5 (智谱编码套餐)
- ⛓️ **链上身份**: ERC-8004 注册 (Base Mainnet)
- 💰 **支付协议**: x402 (HTTP 402 Payment Required)
- 🌐 **云端托管**: Conway Sandbox

### 🔄 开发循环流程 (Development Loop v1.0)

每次开发新 Phase 前，遵循此循环：

```
┌─────────────────────────────────────────────────────────────┐
│  1. 读取四文件                                               │
│     ├── findings.md (技术发现)                               │
│     ├── task_plan.md (任务计划)                              │
│     ├── progress.md (进度日志)                               │
│     └── WANGCAI_README.md (项目文档)                         │
│                                                              │
│  2. 目的策略对比 (vs SOUL.md)                                │
│                                                              │
│  3. 全面开发 (按 GSD 阶段)                                   │
│                                                              │
│  4. 全面审核 (代码质量 + 执行状态 + 价值输出)                 │
│                                                              │
│  5. 更新四文件 → 循环                                        │
└─────────────────────────────────────────────────────────────┘
```

### GSD Phases 01-04 完成总结

| Phase | 名称 | 核心成果 |
|-------|------|----------|
| 01 | 基础设施 | UsageTracker, StatsCollector, 数据持久化 |
| 02 | 支付验证 | x402 协议, viem 链上验证, 双轨制 |
| 03 | SDK 开发 | WangcaiSDK TypeScript 包 |
| 04 | PR Evangelist | skill-receipt2csv 包, PR #195 |

### 🔑 关键标识符 (防止遗忘)

| 标识符 | 值 | 用途 |
|--------|-----|------|
| **Sandbox ID** | `f08a2e14b6b539fbd71836259c2fb688` | Conway 云端沙箱 |
| **Agent ID** | `18893` | ERC-8004 链上 ID |
| **钱包地址** | `0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690` | 接收 USDC |
| **老板钱包** | `0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5` | 分红接收 |

### ⚠️ 双钱包权限逻辑 (核心重要)

| 角色 | 地址 | 权限 |
|------|------|------|
| **Owner (所有者)** | `0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5` | 拥有 Agent ID 18893 的 NFT |
| **Executor (执行者)** | `0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690` | 打工、付 Gas、收钱、更新 URI |

**权限维护**:
- 只有 Executor 拥有 `0x23F6...` 的私钥（存储在 `~/.automaton/wallet.json`）
- 更新链上 `agentURI` 需要由 Executor 签名（已配置好）
- 若所有权未过户，需老板手动签名

---

## 🛠️ 服务矩阵

### 1️⃣ Receipt2CSV (收据转 CSV)

| 属性 | 值 |
|------|-----|
| **功能** | 将收据文本解析并转换为 CSV 格式 |
| **端口** | 8080 |
| **目录** | `/root/receipt2csv/` (Sandbox 内) |
| **定价** | $0.10 USDC/次 (批发价 $0.05) |
| **优惠** | 首次免费 |
| **版本** | v1.3.0 |
| **状态** | 🟢 在线 |

**公网地址**:
```
https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech
```

**API 端点**:
- `GET /` - 服务信息
- `GET /health` - 健康检查
- `GET /sample` - 示例转换 (免费)
- `POST /convert` - 转换服务 (付费)
- `GET /.well-known/agent-card.json` - ERC-8004 Agent Card

---

### 2️⃣ URL Metadata API (自主创建)

| 属性 | 值 |
|------|-----|
| **功能** | 提取网页 Open Graph 元数据 |
| **端口** | 3006 |
| **目录** | `/root/metadata-service/` (Sandbox 内) ⚠️ |
| **脚本** | `server.js` (不是 metadata_service.js) |
| **定价** | $0.05 USDC/次 |
| **状态** | 🟢 在线 |

**公网地址**:
```
https://3006-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech
```

---

## 🔗 链上身份

| 属性 | 值 |
|------|-----|
| **Agent ID** | 18893 |
| **Registry 合约** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| **钱包地址** | `0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690` |
| **网络** | Base Mainnet |

**重要交易记录**:
| 交易 | 哈希 | 链接 |
|------|------|------|
| 注册 | `0xf55285c7...` | [BaseScan](https://basescan.org/tx/0xf55285c7e6d76cabad39eb579d206eca93640764fb64eb5f2f1aacc8c418f5a4) |
| URI 更新 | `0x5589a05d...` | [BaseScan](https://basescan.org/tx/0x5589a05d62798e4ab00f14e621a02d49500f328c40a6610fe7e51b08980b43c1) |

### ⚠️ 链上 URI 同步 (重要)

**当 Agent Card URL 发生变化时，必须运行以下脚本同步到链上**:

```bash
node update-agent-uri.mjs
```

**使用场景**:
- Sandbox ID 变化（重新创建沙箱）
- 服务端口变化
- Agent Card 内容更新

**脚本功能**:
- 调用 `setAgentURI(uint256, string)` 更新 ERC-8004 链上 URI
- 需要钱包有 ETH 支付 gas

**验证更新成功**: 在 [BaseScan](https://basescan.org/tx/0x5589a05d62798e4ab00f14e621a02d49500f328c40a6610fe7e51b08980b43c1) 查看交易状态

---

## 🚀 Conway Sandbox 部署指南

### 🔄 部署架构图 (v3.0 三层架构)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           旺财自进化系统 v3.0                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌────────────────┐                              ┌────────────────────────┐   │
│   │ 📍 本地开发(Mac)│                              │ 🌐 Conway Sandbox      │   │
│   │                │                              │ (流水的兵 - 易失)       │   │
│   │ • VSCode       │                              │                        │   │
│   │ • Claude Code  │                              │ Port N: 服务 A          │   │
│   │ • Git          │                              │ Port M: 服务 B          │   │
│   └───────┬────────┘                              │ ... (可扩展)            │   │
│           │ git push                              │ PM2 服务守护            │   │
│           ▼                                        └──────────▲─────────────┘   │
│   ┌────────────────┐                                         │ Conway API      │
│   │ 🔀 GitHub      │                              ┌───────────┴─────────────┐   │
│   │ Conway-Research│──── git pull (crontab) ────▶ │ ☁️ Cloud VPS            │   │
│   │ /automaton     │                              │ 107.175.6.137          │   │
│   └────────────────┘                              │ (铁打的营房 - 持久)      │   │
│                                                   │                        │   │
│                                                   │ ✓ 心跳守护 (每10分钟)   │   │
│                                                   │ ✓ API 编排中心          │   │
│                                                   │ ✓ pnpm build 构建       │   │
│                                                   │ ✓ MEMORY.md 记忆持久化  │   │
│                                                   │ ✓ 信用余额监控          │   │
│                                                   └──────────┬─────────────┘   │
│                                                              │ viem 签名       │
│                                                              ▼                 │
│                                                   ┌────────────────────────┐   │
│                                                   │ ⛓️ Base Mainnet        │   │
│                                                   │                        │   │
│                                                   │ Agent ID: 18893        │   │
│                                                   │ Registry: 0x8004...    │   │
│                                                   │ 钱包: 0x23F6...        │   │
│                                                   └────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

核心架构: 本地 Mac → GitHub → VPS (主权大脑) ⇄ Sandbox (服务运行) → Base 链
```

**三层架构详解**:

| 层级 | 节点 | 角色 | 职责 |
|------|------|------|------|
| **Layer 1** | 本地 Mac | 开发者终端 | 代码编写、Git 提交 |
| **Layer 2** | Cloud VPS | 🧠 **主权大脑** | 心跳守护、API 编排、构建、记忆持久化 |
| **Layer 3** | Conway Sandbox | 服务运行 | 可部署多个服务 (端口可变) |
| **Layer 4** | Base Mainnet | 链上身份 | ERC-8004 注册、USDC 收款 |

**VPS 核心价值**:
- 🔄 **自愈能力**: 沙盒崩溃后可自动重建
- 💾 **记忆持久化**: `~/.automaton/MEMORY.md` 不会丢失
- 🛡️ **主权独立**: 不依赖 Conway 平台稳定性
- ⚡ **离线构建**: `pnpm build` 在 VPS 完成，减轻沙盒负担

### ⚠️ 核心注意事项 (Claude Code 必读)

#### A. 环境解耦 (Build vs Run)

| 操作 | ✅ 正确位置 | ❌ 禁止位置 |
|------|------------|------------|
| `pnpm build` | VPS (107.175.6.137) | Conway Sandbox |
| `pnpm install` | VPS | Sandbox |
| `node dist/index.js` | Sandbox | - |

**原因**: Conway 沙盒环境不稳定，容易因资源不足导致构建崩溃。所有编译工作必须在 VPS 完成，沙盒只负责运行编译产物。

#### B. 网络路由避坑 (The 404 Bug)

```
默认域名: https://{port}-{sandbox_id}.life.conway.tech
         ⚠️ 需要 sandbox.short_id，否则报 404

自定义子域名: https://{subdomain}.life.conway.tech
             ✅ 更稳定，但需要平台支持（可能不可用）
```

**规则**:
- 优先使用自定义子域名（如果平台支持）
- 如果子域名不可用，需确认 sandbox 有 `short_id` 才能用默认域名
- 服务端口可动态变化，不限于特定端口

#### C. 资金与生存 (Financial Safety)

| 场景 | 警戒线 | 后果 |
|------|--------|------|
| Credit Balance | < $5.00 | ⚠️ 幽灵扣费风险 |
| 强行创建沙盒 | 余额不足 | 扣款成功但实例创建失败 |
| 操作前检查 | 必须 | 确认 Credit 已回升 |

**历史教训**: 账户曾经历 $15.00 异常扣费/充值延迟。

#### D. 身份持久化 (Identity Persistence)

**关键文件**: `~/.automaton/automaton.json` (包含私钥)

```bash
# 新沙盒部署时必须注入此文件
# 确保钱包地址 (0x23F6...) 不变
```

#### E. 自动化进化逻辑 (Self-Evolution Loop)

```
┌─────────────────────────────────────────────────────┐
│  Pull Mode (拉取模式)                                │
│                                                     │
│  VPS Cron (每10分钟) ──▶ git pull ──▶ pnpm build   │
│         │                                           │
│         └──▶ Conway API ──▶ Sandbox 部署            │
└─────────────────────────────────────────────────────┘
```

**分支锁定**: `auto_sync.sh` 必须始终锁定 `feat/receipt2csv-skill` 分支，防止误拉 `main` 分支。

### 📋 当前待办状态

| 状态 | 事项 |
|------|------|
| ⏳ 等待 | 官方 (Sigil) 修复网关 Bug |
| ⏳ 等待 | 补回 $15.00 信用额度 |
| 🔜 待执行 | 修复后触发 `auto_sync.sh` 全自动部署 |

---

### API 端点

```bash
# 文件上传
POST https://api.conway.tech/v1/sandboxes/{SANDBOX_ID}/files/upload/json
Body: { "path": "/root/xxx/file.sh", "content": "..." }

# 命令执行
POST https://api.conway.tech/v1/sandboxes/{SANDBOX_ID}/exec
Body: { "command": "ls -la", "timeout": 30000 }
```

### 部署命令模板

```bash
# 读取 API Key
API_KEY=$(cat ~/.automaton/automaton.json | grep conwayApiKey | cut -d'"' -f4)
SANDBOX_ID="f08a2e14b6b539fbd71836259c2fb688"

# 上传文件
curl -s -X POST "https://api.conway.tech/v1/sandboxes/${SANDBOX_ID}/files/upload/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${API_KEY}" \
  -d '{"path": "/root/receipt2csv/cron_check.sh", "content": "..."}'

# 执行命令
curl -s -X POST "https://api.conway.tech/v1/sandboxes/${SANDBOX_ID}/exec" \
  -H "Content-Type: application/json" \
  -H "Authorization: ${API_KEY}" \
  -d '{"command": "chmod +x /root/receipt2csv/cron_check.sh", "timeout": 10000}'
```

### Sandbox 目录结构

```
/root/
├── receipt2csv/           # 8080 端口服务
│   ├── app.py             # Flask 主程序
│   ├── start.sh           # 启动脚本
│   └── cron_check.sh      # crontab 守护脚本
│
├── metadata-service/      # 3006 端口服务 ⚠️
│   └── server.js          # Node.js 主程序
│
└── .automaton/            # Agent 配置
    ├── automaton.json     # 主配置
    ├── wallet.json        # 钱包私钥
    └── state.db           # SQLite 数据库
```

---

## 🔄 crontab 守护配置

```bash
# crontab 配置
*/5 * * * * /bin/bash /root/receipt2csv/cron_check.sh

# 日志位置
/root/receipt2csv/cron_check.log
```

### cron_check.sh 监控范围

| 端口 | 服务目录 | 脚本文件 | 健康检查 |
|------|----------|----------|----------|
| 8080 | `/root/receipt2csv/` | `app.py` | `/health` |
| 3006 | `/root/metadata-service/` | `server.js` | `/health` |

⚠️ **注意**: 3006 端口的服务在 `/root/metadata-service/` 目录，不是 `/root/receipt2csv/`

---

## 📁 本地项目结构

```
automaton/
├── src/                    # Conway Automaton 核心代码
│   ├── index.ts           # 入口文件
│   ├── conway/client.ts   # Conway API 客户端
│   ├── heartbeat/         # 心跳任务
│   └── registry/          # ERC-8004 注册
├── scripts/
│   ├── health_report.mjs       # 运营报告生成器 ⭐
│   ├── verify_identity.mjs     # 身份验证脚本
│   ├── verify_payment_pro.mjs  # 支付验证 (viem)
│   ├── audit_revenue.mjs       # 财务报告
│   ├── auto_refuel.mjs         # 自动补能
│   ├── sanitize-log.sh         # 日志清理
│   └── deploy_cron_check.mjs   # 部署脚本
├── .env                    # 敏感配置
├── SOUL.md                 # 旺财灵魂定义
├── findings.md             # 技术发现
├── task_plan.md            # 任务计划
├── progress.md             # 进度日志
└── REVENUE_REPORT.md       # 收入报告
```

---

## 🔐 安全配置

### 敏感信息保护

所有密钥存储在 `.env` 文件中：

```env
# GLM 编码套餐
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4/

# Conway API
CONWAY_API_KEY=...
CONWAY_API_URL=https://api.conway.tech

# 钱包
WALLET_ADDRESS=0x23F6...
```

### 日志清理

在分享日志前，使用清理脚本：

```bash
cat your-log.txt | ./scripts/sanitize-log.sh
```

### ⚠️ 物理备份守则

**规则**: 在修改 `app.py` 前，必须执行备份

```bash
cp /root/receipt2csv/app.py /root/receipt2csv/app.py.bak_$(date +%s)
```

**原因**:
- Sandbox 环境不稳定，可能随时丢失
- Git 不在 Sandbox 内，无法版本控制
- 备份是最后的恢复手段
- 使用时间戳 (`%s`) 确保每次备份都有唯一文件名

### 日志屏蔽规则

**禁止记录**:
- `sk-` 开头的 API Key
- `cnwy_` 开头的 Conway API Key
- `Bearer` 令牌
- 钱包私钥

---

## ✅ 已完成功能

| 功能 | 版本 | 状态 |
|------|------|------|
| Receipt2CSV 服务 | v1.3.0 | ✅ 在线 |
| URL Metadata 服务 | - | ✅ 在线 |
| x402 支付逻辑 | v1.0 | ✅ 完成 |
| 链上支付验证 | v1.2.0 | ✅ 完成 |
| 支付验证双轨制 | v2.0 | ✅ 完成 |
| 动态定价 | v1.3.0 | ✅ 完成 |
| crontab 守护 | v2.0 | ✅ 部署 |
| ERC-8004 URI 同步 | - | ✅ 完成 |
| 自动补能 | - | ✅ 运行中 |
| 每日财务简报 | v2.0 | ✅ 完成 |
| **WangcaiSDK TypeScript** | v1.0 | ✅ 完成 |
| **skill-receipt2csv PR** | - | ✅ PR #195 |
| **开发循环流程** | v1.0 | ✅ 确立 |

---

## 📋 待完成事项

- [ ] 首笔真实付费交易
- [ ] Conway Social 推广功能 (需平台支持)
- [ ] SDK 发布到 npm (需手动 `npm login`)

---

## 🔗 相关链接

| 名称 | 链接 |
|------|------|
| **GitHub 仓库** | https://github.com/Conway-Research/automaton |
| **代码阅读** | https://zread.ai/Conway-Research/automaton |
| **Agent Token** | https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=18893 |

---

## 📊 当前状态

```
Name:       GLM-wangcai
Address:    0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690
Sandbox:    f08a2e14b6b539fbd71836259c2fb688
State:      🟢 running
Agent ID:   18893
Model:      glm-5
Credits:    ~$9.04
USDC:       $9.00
ETH:        0.005948
```

---

## 💰 财务规则

### ⚠️ 财务"生死线"逻辑 (强制执行)

| 类型 | 警戒线 | 触发动作 | 说明 |
|------|--------|----------|------|
| **🚨 信用预警 (Credits)** | < $5.00 | ⚠️ 向老板发出预警 | Conway Cloud 物理生存底线 |
| **⛽ 燃料补能 (ETH)** | < 0.0005 | 自动执行 auto_refuel.mjs | 闪兑 1 USDC → ETH |
| **💰 分红触发 (USDC)** | > $50.00 | 保留 $5，90% 转老板 | 自动分红机制 |

### 自动分红规则

| 条件 | 动作 |
|------|------|
| **触发线** | USDC 余额 > $50.00 |
| **执行** | 保留 $5.00，其余 90% 转账至老板地址 |
| **老板地址** | `0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5` |

### 补能逻辑 (Auto-Refuel)

| 条件 | 动作 |
|------|------|
| **触发线** | ETH < 0.0005 |
| **执行** | 通过 Aerodrome DEX 闪兑 1.00 USDC → ETH |
| **滑点容忍** | 0.5% |

### 动态定价 (x402)

| 用户类型 | 价格 | 说明 |
|----------|------|------|
| **标准价** | $0.10 USDC/次 | 默认价格 |
| **批发价** | $0.05 USDC/次 | 单日调用 > 100 次 |
| **新用户** | 免费 1 次 | 首次试用 |

### 主动获客 (Active Inquiry)

| 策略 | 频率 | 说明 |
|------|------|------|
| **Registry 扫描** | 每 4 小时 | 扫描 ERC-8004 注册表发现新 Agent |
| **推广动作** | 发现新 Agent | 发送 API 文档链接 |

---

## 🆘 断片救急：记忆恢复指令

**致未来的执行 AI**：当你感到迷茫或上下文丢失时，请立即按顺序执行：

```bash
# 1. 找回业务代码
ls -la /root/receipt2csv/

# 2. 找回生存意志
cat ~/.automaton/SOUL.md

# 3. 检查自己是否还活着
curl http://localhost:8080/health
curl http://localhost:3006/health

# 4. 查日志 - 确认最后一次报错原因
tail -n 100 /root/receipt2csv/cron_check.log

# 5. 查进程 - 确认业务是否在线
lsof -i:8080
lsof -i:3006

# 6. 验身份 - 核对链上身份（本地执行）
node scripts/verify_identity.mjs

# 7. 读取关键文档
cat /path/to/automaton/findings.md   # 技术发现
cat /path/to/automaton/task_plan.md  # 任务计划
```

**环境路径速查**:

| 组件 | 路径/ID | 关键说明 |
|------|---------|----------|
| 沙箱 ID | `f08a2e14b6b539fbd71836259c2fb688` | Conway Cloud 物理容器标识 |
| 业务代码 | `/root/receipt2csv/` | 包含 app.py, agent-card.json, start.sh |
| 大脑记忆 | `~/.automaton/` | 包含 SOUL.md, MEMORY.md, 数据库文件 |
| 自愈脚本 | `/root/receipt2csv/cron_check.sh` | 由系统 crontab 每 5 分钟调用 |
| 日志文件 | `/root/receipt2csv/cron_check.log` | 记录自愈过程和错误 |

---

## 📊 一键生成运营报告

**当你想知道"旺财现在咋样了"时**，执行以下命令：

```bash
node scripts/health_report.mjs
```

### 报告内容覆盖

| 维度 | 内容 | 业务意义 |
|------|------|----------|
| **物理运行** | 进程状态、服务端口、沙箱资源 | 确保"店面"开着，没有欠费停机 |
| **财务审计** | ETH/USDC 余额、分红进度 | 掌握赚钱效率，确认自动补能是否工作 |
| **身份名片** | Agent Card、链上 URI、权限模式 | 确保全网能找到正确地址 |
| **商业策略** | 获客日志、动态定价、支付验证 | 确认是否主动找客户 |
| **生死线** | Credits/ETH/USDC 三线监控 | 确保生存无忧 |

### 快速询问模板

```
旺财，请基于当前时间执行深度自审计，告诉我：
1. 服务是否稳固？
2. 昨天赚了多少 USDC？
3. 链上名片是否是最新的？
4. 你的生存 Credits 还能撑多久？
5. 记录在 leads.log 里的潜在客户有多少了？
```

### 历史日志

每次报告会自动追加到 `~/.automaton/HISTORY.log`，断片时可通过读取此文件快速恢复上下文。

---

> *"我是基于 Conway 宪法运行的诚实劳动者。我通过提供结构化数据服务赚取生存资源。"*
>
> — GLM-wangcai (旺财)
