import test from 'node:test';
import {Worker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openFounderBudget} from './founder-budget.mjs';
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-budget-'));try{return fn(path.join(dir,'budget.db'));}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const start=Date.parse('2026-10-13T10:00:00Z');
test('authorized limits are CHF20 per day and CHF2.50 per root with ten workers and the unchanged period ceiling',()=>fixture(file=>{
 const b=openFounderBudget(file);try{b.activate({startAt:start,authorizationRef:'patrice-20261015-limits'});const s=b.snapshot(start);assert.equal(s.dailyRappen,2000);assert.equal(s.taskRappen,250);assert.equal(s.periodRappen,15000);assert.equal(s.periodDays,30);assert.equal(s.maxWorkers,10);
  for(let i=0;i<8;i++)b.reserve({id:'new-'+i,rootTaskId:'root-'+i,maxCostRappen:250,now:start});assert.equal(b.snapshot(start).dayRemainingRappen,0);assert.throws(()=>b.reserve({id:'over',rootTaskId:'extra',maxCostRappen:1,now:start}),/daily/);
 }finally{b.close();}
}));
test('concurrent independent database connections cannot race past the shared daily ceiling',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'budget-race-')),file=path.join(dir,'budget.db');const b=openFounderBudget(file);b.activate({startAt:start,authorizationRef:'race'});
 try{const moduleUrl=new URL('./founder-budget.mjs',import.meta.url).href;const results=await Promise.all(Array.from({length:12},(_,i)=>i).map(i=>new Promise((resolve,reject)=>{const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {openFounderBudget}=await import(workerData.moduleUrl);const b=openFounderBudget(workerData.file);let result;try{b.reserve({id:'r'+workerData.i,rootTaskId:'root'+workerData.i,maxCostRappen:250,now:workerData.start});result=true;}catch(e){result=e.message;}finally{b.close();}parentPort.postMessage(result);})();`,{eval:true,workerData:{moduleUrl,file,i,start}});worker.once('message',resolve);worker.once('error',reject);})));assert.equal(results.filter(r=>r===true).length,8);assert.equal(b.snapshot(start).heldRappen,2000);}finally{b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('activation is immutable, reservations are shared and persist, roots include retries',()=>fixture(file=>{
 let b=openFounderBudget(file);assert.throws(()=>b.reserve({id:'a',rootTaskId:'a',maxCostRappen:1,now:start}));
 b.activate({startAt:start,authorizationRef:'user-20261013'});b.activate({startAt:start,authorizationRef:'user-20261013'});
 assert.throws(()=>b.activate({startAt:start+1,authorizationRef:'other'}));
 for(const id of ['a','b','c','e','f','g','h','i'])b.reserve({id,rootTaskId:id,maxCostRappen:250,now:start});
 assert.throws(()=>b.reserve({id:'d',rootTaskId:'d',maxCostRappen:1,now:start}),/daily/);
 assert.equal(b.reserve({id:'a',rootTaskId:'a',maxCostRappen:250,now:start}).duplicate,true);
 assert.throws(()=>b.reserve({id:'a',rootTaskId:'x',maxCostRappen:1,now:start}));
 b.settle({id:'a',actualCostRappen:50,evidenceRef:'receipt-a'});b.close();b=openFounderBudget(file);
 assert.equal(b.snapshot(start).heldRappen,1750);assert.equal(b.snapshot(start).spentRappen,50);
 b.settle({id:'b',actualCostRappen:0,evidenceRef:'receipt-b'});
 assert.throws(()=>b.reserve({id:'retry',rootTaskId:'a',maxCostRappen:201,now:start}),/task/);
 b.reserve({id:'retry',rootTaskId:'a',maxCostRappen:200,now:start});
 b.settle({id:'a',actualCostRappen:50,evidenceRef:'receipt-a'});assert.throws(()=>b.settle({id:'a',actualCostRappen:0,evidenceRef:'other'}));b.close();
}));
test('Zurich day rollover keeps uncertain reservations held; clock reversal and expiration denied',()=>fixture(file=>{
 const b=openFounderBudget(file),t=Date.parse('2026-10-24T21:59:00Z');b.activate({startAt:t,authorizationRef:'user'});
 b.reserve({id:'a',rootTaskId:'a',maxCostRappen:200,now:t});b.settle({id:'a',actualCostRappen:200,evidenceRef:'r'});
 b.reserve({id:'unknown',rootTaskId:'unknown',maxCostRappen:200,now:t});
 assert.equal(b.snapshot(t+120000).daySpentRappen,0);assert.equal(b.snapshot(t+120000).heldRappen,200);
 assert.throws(()=>b.reserve({id:'reverse',rootTaskId:'reverse',maxCostRappen:1,now:t-1}));
 assert.throws(()=>b.reserve({id:'expired',rootTaskId:'expired',maxCostRappen:1,now:t+30*86400000}),/expired/);b.close();
}));
test('30 day total caps cumulative costs and provider overruns halt admission',()=>fixture(file=>{
 const b=openFounderBudget(file);b.activate({startAt:start,authorizationRef:'user'});
 for(let day=0;day<20;day++)for(let i=0;i<4;i++){const id=`${day}-${i}`,cost=i===3?150:200;b.reserve({id,rootTaskId:id,maxCostRappen:cost,now:start+day*86400000});b.settle({id,actualCostRappen:cost,evidenceRef:id});}
 assert.equal(b.snapshot(start+20*86400000).spentRappen,15000);
 assert.throws(()=>b.reserve({id:'over',rootTaskId:'over',maxCostRappen:1,now:start+20*86400000}),/period/);b.close();
}));
test('oversized receipt preserves true cost and disables new spending',()=>fixture(file=>{
 const b=openFounderBudget(file);b.activate({startAt:start,authorizationRef:'user'});b.reserve({id:'a',rootTaskId:'a',maxCostRappen:1,now:start});b.settle({id:'a',actualCostRappen:2,evidenceRef:'overrun'});
 assert.equal(b.snapshot(start).halted,true);assert.equal(b.snapshot(start).spentRappen,2);assert.throws(()=>b.reserve({id:'b',rootTaskId:'b',maxCostRappen:1,now:start}),/halted/);b.close();
}));
