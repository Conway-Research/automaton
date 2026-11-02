// Recompute current verified offline reports, not market forecasts or live books.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const run='artifacts/personnel-free-revalidation-20261004-212336/';
const sources=[],rows=[];
function read(relative){const bytes=fs.readFileSync(new URL(relative,root));sources.push({path:relative,sha256:createHash('sha256').update(bytes).digest('hex')});return JSON.parse(bytes);}
for(const name of ['scenarios','personal-benchmark','benchmark','personal-verify','soak']){
 const report=read(run+name+'.json');
 const cases=report.results??[report.totals];
 for(const [index,c] of cases.entries()){
  assert(c,'Missing scenario');
  for(const value of [c.revenueCents,c.spentCents])assert(Number.isSafeInteger(value)&&value>=0);
  const net=c.revenueCents-c.spentCents;
  assert.equal(net,c.netCents,'Source report arithmetic mismatch');
  rows.push({source:name,variant:c.name??c.scenario??String(index+1),
   ...(c.workers!==undefined?{workers:c.workers,perTaskCents:c.perTaskCents}:{}),
   ...(c.maxActiveCases!==undefined?{maxActiveCases:c.maxActiveCases}:{}),
   currency:'SYNTHETIC_USD_UNITS_NOT_CHF',revenueCents:c.revenueCents,
   nonPersonnelScenarioCostCents:c.spentCents,scenarioNetCents:net,
   personnelCostsIncluded:false,realizedProfitCents:null});
 }
}
const pilot=read('artifacts/pilot-evidence-20261002/verification-and-costs.json');
for(const p of pilot.scenarios){
 assert.equal(p.personnelCostsIncluded,false);
 assert(!Object.hasOwn(p,'laborCents')&&!Object.hasOwn(p,'hourlyLaborValueCents'));
 const key={optimistic:'optimisticOther',central:'centralOther',pessimistic:'pessimisticOther'}[p.name];
 const cost=Object.values(pilot.costAssumptions[key]).reduce((n,v)=>{assert(Number.isSafeInteger(v)&&v>=0);return n+v;},0);
 assert.equal(cost,p.otherCents);
 for(const units of [1,10,100])rows.push({source:'pilot-price-assumption',variant:p.name,units,currency:'CHF',
  revenueCents:p.priceCents*units,nonPersonnelScenarioCostCents:cost*units,
  partialContributionCents:(p.priceCents-cost)*units,personnelCostsIncluded:false,
  fullNetProfitCents:null,realizedProfitCents:null,
  limitation:'Conditional volume, not predicted sales. Fixed non-personnel costs, applicable taxes and other missing fees unresolved; no scaling evidence.'});
}
console.log(JSON.stringify({version:'personnel-free-economic-recalculation-1',sources,rows,
 totalRows:rows.length,actualMarketRevenueVerified:false,
 limitation:'Independent scenarios must not be summed. No personnel amount is charged. Synthetic costs are fixture inputs, not measured costs. No arbitrary discount of unidentified cost aggregates. Historical copies are superseded for current planning, not new evidence.',
 liveReady:false,productionAccepted:false},null,2));
