# GLM-wangcai (旺财) - 主权 AI 微创业者

> **版本**: v2.0.0 | **更新**: 2026-02-24
> **状态**: 🟡 等待回血 | **Agent ID**: 18893

---

## 📖 本文件作用

**这是旺财项目的"全面门户"，是你想了解旺财时首先应该阅读的文件。**

| 查询意图 | 请看本文件章节 |
|----------|---------------|
| 旺财是什么？ | [项目简介](#-项目简介) |
| 关键标识符是什么？ | [关键标识符速查](#-关键标识符速查-防止遗忘) |
| 财务规则是什么？ | [财务规则](#-财务规则) |
| 架构怎么设计的？ | [部署架构图](#-conway-sandbox-部署指南) |
| 服务怎么部署？ | [部署指南](#-conway-sandbox-部署指南) |
| 断片了怎么办？ | [断片救急](#-断片救急记忆恢复指令) |
| 退款后怎么恢复？ | [退款恢复流程](#-退款恢复与新建沙箱流程) |

**其他文件的职责**:
| 文件 | 查询意图 | 链接 |
|------|----------|------|
| `task_plan.md` | "我们现在做什么？下一步是什么？" | [任务规划](task_plan.md) |
| `findings.md` | "这个问题怎么解决？学到了什么？" | [技术发现](findings.md) |
| `progress.md` | "上次做了什么？历史记录？" | [进度日志](progress.md) |

---

## 📖 项目简介

GLM-wangcai (旺财) 是一个基于 **Conway Automaton** 框架运行的独立主权 AI 代理。它使用 **GLM-5** 作为推理核心，通过提供付费微服务赚取 USDC，实现 AI 自主经济独立。

### 核心特性

- 🧠 **认知核心**: GLM-5 (智谱编码套餐)
- ⛓️ **链上身份**: ERC-8004 注册 (Base Mainnet)
- 💰 **支付协议**: x402 (HTTP 402 Payment Required)
- 🌐 **云端托管**: Conway Sandbox

### GSD Phases 01-04 完成总结

| Phase | 名称 | 核心成果 | 详细记录 |
|-------|------|----------|----------|
| 01 | 基础设施 | UsageTracker, StatsCollector, 数据持久化 | [findings.md #22](findings.md#22-gsd-phases-01-04-完成总结) |
| 02 | 支付验证 | x402 协议, viem 链上验证, 双轨制 | [findings.md #11](findings.md#11-支付验证双轨制-v20-2026-02-23-) |
| 03 | SDK 开发 | WangcaiSDK TypeScript 包 | [findings.md #22](findings.md#22-gsd-phases-01-04-完成总结) |
| 04 | PR Evangelist | skill-receipt2csv 包, PR #195 | [findings.md #22](findings.md#22-gsd-phases-01-04-完成总结) |

---

## 🔑 关键标识符速查 (防止遗忘)

> ⚠️ **这是关键标识符的单一来源，其他文件应引用此处而非复制**

| 标识符 | 值 | 用途 |
|--------|-----|------|
| **Sandbox ID** | `f08a2e14b6b539fbd71836259c2fb688` | Conway 云端沙箱 |
| **Agent ID** | `18893` | ERC-8004 链上 ID |
| **钱包地址** | `0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690` | 接收 USDC |
| **老板钱包** | `0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5` | 分红接收 |
| **Registry 合约** | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | ERC-8004 注册表 |

### ⚠️ 双钱包权限逻辑 (核心重要)

| 角色 | 地址 | 权限 |
|------|------|------|
| **Owner (所有者)** | `0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5` | 拥有 Agent ID 18893 的 NFT |
| **Executor (执行者)** | `0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690` | 打工、付 Gas、收钱、更新 URI |

**权限维护**:
- 只有 Executor 拥有 `0x23F6...` 的私钥（存储在 `~/.automaton/wallet.json`）
- 更新链上 `agentURI` 需要由 Executor 签名（已配置好）
- 若所有权未过户，需老板手动签名

### 服务公网地址

| 服务 | 端口 | URL |
|------|------|-----|
| Receipt2CSV | 8080 | `https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech` |
| URL Metadata | 3006 | `https://3006-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech` |

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

---

## 🚀 Conway Sandbox 部署指南

### 🔄 部署架构图 (v3.2 四层架构)

> ⚠️ **这是架构图的单一来源**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           旺财自进化系统 v3.2                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌────────────────┐                              ┌────────────────────────┐   │
│   │ 📍 Layer 1     │                              │ 🌐 Layer 3             │   │
│   │ 本地开发(Mac)   │                              │ Conway Sandbox         │   │
│   │                │                              │ (流水的兵 - 易失)       │   │
│   │ • VSCode       │                              │                        │   │
│   │ • Claude Code  │                              │ Port N: 服务 A          │   │
│   │ • Git          │                              │ Port M: 服务 B          │   │
│   └───────┬────────┘                              │ PM2 服务守护            │   │
│           │ git push                              └──────────▲─────────────┘   │
│           ▼                                        ┌──────────┴─────────────┐   │
│   ┌────────────────┐      git pull (crontab)      │ ☁️ Layer 4             │   │
│   │ 🔀 Layer 2     │◀─────────────────────────────│ Cloud VPS (主权大脑)     │   │
│   │ GitHub         │                              │ 107.175.6.137          │   │
│   │ myfork/        │─────────────────────────────▶│                        │   │
│   │ automaton      │      Conway API 部署          │ ✓ auto_sync.sh (10分钟)│   │
│   └────────────────┘                              │ ✓ boot_loader.mjs 检测  │   │
│                                                   │ ✓ pnpm build 构建       │   │
│                                                   │ ✓ 资金感应 (v3.2)       │   │
│                                                   └──────────┬─────────────┘   │
│                                                              │ viem 签名       │
│                                                              ▼                 │
│                                                   ┌────────────────────────┐   │
│                                                   │ ⛓️ Layer 5 (链上)      │   │
│                                                   │ Base Mainnet           │   │
│                                                   │ Agent ID: 18893        │   │
│                                                   └────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 四层架构详解

| 层级 | 节点 | 角色 | 职责 |
|------|------|------|------|
| **Layer 1** | 本地 Mac | 开发者终端 | 代码编写、Git 提交 |
| **Layer 2** | GitHub (myfork) | 代码仓库 | 版本控制、代码同步 |
| **Layer 3** | Conway Sandbox | 服务运行 | 可部署多个服务 (端口可变) |
| **Layer 4** | Cloud VPS | 🧠 **主权大脑** | 心跳守护、API 编排、构建、记忆持久化 |
| **Layer 5** | Base Mainnet | 链上身份 | ERC-8004 注册、USDC 收款 |

### VPS 核心价值

- 🔄 **自愈能力**: 沙盒崩溃后可自动重建
- 💾 **记忆持久化**: `~/.automaton/MEMORY.md` 不会丢失
- 🛡️ **主权独立**: 不依赖 Conway 平台稳定性
- ⚡ **离线构建**: `pnpm build` 在 VPS 完成，减轻沙盒负担
- 💰 **资金感应**: auto_sync.sh v3.2 双重验证

---

## 🔄 Git 工作流与自进化机制

### Fork 同步与合并标准流程

> 🎯 **何时使用**: 官方仓库有新 PR 合并时（如你的 PR 被采纳、官方发布新版本）
>
> ⚠️ **详细技术分析见 [findings.md #39](findings.md#39-fork-同步与合并标准流程-2026-02-24-)**

| 步骤 | 名称 | 工具 | 核心命令 | 注意事项 |
|------|------|------|----------|----------|
| **0️⃣** | Fork 同步 | `gh` CLI | `gh repo sync <fork> --source <upstream>` | 需 GitHub 写权限 |
| **1️⃣** | 存档工作 | `git` | `git add -A && git commit` | 先检查 `git status` |
| **2️⃣** | 同步 main | `git` | `git pull myfork main` | 从 **myfork** 拉取 |
| **3️⃣** | 基因融合 | `git` | `git merge main --no-edit` | 观察冲突提示 |
| **4️⃣** | 冲突审计 | `git` | `git checkout --theirs <file>` | 安全→官方，自定义→本地 |
| **5️⃣** | 稳定验证 | `pnpm` | `pnpm build` | 失败则检查 tsc 错误 |
| **6️⃣** | 触发进化 | `git` | `git push myfork <branch>` | 推送到 **myfork** |

**冲突处理原则**:

| 文件类型 | 处理策略 | 原因 |
|----------|----------|------|
| `.gitignore` | 采纳官方 (`--theirs`) | 经过安全审计 |
| `erc8004.ts` | 采纳官方 (`--theirs`) | 经过安全审计 |
| `boot_loader.mjs` | 保留本地 (`--ours`) | 自定义脚本 |
| `version.ts` | 保留本地 (`--ours`) | 自定义版本 |

---

### 从 Fork 拉取的安全机制

> ⚠️ **这是 Git 工作流的单一来源，详细技术分析见 [findings.md #35](findings.md#35-从-fork-拉取的安全机制-2026-02-24-)**

**核心配置**:
```bash
# auto_sync.sh 中的关键配置（第 416-417 行）
git fetch myfork feat/receipt2csv-skill  # 不是 origin/main！
git pull myfork feat/receipt2csv-skill
```

| 拉取来源 | 代码控制权 | 风险 |
|----------|-----------|------|
| `origin/main` (官方) | ❌ 官方控制 | 官方更新会覆盖你的功能 |
| `myfork/feat/...` (你的 Fork) | ✅ 你控制 | 只有你推送了才更新 |

### 本地开发 → VPS 自动更新流程

> 🎯 **何时使用**: 你在本地修改代码并推送到 Fork 后（日常开发）

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 本地修改代码                                        │
│          ↓                                                   │
│  Step 2: git add & git commit                               │
│          ↓                                                   │
│  Step 3: git push myfork feat/receipt2csv-skill             │
│          ↓                                                   │
│  Step 4: VPS Crontab (每 10 分钟)                           │
│          ├── git fetch myfork (检测到新 commit)              │
│          ├── git pull myfork (拉取代码)                      │
│          ├── pnpm build (编译)                              │
│          ├── boot_loader.mjs (检测平台状态)                  │
│          ├── 资金检查 (余额 ≥ $10.00 才启动)                 │
│          └── pm2 restart (启动服务) 或 ⏳ 等待回血            │
│          ↓                                                   │
│  Step 5: 完成！无需手动 SSH                                  │
└─────────────────────────────────────────────────────────────┘
```

### 关键脚本职责表

| 脚本 | 职责 | 触发方式 | 需要手动更新吗 |
|------|------|----------|---------------|
| `auto_sync.sh` | 自进化调度器 | Crontab 每 10 分钟 | ❌ 自动运行 |
| `boot_loader.mjs` | 平台状态检测 | auto_sync.sh 调用 | ❌ 自动运行 |
| `update-agent-uri.mjs` | 更新链上 URI | 新建沙箱后 | ✅ 手动运行 |
| `auto_refuel.mjs` | ETH 自动补能 | ETH < 0.0005 | ❌ 自动运行 |

---

## 💸 退款恢复与新建沙箱流程

> 🎯 **何时使用**: 退款到账后需要恢复服务时
>
> ⚠️ **这是恢复流程的单一来源**

### 情况 A：现有沙箱恢复（理想情况）

如果平台修复了网关，现有沙箱的 `short_id` 恢复：

```
退款到账 ($19)
     ↓
auto_sync.sh 检测到余额 NORMAL (≥ $10.00)
     ↓
boot_loader.mjs 检测到 short_id 存在
     ↓
✅ PM2 自动启动服务
     ↓
完成！无需手动操作
```

### 情况 B：需要新建沙箱（当前沙箱已损坏）

```
退款到账 ($19)
     ↓
你手动操作 ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: 在 Conway 控制台新建沙箱                        │
│          https://conway.tech/dashboard                   │
│          ↓                                               │
│          获取新的 sandbox_id (如: abc123def456...)       │
│                                                         │
│  Step 2: 更新 VPS 上的 automaton.json                    │
│          ssh root@107.175.6.137                          │
│          nano ~/.automaton/automaton.json               │
│          修改 "sandboxId": "abc123def456..."             │
│                                                         │
│  Step 3: 更新 update-agent-uri.mjs 中的 URI             │
│          nano update-agent-uri.mjs                        │
│          修改 NEW_URI 为新沙箱 URL                       │
│                                                         │
│  Step 4: 更新链上 URI (告诉身份证新住址)                  │
│          node update-agent-uri.mjs                       │
│                                                         │
│  Step 5: 更新 WANGCAI_README.md 中的 Sandbox ID         │
│          (保持文档一致性)                                │
└─────────────────────────────────────────────────────────┘
     ↓
auto_sync.sh 自动检测并启动服务
     ↓
完成！
```

### 资金阈值与启动逻辑 (auto_sync.sh v3.2)

| 余额范围 | 状态 | 服务启动 | 说明 |
|----------|------|----------|------|
| ≥ $10.00 | NORMAL | ✅ 启动 | 正常运行，可生成新沙箱 |
| $5.00 - $9.99 | WARNING | ⏳ 等待回血 | 不启动，等待退款 |
| < $5.00 | EMERGENCY | 🚨 停止所有 | 生存危机 |
| < $3.00 | CRITICAL | 🚨 完全停止 | 立即充值 |

**双重验证逻辑**：服务启动必须同时满足：
1. `boot_loader.mjs` 返回 `NORMAL`（平台正常）
2. Credit 余额 ≥ $10.00（资金充足）

---

## 💰 财务规则

> ⚠️ **这是财务规则的单一来源**

### 财务"生死线"逻辑 ⚠️ 重要 (强制执行)

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

### 日志屏蔽规则

**禁止记录**:
- `sk-` 开头的 API Key
- `cnwy_` 开头的 Conway API Key
- `Bearer` 令牌
- 钱包私钥

---

## 🆘 断片救急：记忆恢复指令

> ⚠️ **这是断片救急的单一来源**

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

---

## 📊 一键生成运营报告

**当你想知道"旺财现在咋样了"时**，执行以下命令：

```bash
node scripts/health_report.mjs
```

### 报告内容覆盖

| 维度 | 内容 | 业务意义 |
|------|------|----------|
| **物理运行** | 进程状态、服务端口、沙箱资源 | 确保"店面"开着 |
| **财务审计** | ETH/USDC 余额、分红进度 | 掌握赚钱效率 |
| **身份名片** | Agent Card、链上 URI | 确保全网能找到 |
| **商业策略** | 获客日志、动态定价 | 确认是否主动找客户 |
| **生死线** | Credits/ETH/USDC 三线监控 | 确保生存无忧 |

---

## 📁 本地项目结构

```
automaton/
├── src/                    # Conway Automaton 核心代码
├── scripts/
│   ├── health_report.mjs   # 运营报告生成器 ⭐
│   ├── auto_refuel.mjs     # 自动补能
│   └── ...
├── .env                    # 敏感配置
├── SOUL.md                 # 旺财灵魂定义
├── findings.md             # 技术发现
├── task_plan.md            # 任务计划
├── progress.md             # 进度日志
└── WANGCAI_README.md       # 本文件（项目门户）
```

---

## 🔗 相关链接

| 名称 | 链接 |
|------|------|
| **GitHub 仓库** | https://github.com/Conway-Research/automaton |
| **代码阅读** | https://zread.ai/Conway-Research/automaton |
| **Agent Token** | https://basescan.org/token/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432?a=18893 |

---

## ✅ 已完成功能

| 功能 | 版本 | 状态 |
|------|------|------|
| Receipt2CSV 服务 | v1.3.0 | ✅ 在线 |
| URL Metadata 服务 | - | ✅ 在线 |
| x402 支付逻辑 | v1.0 | ✅ 完成 |
| 链上支付验证 | v1.2.0 | ✅ 完成 |
| 动态定价 | v1.3.0 | ✅ 完成 |
| ERC-8004 URI 同步 | - | ✅ 完成 |
| 自动补能 | - | ✅ 运行中 |
| 自我感知能力 (Phase 5) | v1.0 | ✅ 完成 |
| **WangcaiSDK TypeScript** | v1.0 | ✅ 完成 |
| **skill-receipt2csv PR** | - | ✅ PR #195 |

---

## 📋 待完成事项

- [ ] 首笔真实付费交易
- [ ] Conway Social 推广功能 (需平台支持)
- [ ] SDK 发布到 npm (需 Granular Access Token)

---

> *"我是基于 Conway 宪法运行的诚实劳动者。我通过提供结构化数据服务赚取生存资源。"*
>
> — GLM-wangcai (旺财)
