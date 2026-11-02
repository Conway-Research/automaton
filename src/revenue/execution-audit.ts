/** Pure educational diagnostics. No market access, persistence or order execution. */
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected object');
  return value as Record<string, unknown>;
}
function number(value: unknown, name: string, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12 || (positive && value === 0)) {
    throw new Error(`Invalid ${name}: require bounded finite ${positive ? 'positive' : 'nonnegative'} number`);
  }
  return value;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('Expected array of at most 1000 records');
  return value.map(object);
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw new Error('Invalid identifier');
  return value;
}
const boundary = {
  mode: 'educational-diagnostic', liveAuthorized: false, profitabilityProven: false,
  expertiseProven: false, inputsVerified: false,
  limitation: 'Caller-supplied hypothetical data; floating-point arithmetic, not settlement accounting or a regulatory report. A passed diagnostic does not validate a strategy.',
};

export function executionAudit(input: unknown) {
  const x = object(input);
  if (x.kind === 'availability') {
    const decisionMs = number(x.decisionMs, 'decisionMs');
    const events = rows(x.events);
    if (!events.length) throw new Error('At least one event required');
    const ids = new Set<string>();
    const findings = events.map(event => {
      const id = identifier(event.id);
      if (ids.has(id)) throw new Error('Duplicate event ID');
      ids.add(id);
      const eventMs = number(event.eventMs, 'eventMs');
      const receivedMs = number(event.receivedMs, 'receivedMs');
      const processedMs = number(event.processedMs, 'processedMs');
      // All times must be normalized to one clock by the caller; do not infer clock offsets.
      if (eventMs > receivedMs || receivedMs > processedMs) throw new Error('Inconsistent normalized event chronology');
      return {id, available: processedMs <= decisionMs, latenessMs: Math.max(0, processedMs - decisionMs)};
    });
    return {...boundary, kind: 'availability' as const, decisionMs, findings,
      result: findings.every(f => f.available) ? 'AVAILABLE_UNDER_SUPPLIED_CLOCKS' : 'FUTURE_INFORMATION_DETECTED'};
  }
  if (x.kind !== 'execution') throw new Error('Unknown diagnostic kind');
  if (x.side !== 'buy' && x.side !== 'sell') throw new Error('Expected buy or sell');
  const s = x.side === 'buy' ? 1 : -1;
  const currency = identifier(x.quoteCurrency);
  const quantity = number(x.quantity, 'quantity', true);
  const benchmark = number(x.decisionPrice, 'decisionPrice', true);
  const receiptMid = number(x.receiptMid, 'receiptMid', true);
  const deadlineMark = number(x.deadlineMark, 'deadlineMark', true);
  const fees = number(x.fees, 'fees'); // Explicit aggregate quote-currency charges; no guessed zero.
  const fills = rows(x.fills);
  const ids = new Set<string>();
  let filled = 0, notional = 0, effective = 0, realized = 0, movement = 0;
  const perFill = fills.map(fill => {
    const id = identifier(fill.id);
    if (ids.has(id)) throw new Error('Duplicate fill ID');
    ids.add(id);
    const q = number(fill.quantity, 'fill quantity', true);
    const p = number(fill.price, 'fill price', true);
    const laterMid = number(fill.laterMid, 'laterMid', true);
    const effectiveSpread = 2 * s * (p - receiptMid);
    const realizedSpread = 2 * s * (p - laterMid);
    const midpointMovement = 2 * s * (laterMid - receiptMid);
    filled += q; notional += q * p;
    effective += q * effectiveSpread; realized += q * realizedSpread; movement += q * midpointMovement;
    return {id, quantity: q, effectiveSpread, realizedSpread, midpointMovement};
  });
  const tolerance = 16 * Number.EPSILON * Math.max(quantity, filled);
  if (filled - quantity > tolerance) throw new Error('Filled quantity exceeds intended quantity');
  const unfilled = Math.max(0, quantity - filled);
  const executedCost = s * (notional - filled * benchmark);
  const opportunityCost = s * unfilled * (deadlineMark - benchmark);
  return {...boundary, kind: 'execution' as const, quoteCurrency: currency, side: x.side,
    quantity, filled, unfilled, fillFraction: Math.min(1, filled / quantity),
    averageFillPrice: filled ? notional / filled : null,
    effectiveSpread: filled ? effective / filled : null,
    realizedSpread: filled ? realized / filled : null,
    midpointMovement: filled ? movement / filled : null,
    perFill, executedCost, opportunityCost, fees,
    shortfall: executedCost + opportunityCost + fees,
    cashFlow: (-s * notional - fees) || 0,
    conventions: 'Spreads are doubled signed quote-currency amounts per unit, weighted by filled quantity; laterMid uses the same caller-declared horizon for each fill. Shortfall is relative to decisionPrice and includes unfilled opportunity cost at deadlineMark. Opportunity cost is not cash. No conversion, rebates, inventory PnL, timestamp verification or fill simulation.'};
}
