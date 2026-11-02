// Offline revision of a historical synthetic estimate; no active DB or provider.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const file=new URL('../artifacts/pilot-evidence-20261002/verification-and-costs.json',import.meta.url);
const bytes=fs.readFileSync(file),source=JSON.parse(bytes);
const categories={optimistic:'optimisticOther',central:'centralOther',pessimistic:'pessimisticOther'};
const scenarios=source.scenarios.map(s=>{
 const components=source.costAssumptions[categories[s.name]];
 assert(components,'Unknown scenario');
 const nonPersonnelCents=Object.values(components).reduce((sum,n)=>{
  assert(Number.isSafeInteger(n)&&n>=0);return sum+n;
 },0);
 assert.equal(nonPersonnelCents,s.otherCents);
 const minutes=s.deliveryMinutes+s.acquisitionMinutes+s.supportMinutes;
 assert.equal(s.personnelCostsIncluded,false);
 assert.equal(s.priceCents-s.otherCents,s.provisionalContributionCents);
 return {name:s.name,priceCents:s.priceCents,humanInterventionMinutes:minutes,
  nonPersonnelComponents:components,nonPersonnelCents,
  personnelCostsIncluded:false,
  provisionalContributionCents:s.priceCents-nonPersonnelCents,
  completeNetProfitCents:null};
});
const report={mode:'revised-hypothetical-estimate-not-real-profit',currency:'CHF',
 source:'artifacts/pilot-evidence-20261002/verification-and-costs.json',
 sourceSha256:createHash('sha256').update(bytes).digest('hex'),scenarios,
 withdrawnAssumptions:[{field:'fixedPreparationCents',
   status:'WITHDRAWN_UNSUBSTANTIATED_ESTIMATE',includedInRevisedCalculation:false,
   reason:'No invoice, resource quantity or cost breakdown supports this fixed amount. Withdraw the estimate, without asserting it was personnel or that actual preparation is free.'}],
 unresolved:[
  {field:'preparationNonPersonnelCosts',acceptedNonPersonnelCents:null,reason:'Re-estimate only identifiable compute, infrastructure or other non-personnel resources; never reintroduce a human hourly allowance.'},
  ...['tax','platformCommission','scopeOverrun'].map(field=>({field,acceptedNonPersonnelCents:null,reason:'No quantified non-personnel evidence.'})),
 ],breakEvenSales:null,minimumFullCostPriceCents:null,liveReady:false,
 decision:'HOLD_UNTIL_NON_PERSONNEL_COSTS_AND_OTHER_EXISTING_GATES_VERIFIED',
 limitation:'Listed components are historical assumptions, not invoices. Personnel removal does not prove demand, actual expenses or profit. No active records changed.'};
console.log(JSON.stringify(report,null,2));
