import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
import os from 'node:os';import path from 'node:path';
import {openOrderExecution} from './founder-order-execution.mjs';
const root=new URL('../outputs/office-leistungsplaene-20261023/candidates/',import.meta.url);
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 const doc=JSON.parse(fs.readFileSync(new URL(profile+'.json',root),'utf8'));
 const order={gigId:doc.binding.gig,applicationId:doc.binding.applicationId,conversationId:doc.binding.conversationId,workKind:profile};
 test(profile+': execution preflight remains local and creates no work or delivery',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'office-plan-integration-'));let enabled=false,calls=0,e;
  const forbidden=()=>{calls++;throw Error('External operation forbidden');};
  const source=createMarketplaceWorkSource({platform:'ugig',sourceId:'test',isEnabled:()=>enabled,readAssignment:forbidden,verifyProduct:forbidden,submitDelivery:forbidden});
  const bound={...order,sourceId:'test',externalId:'synthetic-order',ownerId:'synthetic-owner',rootTaskId:'synthetic-root',sourceRevision:'r1'};
  try{
   e=openOrderExecution({directory,isEnabled:()=>enabled,sources:[source]});
   const review=e.inspectOfficeServicePlan(bound,doc);assert.equal(review.workAuthorized,false);assert.equal(review.status,'blocked');
   assert.throws(()=>e.inspectOfficeServicePlan({...bound,sourceId:'unknown'},doc),/source adapter/);
   const ctx={order:bound,officeServicePlan:doc,assertActive(){}};
   await assert.rejects(e.adapters.prepare.execute(ctx),/OFF/);
   enabled=true; // Temporary fixture only; no production power control.
   const outcome=await e.adapters.prepare.execute(ctx);assert.equal(outcome.confirmed,false);assert.equal(outcome.planningOnly,true);
   assert.equal(e.snapshot().products,0);assert.deepEqual(e.snapshot().deliveries,[]);assert.equal(calls,0);
  }finally{e?.close();fs.rmSync(directory,{recursive:true,force:true});}
 });
 test(profile+': actual source preparation routes incomplete plan without authority calls',async()=>{
  let calls=0;const forbidden=()=>{calls++;throw Error('Unexpected external authority');};
  const source=createMarketplaceWorkSource({platform:'ugig',sourceId:'test',isEnabled:()=>false,readAssignment:forbidden,verifyProduct:forbidden,submitDelivery:forbidden});
  const before=JSON.stringify(doc);const r=await source.methods.prepare({order,officeServicePlan:doc});
  assert.equal(r.confirmed,false);assert.equal(r.planningOnly,true);assert.equal(r.review.status,'blocked');assert.ok(r.review.missing.includes('plan.hourlyRateMinor'));assert.ok(r.review.missing.includes('evidence.funding'));assert.equal(calls,0);assert.equal(JSON.stringify(doc),before);
  for(const flag of ['sendAuthorized','workAuthorized','deliveryAuthorized','evidenceVerified'])assert.equal(r.review[flag],false);
  await assert.rejects(source.methods.prepare({order}),/OFF/);
 });
 test(profile+': foreign candidate and profile cannot reuse mapping',()=>{
  const source=createMarketplaceWorkSource({platform:'ugig',sourceId:'test',isEnabled:()=>false});
  const expected={...doc.binding,profile};
  for(const key of ['gig','applicationId','conversationId','profile'])assert.deepEqual(source.inspectOfficeServicePlan(doc,{...expected,[key]:'other'}).missing,['exact-candidate-binding']);
  const changed=structuredClone(doc);changed.assessmentInput.plan.phases[0].profileId='other';assert.deepEqual(source.inspectOfficeServicePlan(changed,expected).missing,['exact-profile-phases']);
 });
 test(profile+': asserted gates and references never become grants',async()=>{
  const changed=structuredClone(doc);changed.sendAuthorized=true;changed.workAuthorized=true;changed.deliveryAuthorized=true;changed.evidenceVerified=true;for(const m of changed.evidenceMapping){m.ref='local:unverified';m.status='verified';}for(const k of Object.keys(changed.gates))changed.gates[k]={approved:true};
  const source=createMarketplaceWorkSource({platform:'ugig',sourceId:'test',isEnabled:()=>true,readAssignment:()=>{throw Error('must not read');},verifyProduct:()=>true});
  const r=await source.methods.prepare({order,officeServicePlan:changed});assert.equal(r.confirmed,false);assert.equal(r.review.workAuthorized,false);assert.ok(r.review.missing.includes('independent-contract-funding-and-specialist-validation'));
 });
}
