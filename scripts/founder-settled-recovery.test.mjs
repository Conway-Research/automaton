import test from 'node:test';import assert from 'node:assert/strict';
import {canResumeSettledAnalysis} from './founder-settled-recovery.mjs';
const base=()=>({job:{status:'failed',attempts:2,payload:JSON.stringify({kind:'private-analysis',dependencies:['source']})},attempt:{result:JSON.stringify({status:'incomplete',analysis:null,costEvidence:{outputTokens:2000}}),receipt:JSON.stringify({actualCostRappen:12,evidenceRef:'resp_test'})},reservation:{max_cost:50,actual_cost:12,receipt:'resp_test'},dependencies:[{status:'done',result:JSON.stringify({sources:[{observedAt:new Date().toISOString()}]})}],now:Date.now()});
test('only settled incomplete analysis with one remaining attempt and fresh sources is resumable',()=>{
 assert.equal(canResumeSettledAnalysis(base()),true);
 for(const change of [{job:{...base().job,attempts:3}},{reservation:{...base().reservation,actual_cost:null}},{attempt:{...base().attempt,receipt:JSON.stringify({actualCostRappen:0,evidenceRef:'different'})}},{dependencies:[{status:'failed'}]},{dependencies:[{status:'done',result:JSON.stringify({sources:[{observedAt:'2020-01-01'}]})}]}])assert.equal(canResumeSettledAnalysis({...base(),...change}),false);
});
