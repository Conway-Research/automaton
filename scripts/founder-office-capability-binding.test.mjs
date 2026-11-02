import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectOfficeServicePlan,officeEvidenceScopeDigest} from './founder-office-service-plan.mjs';

for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 const original=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8'));
 const expected={...original.binding,profile};
 const capability={profileId:profile,executorRef:'local:executor',reviewerRef:'local:reviewer',deliveryRef:'local:delivery'};
 const foreign={...capability,profileId:profile==='research-report'?'support-templates':'research-report',executorRef:'local:foreign'};
 test(profile+': reject ambiguous or malformed capability lists before mapping',()=>{
  for(const capabilities of [null,{},[],[null],[foreign],[capability,foreign],[foreign,capability],[capability,capability],[null,capability],[capability,null]]){
   const d=structuredClone(original);d.assessmentInput.evidence.capabilities=capabilities;
   // Even mapping assertions freshly bound to the malformed input cannot repair it.
   for(const m of d.evidenceMapping){m.ref='local:foreign';m.scopeDigest=officeEvidenceScopeDigest(d);}
   const r=inspectOfficeServicePlan(d,expected);
   assert.equal(r.status,'blocked');assert.ok(r.missing.includes('exact-profile-capability'));
   for(const flag of ['sendAuthorized','workAuthorized','deliveryAuthorized','evidenceVerified'])assert.equal(r[flag],false);
  }
 });
 test(profile+': single matching capability preserves reference checks and authority gates',()=>{
  const d=structuredClone(original);d.assessmentInput.evidence.capabilities=[capability];
  for(const id of ['executor','reviewer','delivery']){const m=d.evidenceMapping.find(m=>m.id===id);m.ref=capability[id+'Ref'];m.scopeDigest=officeEvidenceScopeDigest(d);}
  const r=inspectOfficeServicePlan(d,expected);
  assert.ok(!r.missing.includes('exact-profile-capability'));
  for(const id of ['executor','reviewer','delivery'])assert.ok(!r.missing.includes('evidence.'+id));
  assert.ok(r.missing.includes('independent-contract-funding-and-specialist-validation'));
  assert.ok(r.missing.includes('finished-package-customer-release'));
  for(const flag of ['sendAuthorized','workAuthorized','deliveryAuthorized','evidenceVerified'])assert.equal(r[flag],false);
  d.evidenceMapping.find(m=>m.id==='executor').ref='local:foreign';
  assert.ok(inspectOfficeServicePlan(d,expected).missing.includes('evidence.executor'));
 });
}
