import {test} from 'node:test';
import assert from 'node:assert/strict';
import {noCrossBacktest} from './lib/ema-vwap-no-cross.mjs';
import {candidates,trendBacktest} from './lib/ema-vwap-trend.mjs';
import {syntheticBars} from './lib/ema-vwap-offline.mjs';
const candidate=candidates.find(c=>c.id==='cross-stop1-R3');
const costs={feeBps:10,spreadBps:4,slippageBps:3};
test('no counter-cross exits; first entry unchanged; old counter-cross trade is held longer',()=>{
  const bars=syntheticBars(41,40),old=trendBacktest(bars,candidate,costs),next=noCrossBacktest(bars,candidate,costs);
  assert.ok(old.trades.some(t=>t.reason==='counter-cross'));assert.ok(next.trades.length>0);
  assert.equal(next.trades[0].entryIndex,old.trades[0].entryIndex);
  assert.equal(next.trades[0].entry,old.trades[0].entry);
  assert.equal(old.trades[0].reason,'counter-cross');
  assert.ok(next.trades[0].exitIndex>old.trades[0].exitIndex);
  assert.ok(next.trades.every(t=>['stop-first','gap-stop','target','session-end'].includes(t.reason)));
});
test('costs, risk and time split unchanged; session exits flatten every position',()=>{
  const bars=syntheticBars(41,40),start=bars[500].time;
  const next=noCrossBacktest(bars,candidate,costs,start);
  assert.ok(next.trades.length>0);
  for(const [i,t] of next.trades.entries()) {
    assert.ok(bars[t.signalIndex].time>=start);assert.equal(t.entryIndex,t.signalIndex+1);
    assert.ok(t.risk>=t.entry*0.01-1e-9);assert.ok(t.risk>=t.signalATR14*2-1e-9);
    assert.ok(Math.abs(t.target-t.entry-t.direction*3*t.risk)<1e-9);
    assert.ok(Math.abs(t.net-t.gross+t.cost)<1e-9);
    assert.equal(bars[t.entryIndex].session,bars[t.exitIndex].session);
    if(i)assert.ok(t.entryIndex>next.trades[i-1].exitIndex);
  }
});
test('ambiguous candles and opening gaps still fill conservatively',()=>{
  const zero={feeBps:0,spreadBps:0,slippageBps:0},bars=syntheticBars(41,40);
  const first=noCrossBacktest(bars,candidate,zero).trades[0],n=first.entryIndex;
  const b=structuredClone(bars);b[n].high=first.entry+50;b[n].low=first.entry-50;
  assert.equal(noCrossBacktest(b,candidate,zero).trades[0].reason,'stop-first');
  const gap=structuredClone(bars),entry=first.entry;
  Object.assign(gap[n],{open:entry,close:entry,high:entry+0.000001,low:entry-0.000001});
  const price=first.stop-first.direction;
  Object.assign(gap[n+1],{open:price,close:price,high:price+0.000001,low:price-0.000001});
  const t=noCrossBacktest(gap,candidate,zero).trades[0];assert.equal(t.reason,'gap-stop');assert.equal(t.rawExit,price);
});
