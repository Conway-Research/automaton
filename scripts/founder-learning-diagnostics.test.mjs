import test from 'node:test';import assert from 'node:assert/strict';
import {createFounderLearning} from './founder-learning.mjs';
import {classifyLocalFailure} from './founder-failure-classification.mjs';
for(const code of ['service_network_failed','service_timeout'])test('learning preserves '+code+' without retrying or weakening checkpoint',async()=>{
 const gap={id:'gap-test',rootTaskId:'test-root',goalId:'goal',goalVersion:1};const checkpoints=new Map(),events=[];let calls=0;
 const store={snapshot:()=>({gaps:[gap]}),checkpoint:(id,value)=>value?checkpoints.set(id,value):checkpoints.get(id),acquireLease:()=>true,releaseLease(){},recordEvent:e=>events.push(e)};
 const context={now:1000,powerEnabled:true,controllerRunning:true,budgetActive:true,activationApproved:true,availableSlots:1,budgetRemainingRappen:100,dayRemainingRappen:100,rootRemainingRappen:100,policyDigest:'policy',limitsDigest:'limits',goalId:'goal',goalVersion:1};
 const engine=createFounderLearning({store,controller:{},getContext:()=>context,adapters:{discover:async()=>{calls++;const e=Error('private provider text must not escape');e.diagnostic={code};throw e;}}});
 const ctx={task:{rootTaskId:'test-root',input:{gapId:gap.id}},grant:{maxCostRappen:0,reservationId:'fake'},signal:new AbortController().signal,assertActive(){}};
 await assert.rejects(engine.adapter.execute(ctx),e=>{assert.equal(classifyLocalFailure(e).code,code);assert.doesNotMatch(e.message,/private provider/);return true;});
 assert.equal(checkpoints.get(gap.id).report.status,'waiting-evidence');assert.equal(events.find(e=>e.kind==='failure').detail.serviceCode,code);
 assert.equal((await engine.adapter.execute(ctx)).status,'waiting-evidence');assert.equal(calls,1);assert.equal(engine.adapter.autoRetrySafe,false);engine.close();
});
