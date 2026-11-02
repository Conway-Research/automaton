import test from 'node:test';import assert from 'node:assert/strict';
import {autonomyStatus} from './founder-autonomy-status.mjs';
test('technical failures stay owned by Numaron; missing execution is not reported complete',()=>{
 const s=autonomyStatus({status:'running',tasks:[{id:'a',status:'blocked',reason:'Budget daily limit'},{id:'b',status:'failed',diagnostic:{code:'provider_outcome_unknown'}}],capabilities:[{kind:'code-execution',status:'blocked',reason:'not connected'}]});
 assert.equal(s.mode,'self-directed');assert.equal(s.complete,false);assert.equal(s.exceptions.length,2);assert.ok(s.exceptions.every(e=>e.owner==='numaron'&&!e.requiresHuman));assert.equal(s.exceptions[0].nextAction,'wait-for-budget');assert.equal(s.exceptions[1].nextAction,'reconcile-provider-outcome');assert.equal(s.capabilityGaps[0].kind,'code-execution');
});
test('only explicit private access failures create a concrete personal exception',()=>{
 const s=autonomyStatus({tasks:[{id:'auth',status:'failed',diagnostic:{code:'invalid_api_key'}},{id:'quota',status:'failed',diagnostic:{code:'insufficient_quota'}},{id:'retry',status:'failed',nextRetryAt:123}],capabilities:[]});
 assert.equal(s.exceptions[0].requiresHuman,true);assert.equal(s.exceptions[0].nextAction,'restore-account-access');assert.equal(s.exceptions[1].requiresHuman,false);assert.equal(s.exceptions[2].nextAction,'scheduled-retry');assert.equal(s.complete,false);
});
