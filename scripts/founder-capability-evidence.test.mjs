import test from 'node:test';
import assert from 'node:assert/strict';
import {projectCapabilityEvidence} from './founder-capability-evidence.mjs';
const now=1000000, revision='a'.repeat(64);
const capability={kind:'source-work',implemented:true,status:'available',revision,sourceIds:['source-one']};
const source={id:'source-one',capabilities:{work:{state:'live-verified',expiresAt:now+1000,evidenceRefs:['legacy']}}};
const proof=(dimension,extra={})=>({capabilityId:'source-work',sourceId:'source-one',operation:'work',revision,dimension,outcome:'passed',environment:dimension==='offlineVerification'?'offline':'production',origin:dimension==='authorization'?'operator-policy':dimension==='offlineVerification'?'offline-test':'runtime-receipt',ref:'test:one',observedAt:now-20,expiresAt:now+100,...extra});
const run=(proofs=[],extra={})=>projectCapabilityEvidence({capabilities:[capability],sources:[source],proofs,now,powerEnabled:false,controllerRunning:false,budgetActive:true,...extra});
test('existing registry status and legacy task success do not grant new authority',()=>{
 const r=run([], {capabilities:[{...capability,lastSuccessAt:now-1}]});
 assert.equal(r.schemaVersion,1);assert.equal(r.entries.length,1);
 const e=r.entries[0];assert.equal(e.implementation,'present');assert.equal(e.authorization,'unknown');assert.equal(e.availability,'unknown');assert.equal(e.liveVerification,'unknown');assert.ok(e.executionBlockers.includes('power-off'));
});
test('valid exact evidence is separate per dimension and OFF preserves it',()=>{
 const e=run(['authorization','availability','offlineVerification','liveVerification'].map(d=>proof(d))).entries[0];
 assert.equal(e.authorization,'confirmed');assert.equal(e.availability,'observed-available');assert.equal(e.offlineVerification,'passed');assert.equal(e.liveVerification,'observed-success');assert.equal(e.evidence.length,4);assert.ok(e.executionBlockers.includes('power-off'));
});
test('offline success and successful waiting reports cannot become live proof',()=>{
 for(const extra of [{environment:'offline'},{resultStatus:'waiting-data'},{resultStatus:'waiting-evidence'},{resultStatus:'incomplete'}]) assert.equal(run([proof('liveVerification',extra)]).entries[0].liveVerification,'unknown');
});
test('expired, future and mismatching revision proofs are conservative',()=>{
 assert.equal(run([proof('availability',{expiresAt:now})]).entries[0].availability,'stale');
 assert.equal(run([proof('availability',{observedAt:now+1})]).entries[0].availability,'unknown');
 assert.equal(run([proof('offlineVerification',{revision:'b'.repeat(64)})]).entries[0].offlineVerification,'stale');
 assert.equal(run([proof('authorization',{expiresAt:undefined})]).entries[0].authorization,'unknown');
 assert.equal(run([proof('availability',{expiresAt:NaN})]).entries[0].availability,'unknown');
});
test('newer failure defeats older success; contradictory latest evidence fails closed',()=>{
 const older=proof('liveVerification'),failed=proof('liveVerification',{observedAt:now-10,outcome:'failed',ref:'test:two'});
 assert.equal(run([older,failed]).entries[0].liveVerification,'observed-failure');
 assert.equal(run([older,{...older,outcome:'failed'}]).entries[0].liveVerification,'unknown');
});
test('source and operation bindings cannot be borrowed',()=>{
 for(const extra of [{sourceId:'other'},{operation:'submit'},{capabilityId:'other'}]) assert.equal(run([proof('authorization',extra)]).entries[0].authorization,'unknown');
});
test('unavailable adapter and expired source remain blockers despite old positive proof',()=>{
 const e=run([proof('availability')],{capabilities:[{...capability,status:'blocked'}],sources:[{...source,capabilities:{work:{...source.capabilities.work,expiresAt:now}}}]}).entries[0];
 assert.equal(e.availability,'unavailable');assert.ok(e.executionBlockers.includes('source-evidence-expired'));
});
test('no scope is invented for unbound adapters and missing implementation stays missing',()=>{
 const e=run([],{capabilities:[{kind:'research',implemented:false,status:'blocked'}]}).entries[0];
 assert.equal(e.sourceId,null);assert.equal(e.operation,null);assert.equal(e.implementation,'missing');
});
test('projection is bounded, does not mutate inputs and exposes only allowlisted evidence',()=>{
 const proofs=[proof('offlineVerification',{privateText:'secret-value',apiKey:'secret-value'})],before=JSON.stringify(proofs);
 const r=run(proofs);assert.equal(JSON.stringify(proofs),before);assert.ok(!JSON.stringify(r).includes('secret-value'));
 assert.equal(run([proof('offlineVerification',{ref:'https://example.invalid/?token=secret-value'})]).entries[0].offlineVerification,'unknown');
 assert.deepEqual(run(Array.from({length:2049},()=>proof('offlineVerification'))).entries,[]);
 assert.deepEqual(run([],{capabilities:Array.from({length:513},()=>capability)}).entries,[]);
 assert.deepEqual(run([],{now:NaN}).entries,[]);
});
test('duplicate capabilities and unknown proof dimensions cannot hide conflicting evidence',()=>{
 assert.deepEqual(run([],{capabilities:[capability,capability]}).entries,[]);
 assert.equal(run([proof('__proto__')]).entries[0].authorization,'unknown');
});

