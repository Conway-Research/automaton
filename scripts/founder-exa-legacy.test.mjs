import test from 'node:test';import assert from 'node:assert/strict';import {legacyExaRetryEligible} from './founder-exa-legacy.mjs';
test('operator recovery requires a matching failed zero-cost run, unconsumed legacy slot and running power',()=>{
 const v={power:{enabled:true},control:{status:'running'},job:{status:'queued',attempts:1,run_id:'r',payload:JSON.stringify({kind:'exa-research',input:{sourceRepair:{}},rootTaskId:'root'})},attempt:{stage:'failed',at_ms:11000,diagnostic:'{"code":"local_read_failed"}',receipt:'{"actualCostRappen":0,"evidenceRef":"local:r"}'},reservation:{id:'r',root_task:'root',max_cost:0,actual_cost:0,receipt:'local:r'},last:{seq:1,at:10000,window:0,status:'attempted',retry_after_ms:0},count:1,now:400000};
 assert.equal(legacyExaRetryEligible(v),true);
 for(const change of [{power:{enabled:false}},{count:2},{last:{...v.last,status:'succeeded'}},{job:{...v.job,attempts:2}},{reservation:{...v.reservation,actual_cost:null}},{attempt:{...v.attempt,receipt:'{"actualCostRappen":0,"evidenceRef":"other"}'}}])assert.equal(legacyExaRetryEligible({...v,...change}),false);
});
