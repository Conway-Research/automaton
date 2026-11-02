import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trendFeatures,trendAllows,entryPlan,trendBacktest,chooseCandidate,candidates} from './lib/ema-vwap-trend.mjs';
import {syntheticBars} from './lib/ema-vwap-offline.mjs';

test('exactly eight fixed candidates',()=>{
  assert.equal(candidates.length,8);assert.equal(new Set(candidates.map(c=>c.id)).size,8);
});
test('EMA200 and Wilder ATR14 warmup, slope and prefix causality',()=>{
  const b=syntheticBars(7,5).map((x,i)=>({...x,open:100+i,close:100+i,high:101+i,low:99+i}));
  const f=trendFeatures(b);
  assert.equal(f[198].ema200,null);assert.equal(f[199].ema200,199.5);
  assert.ok(Math.abs(f[13].atr14-2)<1e-12);assert.equal(f[12].atr14,null);
  assert.equal(f[211].ema200Past12,199.5);
  assert.deepEqual(trendFeatures(b.slice(0,250)),f.slice(0,250));
});
test('trend filter requires both price alignment and slope in the chosen direction',()=>{
  assert.equal(trendAllows(1,110,{ema200:100,ema200Past12:99}),true);
  assert.equal(trendAllows(-1,90,{ema200:100,ema200Past12:101}),true);
  for(const f of [{ema200:null,ema200Past12:null},{ema200:100,ema200Past12:100},{ema200:100,ema200Past12:101}])
    assert.equal(trendAllows(1,110,f),false);
  assert.equal(trendAllows(1,90,{ema200:100,ema200Past12:99}),false);
});
test('larger stops use max(signal distance, twice ATR, minimum percent), targets 2R or 3R',()=>{
  const c={minStopFraction:0.005,rewardR:2};
  assert.deepEqual(entryPlan(1,100,{low:99.9,high:100.1},0.1,c),{risk:0.5,stop:99.5,target:101});
  assert.deepEqual(entryPlan(-1,100,{low:99.9,high:100.1},0.4,{...c,rewardR:3}),{risk:0.8,stop:100.8,target:97.6});
  assert.equal(entryPlan(1,100,{low:98,high:101},0.1,c).risk,2);
  assert.equal(entryPlan(1,100,{low:101,high:102},0.1,c),null);
});
test('selection uses development rows only, equal asset weighting, stable ties',()=>{
  const rows=[];
  for(const c of candidates)for(const symbol of ['ETHUSDT','BTCUSDT'])rows.push({candidateId:c.id,symbol,period:'train',scenario:'base',mean:c.id===candidates[2].id?-1:-10,trades:100});
  assert.equal(chooseCandidate(rows).candidateId,candidates[2].id);
  assert.throws(()=>chooseCandidate([...rows,{candidateId:'x',symbol:'ETHUSDT',period:'test',scenario:'base',mean:100,trades:100}]));
});
test('execution respects time boundary, causal filter, wider stops, cost arithmetic and no overlap',()=>{
  const b=syntheticBars(41,40),start=b[250].time;
  let count=0;
  for(const c of candidates) {
    const r=trendBacktest(b,c,{feeBps:10,spreadBps:4,slippageBps:3},start),f=trendFeatures(b);
    for(const [i,t] of r.trades.entries()) {
      count++;assert.ok(b[t.signalIndex].time>=start);
      assert.equal(t.entryIndex,t.signalIndex+1);
      assert.ok(trendAllows(t.direction,b[t.signalIndex].close,f[t.signalIndex]));
      assert.ok(t.risk>=t.entry*c.minStopFraction-1e-10);
      assert.ok(t.risk>=2*f[t.signalIndex].atr14-1e-10);
      assert.ok(Math.abs(t.direction*(t.target-t.entry)-c.rewardR*t.risk)<1e-9);
      assert.ok(Math.abs(t.gross-t.cost-t.net)<1e-9);
      if(i)assert.ok(t.entryIndex>r.trades[i-1].exitIndex);
    }
  }
  assert.ok(count>0);
});
test('wide-stop execution still handles ambiguous bars and opening gaps conservatively',()=>{
  const c=candidates[0],costs={feeBps:0,spreadBps:0,slippageBps:0},source=syntheticBars(41,40);
  const first=trendBacktest(source,c,costs).trades[0];assert.ok(first);
  const n=first.entryIndex,b=structuredClone(source);
  b[n].high=first.entry+50;b[n].low=first.entry-50;
  const ambiguous=trendBacktest(b,c,costs).trades[0];
  assert.equal(ambiguous.reason,'stop-first');assert.equal(ambiguous.rawExit,ambiguous.stop);
  const gap=structuredClone(source),entry=first.entry;
  Object.assign(gap[n],{open:entry,close:entry,high:entry+0.000001,low:entry-0.000001});
  const price=first.stop-first.direction;
  Object.assign(gap[n+1],{open:price,close:price,high:price+0.000001,low:price-0.000001});
  const stopped=trendBacktest(gap,c,costs).trades[0];
  assert.equal(stopped.reason,'gap-stop');assert.equal(stopped.rawExit,price);
});
