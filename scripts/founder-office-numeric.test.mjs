import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as offer from './founder-offer-feasibility.mjs';
import {inspectOfficeServicePlan} from './founder-office-service-plan.mjs';
function fixture(profile='document-cleanup'){
 const d=JSON.parse(fs.readFileSync(new URL('../outputs/office-leistungsplaene-20261023/candidates/'+profile+'.json',import.meta.url),'utf8'));
 Object.assign(d.assessmentInput.job,{privacy:'public',aiAllowed:true,description:'Synthetic',currency:'EUR',amount:40});
 Object.assign(d.assessmentInput.plan,{currency:'EUR',hourlyRateMinor:1000,feeBps:0,contingencyBps:0,externalCostMinor:0});
 for(const p of d.assessmentInput.plan.phases)Object.assign(p,{hours:1,days:1,customerConfirmed:true});
 Object.assign(d.commercialTerms,{agreedPriceMinor:4000,agreedCurrency:'EUR'});return d;
}
function inspect(d){const before=structuredClone(d);const r=inspectOfficeServicePlan(d,{...d.binding,profile:d.profile});assert.deepEqual(d,before);for(const k of ['workAuthorized','deliveryAuthorized','sendAuthorized','evidenceVerified'])assert.equal(r[k],false);return r;}
for(const profile of ['document-cleanup','xlsx-automation','support-templates','research-report']){
 test(profile+': invalid hours never produce an estimate',()=>{
  for(const hours of ['1',true,false,[1],{},null,undefined,NaN,Infinity,-1,0,0.001,Number.MAX_SAFE_INTEGER]){const d=fixture(profile);d.assessmentInput.plan.phases[0].hours=hours;const r=inspect(d);assert.ok(r.missing.includes('complete-distinct-work-phases'));assert.equal(r.assessment.estimate,undefined);}
 });
 test(profile+': actual numeric minutes remain accepted',()=>{
  for(const hours of [1,0.5,0.25,1/60]){const d=fixture(profile);d.assessmentInput.plan.phases[0].hours=hours;assert.ok(inspect(d).assessment.estimate);}
 });
 test(profile+': subcent budget is invalid in calculator and commercial display',()=>{
  const d=fixture(profile);d.assessmentInput.job.amount=39.999;const r=inspect(d);assert.ok(r.missing.includes('customer-budget'));assert.equal(r.commercialCheck.customerBudget.amount,null);assert.equal(r.assessment.draft,null);
 });
 test(profile+': exact budget boundary compares cents without substitution',()=>{
  for(const [amount,low] of [[39.99,true],[40,false],[40.01,false]]){const d=fixture(profile);d.assessmentInput.job.amount=amount;const r=inspect(d);assert.equal(r.missing.includes('budget-below-calculated-minimum'),low);assert.equal(r.commercialCheck.customerBudget.amount,amount);assert.equal(r.commercialCheck.agreedPriceMinor,4000);}
 });
}
test('shared decimal conversion handles normal decimals and safe large amounts',()=>{
 for(const [amount,minor] of [[0.01,1],[0.29,29],[1.1,110],[39.99,3999],[40,4000],[90071992547409.9,9007199254740990]])assert.equal(offer.budgetMinorUnits(amount),minor);
});
test('shared decimal conversion rejects invalid types, precision and overflow',()=>{
 for(const amount of [null,undefined,'40',true,[],{},NaN,Infinity,0,-0,-1,1e-7,0.001,39.999,0.1+0.2,90071992547409.92,Number.MAX_VALUE])assert.equal(offer.budgetMinorUnits(amount),null);
});
test('ordinary cent amounts do not fail from multiplication artifacts',()=>{
 for(let cents=1;cents<=10000;cents++)assert.equal(offer.budgetMinorUnits(cents/100),cents);
});
