import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStrategy} from './trading-strategies.mjs';
const now=1800000000000;
const version={id:'numaron-demo-breakout20-v1',rules:{kind:'breakout20'},source:{verified:true,reference:'isolated fixture'}};
function row(side='BUY'){
 const end=Math.floor(now/300000)*300-300;
 const closedBars=Array.from({length:100},(_,i)=>({time:end-(99-i)*300,open:100,high:101,low:99,close:100}));
 closedBars.at(-1).close=side==='BUY'?102:98;
 closedBars.at(-1).high=side==='BUY'?103:101;
 closedBars.at(-1).low=side==='SELL'?97:99;
 return {symbol:'ISOLATED',capability:true,quoteAt:now-100,bid:side==='BUY'?102:97.9,ask:side==='BUY'?102.1:98,closedBars};
}
const evaluate=r=>evaluateStrategy(version,{instruments:[r]},now);
test('closed upward and downward breakouts produce correctly protected signals',()=>{
 for(const side of ['BUY','SELL']){
  const [signal]=evaluate(row(side));assert.ok(signal);assert.equal(signal.side,side);
  assert.equal(signal.signalId.length,64);assert.equal(signal.expiresAt,now+14900);
  assert.ok(side==='BUY'?signal.stop<signal.entry&&signal.entry<signal.target:signal.target<signal.entry&&signal.entry<signal.stop);
  assert.equal(Math.abs(signal.target-signal.entry),2*Math.abs(signal.entry-signal.stop));
  assert.equal(evaluate(row(side))[0].signalId,signal.signalId);
 }
});
test('requires strict closed-candle breakout and current quote to confirm it',()=>{
 for(const side of ['BUY','SELL']){
  const r=row(side);r.closedBars.at(-1).close=side==='BUY'?101:99;assert.deepEqual(evaluate(r),[]);
  const withdrawn=row(side);if(side==='BUY')withdrawn.bid=100;else withdrawn.ask=100;
  assert.deepEqual(evaluate(withdrawn),[]);
 }
});
test('rejects stale future malformed unfinished or incapable observations',()=>{
 const mutations=[r=>r.quoteAt=now-15001,r=>r.quoteAt=now+1001,r=>r.capability=false,
  r=>r.closedBars=r.closedBars.slice(-24),r=>r.closedBars.at(-1).time=now/1000,
  r=>r.closedBars.forEach(b=>b.time-=601),r=>r.closedBars[4].close=NaN,
  r=>r.closedBars[4].time=r.closedBars[3].time,r=>r.ask=r.bid-1];
 for(const change of mutations){const r=row();change(r);assert.deepEqual(evaluate(r),[]);}
});
