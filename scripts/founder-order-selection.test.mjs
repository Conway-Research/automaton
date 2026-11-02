import test from 'node:test';
import assert from 'node:assert/strict';
import {selectOrderCandidate,selectOrderObservations} from './founder-order-selection.mjs';
import {guardOrderAction} from './founder-order-lifecycle.mjs';
import {openOpportunityStore,observationDigest} from './founder-opportunity-store.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {monitorResultObservations} from './founder-monitor-handoff.mjs';
const now=Date.UTC(2026,9,18);
const candidate={title:'CSV conversion',url:'https://example.invalid/jobs/1',remoteState:'open',fit:'strong',scope:'bounded',acceptance:'clear',payment:'protected',aiUse:'allowed',applicationFeeMinor:0,proposalCount:12,observedAt:new Date(now).toISOString()};
test('complete candidate may be proposed but never authorizes work',()=>{
 const r=selectOrderCandidate(candidate,{now});assert.equal(r.decision,'propose');assert.equal(r.executionAuthorized,false);assert.equal(r.paymentVerified,false);
});
test('missing terms, AI rules, adapter and competition become explicit questions',()=>{
 const r=selectOrderCandidate({title:'API integration',remoteState:'unknown'},{now});assert.equal(r.decision,'clarify');assert.ok(r.questions.length>=5);assert.equal(r.executionAuthorized,false);
});
test('competition ranks rather than discards; broad scope remains eligible',()=>{
 for(const proposalCount of [31,60,110])assert.notEqual(selectOrderCandidate({...candidate,proposalCount},{now}).decision,'exclude');
 assert.equal(selectOrderCandidate({...candidate,scope:'large'},{now}).decision,'propose');
 assert.ok(selectOrderCandidate(candidate,{now}).score>selectOrderCandidate({...candidate,proposalCount:110},{now}).score);
});
test('fees defer without erasing; explicit incompatibilities exclude',()=>{
 assert.equal(selectOrderCandidate({...candidate,applicationFeeMinor:20},{now}).decision,'clarify');
 for(const flag of ['requiresWorkerDeposit','identityMisrepresentation','eligibilityMismatch','aiForbidden'])assert.equal(selectOrderCandidate({...candidate,[flag]:true},{now}).decision,'exclude');
 assert.equal(selectOrderCandidate({...candidate,remoteState:'closed'},{now}).decision,'exclude');
});
test('old or malformed evidence cannot become ready proposal',()=>{
 assert.equal(selectOrderCandidate({...candidate,observedAt:'bad'},{now}).decision,'clarify');
 assert.equal(selectOrderCandidate({...candidate,observedAt:new Date(now-8*86400000).toISOString()},{now}).decision,'clarify');
 assert.equal(selectOrderCandidate(null,{now}).decision,'exclude');
});
test('listing history retained, latest revision selected without changing observations',()=>{
 const observations=[{sourceId:'fake',externalId:'one',kind:'listing',revision:'old',observedAt:new Date(now-1000).toISOString(),data:{...candidate,remoteState:'closed'}},{sourceId:'fake',externalId:'one',kind:'listing',revision:'new',observedAt:new Date(now).toISOString(),data:candidate}];
 const before=JSON.stringify(observations),r=selectOrderObservations(observations,{now});assert.equal(r.length,1);assert.equal(r[0].revision,'new');assert.equal(r[0].selection.decision,'propose');assert.equal(JSON.stringify(observations),before);
});
test('selection cannot bypass OFF or missing work authority',()=>{
 const r=selectOrderCandidate(candidate,{now});assert.equal(guardOrderAction({kind:'work'},{powerEnabled:false,controllerRunning:true}).allowed,false);assert.equal(r.executionAuthorized,false);
});
test('temporary store exposes clarification queue without registering executable orders',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-selection-'));
 const store=openOpportunityStore(path.join(dir,'test.db'));
 try{const o={sourceId:'synthetic',externalId:'one',revision:'1',evidenceRef:'synthetic:one',kind:'listing',observedAt:new Date(now).toISOString(),data:{title:'API tool'}};store.ingest({...o,digest:observationDigest(o)});assert.equal(store.selection({now})[0].selection.decision,'clarify');assert.equal(store.snapshot().orders.length,0);}finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('monitor retains bounded screening claims, never source grants',()=>{
 const [o]=monitorResultObservations({sourceId:'fake',data:{jobs:[{id:'one',...candidate,proposalCount:12,status:'open',executionAuthorized:true,assignmentConfirmed:true,paymentConfirmed:true}]}});
 assert.equal(o.data.proposalCount,12);assert.equal(o.data.paymentConfirmed,false);assert.equal(o.data.assignmentConfirmed,false);assert.equal(o.data.executionAuthorized,undefined);
 assert.equal(selectOrderCandidate({...o.data,observedAt:new Date(now).toISOString()},{now}).decision,'propose');
});
