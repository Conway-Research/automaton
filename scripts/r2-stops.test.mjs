import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stopVariants,atr14,stopPrice,r2StopBacktest} from './lib/r2-stops.mjs';
import {r2LongBacktest} from './lib/r2-long-history.mjs';
const DAY=86400000;
const make=()=>Array.from({length:500},(_,i)=>{const close=100+i*.04+Math.sin(i/4)*4;return {time:i*DAY,open:close+.1,close,high:close+1,low:close-.2,volume:100,dividend:0};});
const crypto={feeBps:10,spreadBps:4,slippageBps:3};
const spy={perShare:.005,minFee:1,regulatorySellBps:.5,spreadBps:2,slippageBps:2};
test('four fixed stops plus baseline, exact stop levels and causal Wilder ATR14',()=>{
 assert.deepEqual(stopVariants.map(x=>x.id),['none','fixed5','fixed10','fixed15','atr3']);
 assert.equal(stopPrice(100,stopVariants[1],1),95);assert.equal(stopPrice(100,stopVariants[2],1),90);
 assert.equal(stopPrice(100,stopVariants[3],1),85);assert.equal(stopPrice(100,stopVariants[4],2),94);
 const b=make().map(b=>({...b,open:100,close:100,high:101,low:99})),a=atr14(b);
 assert.equal(a[12],null);assert.ok(Math.abs(a[13]-2)<1e-12);
 assert.deepEqual(atr14(b.slice(0,300)),a.slice(0,300));
});
test('baseline is exactly unchanged for both markets',()=>{
 for(const market of ['crypto','SPY']) {
  const b=make(),cost=market==='crypto'?crypto:spy;
  assert.deepEqual(r2StopBacktest(b,market,cost,0,500*DAY,stopVariants[0]),r2LongBacktest(b,market,cost,0,500*DAY));
 }
});
test('entry-day intraday stop, gap stop and sell costs',()=>{
 const original=make(),first=r2LongBacktest(original,'crypto',crypto,0,500*DAY).trades[0],i=first.entryIndex;
 const b=structuredClone(original);b[i].low=first.entry*.8;
 const t=r2StopBacktest(b,'crypto',crypto,0,500*DAY,stopVariants[1]).trades[0];
 assert.equal(t.exitIndex,i);assert.equal(t.reason,'stop');assert.equal(t.rawExit,t.stop);
 assert.ok(Math.abs(t.exit-t.stop*.9995)<1e-9);
 const run=r2StopBacktest(b,'crypto',crypto,0,500*DAY,stopVariants[1]);
 assert.equal(run.stats.boundaryTrades,run.trades.filter(t=>t.reason==='boundary').length);
 const g=structuredClone(original);const p=first.entry*.8;
 Object.assign(g[i+1],{open:p,close:p,high:p+1,low:p-1});
 const gap=r2StopBacktest(g,'crypto',crypto,0,500*DAY,stopVariants[1]).trades[0];
 assert.equal(gap.reason,'gap-stop');assert.equal(gap.rawExit,p);assert.ok(gap.rawExit<gap.stop);
});
test('signal-close ATR fixes the stop, split boundaries and no overlapping positions',()=>{
 const b=make(),start=b[220].time,a=atr14(b);
 for(const s of stopVariants.slice(1)) {
  const r=r2StopBacktest(b,'crypto',crypto,start,500*DAY,s);assert.ok(r.trades.length>0);
  for(const [i,t] of r.trades.entries()) {
   assert.equal(t.entryIndex,t.signalIndex+1);assert.ok(b[t.signalIndex].time>=start);
   assert.ok(Math.abs(t.stop-stopPrice(t.entry,s,a[t.signalIndex]))<1e-10);
   assert.ok(Math.abs(t.net-((t.exit-t.entry)*t.quantity-t.fee+t.dividends))<1e-7);
   if(i)assert.ok(t.entryIndex>r.trades[i-1].exitIndex);
  }
 }
});
test('SPY dividend accrual precedes ex-date gap-stop and stop is not dividend-adjusted',()=>{
 const b=make(),first=r2LongBacktest(b,'SPY',spy,0,500*DAY).trades[0],i=first.entryIndex;
 const p=first.entry*.8;b[i+1].dividend=.5;
 Object.assign(b[i+1],{open:p,close:p,high:p+1,low:p-1});
 const t=r2StopBacktest(b,'SPY',spy,0,500*DAY,stopVariants[1]).trades[0];
 assert.equal(t.reason,'gap-stop');assert.equal(t.dividends,t.quantity*.5);
 assert.equal(t.quantity,Math.floor(t.quantity));assert.ok(Math.abs(t.stop-t.entry*.95)<1e-9);
});
