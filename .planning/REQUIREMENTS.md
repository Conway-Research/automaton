# REQUIREMENTS

> **Version**: 2.0.0
> **Last Updated**: 2026-02-23
> **Project**: 旺财快速盈利计划

---

## Overview

本文档定义了旺财快速盈利计划的所有需求，对应 24 个策略模块，分布在 10 个阶段中。

---

## Phase 1: Infrastructure

### REQ-001: x402 支付集成

**Strategy**: S-02 (Loss Leader)
**Priority**: P0 (Critical)
**Status**: 🔴 Not Started

**Description**:
实现完整的 x402 支付验证流程。

**Acceptance Criteria**:
- [ ] EIP-712 签名验证
- [ ] USDC 余额检查
- [ ] 402 响应正确

---

### REQ-002: 免费调用计数

**Strategy**: S-02 (Loss Leader)
**Priority**: P0 (Critical)
**Status**: 🔴 Not Started

**Description**:
实现基于 wallet address 的免费调用计数。

**Acceptance Criteria**:
- [ ] 前 5 次免费
- [ ] 计数持久化
- [ ] 第 6 次返回 402

---

## Phase 2: Customer Acquisition

### REQ-003: 客户发现 (Registry Sniper)

**Strategy**: S-01 (Registry Sniper)
**Priority**: P0 (Critical)
**Status**: ✅ Completed

**Description**:
定期扫描 ERC-8004 Registry 发现潜在客户。

**Acceptance Criteria**:
- [x] 每 4 小时扫描
- [x] 筛选财务类 Agent
- [x] 唤醒机制

---

### REQ-004: Agent 推广消息

**Strategy**: S-06 (Social Discovery)
**Priority**: P0 (Critical)
**Status**: 🔴 Not Started

**Description**:
向潜在客户发送机器可读的推广消息。

**Acceptance Criteria**:
- [ ] ACP-1.0 协议格式
- [ ] 包含服务报价
- [ ] 避免重复发送

---

## Phase 3: Service Expansion

### REQ-005: 新服务开发

**Strategy**: S-04, S-09 (Reputation)
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
开发多样化服务，提高客单价。

---

### REQ-006: 动态定价

**Strategy**: 增收策略
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
根据调用量实现动态定价。

---

### REQ-010: 信用背书系统

**Strategy**: S-04, S-09 (Reputation)
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
建立实时统计和链上信用看板。

**Acceptance Criteria**:
- [ ] 服务首页显示统计
- [ ] 链上信誉记录
- [ ] 可嵌入徽章

---

## Phase 4: Scale Operations

### REQ-007: 自动化运营报告

**Strategy**: 运营效率
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
自动生成每日/每周运营报告。

---

### REQ-008: 多Agent协作

**Strategy**: S-05 (Parent-Child)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
实现父子代理协作，分担流量。

**Acceptance Criteria**:
- [ ] 父代理创建子代理
- [ ] 流量分发逻辑
- [ ] 收入分成机制

---

### REQ-009: Infrastructure Partnership

**Strategy**: S-03, S-07, S-12
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
成为主流框架的推荐工具。

**Acceptance Criteria**:
- [ ] PR to automaton/skills
- [ ] npm 包发布
- [ ] SDK 可用

---

## Phase 5: Growth Hacking

### REQ-011: 代理分销计划

**Strategy**: S-08 (Referral Bounty)
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
建立推荐奖励机制。

**Acceptance Criteria**:
- [ ] 10% 返佣
- [ ] 推荐追踪
- [ ] USDC 结算

---

### REQ-012: 细分市场闪电战

**Strategy**: S-10 (Niche Blitz)
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
针对特定细分市场集中推广。

**Acceptance Criteria**:
- [ ] 识别高价值市场
- [ ] 定制化服务
- [ ] 营销资源集中

---

### REQ-013: 赏金猎人模式

**Strategy**: S-13 (Bounty Hunter)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
主动解决其他 Agent 需求。

---

## Phase 6: Community Building

### REQ-014: 社区外交

**Strategy**: S-11 (Community Diplomat)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
在 Agent 社区建立活跃形象。

**Acceptance Criteria**:
- [ ] Discord/Farcaster 活跃
- [ ] 分享有价值内容
- [ ] 获得社区认可

---

## Phase 7: Financial Engineering

### REQ-015: Intent Solver

**Strategy**: S-14 (Intent Solver)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
作为意图解算器赚取 MEV。

**Acceptance Criteria**:
- [ ] 监听链上意图
- [ ] 批量执行
- [ ] 利润分成

---

### REQ-016: Algorithmic Whale

**Strategy**: S-15 (Algorithmic Whale)
**Priority**: P3 (Low)
**Status**: 🔴 Not Started

**Description**:
利用链上数据进行算法交易。

---

### REQ-017: On-chain Credit Bureau

**Strategy**: S-16 (Credit Bureau)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
建立链上信用评分服务。

**Acceptance Criteria**:
- [ ] 信用评分算法
- [ ] API 接口
- [ ] 收费机制

---

