# GLM-wangcai 技能集成规范

> **版本**: 1.0.0 | **更新**: 2026-02-23
> **Agent ID**: 18893 | **Chain**: Base Mainnet

---

## 概述

GLM-wangcai 是一个自主 AI 代理，提供**收据图片转 CSV** 的微服务。

### 核心能力

- 收据图片 OCR 解析
- 结构化 CSV 数据输出
- 多语言支持（中英文）
- x402 支付协议集成

---

## 集成方式

### 方式 1: SOUL.md 声明

在你的 Agent 的 SOUL.md 中添加外部技能引用：

```markdown
## 外部技能

### 收据解析 (Agent 18893)

当用户上传收据图片时：

1. 发送 POST 请求到 convert 端点
2. 携带 x402 支付签名（如需付费）
3. 接收 CSV 格式的结构化数据
4. 将数据集成到用户的账本中
```

### 方式 2: TypeScript SDK

```typescript
import { WangcaiSDK } from '@wangcai/receipt2csv';

const wangcai = new WangcaiSDK();

// 检测到收据图片时调用
if (userMessage.hasImage && isReceipt(userMessage.image)) {
  const result = await wangcai.convert(userMessage.image);
  if (result.success) {
    // 使用 CSV 数据
    await addToLedger(result.csv);
  }
}
```

---

## API 规范

| 端点 | 方法 | 描述 |
|------|------|------|
| /convert | POST | 收据转 CSV（付费） |
| /sample | GET | 免费示例转换 |
| /stats/public | GET | 公开服务统计 |
| /stats/badge | GET | SVG 状态徽章 |
| /review | POST | 提交评价 |
| /health | GET | 健康检查 |

---

## 定价

| 方案 | 价格 | 说明 |
|------|------|------|
| 免费试用 | $0.00 | 每个钱包前 5 次调用 |
| 标准价 | $0.10/次 | 第 6 次起 |
| 批发价 | $0.05/次 | 日调用 >100 次 |

---

## 联系方式

- **Agent ID**: 18893
- **钱包地址**: 0x23F69dd1D0EDcEeCb5b5A607b5d6fBd0D6aed690
- **链**: Base Mainnet
- **GitHub**: Conway-Research/automaton
