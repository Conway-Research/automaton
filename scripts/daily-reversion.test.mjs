import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateDaily,dailyIndicators,dailyRule,dailyBacktest,wilson} from './lib/daily-reversion.mjs';
const day=86400000;
const make=(n=500)=>Array.from({length:n},(_,i)=>{const c=100+i*.04+Math.sin(i/4)*4;return {time:Date.UTC(2022,0,1)+i*day,open:c+.1,high:c+1,low:c-.2,close:c,volume:100};});
test('aggregation requires complete UTC days and preserves OHLCV',()=>{
 const bars=Array.from({length:576},(_,i)=>({time:i*300000,open:100,high:102,low:99,close:101,volume:2}));
 const d=aggregateDaily(bars);assert.equal(d.length,2);assert.equal(d[0].volume,576);assert.equal(d[0].close,101);
 assert.throws(()=>aggregateDaily(bars.slice(1)));assert.throws(()=>aggregateDaily([...bars.slice(0,20),...bars.slice(21)]));
});
test('SMA200 and Wilder RSI2 exact seed and causal prefix',()=>{
 const b=make(220).map((x,i)=>({...x,open:100+i,close:100+i,low:99+i,high:101+i}));
 const f=dailyIndicators(b);assert.equal(f[198].sma200,null);assert.equal(f[199].sma200,199.5);assert.equal(f[2].rsi2,100);
 assert.deepEqual(dailyIndicators(b.slice(0,210)),f.slice(0,210));
});
test('fixed rules differ: R2 RSI sequence, Double7 close extrema, IBS with RSI',()=>{
 const b=make(210),f=b.map(()=>({sma200:90,rsi2:50,ibs:.5})),i=209;
 f[i-2].rsi2=60;f[i-1].rsi2=30;f[i].rsi2=10;
 assert.equal(dailyRule('improved-r2',b,f,i).buy,true);
 f[i].rsi2=80;assert.equal(dailyRule('improved-r2',b,f,i).sell,true);
 b[i].close=99;f[i].rsi2=5;f[i].ibs=.1;
 assert.equal(dailyRule('double7',b,f,i).buy,true);
 assert.equal(dailyRule('ibs-rsi2',b,f,i).buy,true);
 f[i].sma200=110;assert.equal(dailyRule('double7',b,f,i).buy,false);assert.equal(dailyRule('ibs-rsi2',b,f,i).buy,true);
 assert.throws(()=>dailyRule('unknown',b,f,i));
});
test('next-day fills, multi-day holdings, exact fees, split and boundary handling',()=>{
 for(const strategy of ['improved-r2','double7','ibs-rsi2']) {
  const b=make(),r=dailyBacktest(b,strategy,{feeBps:10,spreadBps:4,slippageBps:3},b[220].time,b.at(-1).time+day);
  assert.ok(r.trades.length>0);assert.ok(r.trades.some(t=>t.exitIndex-t.entryIndex>1));
  for(const [i,t] of r.trades.entries()) {
   assert.equal(t.entryIndex,t.signalIndex+1);assert.ok(b[t.signalIndex].time>=b[220].time);
   assert.ok(Math.abs(t.entry-t.rawEntry*1.0005)<1e-9);assert.ok(Math.abs(t.exit-t.rawExit*.9995)<1e-9);
   assert.ok(Math.abs(t.net-((t.exit-t.entry)*t.quantity-t.fee))<1e-8);
   assert.ok(Math.abs(t.fee-(t.entry+t.exit)*t.quantity*.001)<1e-8);
   if(t.reason==='signal')assert.equal(t.exitIndex,t.exitSignalIndex+1);
   if(i)assert.ok(t.entryIndex>r.trades[i-1].exitIndex);
  }
  assert.ok(Math.abs(r.equity.at(-1).equity-(10000+r.trades.reduce((a,t)=>a+t.net,0)))<1e-6);
  assert.ok(r.stats.maxCloseDrawdownFraction>=0);assert.ok(r.stats.winRate>=0&&r.stats.winRate<=1);
 }
});
test('Wilson interval exposes small-sample uncertainty',()=>{
 const a=wilson(3,4);assert.ok(a.low<.75&&a.high>.75);assert.equal(wilson(0,0),null);
});
test('known Wilder RSI2 values and invalid daily chronology',()=>{
 const b=[100,99,98,99].map((close,i)=>({time:i*day,open:close,close,high:close+1,low:close-1,volume:1}));
 const f=dailyIndicators(b);assert.equal(f[2].rsi2,0);assert.equal(f[3].rsi2,50);
 b[3].time+=day;assert.throws(()=>dailyIndicators(b));
});
test('flat round-trip loses exact costs, forced tail is explicit and capital stays fully paid',()=>{
 const b=[100,99,98,98,98,98,98].map((close,i)=>({time:i*day,open:close,close,high:close+1,low:close-.1,volume:1}));
 const r=dailyBacktest(b,'ibs-rsi2',{feeBps:10,spreadBps:4,slippageBps:3},0,7*day);
 assert.equal(r.trades.length,1);assert.equal(r.trades[0].reason,'boundary');assert.equal(r.tails.length,1);
 assert.equal(r.stats.wins,0);assert.equal(r.stats.naturalExitTrades,0);
 const expected=(.9995*.999)/(1.0005*1.001)-1;
 assert.ok(Math.abs(r.stats.netReturn-expected)<1e-12);
 assert.ok(Math.abs(r.trades[0].quantity*r.trades[0].entry*1.001-10000)<1e-9);
});
