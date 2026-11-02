import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indicators, signals, backtest, syntheticBars } from './lib/ema-vwap-offline.mjs';

test('volume weighting, EMA seed and session reset are causal', () => {
  const b=syntheticBars(1,1).slice(0,12);
  b.forEach((x,i)=>Object.assign(x,{open:100+i,high:100+i,low:100+i,close:100+i,volume:i+1}));
  const a=indicators(b);
  assert.equal(a[8].ema,104);
  assert.ok(Math.abs(a[1].vwap-100.66666666666667)<1e-10);
  b[11].session='next';
  assert.equal(indicators(b)[11].vwap,b[11].close);
  assert.deepEqual(indicators(b.slice(0,10)),indicators(b).slice(0,10));
});
test('invalid bars, missing volume and non-five-minute gaps are rejected', () => {
  for(const change of [b=>b[3].volume=0,b=>b[3].time+=1,b=>b[3].high=0]) {
    const b=syntheticBars(1,1);change(b);assert.throws(()=>indicators(b));
  }
});
test('confirmed and anticipatory signals are different and prefix invariant', () => {
  const b=syntheticBars(7,8);
  for(const variant of ['cross','early']) {
    const s=signals(b,variant);assert.ok(s.some(x=>x.direction===1));assert.ok(s.some(x=>x.direction===-1));
    assert.deepEqual(signals(b.slice(0,300),variant),s.slice(0,300));
  }
  assert.notDeepEqual(signals(b,'cross'),signals(b,'early'));
  assert.throws(()=>signals(b,'wrong'));
});
test('next-bar execution, one position, cost accounting and both directions', () => {
  for(const variant of ['cross','early']) {
    const b=syntheticBars(7,8),r=backtest(b,variant,{feeBps:10,spreadBps:4,slippageBps:3});
    assert.ok(r.trades.length>0);
    for(const [i,t] of r.trades.entries()) {
      assert.equal(t.entryIndex,t.signalIndex+1);
      assert.ok(t.cost>0);assert.ok(Math.abs(t.net-(t.gross-t.cost))<1e-9);
      assert.ok(Math.abs(t.entry-t.rawEntry*(1+t.direction*0.0005))<1e-10);
      assert.ok(Math.abs(t.exit-t.rawExit*(1-t.direction*0.0005))<1e-10);
      assert.ok(Math.abs(t.fee-(t.entry+t.exit)*0.001)<1e-10);
      if(t.reason==='counter-cross') {
        const ind=indicators(b),old=ind[t.exitIndex-2].ema-ind[t.exitIndex-2].vwap;
        const current=ind[t.exitIndex-1].ema-ind[t.exitIndex-1].vwap;
        assert.ok(t.direction===1?old>=0&&current<0:old<=0&&current>0);
        assert.equal(t.rawExit,b[t.exitIndex].open);
      }
      if(i)assert.ok(t.entryIndex>r.trades[i-1].exitIndex);
    }
    assert.ok(r.trades.some(t=>t.direction===1));assert.ok(r.trades.some(t=>t.direction===-1));
    assert.equal(r.liveAuthorized,false);
    assert.ok(backtest(b,variant,{feeBps:0,spreadBps:0,slippageBps:0}).net>r.net);
  }
  assert.throws(()=>backtest(syntheticBars(1,1),'cross',{feeBps:-1,spreadBps:0,slippageBps:0}));
});
test('executed stops honor adverse opening gaps for long and short', () => {
  for(const direction of [1,-1]) {
    const b=syntheticBars(7,8),s=signals(b,'cross');
    const n=s.findIndex((x,i)=>i>9&&x.direction===direction)+1;
    const stop=direction===1?b[n-1].low:b[n-1].high;
    const entry=(b[n-1].close+b[n].open)/2;
    Object.assign(b[n],{open:entry,close:entry,high:entry+0.00001,low:entry-0.00001});
    const gap=stop-direction;
    Object.assign(b[n+1],{open:gap,close:gap,high:gap+0.001,low:gap-0.001});
    const t=backtest(b,'cross',{feeBps:0,spreadBps:0,slippageBps:0}).trades.find(t=>t.entryIndex===n);
    assert.ok(t);assert.equal(t.reason,'gap-stop');assert.equal(t.rawExit,gap);
  }
});
test('ambiguous bars resolve stop first, gaps fill adversely, sessions flatten', () => {
  const zero={feeBps:0,spreadBps:0,slippageBps:0};
  for(const direction of [1,-1]) {
    const original=syntheticBars(7,8),s=signals(original,'cross');
    const n=s.findIndex((x,i)=>i>9&&x.direction===direction)+1;
    assert.ok(n>10);
    const b=structuredClone(original),entry=b[n].open;
    b[n].high=entry+10;b[n].low=entry-10;
    const t=backtest(b,'cross',zero).trades.find(t=>t.entryIndex===n);
    assert.equal(t.reason,'stop-first');assert.equal(t.rawExit,t.stop);
    const gap=structuredClone(original),stop=direction===1?gap[n-1].low:gap[n-1].high;
    gap[n].open=stop-direction;gap[n].high=Math.max(gap[n].high,gap[n].open);gap[n].low=Math.min(gap[n].low,gap[n].open);
    assert.equal(backtest(gap,'cross',zero).trades.some(t=>t.entryIndex===n),false);
  }
  for(const t of backtest(syntheticBars(7,8),'early',zero).trades) {
    assert.equal(syntheticBars(7,8)[t.entryIndex].session,syntheticBars(7,8)[t.exitIndex].session);
  }
});
