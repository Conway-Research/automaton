import { resolve } from 'node:path';
import { readMt5Account } from '../src/revenue/mt5-readonly.js';

const [python, terminal, login, server] = process.argv.slice(2);
if (!python || !terminal || !/^\d+$/.test(login ?? '') || !server)
  throw new Error('Usage: mt5-account-check.ts PYTHON TERMINAL LOGIN SERVER');
const data = await readMt5Account({ python: resolve(python), terminal: resolve(terminal),
  script: resolve('scripts/mt5-readonly.py'), expectedLogin: Number(login), expectedServer: server });
console.log(JSON.stringify({ observedAt: data.observedAt, source: data.source,
  executionEnabled: data.executionEnabled, currency: data.account.currency,
  balance: data.account.balance, equity: data.account.equity,
  freeMargin: data.account.margin_free, positions: data.positions.length,
  pendingOrders: data.pendingOrders.length }, null, 2));
