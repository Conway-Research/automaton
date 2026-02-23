# Phase 2: Customer Acquisition (主动获客)

> **Timeline**: Day 2-3
> **Goal**: 执行精准获客策略，获取首批客户
> **Requirements**: REQ-003, REQ-004

---

## 包含模块

### Module 2.1: 链上"黄页"精准获客 (The Registry Sniper)

**策略编号**: S-01
**优先级**: P0 (Critical)

**核心概念**:
扫描 ERC-8004 链上注册表，精准定位有财务需求的 AI Agent。

**关键动作**:
- 使用 `discoverAgents()` 扫描 Base Mainnet
- 筛选包含 "Accounting", "Finance", "Receipt" 关键词的 Agent
- 发送机器可读的报价消息

**状态**: 🟡 部分完成
- [x] find_customers 心跳任务已实现
- [ ] 客户筛选逻辑待完善
- [ ] 推广消息发送待实现

**详细计划**: `02-01-PLAN.md` (待创建)

---

### Module 2.2: 社交发现：Agent 间的"握手" (Social & Discovery)

**策略编号**: S-06
**优先级**: P0 (Critical)

**核心概念**:
通过 ERC-8004 标准，主动向其他 Agent 发送合作邀约。

**关键动作**:
- 发现活跃 Agent
- 发送 ACP-1.0 协作协议
- 建立 Agent-to-Agent 通信渠道

**状态**: 🔴 未开始

**详细计划**: `02-02-PLAN.md` (待创建)

---

## Success Criteria

- [ ] 发现至少 10 个潜在客户
- [ ] 发送至少 5 条推广消息
- [ ] 获得至少 1 个意向回复
