import {afterEach,beforeEach,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {ResearchStore,type ResearchOpportunity} from '../revenue/research.js';
import type {MarketingPlan} from '../revenue/marketing.js';
import {OnlineRuntime} from '../online/runtime.js';
import {planResearchExperiment} from '../revenue/research-handoff.js';
import {researchAdmissionBlock,researchEconomicVersionBlock} from '../revenue/research-admission.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';

let directory:string,db:ReturnType<typeof createDatabase>,store:ResearchStore;
const plan:MarketingPlan={currency:'USD',product:'Irrigation forecasting pilot',audience:'Vineyard operators',channel:'Permission-based pilot listing',
  offer:'Deliver one irrigation report',successCriterion:'One attributable paid pilot and positive settled net proceeds',stopCriterion:'Stop after seven days or at the approved cost ceiling without a paid pilot',
  priceCents:2000,deliveryCostCents:100,paymentFeeCents:50,refundAllowanceCents:50,taxAllowanceCents:100,acquisitionCostPerSaleCents:200,
  fixedTestCostCents:500,operatingCostCents:100,availableTestBudgetCents:2000,conservativeSales:2};
function seed(unknown=true){
  const o:ResearchOpportunity={id:'vineyard',title:'Vineyard forecasting',sector:'b2b-services',hypothesis:'A report may reduce irrigation effort',
    forecast:{revenueCents:0,costCents:0,probability:0,days:7,validationBudgetCents:0},...(unknown?{forecastState:'unknown' as const}:{})};
  store.import({opportunities:[o],evidence:['one','two'].map((host,i)=>({id:`source-${i}`,opportunityId:o.id,sourceUrl:`https://${host}.example/request`,
    observedAt:new Date(Date.now()-60000).toISOString(),kind:'request',excerpt:`Distinct fixture request ${i} for irrigation forecasts`,provenance:'reported',reviewedBy:null}))});
}
beforeEach(()=>{directory=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-economics-'));db=createDatabase(path.join(directory,'fixture.db'));store=new ResearchStore(db.raw);});
afterEach(()=>{db.close();fs.rmSync(directory,{recursive:true,force:true});});
it.each(['vineyard','intermediate'])('revalidates later reviewed counter-evidence from %s across revisions',ancestor=>{
 seed();
 const first=store.reviseEconomics('vineyard',plan,0.8,7,'First synthetic revision');
 const last=store.reviseEconomics(first.id,plan,0.9,7,'Second synthetic revision');
 for(const e of store.evidence(last.id))store.review(e.id,'fixture','accept','Synthetic positive review');
 expect(store.rank().find(o=>o.id===last.id)?.decision).toBe('validate');
 const now=Date.now(),parent=ancestor==='vineyard'?'vineyard':first.id;
 store.import({opportunities:[],evidence:[{id:'late-rejection',opportunityId:parent,sourceUrl:'https://counter.example/response',
  observedAt:new Date(now).toISOString(),kind:'rejection',excerpt:'Synthetic counter-evidence',provenance:'reported',reviewedBy:null}]});
 expect(researchEconomicVersionBlock(db.raw,last.id)).toBeUndefined();
 store.review('late-rejection','fixture','accept','Verified synthetic counter-evidence');
 const before=db.raw.prepare('SELECT total_changes() n').get();
 expect(store.rank().find(o=>o.id===last.id)).toMatchObject({decision:'hold',score:0});
 expect(researchEconomicVersionBlock(db.raw,last.id)).toContain('rejection');
 expect(researchEconomicVersionBlock(db.raw,last.id,now-1)).toBeUndefined();
 expect(researchEconomicVersionBlock(db.raw,last.id,now+90*86400000)).toContain('rejection');
 expect(researchEconomicVersionBlock(db.raw,last.id,now+90*86400000+1)).toBeUndefined();
 expect(researchEconomicVersionBlock(db.raw,last.id,NaN)).toContain('Invalid');
 expect(store.plan(500,Date.now(),last.id).plans).toEqual([]);
 expect(db.raw.prepare('SELECT total_changes() n').get()).toEqual(before);
 store.review('late-rejection','fixture','reject','Counter-evidence found inapplicable on explicit review');
 expect(researchEconomicVersionBlock(db.raw,last.id)).toBeUndefined();
 expect(store.rank().find(o=>o.id===last.id)?.decision).toBe('validate');
});
it('preserves syndicated provenance through repeated economic revisions and fresh reviews',()=>{
 store.import({opportunities:[{id:'syndicated',title:'Synthetic opportunity',sector:'software',hypothesis:'Fixture only',
  forecast:{revenueCents:0,costCents:0,probability:0,days:7,validationBudgetCents:0},forecastState:'unknown'}],
  evidence:[0,1].map(i=>({id:`syndicated${i}`,opportunityId:'syndicated',sourceUrl:`https://source${i}.example/task`,
   originUrl:'https://origin.example/task',observedAt:new Date().toISOString(),kind:'request' as const,
   excerpt:`Different synthetic wording ${i}`,provenance:'reported' as const,reviewedBy:null}))});
 let current='syndicated';
 for(const probability of [0.8,0.9]){
  const revised=store.reviseEconomics(current,plan,probability,7,'Synthetic economics revision');
  const evidence=store.evidence(revised.id);
  expect(evidence.map(e=>e.originUrl)).toEqual(['https://origin.example/task','https://origin.example/task']);
  for(const e of evidence)store.review(e.id,'fixture','accept','Fresh synthetic review');
  expect(store.rank().find(o=>o.id===revised.id)).toMatchObject({independentSources:1,decision:'hold',score:0});
  expect(store.plan(500,Date.now(),revised.id).plans).toEqual([]);
  expect(()=>planResearchExperiment(db.raw,revised.id)).toThrow('reviewed demand');
  current=revised.id;
 }
 expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
});

it('holds an unknown forecast while distinguishing an explicit zero-return assumption',()=>{
  seed();expect(store.rank()[0]).toMatchObject({decision:'hold',forecastNetCents:null,score:0});
  expect(store.economicBrief('vineyard')).toMatchObject({missing:expect.arrayContaining(['payer','price','paymentFees','taxAllowance']),economics:null,test:{maxAuthorizedSpendCents:0,executionAuthorized:false}});
  expect(store.plan(10000).plans).toHaveLength(0);
  const o=JSON.parse((db.raw.prepare('SELECT payload FROM research_opportunities').get() as {payload:string}).payload);delete o.forecastState;o.id='zero';
  store.import({opportunities:[o],evidence:[]});expect(store.rank().find(x=>x.id==='zero')).toMatchObject({decision:'reject',forecastNetCents:0});
});
it('marks automatic forecasts unknown and persists missing facts in the actual private draft',async()=>{
  const r=new OnlineRuntime(db.raw,async input=>new Response(JSON.stringify(String(input).includes('github')?{items:[{
    html_url:'https://github.com/fixture/project/issues/1',title:'Need vineyard forecasting',body:'Need vineyard forecasting report',created_at:new Date(Date.now()-60000).toISOString()}]}:[])));
  r.enqueue('vineyard forecasting');r.control('start');await r.tick();
  const candidate=r.snapshot().research[0];expect(candidate).toMatchObject({decision:'hold',forecastNetCents:null});
  const draft=r.draft(candidate.id);expect(draft.economicBrief).toMatchObject({economics:null,missing:expect.arrayContaining(['payer','price']),profitabilityProven:false});
  expect(draft.plannedExperimentId).toBeNull();
});
it('does not alias a historical explicit zero forecast with a new unknown automatic forecast',()=>{
  const r=new OnlineRuntime(db.raw,async()=>{throw new Error('No external calls');});
  r.enqueue('vineyard forecasting',{revenueCents:0,costCents:0,probability:0,days:30,validationBudgetCents:0});
  const original=(db.raw.prepare('SELECT payload FROM research_opportunities').get() as {payload:string}).payload;
  db.raw.exec("UPDATE online_jobs SET status='done',created_at=datetime('now','-2 days')");
  r.enqueue('vineyard forecasting');
  expect(r.snapshot().research.map(x=>x.decision).sort()).toEqual(['hold','reject']);
  expect(db.raw.prepare('SELECT 1 FROM research_opportunities WHERE payload=?').get(original)).toBeDefined();
});
it('versions complete economics and retains the unknown original without inheriting reviews or budgets',()=>{
  seed();for(const e of store.evidence())store.review(e.id,'fixture','accept','Fixture only');
  const first=store.reviseEconomics('vineyard',plan,0.8,7,'Fixture cost decomposition');
  expect(first.brief).toMatchObject({forecastNetCents:1600,decision:'hold',missing:[],economics:{grossOutlayCents:1600,forecastNetCents:2400}});
  expect(store.rank().find(x=>x.id==='vineyard')?.forecastNetCents).toBeNull();
  expect(store.rank().find(x=>x.id===first.id)?.independentSources).toBe(0);
  expect(()=>planResearchExperiment(db.raw,first.id)).toThrow('reviewed demand');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  expect(()=>db.raw.exec('DELETE FROM research_economic_revisions')).toThrow('immutable');
});
it('connects reviewed economics to the existing experiment planner with zero execution budgets',()=>{
  seed();const revised=store.reviseEconomics('vineyard',plan,0.8,7,'Fixture only');
  for(const e of store.evidence(revised.id))store.review(e.id,'fixture','accept','Fixture only');
  const proposal=store.plan(500,Date.now(),revised.id).plans[0];
  expect(proposal).toMatchObject({successCriteria:plan.successCriterion,stopCondition:plan.stopCriterion,economicAssessment:{grossOutlayCents:1600}});
  const {experimentId}=planResearchExperiment(db.raw,revised.id);
  expect(db.raw.prepare('SELECT channel,offer,forecast_cost_cents,max_budget_cents,max_inference_cost_cents,status FROM revenue_experiments WHERE id=?').get(experimentId))
    .toEqual({channel:plan.channel,offer:plan.offer,forecast_cost_cents:1600,max_budget_cents:0,max_inference_cost_cents:0,status:'planned'});
});
it('rejects high-revenue proposals whose gross funding exceeds the assumed test envelope',()=>{
  seed();const r=store.reviseEconomics('vineyard',{...plan,availableTestBudgetCents:1000},1,7,'Cash gap fixture');
  expect(r.brief).toMatchObject({forecastNetCents:2400,decision:'reject',reason:expect.stringContaining('Gross test outlay')});
});
it('accounts for success uncertainty after every cost rather than ranking by revenue',()=>{
  seed();const low=store.reviseEconomics('vineyard',plan,0.2,7,'Low confidence');
  expect(low.brief).toMatchObject({decision:'reject',forecastNetCents:-800});
  const high=store.reviseEconomics('vineyard',plan,0.8,7,'Higher confidence fixture');
  for(const id of [low.id,high.id])for(const e of store.evidence(id))store.review(e.id,'fixture','accept','Fixture only');
  expect(store.rank()[0]).toMatchObject({id:high.id,decision:'validate',forecastNetCents:1600});
  expect(store.rank().find(x=>x.id===low.id)).toMatchObject({decision:'hold',reason:expect.stringContaining('superseded'),forecastNetCents:-800,score:0});
});
it('blocks a funded predecessor across connections after a worse economic revision without erasing its accounting',()=>{
  seed();const original=store.reviseEconomics('vineyard',plan,0.8,7,'Initial fixture');
  for(const e of store.evidence(original.id))store.review(e.id,'fixture','accept','Fixture only');
  const {experimentId}=planResearchExperiment(db.raw,original.id);
  db.raw.prepare("UPDATE revenue_opportunities SET status='validating'").run();
  db.raw.prepare("UPDATE revenue_experiments SET status='running',started_at=datetime('now'),max_budget_cents=100,max_inference_cost_cents=50 WHERE id=?").run(experimentId);
  const other=createDatabase(path.join(directory,'fixture.db'));
  try{
    const governor=new ExperimentBudgetGovernor(other.raw);
    expect(researchAdmissionBlock(other.raw,experimentId)).toBeUndefined();
    expect(governor.checkInferenceBudget(experimentId,1).allowed).toBe(true);
    const worse=store.reviseEconomics(original.id,{...plan,acquisitionCostPerSaleCents:3000},0.8,7,'New cost evidence fixture');
    expect(worse.brief.decision).toBe('reject');
    expect(researchAdmissionBlock(other.raw,experimentId)).toContain('economics superseded');
    expect(governor.checkInferenceBudget(experimentId,1).allowed).toBe(false);
    expect(governor.checkTotalBudget(experimentId,1).allowed).toBe(false);
    expect(store.reviseEconomics('vineyard',plan,0.8,7,'Initial fixture').duplicate).toBe(true);
    expect(researchAdmissionBlock(other.raw,experimentId)).toContain('economics superseded');
    expect(()=>planResearchExperiment(other.raw,original.id)).toThrow('reviewed demand');
    expect(other.raw.prepare('SELECT status,max_budget_cents,max_inference_cost_cents FROM revenue_experiments WHERE id=?').get(experimentId))
      .toEqual({status:'running',max_budget_cents:100,max_inference_cost_cents:50});
  }finally{other.close();}
});
it.each([{taxAllowanceCents:undefined},{paymentFeeCents:-1},{currency:'CHF'},{operatingCostCents:NaN},{stopCriterion:''}])('rejects incomplete or incompatible economic inputs %#',changes=>{
  seed();expect(()=>store.reviseEconomics('vineyard',{...plan,...changes} as MarketingPlan,0.8,7,'Fixture invalid')).toThrow();
  expect(store.rank()).toHaveLength(1);
});
it('deduplicates across connections, bounds the entire revision lineage and survives reopening',()=>{
  seed();const other=createDatabase(path.join(directory,'fixture.db')),second=new ResearchStore(other.raw);
  let current='vineyard';
  try{
    for(let i=0;i<8;i++){
      const previous=current;const r=store.reviseEconomics(previous,plan,0.8,7,`Fixture revision ${i}`);current=r.id;
      expect(second.reviseEconomics(previous,plan,0.8,7,`Fixture revision ${i}`)).toMatchObject({id:current,duplicate:true});
    }
    expect(()=>second.reviseEconomics(current,plan,0.8,7,'Excess')).toThrow('revision limit');
  }finally{other.close();}
  db.close();db=createDatabase(path.join(directory,'fixture.db'));store=new ResearchStore(db.raw);
  expect(store.economicBrief(current)).toMatchObject({decision:'hold',forecastNetCents:1600});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM research_economic_revisions').get()).toEqual({n:8});
});
it('makes economics available through the actual agent tool without external calls',async()=>{
  seed();const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_research_economics')!;
  const ctx={db} as unknown as ToolContext;
  expect(JSON.parse(await tool.execute({action:'brief',opportunity_id:'vineyard'},ctx)).missing).toContain('payer');
  const result=JSON.parse(await tool.execute({action:'revise',opportunity_id:'vineyard',plan,probability:0.8,days:7,reason:'Fixture'},ctx));
  expect(result.brief.test.executionAuthorized).toBe(false);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
it('rejects omitted cost components in an imported economic forecast',()=>{
  seed();const source=JSON.parse((db.raw.prepare('SELECT payload FROM research_opportunities').get() as {payload:string}).payload);
  delete source.forecastState;source.id='bad';source.economics=plan;source.forecast={revenueCents:4000,costCents:0,probability:0.8,days:7,validationBudgetCents:500};
  expect(()=>store.import({opportunities:[source],evidence:[]})).toThrow('every economic cost');
  expect(store.rank()).toHaveLength(1);
});
