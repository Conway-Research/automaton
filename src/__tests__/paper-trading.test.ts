import { describe, expect, it } from "vitest";
import { sizePaperPosition, simulatePaperExit, walkForwardPaper, buyAndHoldPaper, fractionalPaperQuote, type PaperPlan, type Bar } from "../revenue/paper-trading.js";

const plan: PaperPlan = { symbol: "SIM", thesis: "Synthetic demand", entryCents: 10000, stopCents: 9600,
  targetsCents: [10800], exitRule: "stop, first target, or end of OOS window" };
const costs = { feeBps: 10, slippageBps: 10 };
const bar = (time: number, values: Partial<Bar> = {}): Bar => ({ time, open: 10000, high: 10200, low: 9800, close: 10000, ...values });

describe("paper-only risk and execution", () => {
  const lots={scale:1000000,stepAtoms:100,minAtoms:100,maxAtoms:1000000,minNotionalCents:500};
  it('settles fractional cash with exact rational rounding and both fees',()=>{
    expect(fractionalPaperQuote(200000,220000,10000,lots,{feeBps:10,slippageBps:10})).toMatchObject({committedCents:2005,proceedsCents:2194,netPnlCents:189,entryFeeCents:3,exitFeeCents:3,executionAuthorized:false,accountRulesVerified:false});
  });
  it('flags a below-minimum liquidation instead of claiming an executable exit',()=>{
    expect(fractionalPaperQuote(200000,100000,2500,lots,costs).exitBelowMinimum).toBe(true);
    expect(()=>fractionalPaperQuote(200000,220000,2400,lots,costs)).toThrow('minimum notional');
  });
  it('rejects invalid lot sizes and unsafe money without rounding them into permission',()=>{
    for(const atoms of [0,NaN,10001,1000001])expect(()=>fractionalPaperQuote(200000,220000,atoms,lots,costs)).toThrow();
    expect(()=>fractionalPaperQuote(200000,220000,10000,{...lots,scale:0},costs)).toThrow();
    expect(()=>fractionalPaperQuote(Number.MAX_SAFE_INTEGER,1,1000000000000,{...lots,scale:1,maxAtoms:1000000000000},costs)).toThrow('arithmetic');
  });
  it('reconciles the passive comparator with independently hand-calculated cash and both order fees',()=>{
    const r=buyAndHoldPaper([{time:1,open:100,high:100,low:100,close:100},{time:2,open:120,high:120,low:120,close:120}],1000,{feeBps:100,slippageBps:100});
    // 9 units at 101, fee 10, residual 81; exit 118*9 minus fee 11.
    expect(r).toMatchObject({units:9,committedCents:919,remainingCashCents:81,entryFeeCents:10,exitFeeCents:11,finalEquityCents:1132,netPnlCents:132,grossPnlCents:180,slippageDragCents:27,executionAuthorized:false});
  });
  it('charges no fictional fees when no whole unit is affordable and preserves losses',()=>{
    expect(buyAndHoldPaper([bar(1)],50,{...costs,minimumFeeCents:100})).toMatchObject({units:0,netPnlCents:0,entryFeeCents:0,exitFeeCents:0});
    const result=buyAndHoldPaper([bar(1),bar(2,{open:5000,high:5000,low:5000,close:5000})],100000,{feeBps:0,slippageBps:0});
    expect(result.netPnlCents).toBe(-50000);expect(result.ohlcDrawdownUpperBoundCents).toBeGreaterThanOrEqual(50000);
  });
  it('rejects invalid comparator bounds and overflow rather than inventing returns',()=>{
    expect(()=>buyAndHoldPaper([],100,costs)).toThrow();
    expect(()=>buyAndHoldPaper([bar(1)],NaN,costs)).toThrow();
    expect(()=>buyAndHoldPaper([bar(1)],100,{feeBps:-1,slippageBps:0})).toThrow();
    expect(()=>buyAndHoldPaper([bar(2),bar(1)],100,costs)).toThrow();
    expect(()=>buyAndHoldPaper([{time:1,open:1,high:1,low:1,close:1},{time:2,open:100000000,high:100000000,low:100000000,close:100000000}],100000000,{feeBps:0,slippageBps:0})).toThrow('arithmetic');
  });
  it('reports intrabar downside even when closed trades break even',()=>{
    const input=Array.from({length:6},(_,i)=>bar(i+1,{high:10400,low:9800,close:10000}));
    const r=walkForwardPaper(input,2,4,1000000,{feeBps:0,slippageBps:0},()=>()=>({...plan,stopCents:9700,targetsCents:[15000]}));
    expect(r.netPnlCents).toBe(0);expect(r.trades).toHaveLength(1);
    expect(r.ohlcDrawdownUpperBoundCents).toBe(600*r.trades[0].units);
    expect(r.trades[0].mode).toBe('paper');
  });
  it('keeps the drawdown envelope zero while abstaining and does not inspect training highs as exposure',()=>{
    const input=Array.from({length:6},(_,i)=>bar(i+1,{high:20000,low:5000}));
    expect(walkForwardPaper(input,2,2,1000000,costs,()=>()=>null).ohlcDrawdownUpperBoundCents).toBe(0);
  });
  it("accounts for minimum fees on each order without multiplying them by units", () => {
    const friction={feeBps:0,slippageBps:0,minimumFeeCents:35};
    const cheap={...plan,entryCents:1000,stopCents:995,targetsCents:[1050]};
    expect(()=>sizePaperPosition(cheap,5000,5000,friction)).toThrow("Insufficient");
    const p=sizePaperPosition({...cheap,riskFraction:.02},5000,5000,friction);
    expect(p).toMatchObject({units:4,entryFeeCents:35,plannedLossCents:90});
    const closed=simulatePaperExit(p,[{time:1,open:1000,high:1000,low:995,close:995}],friction);
    expect(closed.netPnlCents).toBe(-90);
    expect(()=>sizePaperPosition(cheap,5000,5000,{...friction,minimumFeeCents:-1})).toThrow("fees");
  });
  it("enforces the trade-capital loss cap including costs, not just stop distance", () => {
    expect(()=>sizePaperPosition({...plan,stopCents:9500},1000000,1000000,costs)).toThrow("5% of committed");
    const allowed=sizePaperPosition({...plan,stopCents:9500},1000000,1000000,{feeBps:0,slippageBps:0});
    expect(allowed.plannedLossCents).toBe(allowed.committedCents/20);
  });
  it("sizes a 50-unit budget without increasing risk to overcome small capital", () => {
    const small={...plan,entryCents:1000,stopCents:960,targetsCents:[1080]};
    const p=sizePaperPosition(small,5000,5000,{feeBps:50,slippageBps:0});
    expect(p.units).toBe(1);
    expect(p.plannedLossCents).toBe(50);
    expect(p.plannedLossCents).toBeLessThanOrEqual(Math.floor(p.committedCents/20));
    expect(()=>sizePaperPosition(small,5000,5000,{feeBps:60,slippageBps:0})).toThrow("Insufficient");
  });
  it("includes fees and slippage inside the default 1% planned loss", () => {
    const p = sizePaperPosition(plan, 1000000, 1000000, costs);
    expect(p.mode).toBe("paper");
    expect(p.plannedLossCents).toBeLessThanOrEqual(10000);
    expect(p.committedCents).toBeLessThanOrEqual(1000000);
    const stopped = simulatePaperExit(p, [bar(1, { low: 9500 })], costs);
    expect(-stopped.netPnlCents).toBe(p.plannedLossCents);
  });
  it.each([{ riskFraction: 0.02001 }, { riskFraction: NaN }, { stopCents: 9400 },
    { thesis: "" }, { targetsCents: [] }, { stopCents: 10000 }])("rejects invalid risk plans %j", change => {
    expect(() => sizePaperPosition({ ...plan, ...change }, 1000000, 1000000, costs)).toThrow();
  });
  it("allows 2% only when explicitly requested and still limits cash", () => {
    const p = sizePaperPosition({ ...plan, riskFraction: 0.02 }, 1000000, 20000, costs);
    expect(p.plannedLossCents).toBeLessThanOrEqual(20000);
    expect(p.committedCents).toBeLessThanOrEqual(20000);
  });
  it("models gaps honestly: actual loss can exceed the planned stop loss", () => {
    const p = sizePaperPosition(plan, 1000000, 1000000, costs);
    const exit = simulatePaperExit(p, [bar(1, { open: 9000, low: 8900, high: 9200, close: 9100 })], costs);
    expect(-exit.netPnlCents).toBeGreaterThan(p.plannedLossCents);
    expect(exit.exitFillCents).toBeLessThan(9000);
  });
  it("uses the stop if a bar reaches both stop and target", () => {
    const p = sizePaperPosition(plan, 1000000, 1000000, costs);
    expect(simulatePaperExit(p, [bar(1, { high: 11000, low: 9500 })], costs).reason).toBe("stop");
  });
  it("requires chronological valid bars", () => {
    const p = sizePaperPosition(plan, 1000000, 1000000, costs);
    expect(() => simulatePaperExit(p, [bar(2), bar(1)], costs)).toThrow("nonchronological");
  });
  it("fits on preceding data and signals never receive the traded bar", () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(i + 1, { high: 11000 }));
    const trainingEnds: number[] = [];
    const result = walkForwardPaper(bars, 5, 5, 1000000, costs, training => {
      trainingEnds.push(training.at(-1)!.time);
      expect(Object.isFrozen(training)).toBe(true);
      return (past, open) => {
        expect(past.at(-1)!.time).toBeGreaterThanOrEqual(training.at(-1)!.time);
        return { ...plan, entryCents: open };
      };
    });
    expect(trainingEnds).toEqual([5, 10, 15]);
    expect(result.windows).toHaveLength(3);
    expect(result.trades).toHaveLength(15);
    expect(result.windows.every(w => w.trainEnd < w.testStart)).toBe(true);
    expect(result.netPnlCents).toBe(result.trades.reduce((sum, t) => sum + t.netPnlCents, 0));
    expect(result.trades.every(t => t.mode === "paper")).toBe(true);
  });
  it("rejects retrospective entry prices", () => {
    const result = walkForwardPaper(Array.from({ length: 10 }, (_, i) => bar(i)), 5, 5, 1000000, costs,
      () => () => ({ ...plan, entryCents: 9900 }));
    expect(result.rejectedPlans).toBe(5);
    expect(result.trades).toEqual([]);
  });
});
