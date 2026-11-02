import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {RevenueStore} from '../revenue/store.js';
import {registerProfitabilityPolicy} from '../revenue/profitability.js';
import {registerProfitSource,reconcileProfit,type ProfitStatement} from '../revenue/profit-reconciliation.js';
import {COST_CATEGORIES} from '../revenue/profit-ledger.js';
import {OpportunityProfiles} from '../revenue/opportunity-profile.js';
import {compareProfitabilityAlternatives,comparePricingAlternatives} from '../revenue/strategy-comparison.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
import {claimDigest} from '../commerce/claim-evidence.js';
let dir:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-champion-'));db=createDatabase(path.join(dir,'test.db'));other=createDatabase(path.join(dir,'test.db'));});
afterEach(()=>{vi.useRealTimers();db.close();other.close();fs.rmSync(dir,{recursive:true});});
function profile(opportunityId:string,revisionId=opportunityId,capitalRequiredCents=10){return {opportunityId,revisionId,capitalRequiredCents,startupCostCents:0,ongoingCostCents:0,validationCostCents:10,timeToValidationHours:1,timeToRevenueHours:1,maximumLossCents:10,opportunityCostCents:0,liquidityDays:0,scalability:1,repeatability:1,automationPotential:1,reversibility:1,evidenceQuality:1};}
async function series(id:string,net:number,mode:'paper'|'live'='live',samplePrefix=id,basis='comparable',pricing?:{price:number;channel?:string;exposures?:number}){
  db.raw.prepare("INSERT INTO revenue_opportunities(id,name,status) VALUES(?,?,'validating')").run(id,id);
  registerProfitabilityPolicy(db.raw,{opportunityId:id,minimumSamples:3,minimumNetCents:-1,maximumNetCents:net===90?100:1000,maximumCumulativeLossCents:1000,maximumDrawdownCents:1000,
    maximumEvidenceAgeMs:60000,capacityCents:20,maximumScaleCents:20,maximumValidationCents:10,forecastSuccessMeansPositiveNet:true,comparisonBasis:basis,reviewedBy:'fixture'});
  new OpportunityProfiles(db.raw).record(profile(id));registerProfitSource(db.raw,id,mode);
  const store=new RevenueStore(db.raw);
  for(let i=0;i<20;i++){
    const exp=`${id}_${i}`;
    db.raw.prepare("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents) VALUES(?,?,'planned','registered',20)").run(exp,id);
    store.transitionExperimentStatus(exp,'running');if(pricing)vi.setSystemTime(Date.now()+1000);store.transitionExperimentStatus(exp,'completed','fixture','fixture');
    const e=store.getExperiment(exp)!;
    const s:ProfitStatement={statementId:exp,experimentId:exp,mode,currency:'USD',sampleUnitId:`${samplePrefix}_${i}`,comparisonBasis:basis,periodStart:Date.parse(e.startedAt!),periodEnd:Date.parse(e.completedAt!),observedAt:Date.now(),
      revenueCents:net,costs:Object.fromEntries(COST_CATEGORIES.map(k=>[k,0])) as ProfitStatement['costs'],cashSettled:true,liabilitiesComplete:true,evidenceDigest:'a'.repeat(64)};
    if(pricing)s.business={cohortId:exp,channelId:pricing.channel??'search',productId:'template',priceCents:pricing.price,exposures:pricing.exposures??10,leads:2,customers:1,newCustomers:1,orders:1,
      renewalEligible:0,renewed:0,subscriptionRevenueCents:0,deliveryCostCents:0,supportCostCents:0,
      attribution:{audience:'fixture',language:'de',region:'CH',channel:pricing.channel??'search',variant:'v1',productDigest:'a'.repeat(64),requirementsDigest:'b'.repeat(64),qualityDecisionDigest:'c'.repeat(64),
        hypothesisId:'registered',hypothesisDigest:claimDigest('registered'),experimentId:exp,campaignId:'comparison',messageDigest:'d'.repeat(64),evidenceDigest:'e'.repeat(64),provenance:'ABGESTIMMT',quality:'passed',activated:1,reused:0,refundedOrders:0,supportCases:0,representativeSample:true,costsComplete:true}};
    await reconcileProfit(db.raw,exp,{sourceId:id,readVerifiedStatement:async()=>s});
  }
}
it.each(['paper','live'] as const)('compares observed %s strategies through the real tool without switching or authorizing execution',async mode=>{
  await series('champion',90,mode);await series('challenger',900,mode);
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='revenue_compare_strategies')!;
  const report=JSON.parse(await tool.execute({champion_id:'champion',challengers:[{opportunityId:'challenger',switchingCostCents:1}]},{db:other} as ToolContext));
  expect(report).toMatchObject({executionAuthorized:false,recommendedCandidate:mode==='live'?'challenger':null,candidates:[{reasons:[],recommendation:mode==='live'?'candidate_for_controlled_reallocation':'candidate_for_further_validation'}]});
  expect(compareProfitabilityAlternatives(other.raw,'champion',[{opportunityId:'challenger',switchingCostCents:10000}]).recommendedCandidate).toBeNull();
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
});
it('compares reconciled price cohorts through the runtime tool without asserting causal elasticity or changing prices',async()=>{
  vi.useFakeTimers();vi.setSystemTime(Date.now());
  await series('champion',90,'live','champion','comparable',{price:90});await series('challenger',900,'live','challenger','comparable',{price:900});
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='revenue_compare_strategies')!;
  const report=JSON.parse(await tool.execute({comparison_kind:'pricing',champion_id:'champion',challengers:[{opportunityId:'challenger',switchingCostCents:1}]},{db:other} as ToolContext));
  expect(report).toMatchObject({executionAuthorized:false,priceChangeAuthorized:false,candidates:[{reasons:[],championPriceCents:90,candidatePriceCents:900,causalPriceEffect:null,recommendation:'candidate_for_controlled_price_replication'}]});
  expect(report.candidates[0].observations).toHaveLength(20);
  expect(report.candidates[0].observations[0]).toMatchObject({conversionRate:0.1,netProfitCents:900,lifetimeValueCents:null});
});
it.each(['missing','channel','exposures','same_price'] as const)('retains current pricing on %s instead of treating profitable aggregates as a controlled price effect',async failure=>{
  vi.useFakeTimers();vi.setSystemTime(Date.now());
  await series('champion',90,'live','champion','comparable',{price:90});
  await series('challenger',900,'live','challenger','comparable',failure==='missing'?undefined:{price:failure==='same_price'?90:900,channel:failure==='channel'?'other':'search',exposures:failure==='exposures'?100:10});
  const report=comparePricingAlternatives(other.raw,'champion',[{opportunityId:'challenger',switchingCostCents:0}]);
  expect(report.candidates[0].recommendation).toBe('retain_current_price');expect(report.candidates[0].reasons.length).toBeGreaterThan(0);
});
it.each(['mode','basis','shared_samples','resources','stale'] as const)('retains the champion when %s makes replacement unsupported',async failure=>{
  await series('champion',90);await series('challenger',900,failure==='mode'?'paper':'live',failure==='shared_samples'?'champion':'challenger',failure==='basis'?'different':'comparable');
  if(failure==='resources')new OpportunityProfiles(db.raw).record(profile('challenger','changed',11));
  if(failure==='stale'){vi.useFakeTimers();vi.setSystemTime(Date.now()+60001);}
  const report=compareProfitabilityAlternatives(other.raw,'champion',[{opportunityId:'challenger',switchingCostCents:0}]);
  expect(report.recommendedCandidate).toBeNull();expect(report.candidates[0].reasons.length).toBeGreaterThan(0);
});