test('newer malformed matching evidence cannot leave an old positive claim',()=>{
 for(const extra of [{observedAt:now+1},{observedAt:NaN},{observedAt:now-1,expiresAt:NaN}]){
  const e=run([proof('availability'),proof('availability',extra)]).entries[0];
  assert.equal(e.availability,'unknown');
 }
});

test('inherited object keys are not source operations',()=>{
 for(const kind of ['source-__proto__','source-constructor','source-toString']){
  const e=run([],{capabilities:[{...capability,kind}]}).entries[0];
  assert.equal(e.operation,null);assert.ok(e.executionBlockers.includes('source-binding-unverified'));
 }
});

test('missing registered source cannot substantiate bound claims',()=>{
 const e=run(['authorization','availability','offlineVerification','liveVerification'].map(d=>proof(d)),{sources:[]}).entries[0];
 for(const d of ['authorization','availability','offlineVerification','liveVerification'])assert.equal(e[d],'unknown');
 assert.ok(e.executionBlockers.includes('source-binding-unverified'));
});
test('unbound source adapters and unknown operations cannot receive null-scoped proof',()=>{
 for(const c of [{...capability,sourceIds:[]},{...capability,kind:'source-unknown'},{...capability,kind:'work'}]){
  const e=run([proof('authorization',{capabilityId:c.kind,sourceId:c.sourceIds.length?'source-one':null,operation:null})],{capabilities:[c]}).entries[0];
  assert.equal(e.authorization,'unknown');assert.ok(e.executionBlockers.includes('source-binding-unverified'));
 }
});
test('generic adapters cannot claim production authority through null scope',()=>{
 const e=run([proof('authorization',{capabilityId:'research',sourceId:null,operation:null})],{capabilities:[{kind:'research',implemented:true,revision}]}).entries[0];
 assert.equal(e.authorization,'unknown');
});
test('missing implementation cannot be reported available',()=>{
 const e=run([proof('availability')],{capabilities:[{...capability,implemented:false}]}).entries[0];
 assert.equal(e.availability,'unavailable');
});
test('invalid-only proof is diagnosed rather than silently discarded',()=>{
 const e=run([proof('availability',{observedAt:now+1})]).entries[0];
 assert.ok(e.executionBlockers.includes('availability-evidence-invalid'));
});

const revoke=(dimension,extra={})=>({capabilityId:'source-work',sourceId:'source-one',operation:'work',revision,dimension,revokedAt:now-10,ref:'policy:withdrawn',...extra});
test('explicit revocation invalidates each exact proof dimension',()=>{
 for(const dimension of ['authorization','availability','offlineVerification','liveVerification']){
  const e=run([proof(dimension)],{revocations:[revoke(dimension)]}).entries[0];
  assert.equal(e[dimension],'revoked');assert.ok(e.executionBlockers.includes(dimension+'-evidence-revoked'));assert.equal(e.revocations[0].ref,'policy:withdrawn');
 }
});
test('revoked revision cannot be resurrected with a later success timestamp',()=>{
 const e=run([proof('authorization',{observedAt:now-1})],{revocations:[revoke('authorization')]}).entries[0];
 assert.equal(e.authorization,'revoked');
});
test('revocation cannot cross source, action, revision or dimension',()=>{
 for(const extra of [{sourceId:'other'},{operation:'submit'},{revision:'b'.repeat(64)},{dimension:'availability'},{capabilityId:'source-submit'}]){
  assert.equal(run([proof('authorization')],{revocations:[revoke('authorization',extra)]}).entries[0].authorization,'confirmed');
 }
});
test('revocation without any positive proof is still displayed',()=>{
 const e=run([],{revocations:[revoke('authorization')]}).entries[0];assert.equal(e.authorization,'revoked');
});
test('invalid revocation collections fail closed',()=>{
 for(const revocations of [null,{},Array(2049).fill(revoke('authorization')),[revoke('authorization',{revokedAt:now+1})],[revoke('authorization',{revision:'bad'})],[revoke('authorization',{ref:'https://invalid.test/secret'})],[revoke('__proto__')]]){
  const r=run([proof('authorization')],{revocations});assert.deepEqual(r.entries,[]);assert.ok(r.diagnostics.length);
 }
});
test('revocation output is bounded, deduplicated and does not disclose extra data',()=>{
 const r=revoke('authorization',{privateText:'DO_NOT_EXPOSE'}),before=JSON.stringify(r);
 const e=run([],{revocations:[r,r]}).entries[0];assert.equal(e.revocations.length,1);assert.ok(!JSON.stringify(e).includes('DO_NOT_EXPOSE'));assert.equal(JSON.stringify(r),before);
});
