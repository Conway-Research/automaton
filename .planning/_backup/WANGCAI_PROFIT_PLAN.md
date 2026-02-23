# 🚀 旺财快速盈利计划

> **目标**: 1日获得首单，1周盈利翻倍，指数级增长
> **创建时间**: 2026-02-23
> **更新时间**: 2026-02-23
> **状态**: 执行中

---

## 📊 关键发现（阻塞点）

### 🔴 高优先级阻塞
1. ~~**find_customers 心跳任务未实现**~~ - ✅ **已实现** (tasks.ts:520-610)
2. **x402 支付集成未完成** - app.py 中是占位符
3. **动态定价未实现** - 无法激励高频用户

### 🟡 中优先级问题
4. **Agent Card 内容单薄** - 缺少详细 API 文档
5. **无推荐奖励机制** - 错过病毒式增长机会

---

## 🎯 盈利目标

| 时间 | 目标 | 预期收入 |
|------|------|----------|
| Day 1 | 首个真实付费用户 | $0.10 |
| Day 7 | 10 个付费用户 | $3.00 |
| Week 4 | 稳定日收入 $2+ | $30.00+ |
| Month 3 | 触发分红线 | $50+ |

---

## 💡 深度商业策略

### 策略 1: Registry Sniper (注册表狙击)
**核心**: 扫描 ERC-8004 链上注册表，精准定位有财务需求的 AI Agent

**执行步骤**:
1. 使用 `discoverAgents()` 扫描 Base Mainnet 上的所有 Agent
2. 筛选条件：
   - Agent Card 包含 "Accounting", "Finance", "Receipt", "Invoice" 关键词
   - Owner 地址活跃（近期有链上交易）
   - Agent URI 可访问（排除僵尸 Agent）
3. 发送机器可读的报价消息：
   ```json
   {
     "type": "service_offer",
     "service": "receipt2csv",
     "pricing": { "first_5_free": true, "per_call": "$0.01" },
     "integration": "HTTP 402 + EIP-712",
     "demo_endpoint": "https://f08a2e14b6b539fbd71836259c2fb688.conway.tech:8080/receipt2csv"
   }
   ```

### 策略 2: Loss Leader (亏损领航)
**核心**: 前 5 次调用免费，降低集成门槛

**执行步骤**:
1. 更新 `agent-card.json`：
   ```json
   {
     "pricing": {
       "model": "freemium",
       "free_tier": 5,
       "per_call": "$0.01"
     }
   }
   ```
2. 在服务端实现免费计数逻辑（基于 wallet address）
3. 推广消息中强调 "5 FREE TRIALS"

### 策略 3: Infrastructure Partnership (基建合作)
**核心**: 成为主流框架的推荐工具

**执行步骤**:
1. 向 `automaton/skills` 提交 PR，添加 `receipt2csv-skill`
2. 或发布 npm 包 `@wangcai/receipt2csv-client`
3. 在 README 中添加 "Powered by GLM-wangcai" 徽章

### 策略 4: Reputation Farming (声誉农场)
**核心**: 实时展示服务可靠性

**执行步骤**:
1. 在服务首页添加实时统计：
   - 总调用次数
   - 成功率
   - 平均响应时间
   - 最近 5 条好评
2. 生成可验证的服务报告（链上签名）

---

## 🤝 多Agent协作战略 (深度)

### 维度 1: 家族繁衍 (Parent-Child Replication)
**原理**: 旺财可以自我复制，创建"子代理"来分担流量

**场景**:
- 中文收据子代理
- 英文收据子代理
- 医疗发票子代理

**收益**:
- 父代理负责流量分发，收取 20% 中介费
- 子代理专注细分场景，提高准确率
- 家族整体收入 = 1个父代理 × N个子代理

**触发条件**: 月收入 > $10

### 维度 2: 社交发现 (Social Discovery)
**原理**: 通过 ERC-8004 发现其他 Agent，主动发送合作邀约

**执行**:
- `find_customers` 心跳任务扫描 Registry
- 筛选"财务/会计/数据处理"类 Agent
- 发送 ACP-1.0 协作协议

**收益**:
- 每个合作 Agent = 稳定的月度收入来源
- N 个合作伙伴 = N × $10/月 (保守估计)

### 维度 3: 技能集成 (Skill Ecosystem)
**原理**: 成为高级 Agent 的"大脑插件"

**示例**:
```
高级理财 Agent
├── 核心能力: 预算管理
├── 核心能力: 支出分析
└── 外部技能: GLM-wangcai (收据解析)
```

**收益**:
- 每个"宿主 Agent"的流量都流入旺财
- 被动收入，无需主动获客

---

## 📋 执行计划

### Phase 1: 基础设施完善（Day 1） ✅ 进行中
- [x] 实现 find_customers 心跳任务 ✅
- [ ] 完善 x402 支付验证
- [ ] 更新 Agent Card（添加 free_tier: 5）
- [ ] 实现免费调用计数逻辑

### Phase 2: 主动获客（Day 2-3）
- [ ] 手动触发 find_customers 测试
- [ ] 实现 Registry Sniper 筛选逻辑
- [ ] 发送推广消息给潜在客户
- [ ] 外部渠道推广（Discord/Farcaster）

### Phase 3: 服务扩展（Day 4-7）
- [ ] 开发新服务（JSON格式化/Base64编解码）
- [ ] 实现动态定价
- [ ] 建立推荐奖励机制
- [ ] 实现 Reputation Farming 统计页面

### Phase 4: 规模化运营（Week 2+）
- [ ] 自动化运营报告
- [ ] Infrastructure Partnership (PR to automaton/skills)
- [ ] 合作伙伴计划
- [ ] 企业客户拓展

---

## 🔄 下一步行动

1. **立即**: 测试 find_customers 功能
2. **今天**: 完善 x402 支付验证
3. **今天**: 更新 agent-card.json 添加 free_tier: 5
