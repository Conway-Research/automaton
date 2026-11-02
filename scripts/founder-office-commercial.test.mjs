import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {inspectOfficeServicePlan,officeEvidenceScopeDigest} from './founder-office-service-plan.mjs';
import {offerScopeDigest} from './founder-offer-feasibility.mjs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
function fixture(profile){
 const d=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8'));
 Object.assign(d.assessmentInput.job,{privacy:'public',aiAllowed:true,description:'Synthetic only',currency:'EUR',amount:1000});
 Object.assign(d.assessmentInput.plan,{currency:'EUR',hourlyRateMinor:1000,feeBps:0,contingencyBps:0,externalCostMinor:0});
 for(const p of d.assessmentInput.plan.phases)Object.assign(p,{hours:1,days:1,customerConfirmed:true});
 Object.assign(d.commercialTerms,{agreedPriceMinor:4000,agreedCurrency:'EUR'});
 return d;
}
function inspect(d){
 d.assessmentInput.evidence.scopeDigest=offerScopeDigest(d.assessmentInput.job,d.assessmentInput.plan);
 for(const m of d.evidenceMapping)m.scopeDigest=officeEvidenceScopeDigest(d);
 const before=JSON.stringify(d),r=inspectOfficeServicePlan(d,{...d.binding,profile:d.profile});
 assert.equal(JSON.stringify(d),before);
 for(const key of ['workAuthorized','sendAuthorized','deliveryAuthorized','evidenceVerified'])assert.equal(r[key],false);
 return r;
}
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 test(profile+': exact minimum and higher price remain review inputs',()=>{
  for(const price of [4000,4001,Number.MAX_SAFE_INTEGER]){
   const d=fixture(profile);d.commercialTerms.agreedPriceMinor=price;const r=inspect(d);
   assert.equal(r.commercialCheck.status,'consistent');
   assert.equal(r.commercialCheck.minimumQuoteMinor,4000);
   assert.equal(r.commercialCheck.agreedPriceMinor,price);
   assert.deepEqual(r.commercialCheck.customerBudget,{amount:1000,currency:'EUR'});
   assert.equal(r.status,'review-required');
  }
 });
 test(profile+': undercoverage blocks even with large customer budget',()=>{
  const d=fixture(profile);d.commercialTerms.agreedPriceMinor=3999;const r=inspect(d);
  assert.ok(r.missing.includes('commercial.agreed-price-below-calculated-minimum'));assert.equal(r.status,'blocked');
 });
 test(profile+': different currencies never compare numeric prices',()=>{
  const d=fixture(profile);d.commercialTerms.agreedCurrency='USD';d.commercialTerms.agreedPriceMinor=1;
  const r=inspect(d);assert.equal(r.commercialCheck.status,'blocked');assert.ok(r.missing.includes('commercial.currency-mismatch'));
  assert.ok(!r.missing.includes('commercial.agreed-price-below-calculated-minimum'));
 });
 test(profile+': unavailable calculation is not a zero minimum',()=>{
  const d=fixture(profile);d.assessmentInput.plan.hourlyRateMinor=null;const r=inspect(d);
  assert.equal(r.commercialCheck.status,'incomplete');assert.equal(r.commercialCheck.minimumQuoteMinor,null);
  assert.ok(r.missing.includes('commercial.calculation-required'));
 });
 test(profile+': source passes commercial block through without provider calls',async()=>{
  const d=fixture(profile);d.commercialTerms.agreedPriceMinor=1;
  const source=createMarketplaceWorkSource({platform:'ugig',sourceId:'synthetic',isEnabled:()=>false,readAssignment(){throw Error('forbidden');},verifyProduct(){throw Error('forbidden');},submitDelivery(){throw Error('forbidden');}});
  const r=await source.methods.prepare({officeServicePlan:d,order:{gigId:d.binding.gig,applicationId:d.binding.applicationId,conversationId:d.binding.conversationId,workKind:profile}});
  assert.equal(r.confirmed,false);assert.equal(r.planningOnly,true);assert.equal(r.review.commercialCheck.status,'blocked');
 });
}
for(const price of [null,undefined,0,-1,1.5,'4000',NaN,Infinity,Number.MAX_SAFE_INTEGER+1])test('invalid agreed price '+String(price),()=>{
 const d=fixture('document-cleanup');d.commercialTerms.agreedPriceMinor=price;const r=inspect(d);
 assert.equal(r.commercialCheck.status,'incomplete');assert.equal(r.commercialCheck.agreedPriceMinor,null);assert.ok(r.missing.includes('terms.agreedPriceMinor'));
});
test('missing currency and budget remain missing; budget is never substituted',()=>{
 const d=fixture('document-cleanup');d.commercialTerms.agreedCurrency=null;d.assessmentInput.job.amount=null;
 const r=inspect(d);assert.equal(r.commercialCheck.status,'incomplete');assert.equal(r.commercialCheck.agreedCurrency,null);assert.equal(r.commercialCheck.customerBudget.amount,null);
});
test('known currency mismatch survives unavailable calculation',()=>{
 const d=fixture('document-cleanup');d.assessmentInput.plan.hourlyRateMinor=null;d.commercialTerms.agreedCurrency='USD';
 assert.ok(inspect(d).missing.includes('commercial.currency-mismatch'));
});
test('fees and contingency are included in minimum comparison',()=>{
 const d=fixture('document-cleanup');Object.assign(d.assessmentInput.plan,{feeBps:1000,contingencyBps:1000});d.commercialTerms.agreedPriceMinor=4888;
 const r=inspect(d);assert.equal(r.commercialCheck.minimumQuoteMinor,4889);assert.equal(r.commercialCheck.status,'blocked');
});
