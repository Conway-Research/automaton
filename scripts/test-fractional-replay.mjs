import assert from 'node:assert/strict';
import fs from 'node:fs';
import {run} from '../artifacts/trading-three-stage-20261011/frozen-engine.mjs';
const v={id:'test',family:'momentum',lookback:2,thresholdBps:0,stopBps:100,targetBps:200};
const bar=(time,open,high,low,close)=>({time,open,high,low,close});
const prefix=[bar(1,10000,10000,10000,10000),bar(2,10100,10100,10100,10100)];
const replay=(a,b)=>run([...prefix,a,b],2,2,10000,[v],{feeBps:10,slippageBps:5},['test']);
const cases=[
 ['ambiguous-stop-first',bar(3,10200,10500,10000,10300),bar(4,10300,10300,10300,10300),'stop',10098],
 ['target',bar(3,10200,10500,10200,10300),bar(4,10300,10300,10300,10300),'target',10404],
 ['day-window-end',bar(3,10200,10300,10200,10250),bar(4,10250,10300,10200,10250),'window_end',10250],
 ['gap-stop',bar(3,10200,10300,10200,10250),bar(4,9900,10000,9800,9950),'stop',9900]
];
for(const [name,a,b,reason,price] of cases){const r=replay(a,b);assert.equal(r.trades[0].reason,reason,name);assert.equal(r.trades[0].exit,price,name);assert.ok(r.trades[0].atoms%1000000!==0,name);assert.ok(r.trades[0].entryFeeCents>0&&r.trades[0].exitFeeCents>0);}
fs.writeFileSync('artifacts/trading-three-stage-20261011/replay-tests.json',JSON.stringify({passed:cases.map(c=>c[0]),fractionalEntryAndExit:true,feesBothSides:true},null,2),{flag:'wx'});console.log('4 fractional exit fixtures passed');
