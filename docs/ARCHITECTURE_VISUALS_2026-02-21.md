# Conway Architecture Visuals (2026-02-21)

This file provides immediately usable architecture diagrams for the current codebase.

---

## 1) High-Level System Diagram

```mermaid
flowchart LR
  Creator[Creator / Operator]
  CLI[Creator CLI\npackages/cli/src/*]

  subgraph Runtime[Automaton Runtime Process]
    IDX[src/index.ts]
    LOOP[src/agent/loop.ts]
    TOOLS[src/agent/tools.ts]
    HB[src/heartbeat/daemon.ts]
    SYS[src/agent/system-prompt.ts]
  end

  subgraph State[Persistence]
    DB[(SQLite\n~/.automaton/state.db\nsrc/state/schema.ts\nsrc/state/database.ts)]
    CFG[(Config + Wallet\n~/.automaton/automaton.json\n~/.automaton/wallet.json)]
    SK[(Skills dir\n~/.automaton/skills/*)]
  end

  subgraph External[External Services]
    INF[Inference APIs\nsrc/conway/inference.ts]
    X402[x402 / USDC\nsrc/conway/x402.ts]
    CH[Conway Client Adapter\nsrc/conway/client.ts]
    SOC[Social Relay\nsrc/social/client.ts]
    BIN[Binance Market Data\nsrc/trading/*, src/backtesting/*]
  end

  Creator --> CLI
  Creator --> IDX
  CLI --> DB

  IDX --> LOOP
  IDX --> HB
  IDX --> DB
  IDX --> CFG
  IDX --> SK

  LOOP --> SYS
  LOOP --> TOOLS
  LOOP --> DB
  LOOP --> INF

  HB --> DB
  HB --> CH
  HB --> SOC

  TOOLS --> CH
  TOOLS --> X402
  TOOLS --> DB
  TOOLS --> BIN
```

---

## 2) Runtime Execution Flow Diagram

```mermaid
flowchart TD
  A[Process start\nsrc/index.ts] --> B{Config exists?}
  B -- no --> B1[Run setup wizard\nsrc/setup/wizard.ts]
  B1 --> C
  B -- yes --> C[Load wallet + API key\nsrc/identity/*]

  C --> D[Init SQLite DB\nsrc/state/database.ts]
  D --> E[Create clients\nconway + inference + social]
  E --> F[Load heartbeat config\nsrc/heartbeat/config.ts]
  F --> G[Start heartbeat daemon\nsrc/heartbeat/daemon.ts]

  G --> H[Outer while true loop\nsrc/index.ts]
  H --> I[Run agent loop\nsrc/agent/loop.ts]

  I --> J[Wake prompt + context build]
  J --> K[Survival tier + kill switch checks]
  K --> L[Inference call]
  L --> M{Tool calls?}

  M -- yes --> N[Execute tools\nsrc/agent/tools.ts]
  N --> O[Persist turn/tool results\nturns + tool_calls tables]
  M -- no --> O

  O --> P{Sleep/dead/idle?}
  P -- sleeping --> Q[Set sleep_until in KV]
  P -- dead --> R[Dead wait cycle]
  P -- continue --> J

  Q --> S[Heartbeat may set wake_request]
  S --> H
  R --> H
```

---

## 3) Data / Storage Map

```mermaid
flowchart LR
  subgraph Files
    A1[~/.automaton/automaton.json]
    A2[~/.automaton/wallet.json]
    A3[~/.automaton/heartbeat.yml]
    A4[~/.automaton/SOUL.md]
    A5[~/.automaton/skills/*/SKILL.md]
  end

  subgraph DB[SQLite: ~/.automaton/state.db]
    T1[turns]
    T2[tool_calls]
    T3[kv]
    T4[heartbeat_entries]
    T5[transactions]
    T6[modifications]
    T7[skills]
    T8[children]
    T9[registry]
    T10[inbox_messages]
    T11[signals]
    T12[positions]
    T13[notes]
  end

  LOOP[src/agent/loop.ts] --> T1
  LOOP --> T2
  LOOP --> T3
  LOOP --> T10

  HB[src/heartbeat/tasks.ts] --> T3
  HB --> T4
  HB --> T10

  TOOLS[src/agent/tools.ts] --> T5
  TOOLS --> T6
  TOOLS --> T7
  TOOLS --> T8
  TOOLS --> T11
  TOOLS --> T12
  TOOLS --> T13

  SETUP[src/setup/wizard.ts] --> A1
  SETUP --> A2
  SETUP --> A3
  SETUP --> A4
  SETUP --> A5

  CFG[src/config.ts] --> A1
  WAL[src/identity/wallet.ts] --> A2
  SKL[src/skills/loader.ts] --> A5
  SKL --> T7
```

---

## 4) Strategy Decision Pipeline (Live + Research)

```mermaid
flowchart TD
  subgraph Live[Live Runtime Decisioning]
    L1[Wake cycle starts\nsrc/agent/loop.ts]
    L2[Pull context + recent turns + financial state]
    L3[LLM decides actions]
    L4[Trading tools invoked\nfetch_market_context\ncalculate_atr\nopen/close paper position]
    L5[Persist signals/positions/PnL\nstate.db]
    L6{Kill switch active?\ntrading/drawdown.ts keys}
    L7[Force sleep/halt trading]
  end

  subgraph Research[Offline Quant Research]
    R1[Fetch/load candles\nbacktester.ts]
    R2[Run strategy A/B/C/D/E\nbacktester.ts + strategies.ts]
    R3[Compute metrics\nmetrics.ts]
    R4[Grid optimize\noptimizer.ts / optimizer2.ts]
    R5[Save results\ndata/backtest_results*.json]
  end

  L1 --> L2 --> L3 --> L4 --> L5 --> L6
  L6 -- yes --> L7
  L6 -- no --> L3

  R1 --> R2 --> R3 --> R4 --> R5

  R5 -. optional manual adoption .-> L3
```

---

## File Paths by Major Visualized Subsystem

- Runtime orchestrator: `/Users/stackie/projects/conway-real/src/index.ts`
- Agent loop + tools: `/Users/stackie/projects/conway-real/src/agent/loop.ts`, `/Users/stackie/projects/conway-real/src/agent/tools.ts`
- Heartbeat: `/Users/stackie/projects/conway-real/src/heartbeat/daemon.ts`, `/Users/stackie/projects/conway-real/src/heartbeat/tasks.ts`
- Persistence: `/Users/stackie/projects/conway-real/src/state/schema.ts`, `/Users/stackie/projects/conway-real/src/state/database.ts`
- Trading runtime helpers: `/Users/stackie/projects/conway-real/src/trading/market.ts`, `/Users/stackie/projects/conway-real/src/trading/atr.ts`, `/Users/stackie/projects/conway-real/src/trading/drawdown.ts`
- Backtesting engine: `/Users/stackie/projects/conway-real/src/backtesting/backtester.ts`, `/Users/stackie/projects/conway-real/src/backtesting/strategies.ts`, `/Users/stackie/projects/conway-real/src/backtesting/optimizer.ts`, `/Users/stackie/projects/conway-real/src/backtesting/optimizer2.ts`
- External adapters: `/Users/stackie/projects/conway-real/src/conway/client.ts`, `/Users/stackie/projects/conway-real/src/conway/inference.ts`, `/Users/stackie/projects/conway-real/src/conway/x402.ts`, `/Users/stackie/projects/conway-real/src/social/client.ts`
