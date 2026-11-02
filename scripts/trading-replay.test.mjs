import test from 'node:test';import assert from 'node:assert/strict';
import {replayCashCandidate,openReplayResearch} from './trading-replay.mjs';
const row=()=>({symbol:'STOCK',costTerms:{profitCurrency:'USD',contractSize:1},closedBars:Array.from({length:100},(_,i)=>({time:1700000000+i*300,open:100+i*.5,high:100.5+i*.5,low:99.9+i*.5,close:100.4+i*.5}))});
test('research archive stores source bars and deduplicates the same account dataset',()=>{
 const r=openReplayResearch(':memory:');try{const m={account:{identity:'a',server:'s'},instruments:[{...row(),capability:true}]};r.observe(m,1000);r.observe(m,2000);assert.equal(r.snapshot().totalReports,1);assert.ok(r.snapshot().reports[0].trades>0);r.observe({...m,account:{identity:'other',server:'s'},instruments:[]},3000);assert.equal(r.snapshot().totalReports,0);}finally{r.close();}
});
test('replay uses real chronological holdout and explicit paper costs, never grants live validation',()=>{
 const r=replayCashCandidate(row());assert.equal(r.mode,'paper-cash-comparator');assert.equal(r.currency,'USD');assert.equal(r.liveAuthorized,false);assert.equal(r.costsVerified,false);assert.equal(r.independentStrategyProven,false);assert.equal(r.friction.feeBps,10);assert.equal(r.datasetDigest.length,64);assert.ok(r.result.windows.every(w=>w.trainEnd<w.testStart));assert.ok(r.result.trades.length>0);assert.equal(r.result.netPnlCents,r.result.finalEquityCents-r.result.initialEquityCents);
});
test('replay rejects unsupported contract assumptions and corrupted historical bars',()=>{
 const x=row();x.costTerms.contractSize=100;assert.throws(()=>replayCashCandidate(x),/contract/);x.costTerms.contractSize=1;x.closedBars[5].high=0;assert.throws(()=>replayCashCandidate(x),/bars/);
});

test('a full previous day cannot permanently stop fresh replay collection',()=>{
 const r=openReplayResearch(':memory:');try{const m={account:{identity:'a',server:'s'},instruments:Array.from({length:1000},(_,i)=>({...row(),symbol:'S'+i,capability:true}))};r.observe(m,1000);assert.equal(r.snapshot().totalReports,1000);r.observe({...m,instruments:[{...row(),symbol:'NEW',capability:true}]},86401000);assert.equal(r.snapshot().totalReports,1001);}finally{r.close();}
});

test('same symbol cannot consume archive capacity with overlapping snapshots every few seconds',()=>{
 const r=openReplayResearch(':memory:');try{const m={account:{identity:'a',server:'s'},instruments:[{...row(),capability:true}]};r.observe(m,1000);m.instruments[0].closedBars=m.instruments[0].closedBars.map(b=>({...b,time:b.time+300}));r.observe(m,6000);assert.equal(r.snapshot().totalReports,1);r.observe(m,3601000);assert.equal(r.snapshot().totalReports,2);}finally{r.close();}
});
