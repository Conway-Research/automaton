import test from 'node:test';
import fs from 'node:fs';import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';
import {offerScopeDigest} from './founder-offer-feasibility.mjs';
import {inspectOfficeServicePlan} from './founder-office-service-plan.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
const results=[];
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 test(profile+': canonical restoration and 480 valid minute values',()=>{
 const original=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8'));
 function fixture(){const d=structuredClone(original);Object.assign(d.assessmentInput.job,{privacy:'public',aiAllowed:true,description:'Synthetic audit',currency:'EUR',amount:1000});Object.assign(d.assessmentInput.plan,{currency:'EUR',hourlyRateMinor:1000,feeBps:0,contingencyBps:0,externalCostMinor:0});for(const p of d.assessmentInput.plan.phases)Object.assign(p,{hours:1,days:1,customerConfirmed:true});d.assessmentInput.evidence.scopeDigest=offerScopeDigest(d.assessmentInput.job,d.assessmentInput.plan);return d;}
 const rejectedMinutes=[];
 for(let minutes=1;minutes<=480;minutes++){const d=fixture();d.assessmentInput.plan.phases[0].hours=minutes/60;d.assessmentInput.evidence.scopeDigest=offerScopeDigest(d.assessmentInput.job,d.assessmentInput.plan);const r=inspectOfficeServicePlan(d,{...d.binding,profile});assert.equal(r.workAuthorized,false);if(r.missing.includes('complete-distinct-work-phases'))rejectedMinutes.push(minutes);}
 assert.deepEqual(rejectedMinutes,[]);
 const legacyDoc=fixture();legacyDoc.assessmentInput.evidence.scopeDigest=createHash('sha256').update(JSON.stringify({job:legacyDoc.assessmentInput.job,plan:legacyDoc.assessmentInput.plan})).digest('hex');
 assert.ok(inspectOfficeServicePlan(legacyDoc,{...legacyDoc.binding,profile}).missing.includes('scope-bound-evidence'));
 const fractional=fixture();fractional.assessmentInput.plan.phases[0].hours=2.05;
 const calculated=inspectOfficeServicePlan(fractional,{...fractional.binding,profile});assert.equal(calculated.assessment.estimate.minimumQuoteMinor,5050);
 const d=fixture(),direct=inspectOfficeServicePlan(d,{...d.binding,profile});assert.ok(!direct.missing.includes('scope-bound-evidence'));
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'office-canonical-audit-')),workPackages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]},sourceId=normalizeInventory({},workPackages).sources[0].id;
 const key={sourceId,externalId:'synthetic',ownerId:'synthetic-owner'},revision='r1';let service;let calls=0;
 try{const source=createMarketplaceWorkSource({platform:'ugig',sourceId,isEnabled:()=>false,readAssignment(){calls++;throw Error('Forbidden provider call');}});
  service=openOrderRestoration({base,directory:path.join(base,'state'),isEnabled:()=>false,workPackages,execution:{sources:[source]}});
  service.store.register({...key,rootTaskId:'root',sourceRevision:revision,state:'discovered',gigId:d.binding.gig,applicationId:d.binding.applicationId,conversationId:d.binding.conversationId,workKind:profile,provenance:{type:'reviewed-local-registration',ownerId:key.ownerId,evidenceRef:'synthetic'}});
  const before=JSON.stringify(service.store.snapshot()),input=JSON.stringify(d),review=service.inspectOfficeServicePlan(key,revision,d).review;
  assert.ok(!review.missing.includes('scope-bound-evidence'));assert.equal(JSON.stringify(service.store.snapshot()),before);assert.equal(JSON.stringify(d),input);assert.equal(calls,0);assert.equal(review.workAuthorized,false);assert.equal(review.sendAuthorized,false);assert.equal(review.deliveryAuthorized,false);
  results.push({profile,minutesChecked:480,rejectedMinutes,example:{hours:2.05,expectedMinutes:123,actualBinaryProduct:2.05*60},directScopeAccepted:true,restorationReportsScopeChanged:false,providerCalls:calls,stateUnchanged:true,workAuthorized:false});
 }finally{service?.close();fs.rmSync(base,{recursive:true,force:true});}
});
}

import {createHash} from 'node:crypto';
import * as offer from './founder-offer-feasibility.mjs';
import {checkedJSON} from './founder-restoration-integrity.mjs';
test('canonical versioned hash preserves order-independent objects and binds contents and array order',()=>{
 const job={title:'Synthetic',amount:40,description:'Input'},plan={phases:[{id:'one',hours:1},{id:'two',hours:2}],currency:'EUR'};
 const hash=offerScopeDigest(job,plan);assert.match(hash,/^offer-scope-v2:[a-f0-9]{64}$/);
 const canonical=checkedJSON({job,plan});assert.equal(offerScopeDigest(canonical.job,canonical.plan),hash);
 assert.notEqual(offerScopeDigest({...job,amount:41},plan),hash);
 assert.notEqual(offerScopeDigest(job,{...plan,phases:[...plan.phases].reverse()}),hash);
 const legacy=createHash('sha256').update(JSON.stringify({job,plan})).digest('hex');assert.notEqual(hash,legacy);
});
test('minute conversion rejects coercion, subminutes, overflow and adjacent floating point values',()=>{
 for(const h of ['1',true,null,{},[1],undefined,NaN,Infinity,0,-1,0.001,1/120,Number.MAX_SAFE_INTEGER,1+Number.EPSILON,2.05+Number.EPSILON*2])assert.equal(offer.hoursToMinutes(h),null);
 for(const [h,m] of [[2.05,123],[4.1,246],[31/60,31],[0.5,30],[1/60,1]])assert.equal(offer.hoursToMinutes(h),m);
});
