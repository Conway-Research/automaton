import { describe, it, expect } from 'vitest';
import { validateMt5Snapshot } from '../revenue/mt5-readonly.js';

const options = { expectedLogin: 123, expectedServer: 'test' };
const now = Date.now();
const fixture = () => ({ schemaVersion: 1, observedAt: new Date(now).toISOString(),
  readOnly: true, executionEnabled: false, account: { login: 123, server: 'test',
    currency: 'EUR', balance: 49, equity: 48, profit: -1, margin: 20,
    margin_free: 28, leverage: 30 }, positions: [], pendingOrders: [] });

describe('MT5 telemetry boundary', () => {
  it('requires explicit demo trade mode when bound to a demo account', () => {
    for (const trade_mode of [undefined, 1, 2]) {
      const data = { ...fixture(), account: { ...fixture().account, trade_mode } };
      expect(() => validateMt5Snapshot(data, { ...options, expectedTradeMode: 0 }, now)).toThrow('demo');
    }
    const data = { ...fixture(), account: { ...fixture().account, trade_mode: 0 } };
    expect(validateMt5Snapshot(data, { ...options, expectedTradeMode: 0 }, now).account.trade_mode).toBe(0);
  });
  it('preserves currency and does not enable execution', () => {
    const result = validateMt5Snapshot(fixture(), options, now);
    expect(result.account.currency).toBe('EUR');
    expect(result.executionEnabled).toBe(false);
  });
  it.each([-16000, 2000])('rejects invalid observation age %s', offset => {
    expect(() => validateMt5Snapshot({ ...fixture(), observedAt: new Date(now + offset).toISOString() }, options, now)).toThrow();
  });
  it('rejects the right login on a different server', () => {
    const data = fixture(); data.account.server = 'other';
    expect(() => validateMt5Snapshot(data, options, now)).toThrow();
  });
  it('rejects missing exposure and non-finite equity', () => {
    expect(() => validateMt5Snapshot({ ...fixture(), positions: null }, options, now)).toThrow();
    const data = fixture(); data.account.equity = NaN;
    expect(() => validateMt5Snapshot(data, options, now)).toThrow();
  });
});
