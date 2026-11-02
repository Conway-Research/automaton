import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderBudget} from './founder-budget.mjs';
test('retry display projection agrees with live admission and never replaces fresh admission',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retry-view-'));const b=openFounderBudget(path.join(dir,'budget.db'));const now=Date.UTC(2026,9,24,10);
 try{b.activate({startAt:now,authorizationRef:'test'});b.reserve({id:'r1',rootTaskId:'root',maxCostRappen:50,now});b.settle({id:'r1',actualCostRappen:0,evidenceRef:'test:receipt'});
  const view=b.retryEligibilitySnapshot(now);const valid={runId:'r1',rootTaskId:'root',maxCostRappen:50,now};
  for(const input of [valid,{...valid,rootTaskId:'other'},{...valid,runId:'missing'},{...valid,maxCostRappen:-1},{...valid,maxCostRappen:251}])assert.equal(view(input),b.retryEligible(input));
  b.reserve({id:'r2',rootTaskId:'root',maxCostRappen:250,now});assert.equal(view(valid),true);assert.equal(b.retryEligible(valid),false);assert.equal(b.retryEligibilitySnapshot(now)(valid),false);
  assert.equal(b.retryEligibilitySnapshot(now-1)(valid),false);
 }finally{b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('retry display uses full ledger beyond bounded displayed entries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retry-large-'));const b=openFounderBudget(path.join(dir,'budget.db'));const now=Date.UTC(2026,9,24,10);
 try{b.activate({startAt:now,authorizationRef:'test'});for(let i=0;i<5002;i++){b.reserve({id:'r'+i,rootTaskId:'root'+i,maxCostRappen:0,now});b.settle({id:'r'+i,actualCostRappen:0,evidenceRef:'test:'+i});}
  const view=b.retryEligibilitySnapshot(now);for(const i of [0,1,5001]){const input={runId:'r'+i,rootTaskId:'root'+i,maxCostRappen:50,now};assert.equal(view(input),true);assert.equal(view(input),b.retryEligible(input));}
 }finally{b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
