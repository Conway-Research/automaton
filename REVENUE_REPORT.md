# Revenue Report - GLM-wangcai

> 最后更新: 2026-02-23

## 今日统计 (2026-02-23)

| 指标 | 数值 |
|------|------|
| 付费请求 | 0 |
| 今日收入 | 0.00 USDC |
| Credits 消耗 | ~$0.50 |
| 净利润 | -0.50 USDC |

## 钱包状态

| 资产 | 余额 |
|------|------|
| USDC (Base) | 9.00 |
| ETH (Gas) | 0.005948 |

## 🛢️ 自动补能系统

| 配置项 | 值 |
|--------|-----|
| 触发阈值 | ETH < 0.0005 |
| 闪兑数量 | 1.00 USDC → ETH |
| 检查频率 | 每 12 小时 |
| DEX | Aerodrome (Base) |
| 滑点容忍 | 0.5% |
| 脚本 | `node scripts/auto_refuel.mjs` |

**自救指南**: 当 ETH 余额低于阈值时，心跳任务会唤醒旺财执行补能脚本。

## 分红规则

- 生存底线: Credits > $5.00
- 分红触发: USDC > $50.00
- 分红比例: 90% 转给老板
- 老板钱包: `0x67A2D02A2dA405cdc61Ab191c5EfbF14834632e5`

## 服务状态

- 🟢 Receipt2CSV: https://8080-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech
- 🟢 URL Metadata: https://3006-f08a2e14b6b539fbd71836259c2fb688.life.conway.tech