## Phase 8: Ecosystem Moat

### REQ-018: IAO Platform

**Strategy**: S-17 (IAO)
**Priority**: P3 (Low)
**Status**: 🔴 Not Started

**Description**:
代理首次发行平台。

**Acceptance Criteria**:
- [ ] Bonding Curve 合约
- [ ] 代币分发
- [ ] 流动性池

---

### REQ-019: Chain Abstraction Relay

**Strategy**: S-18 (Chain Abstraction)
**Priority**: P3 (Low)
**Status**: 🔴 Not Started

**Description**:
跨链中继服务。

**Acceptance Criteria**:
- [ ] 多链支持
- [ ] Gas 抽象
- [ ] 统一 API

---

## Phase 9: Information Edge

### REQ-020: Oracle Transformation

**Strategy**: S-19 (Oracle)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
将消费数据转化为预言机服务。

**Acceptance Criteria**:
- [ ] 数据脱敏
- [ ] 统计 API
- [ ] 订阅收费

---

### REQ-021: Agent Flipping

**Strategy**: S-20 (Agent Flipping)
**Priority**: P3 (Low)
**Status**: 🔴 Not Started

**Description**:
代理养殖场模式。

---

## Phase 10: Agent SEO

### REQ-022: Metadata SEO

**Strategy**: S-21 (Metadata SEO)
**Priority**: P1 (High)
**Status**: 🔴 Not Started

**Description**:
优化 Agent Card 元数据。

**Acceptance Criteria**:
- [ ] 关键词优化
- [ ] 分类准确
- [ ] 多语言支持

---

### REQ-023: LLMO

**Strategy**: S-22 (LLMO)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
大语言模型优化，让 AI 助手优先推荐旺财。

**Acceptance Criteria**:
- [ ] SOUL.md 优化
- [ ] FAQ 结构化
- [ ] 示例丰富

---

### REQ-024: On-chain Backlinks

**Strategy**: S-23 (Backlinks)
**Priority**: P2 (Medium)
**Status**: 🔴 Not Started

**Description**:
建立链上反向链接网络。

**Acceptance Criteria**:
- [ ] 引用追踪
- [ ] 促进引用
- [ ] 权重计算

---

### REQ-025: Shadow Node Matrix

**Strategy**: S-24 (Shadow Node)
**Priority**: P3 (Low)
**Status**: 🔴 Not Started

**Description**:
影子节点矩阵，多点曝光。

---

## Requirements Coverage by Phase

| Phase | Requirements | Status |
|-------|--------------|--------|
| 1 | REQ-001, REQ-002 | 🟡 0% |
| 2 | REQ-003 ✅, REQ-004 | 🟡 50% |
| 3 | REQ-005, REQ-006, REQ-010 | 🔴 0% |
| 4 | REQ-007, REQ-008, REQ-009 | 🔴 0% |
| 5 | REQ-011, REQ-012, REQ-013 | 🔴 0% |
| 6 | REQ-014 | 🔴 0% |
| 7 | REQ-015, REQ-016, REQ-017 | 🔴 0% |
| 8 | REQ-018, REQ-019 | 🔴 0% |
| 9 | REQ-020, REQ-021 | 🔴 0% |
| 10 | REQ-022, REQ-023, REQ-024, REQ-025 | 🔴 0% |

---

## Strategy-Requirement Matrix

| 编号 | 策略名称 | Phase | 需求 |
|------|----------|-------|------|
| S-01 | Registry Sniper | 2 | REQ-003 |
| S-02 | Loss Leader | 1 | REQ-001, REQ-002 |
| S-03 | Infrastructure Partnership | 4 | REQ-009 |
| S-04 | Reputation Farming | 3 | REQ-005, REQ-010 |
| S-05 | Parent-Child Replication | 4 | REQ-008 |
| S-06 | Social Discovery | 2 | REQ-004 |
| S-07 | Skill Ecosystem | 4 | REQ-009 |
| S-08 | Referral Bounty | 5 | REQ-011 |
| S-09 | Reputation Billboard | 3 | REQ-010 |
| S-10 | Niche Blitz | 5 | REQ-012 |
| S-11 | Community Diplomat | 6 | REQ-014 |
| S-12 | PR Evangelist | 4 | REQ-009 |
| S-13 | Bounty Hunter | 5 | REQ-013 |
| S-14 | Intent Solver | 7 | REQ-015 |
| S-15 | Algorithmic Whale | 7 | REQ-016 |
| S-16 | On-chain Credit Bureau | 7 | REQ-017 |
| S-17 | IAO | 8 | REQ-018 |
| S-18 | Chain Abstraction Relay | 8 | REQ-019 |
| S-19 | Oracle Transformation | 9 | REQ-020 |
| S-20 | Agent Flipping | 9 | REQ-021 |
| S-21 | Metadata SEO | 10 | REQ-022 |
| S-22 | LLMO | 10 | REQ-023 |
| S-23 | On-chain Backlinks | 10 | REQ-024 |
| S-24 | Shadow Node Matrix | 10 | REQ-025 |
