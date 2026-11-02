import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderBudget} from './founder-budget.mjs';
import {openFounderRuntime} from './founder-runtime.mjs';
test('learning root accounting includes reservations outside the bounded display without changing limits',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'learning-budget-'));const b=openFounderBudget(path.join(dir,'budget.db'));const at=Date.parse('2026-10-20T00:00:00Z');
 try{b.activate({startAt:at,authorizationRef:'fixture-only'});b.reserve({id:'a-hidden',rootTaskId:'root',maxCostRappen:100,now:at});b.settle({id:'a-hidden',actualCostRappen:80,evidenceRef:'fake-receipt'});b.reserve({id:'b-held',rootTaskId:'root',maxCostRappen:170,now:at});for(let n=0;n<5001;n++)b.reserve({id:'z-'+n,rootTaskId:'other',maxCostRappen:0,now:at});
 const display=b.snapshot(at);assert.equal(display.entriesComplete,false);assert.equal(display.entries.length,5000);
 assert.deepEqual(b.learningAccounting('root'),{complete:true,spentRappen:250});assert.deepEqual(b.learningAccounting('other'),{complete:true,spentRappen:0});assert.deepEqual(b.learningAccounting(),{complete:true,spentRappen:0});assert.throws(()=>b.learningAccounting('invalid root'));
 assert.throws(()=>b.reserve({id:'over',rootTaskId:'root',maxCostRappen:1,now:at}),/task/);assert.equal(b.snapshot(at).entriesComplete,false);
 }finally{b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('isolated runtime continues learning with more than 5000 ledger entries using exact accounting',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'learning-budget-runtime-'));let discoveries=0;
 const runtime=openFounderRuntime({base,activate:true,isEnabled:()=>true,adapters:{research:{available:true,maxCostRappen:0,execute:async()=>({sources:[]}),verify:()=>true}},learningOptions:{enabled:true,activationApproved:true,adapters:{discover:async()=>{discoveries++;return [];}}}});
 const b=openFounderBudget(path.join(base,'artifacts/founder-autonomy-20261013/budget.db'));
 try{const at=Date.now();for(let n=0;n<5001;n++)b.reserve({id:'fixture-'+n,rootTaskId:'fixture',maxCostRappen:0,now:at});assert.equal(b.snapshot().entriesComplete,false);await runtime.cycle();assert.ok(discoveries>0);assert.equal(runtime.snapshot().budget.entriesComplete,false);assert.ok(runtime.learningSnapshot().gaps.length>0);assert.equal(runtime.snapshot().budget.taskRappen,250);
 }finally{b.close();await runtime.close();fs.rmSync(base,{recursive:true,force:true});}
});
