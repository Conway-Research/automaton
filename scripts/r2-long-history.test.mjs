import {test} from 'node:test';
import assert from 'node:assert/strict';
import {r2Features,r2LongBacktest} from './lib/r2-long-history.mjs';
import {dailyBacktest} from './lib/daily-reversion.mjs';
const DAY=86400000;
const bars=()=>Array.from({length:500},(_,i)=>{const close=100+i*.04+Math.sin(i/4)*4;return {time:i*DAY,open:close+.1,close,high:close+1,low:close-.2,volume:100,dividend:0};});
const crypto={feeBps:10,spreadBps:4,slippageBps:3};
const spy={perShare:.005,minFee:1,regulatorySellBps:.5,spreadBps:2,slippageBps:2};
test('fixed RSI2/SMA200 and crypto execution reproduce prior engine',()=>{
 const b=bars(),old=dailyBacktest(b,'improved-r2',crypto,0,500*DAY),r=r2LongBacktest(b,'crypto',crypto,0,500*DAY);
 assert.equal(r.trades.length,old.trades.length);assert.equal(r.stats.wins,old.stats.wins);
 assert.ok(Math.abs(r.stats.net-old.stats.net)<1e-6);
 for(let i=0;i<r.trades.length;i++)assert.equal(r.trades[i].entryIndex,old.trades[i].entryIndex);
});
test('session indicators accept weekend gaps, remain prefix causal and reject reordering',()=>{
 const b=bars();for(let i=0;i<b.length;i++)b[i].time=(i+Math.floor(i/5)*2)*DAY;
 assert.deepEqual(r2Features(b.slice(0,300)),r2Features(b).slice(0,300));
 b[200].time=b[199].time;assert.throws(()=>r2Features(b));
});
test('SPY commissions use whole shares, minimum ticket and sell-side buffer',()=>{
 const b=bars(),r=r2LongBacktest(b,'SPY',spy,0,500*DAY);
 assert.ok(r.trades.length>0);
 for(const t of r.trades){assert.equal(t.quantity,Math.floor(t.quantity));assert.ok(t.entryFee>=1);assert.ok(t.exitFee>=1);
  assert.ok(Math.abs(t.exitFee-(Math.max(1,.005*t.quantity)+t.quantity*t.exit*.5/10000))<1e-8);
  assert.ok(t.entry*t.quantity+t.entryFee<=t.capitalBefore+1e-8);}
});
test('dividends accrue only to holders before ex-date, including an exit at that open',()=>{
 const b=bars(),base=r2LongBacktest(b,'SPY',spy,0,500*DAY),first=base.trades[0];
 b[first.entryIndex+1].dividend=.5;
 const paid=r2LongBacktest(b,'SPY',spy,0,500*DAY).trades[0];
 assert.equal(paid.dividends,.5*paid.quantity);
 assert.ok(Math.abs(paid.net-((paid.exit-paid.entry)*paid.quantity-paid.entryFee-paid.exitFee+paid.dividends))<1e-8);
 b[first.entryIndex+1].dividend=0;b[first.entryIndex].dividend=.5;
 assert.equal(r2LongBacktest(b,'SPY',spy,0,500*DAY).trades[0].dividends,0);
});
