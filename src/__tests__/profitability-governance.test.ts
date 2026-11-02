import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {registerOutcomeContract} from '../revenue/outcome.js';
import {registerRevalidationAllowance,revalidationAdmission} from '../revenue/revalidation.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {reserveInferenceCost,settleInferenceCost} from '../inference/reservations.js';
import {isProtectedFile} from '../self-mod/code.js';
import {RevenueStore} from '../revenue/store.js';
import {registerProfitSource,reconcileProfit,reconcileProfitCorrection,reconciledProfitEvidence,profitReconciliationBlocked,reviewProfitRecovery,type ProfitStatement} from '../revenue/profit-reconciliation.js';
import {COST_CATEGORIES} from '../revenue/profit-ledger.js';
import {economicCalibration,registerProfitabilityPolicy,registerScalingReview,profitabilitySnapshot,type ProfitabilityPolicy} from '../revenue/profitability.js';
import {OpportunityProfiles} from '../revenue/opportunity-profile.js';
import {recordAllocationComparison,observeAllocationComparison,planCapitalAllocation} from '../revenue/capital-allocation.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {bindPaperProfit,reconcilePaperProfit} from '../revenue/paper-profit.js';
import {PaperPortfolio} from '../revenue/paper-portfolio.js';
import {ArbitragePaperEngine,ARBITRAGE_COSTS,type ArbitrageCandidate} from '../revenue/arbitrage.js';
import {main} from '../v1/cli.js';
import {economicState} from '../revenue/economic-state.js';
import {createBuiltinTools} from '../agent/tools.js';
import type {ToolContext} from '../types.js';
import {claimDigest} from '../commerce/claim-evidence.js';
let dir:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>;
beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-profitability-'));db=createDatabase(path.join(dir,'test.db'));other=createDatabase(path.join(dir,'test.db'));
  db.raw.exec(`INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','validating');
    INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_inference_cost_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition)
    VALUES('e','o','planned','test',100,100,24,'demand','no demand','ceiling'),('prior','o','planned','test',100,100,24,'demand','no demand','ceiling');`);
  registerOutcomeContract(db.raw,'prior',{minimumQualifiedCustomers:3,minimumPaidOrders:1,evidenceMaxAgeMs:60000,mode:'live',reviewedBy:'fixture'});
  db.raw.exec("UPDATE revenue_experiments SET status='completed' WHERE id='prior'");
});
afterEach(()=>{vi.useRealTimers();db.close();other.close();fs.rmSync(dir,{recursive:true});});
const allowance=()=>({opportunityId:'o',experimentId:'e',maximumCostCents:20,expiresAt:Date.now()+60000,reviewedBy:'fixture'});
it('blocks concurrent funding of an exact equivalent test across opportunities and permits later replication',()=>{
  registerPolicy();
  db.raw.exec("UPDATE revenue_experiments SET channel='listing',offer='template' WHERE id='e'; INSERT INTO revenue_opportunities(id,name,status) VALUES('q','other','validating'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,channel,offer,max_budget_cents,max_inference_cost_cents) VALUES('duplicate','q','planned',' TEST ','Listing','Template',100,100)");
  expect(new ExperimentBudgetGovernor(other.raw).checkTotalBudget('duplicate',1).allowed).toBe(true);
  const hold=db.raw.transaction(()=>reserveInferenceCost(db.raw,'worker','e','mock',5)).immediate();
  expect(new ExperimentBudgetGovernor(other.raw).checkInferenceBudget('duplicate',1)).toMatchObject({allowed:false,reason:expect.stringContaining('Equivalent validation')});
  settleInferenceCost(db.raw,hold,()=>{});
  expect(new ExperimentBudgetGovernor(other.raw).checkTotalBudget('duplicate',1).allowed).toBe(true);
});
it('appends reviewed refund corrections without deleting history, duplicating samples or clearing recovery',async()=>{
  const s=statement('live');registerProfitSource(db.raw,'mock','live');
  const adapter={sourceId:'mock',readVerifiedStatement:async()=>s};
  await reconcileProfit(db.raw,'e',adapter);
  const original=reconciledProfitEvidence(db.raw,'o')[0];
  s.revenueCents=0;s.evidenceDigest='b'.repeat(64);
  await expect(reconcileProfit(other.raw,'e',adapter)).rejects.toThrow();
  await reconcileProfitCorrection(db.raw,'e',adapter,original.statementDigest,'fixture');
  expect(await reconcileProfitCorrection(other.raw,'e',adapter,original.statementDigest,'fixture')).toMatchObject({duplicate:true});
  const corrected=reconciledProfitEvidence(other.raw,'o');
  expect(corrected).toHaveLength(1);expect(corrected[0]).toMatchObject({revision:1,revenueCents:0,netProfitCents:-10*COST_CATEGORIES.length});
  expect(profitReconciliationBlocked(other.raw,'o')).toBe(true);
  await reviewProfitRecovery(db.raw,'e',adapter,'fixture');
  expect(profitReconciliationBlocked(other.raw,'o')).toBe(false);
  expect(JSON.parse((db.raw.prepare('SELECT payload FROM obolus_profit_statements').get() as {payload:string}).payload).revenueCents).toBe(100);
  expect(()=>db.raw.exec('DELETE FROM obolus_profit_corrections')).toThrow('immutable');
  s.sampleUnitId='replacement';s.revenueCents=1;
  await expect(reconcileProfitCorrection(db.raw,'e',adapter,corrected[0].statementDigest,'fixture')).rejects.toThrow();
  expect(reconciledProfitEvidence(other.raw,'o')[0].revision).toBe(1);
  expect(profitReconciliationBlocked(other.raw,'o')).toBe(true);
});
it('attributes preregistered paper fills once with fees and slippage, without producing real cash',async()=>{
  expect(()=>bindPaperProfit(db.raw,'e',['position'],'cohort')).toThrow('freeze its forecast');
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('e','running');
  const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_paper_profit')!;
  const context={db} as ToolContext;
  await tool.execute({action:'bind',experiment_id:'e',position_ids:['position'],comparison_basis:'cohort'},context);
  expect(()=>bindPaperProfit(other.raw,'prior',['position'],'cohort')).toThrow();
  const portfolio=new PaperPortfolio(db.raw);
  portfolio.initialize({initialCapitalCents:1000000,liquidityFloorCents:100000,maxOpenRiskCents:15000,maxDailyLossCents:50000,maxDrawdownCents:100000,maxPositions:3,friction:{feeBps:10,slippageBps:5}});
  portfolio.open('position',{symbol:'SIM',thesis:'synthetic only',entryCents:10000,stopCents:9600,targetsCents:[10800],exitRule:'stop or target'},1000);
  const settled=portfolio.settle('position',[{time:2000,open:10000,high:10900,low:9900,close:10800}]);
  store.transitionExperimentStatus('e','completed','fixture','fixture');
  await tool.execute({action:'reconcile',experiment_id:'e'},context);
  expect(await reconcilePaperProfit(other.raw,'e')).toMatchObject({duplicate:true});
  expect(reconciledProfitEvidence(other.raw,'o')).toMatchObject([{mode:'paper',netProfitCents:settled.trade.netPnlCents,reconciled:true}]);
  expect(economicState(other.raw).profitContributors).toMatchObject([{mode:'live',winners:[],losers:[]},{mode:'paper',winners:[{netCents:settled.trade.netPnlCents,shareOfPositiveNet:1}]}]);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  expect(isProtectedFile('src/revenue/paper-profit.ts')).toBe(true);
});
it('rejects attribution of past paper winners and incomplete settlement',async()=>{
  new RevenueStore(db.raw).transitionExperimentStatus('e','running');
  const portfolio=new PaperPortfolio(db.raw);
  portfolio.initialize({initialCapitalCents:1000000,liquidityFloorCents:100000,maxOpenRiskCents:15000,maxDailyLossCents:50000,maxDrawdownCents:100000,maxPositions:3,friction:{feeBps:0,slippageBps:0}});
  portfolio.open('past',{symbol:'SIM',thesis:'synthetic only',entryCents:10000,stopCents:9600,targetsCents:[10800],exitRule:'stop or target'},1000);
  expect(()=>bindPaperProfit(db.raw,'e',['past'],'cohort')).toThrow('Preregister');
  bindPaperProfit(db.raw,'e',['missing'],'cohort');statement();
  await expect(reconcilePaperProfit(other.raw,'e')).rejects.toThrow();
  expect(profitReconciliationBlocked(db.raw,'o')).toBe(true);
  expect(reconciledProfitEvidence(db.raw,'o')).toHaveLength(0);
});
function statement(mode:'paper'|'live'='paper'):ProfitStatement{
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('e','running');store.transitionExperimentStatus('e','completed','fixture','fixture');
  const e=store.getExperiment('e')!;
  return {statementId:'statement1',experimentId:'e',mode,currency:'USD',sampleUnitId:'sample1',comparisonBasis:'cohort',periodStart:Date.parse(e.startedAt!),periodEnd:Date.parse(e.completedAt!),
    observedAt:Date.now(),revenueCents:100,costs:Object.fromEntries(COST_CATEGORIES.map(key=>[key,10])) as ProfitStatement['costs'],
    cashSettled:true,liabilitiesComplete:true,evidenceDigest:'a'.repeat(64)};
}
const paperArbitrageInput=()=>({candidate:{id:'arb',category:'cross_exchange',currency:'USD',capitalCents:100,grossProfitCents:100,
  costs:Object.fromEntries(ARBITRAGE_COSTS.map(k=>[k,1])),maximumLossCents:100,executableLiquidityCents:100,observedAt:1000,expiresAt:2000,evidence:'paper',legsAvailable:true} as ArbitrageCandidate,
  now:1100,actualGrossCents:50,actualCostsCents:20,failedLegLossCents:40});
function paperArbitrageEngine(){const engine=new ArbitragePaperEngine(db.raw);engine.initialize({capitalCents:5000,liquidityReserveCents:2500,maximumPositionCents:1000,maximumLossCents:100,maximumCumulativeLossCents:200,maxQuoteAgeMs:1000});return engine;}
it('connects preregistered arbitrage paper costs and failed legs to shared truth through the actual agent tool',async()=>{
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('e','running');
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='revenue_paper_profit')!;
  await tool.execute({action:'bind',kind:'arbitrage',experiment_id:'e',position_ids:['arb'],comparison_basis:'spread'}, {db} as ToolContext);
  const config=path.join(dir,'paper.json');
  fs.writeFileSync(config,JSON.stringify({limits:{capitalCents:5000,liquidityReserveCents:2500,maximumPositionCents:1000,maximumLossCents:100,maximumCumulativeLossCents:200,maxQuoteAgeMs:1000},
    policy:{edition:'founder',commercialFeatures:[],permissions:['paper_trading' as const],emergencyStop:false}}));
  await main(['arbitrage-paper-configure','--database',path.join(dir,'test.db'),'--input',config,'--apply']);
  const execute=createBuiltinTools("fixture-sandbox").find(t=>t.name==='paper_arbitrage')!;
  const input=paperArbitrageInput();
  const result=JSON.parse(await execute.execute({action:'execute',...input},{db} as ToolContext));
  expect(result).toMatchObject({mode:'paper',paperProfitCents:-10,liveExecutionAuthorized:false});
  expect(JSON.parse(await execute.execute({action:'execute',...input},{db:other} as ToolContext))).toEqual(result);
  db.raw.exec("INSERT INTO economic_events(id,event_type,experiment_id,amount_cents,currency) VALUES('paper-operation','cost','e',3,'USD')");
  store.transitionExperimentStatus('e','completed','fixture','fixture');
  await tool.execute({action:'reconcile',experiment_id:'e'},{db:other} as ToolContext);
  expect(await reconcilePaperProfit(db.raw,'e')).toEqual({duplicate:true});
  expect(reconciledProfitEvidence(other.raw,'o')).toMatchObject([{mode:'paper',revenueCents:50,costCents:63,netProfitCents:-13}]);
  expect(profitabilitySnapshot(other.raw,'o')).toMatchObject({accountingMode:'paper',liveSamples:0,paperSamples:1,executionAuthorized:false});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:1});
});
it('requires operator paper registration and never accepts an agent-supplied permission or live action',async()=>{
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='paper_arbitrage')!;
  const args={action:'execute',...paperArbitrageInput(),policy:{edition:'founder',permissions:['live_trading','paper_trading']}};
  await expect(tool.execute(args,{db} as ToolContext)).rejects.toThrow('Operator paper configuration');
  await expect(tool.execute({...args,action:'live'},{db} as ToolContext)).rejects.toThrow('Invalid paper');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_arbitrage_paper').get()).toEqual({n:0});
});
it('preserves configured paper limits and halt across connections and excludes commercial permission escalation',async()=>{
  const limits={capitalCents:5000,liquidityReserveCents:2500,maximumPositionCents:1000,maximumLossCents:100,maximumCumulativeLossCents:200,maxQuoteAgeMs:1000};
  const policy={edition:'founder' as const,commercialFeatures:[],permissions:['paper_trading' as const],emergencyStop:false};
  const engine=new ArbitragePaperEngine(db.raw);
  expect(()=>engine.configureRuntime(limits,{...policy,edition:'personal'})).toThrow('permission denied');
  expect(engine.snapshot().control).toBeNull();
  engine.configureRuntime(limits,policy);
  expect(()=>engine.configureRuntime({...limits,capitalCents:6000},policy)).toThrow('cannot be reset');
  expect(()=>engine.configureRuntime(limits,{...policy,permissions:['paper_trading','live_trading']})).toThrow('immutable');
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='paper_arbitrage')!;
  await tool.execute({action:'halt'},{db:other} as ToolContext);
  await expect(tool.execute({action:'execute',...paperArbitrageInput()},{db} as ToolContext)).rejects.toThrow('not active');
  expect(JSON.parse(await tool.execute({action:'status'},{db} as ToolContext))).toMatchObject({mode:'paper',control:{halted:1},totals:{count:0},liveExecutionAuthorized:false});
});
it('rejects retroactive arbitrage attribution and preserves legacy reports without fabricating missing gross costs',async()=>{
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('e','running');
  const engine=paperArbitrageEngine(),policy={edition:'founder' as const,commercialFeatures:[],permissions:['paper_trading' as const],emergencyStop:false};
  engine.executePaper({...paperArbitrageInput(),candidate:{...paperArbitrageInput().candidate,id:'past'}},policy);
  expect(()=>bindPaperProfit(db.raw,'e',['past'],'spread','arbitrage')).toThrow('Preregister');
  bindPaperProfit(db.raw,'e',['arb'],'spread','arbitrage');engine.executePaper(paperArbitrageInput(),policy);
  db.raw.exec("UPDATE obolus_arbitrage_paper SET report=json_remove(report,'$.settlement') WHERE id='arb'");
  store.transitionExperimentStatus('e','completed','fixture','fixture');
  await expect(reconcilePaperProfit(db.raw,'e')).rejects.toThrow();
  expect(reconciledProfitEvidence(other.raw,'o')).toHaveLength(0);
  expect(profitReconciliationBlocked(other.raw,'o')).toBe(true);
});
const businessCohort=()=>({cohortId:'customers_october',channelId:'search',productId:'template',priceCents:10,
  exposures:100,leads:20,customers:10,newCustomers:5,orders:10,renewalEligible:5,renewed:4,
  subscriptionRevenueCents:40,deliveryCostCents:20,supportCostCents:10});
it.each(['SIMULATION','LOKALE_FIXTURE','PROGNOSE','UNBEKANNT'] as const)('rejects %s business attribution from the actual live reconciliation path',async provenance=>{
 const s:ProfitStatement={...statement('live'),business:{...businessCohort(),attribution:{audience:'fixture',language:'de',region:'CH',channel:'search',variant:'v1',
  productDigest:'a'.repeat(64),requirementsDigest:'b'.repeat(64),qualityDecisionDigest:'c'.repeat(64),hypothesisId:'test',hypothesisDigest:claimDigest('test'),experimentId:'e',campaignId:'campaign',messageDigest:'d'.repeat(64),evidenceDigest:'e'.repeat(64),
  provenance,quality:'passed',activated:8,reused:4,refundedOrders:0,supportCases:0,representativeSample:true,costsComplete:true}}};
 registerProfitSource(db.raw,'business','live');
 const events=db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get();
 await expect(reconcileProfit(db.raw,'e',{sourceId:'business',readVerifiedStatement:async()=>s})).rejects.toThrow('Profit reconciliation failed');
 expect(reconciledProfitEvidence(other.raw,'o')).toHaveLength(0);
 expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual(events);
});
it.each(['paper','live'] as const)('exposes reconciled %s channel/cohort economics through the real profitability tool without invented LTV',async mode=>{
  const s={...statement(mode),business:businessCohort()};registerProfitSource(db.raw,'business',mode);
  await reconcileProfit(db.raw,'e',{sourceId:'business',readVerifiedStatement:async()=>s});
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='revenue_profitability')!;
  const result=JSON.parse(await tool.execute({opportunity_id:'o'},{db:other} as ToolContext));
  expect(result.businessPerformance).toHaveLength(1);
  expect(result.businessPerformance[0]).toMatchObject({mode,reconciled:true,metrics:{revenueCents:100,totalCostCents:170,netProfitCents:-70,
    acquisitionCostPerNewCustomerCents:2,conversionRate:0.1,renewalRate:0.8,churnRate:0.2,lifetimeValueCents:null,paybackHours:null,causalPriceEffect:null}});
  expect(result.executionAuthorized).toBe(false);
  expect(reconciledProfitEvidence(other.raw,'o')[0].conditions).toMatchObject({conversionBps:1000,retentionBps:8000,acquisitionCostCents:2,supportCostCents:10});
  expect(isProtectedFile('src/revenue/business-performance.ts')).toBe(true);
});
it.each(['incomplete','retention','costs','secret','contradiction'] as const)('rejects %s business metrics and pauses the affected economics',async problem=>{
  const s={...statement('live'),business:businessCohort()};registerProfitSource(db.raw,'business','live');
  if(problem==='incomplete')delete (s.business as Partial<typeof s.business>).exposures;
  if(problem==='retention')s.business.renewed=6;
  if(problem==='costs')s.business.supportCostCents=1000;
  if(problem==='secret')Object.assign(s.business,{rawDebug:'must never be persisted'});
  if(problem==='contradiction')Object.assign(s,{conditions:{retentionBps:10000}});
  await expect(reconcileProfit(db.raw,'e',{sourceId:'business',readVerifiedStatement:async()=>s})).rejects.toThrow();
  expect(profitReconciliationBlocked(other.raw,'o')).toBe(true);
  expect(reconciledProfitEvidence(other.raw,'o')).toHaveLength(0);
});
it('keeps unobserved renewal/conversion metrics null and updates refunds only through reviewed correction',async()=>{
  const s={...statement('live'),business:{...businessCohort(),exposures:null,leads:null,renewalEligible:null,renewed:null}};
  registerProfitSource(db.raw,'business','live');const adapter={sourceId:'business',readVerifiedStatement:async()=>s};
  await reconcileProfit(db.raw,'e',adapter);const before=reconciledProfitEvidence(other.raw,'o')[0];
  expect(before.business).toMatchObject({conversionRate:null,renewalRate:null,churnRate:null});
  s.costs.refund+=50;s.evidenceDigest='b'.repeat(64);
  await reconcileProfitCorrection(db.raw,'e',adapter,before.statementDigest,'fixture');
  expect(profitabilitySnapshot(other.raw,'o')).toMatchObject({state:'PAUSED',businessPerformance:[{metrics:{netProfitCents:-120}}]});
});
it('calibrates first revenue and capital occupancy from scoped observations and enforces intraperiod drawdown',async()=>{
  vi.useFakeTimers();registerPolicy();db.raw.exec("UPDATE revenue_experiments SET forecast_time_to_revenue_hours=2 WHERE id='e'");
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('e','running');const start=Date.now();
  vi.setSystemTime(start+2*3600000);store.transitionExperimentStatus('e','completed','fixture','fixture');
  vi.setSystemTime(start+3*3600000);
  const s:ProfitStatement={statementId:'deployment',experimentId:'e',mode:'live',currency:'USD',sampleUnitId:'one',comparisonBasis:'cohort',
    periodStart:start,periodEnd:start+2*3600000,observedAt:Date.now(),revenueCents:100,costs:Object.fromEntries(COST_CATEGORIES.map(k=>[k,0])) as ProfitStatement['costs'],
    cashSettled:true,liabilitiesComplete:true,evidenceDigest:'a'.repeat(64),
    deployment:{peakCapitalCents:200,capitalHoursCents:300,drawdownCents:100,firstRevenueAt:start+3600000,settledAt:Date.now()}};
  registerProfitSource(db.raw,'deployment','live');await reconcileProfit(db.raw,'e',{sourceId:'deployment',readVerifiedStatement:async()=>s});
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:'TERMINATED',drawdownCents:0,observedWithinExperimentDrawdownCents:100,
    economicForecastCalibration:{timeSamples:1,meanTimeToRevenueErrorHours:-1},deploymentObservations:[{metrics:{timeToFirstRevenueHours:1,settlementDelayHours:1,netReturnOnPeakCapital:0.5}}]});
  db.raw.exec("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents) VALUES('followon','p','planned','new work',20)");
  expect(new ExperimentBudgetGovernor(other.raw).checkTotalBudget('followon',1)).toMatchObject({allowed:false,reason:'Profitability governor: TERMINATED'});
});
it.each(['capital_integral','future_settlement','revenue_time'] as const)('rejects impossible %s observations instead of inventing capital velocity',async failure=>{
  const s=statement('live');s.deployment={peakCapitalCents:100,capitalHoursCents:0,drawdownCents:0,firstRevenueAt:null,settledAt:s.observedAt};
  if(failure==='capital_integral')s.deployment.capitalHoursCents=1000000;
  if(failure==='future_settlement')s.deployment.settledAt=s.observedAt+1;
  if(failure==='revenue_time')s.deployment.firstRevenueAt=s.periodStart-1;
  registerProfitSource(db.raw,'deployment','live');
  await expect(reconcileProfit(db.raw,'e',{sourceId:'deployment',readVerifiedStatement:async()=>s})).rejects.toThrow();
  expect(reconciledProfitEvidence(other.raw,'o')).toHaveLength(0);
});
const profitPolicy=():ProfitabilityPolicy=>({opportunityId:'p',minimumSamples:3,minimumNetCents:-1000,maximumNetCents:1000,
  maximumCumulativeLossCents:100,maximumDrawdownCents:100,maximumEvidenceAgeMs:60000,capacityCents:100,maximumScaleCents:50,maximumValidationCents:20,
  forecastSuccessMeansPositiveNet:true,comparisonBasis:'cohort',reviewedBy:'fixture'});
function registerPolicy(){
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('p','fixture','validating'); UPDATE revenue_experiments SET opportunity_id='p' WHERE id='e'");
  registerProfitabilityPolicy(db.raw,profitPolicy());
}
it.each(['paper','live'] as const)('calibrates allocation downward only from matching live forecast outcomes, not %s labels',async mode=>{
  vi.useFakeTimers();
  registerPolicy();registerProfitSource(db.raw,'calibration',mode);
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:2500,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  const store=new RevenueStore(db.raw);store.updateExperiment('e',{forecastRevenueCents:1000,forecastCostCents:10,forecastProbabilitySuccess:1,forecastTimeToRevenueHours:1});
  for(let i=0;i<3;i++){
    const id=`cal_${i}`;
    db.raw.prepare("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,forecast_cost_cents,forecast_probability_success,forecast_time_to_revenue_hours) VALUES(?,'p','planned','fixture',10,1,0)").run(id);
    store.transitionExperimentStatus(id,'running');vi.setSystemTime(Date.now()+3600);store.transitionExperimentStatus(id,'completed','fixture','fixture');const e=store.getExperiment(id)!;
    const s:ProfitStatement={experimentId:id,statementId:id,sampleUnitId:id,comparisonBasis:'cohort',mode,currency:'USD',periodStart:Date.parse(e.startedAt!),periodEnd:Date.parse(e.completedAt!),observedAt:Date.now(),revenueCents:10,
      costs:{...Object.fromEntries(COST_CATEGORIES.map(key=>[key,0])),other:20} as ProfitStatement['costs'],cashSettled:true,liabilitiesComplete:true,evidenceDigest:'a'.repeat(64)};
    s.deployment={peakCapitalCents:20,capitalHoursCents:0.02,drawdownCents:10,firstRevenueAt:Date.parse(e.completedAt!),settledAt:Date.now()};
    await reconcileProfit(db.raw,id,{sourceId:'calibration',readVerifiedStatement:async()=>s});
  }
  const result=planCapitalAllocation(other.raw,[{experimentId:'e',requestedCents:20,maximumLossCents:20,evidenceQuality:0.5,liquidityDays:0,opportunityCostCents:0}],
    {budgetCents:20,lossCapacityCents:20,maxPerExperimentCents:20,minEvidenceQuality:0,maxLiquidityDays:1},{edition:'founder',commercialFeatures:[],permissions:['experiments' as const],emergencyStop:false});
  expect(result.candidates[0].effectiveProbability).toBe(mode==='live'?0:1);
  expect(result.candidates[0].selected).toBe(mode==='paper');
  expect(result.candidates[0].horizonHours).toBeCloseTo(mode==='live'?1.001:1);
  expect(result.candidates[0].timeCorrectionHours).toBeCloseTo(mode==='live'?0.001:0);
  expect(result.executionAuthorized).toBe(false);
});
it('does not mistake two proposals sharing a provider and risk factor for diversification',()=>{
  registerPolicy();initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:2500,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('q','fixture','validating'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_inference_cost_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition) VALUES('other','q','planned','different test',100,100,24,'demand','no demand','ceiling'); UPDATE revenue_experiments SET forecast_revenue_cents=1000,forecast_cost_cents=10,forecast_probability_success=1,forecast_time_to_revenue_hours=1 WHERE id IN ('e','other')");
  const profiles=new OpportunityProfiles(db.raw);
  for(const opportunityId of ['p','q'])profiles.record({opportunityId,revisionId:opportunityId,capitalRequiredCents:10,startupCostCents:0,ongoingCostCents:0,validationCostCents:10,timeToValidationHours:1,timeToRevenueHours:1,maximumLossCents:10,opportunityCostCents:0,liquidityDays:0,scalability:0,repeatability:0,automationPotential:1,reversibility:1,evidenceQuality:0.5,dependencyIds:['provider'],riskFactorIds:['demand'],switchingHours:2});
  const candidates=['e','other'].map(experimentId=>({experimentId,requestedCents:10,maximumLossCents:10,evidenceQuality:0.5,liquidityDays:0,opportunityCostCents:0}));
  const limits={budgetCents:100,lossCapacityCents:100,maxPerExperimentCents:20,minEvidenceQuality:0,maxLiquidityDays:1,maxPerDependencyCents:10,maxPerRiskFactorLossCents:10,maxSwitchingHours:3};
  const edition={edition:'founder' as const,commercialFeatures:[],permissions:['experiments' as const],emergencyStop:false};
  const result=planCapitalAllocation(other.raw,candidates,limits,edition);
  expect(result.candidates.filter(c=>c.selected)).toHaveLength(1);
  expect(result.candidates.find(c=>!c.selected)!.reasons).toEqual(expect.arrayContaining(['shared_dependency_concentration','shared_risk_factor_limit']));
  expect(result.proposedConcentration.dependencies).toEqual([{id:'provider',cents:10}]);
  expect(planCapitalAllocation(other.raw,candidates,{...limits,maxSwitchingHours:1},edition).decision).toBe('preserve_capital');
});
it.each([undefined,51,25])('uses authenticated regime metrics and fails closed on missing or excessive slippage: %s',async slippage=>{
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('p','fixture','validating'); UPDATE revenue_experiments SET opportunity_id='p' WHERE id='e'");
  registerProfitabilityPolicy(db.raw,{...profitPolicy(),regimeBounds:[{metric:'slippageBps',minimum:0,maximum:50}]});
  expect(profitabilitySnapshot(db.raw,'p').state).toBe('HYPOTHESIS');
  const s=statement();if(slippage!==undefined)s.conditions={slippageBps:slippage};
  registerProfitSource(db.raw,'mock','paper');await reconcileProfit(db.raw,'e',{sourceId:'mock',readVerifiedStatement:async()=>s});
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:slippage===25?'PAPER_VALIDATING':'REVALIDATING',regime:[{metric:'slippageBps',value:slippage??null,inRange:slippage===25}],edgeHalfLifeHours:null});
});
it('registers operator policies through the CLI only on explicit apply without starting any runtime',async()=>{
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('p','fixture','validating')");
  const input=path.join(dir,'policy.json');fs.writeFileSync(input,JSON.stringify(profitPolicy()));
  const output=vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  try{
    const args=['profitability-policy','--database',path.join(dir,'test.db'),'--input',input];
    await main(args);
    expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_profitability_policies'").get()).toBeUndefined();
    await main([...args,'--apply']);await main([...args,'--apply']);
    expect(profitabilitySnapshot(other.raw,'p').policyConfigured).toBe(true);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_profitability_policies').get()).toEqual({n:1});
  }finally{output.mockRestore();}
});
it.each(['paper','live'] as const)('requires repeated reconciled %s results and explicit scale readiness; repeated cohorts downgrade',async mode=>{
  vi.useFakeTimers();registerPolicy();registerProfitSource(db.raw,'series',mode);
  const store=new RevenueStore(db.raw);
  for(let i=0;i<200;i++){
    const id=`sample_${String(i).padStart(3,'0')}`;
    db.raw.prepare("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_inference_cost_cents) VALUES(?,'p','planned','preregistered',100,100)").run(id);
    store.transitionExperimentStatus(id,'running');store.transitionExperimentStatus(id,'completed','fixture','fixture');
    const e=store.getExperiment(id)!;
    const s:ProfitStatement={statementId:id,experimentId:id,mode,currency:'USD',sampleUnitId:id,comparisonBasis:'cohort',periodStart:Date.parse(e.startedAt!),periodEnd:Date.parse(e.completedAt!),observedAt:Date.now(),
      revenueCents:1000,costs:{...Object.fromEntries(COST_CATEGORIES.map(key=>[key,0])),other:100} as ProfitStatement['costs'],cashSettled:true,liabilitiesComplete:true,evidenceDigest:'a'.repeat(64)};
    await reconcileProfit(db.raw,id,{sourceId:'series',readVerifiedStatement:async()=>s});
  }
  const profiles=new OpportunityProfiles(db.raw);
  profiles.record({opportunityId:'p',revisionId:'profile',capitalRequiredCents:50,startupCostCents:0,ongoingCostCents:0,validationCostCents:20,timeToValidationHours:1,timeToRevenueHours:1,maximumLossCents:20,opportunityCostCents:0,liquidityDays:0,scalability:1,repeatability:1,automationPotential:1,reversibility:1,evidenceQuality:1});
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:mode==='paper'?'PAPER_VALIDATED':'REPEATABLE',executionAuthorized:false});
  const review={reviewId:'ready',opportunityId:'p',maximumCents:50,expiresAt:Date.now()+60000,operationalReady:true as const,securityReady:true as const,reviewedBy:'fixture'};
  if(mode==='paper')expect(()=>registerScalingReview(db.raw,review)).toThrow('live evidence');
  else {
    registerScalingReview(db.raw,review);
    expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:'SCALABLE',maximumScaleCents:50,executionAuthorized:false});
  }
  const s=statement(mode);s.revenueCents=1000;s.sampleUnitId='sample_000';
  await reconcileProfit(db.raw,'e',{sourceId:'series',readVerifiedStatement:async()=>s});
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:'REVALIDATING',action:'REVALIDATE',reasons:expect.arrayContaining(['incompatible_or_repeated_samples'])});
});
it('keeps weak evidence within the preregistered validation ceiling despite larger experiment budgets',()=>{
  registerPolicy();const governor=new ExperimentBudgetGovernor(other.raw);
  expect(governor.checkTotalBudget('e',20).allowed).toBe(true);
  expect(governor.checkInferenceBudget('e',21)).toMatchObject({allowed:false,reason:'Profitability validation or scaling ceiling exceeded'});
  expect(profitabilitySnapshot(db.raw,'p')).toMatchObject({state:'HYPOTHESIS',perExperimentCeilingCents:20});
});
it('calibrates immutable forecast pairs, retains uncertainty and detects strong edge decay',()=>{
  const sample={net:900,cost:100,forecastCost:50,probability:0.8};
  const one=economicCalibration([sample],{minimum:-1000,maximum:1000},true);
  expect(one.lowerNetCents).toBeLessThan(0);expect(one.brierScore).toBeCloseTo(0.04);expect(one.meanCostErrorCents).toBe(50);
  const many=Array.from({length:400},(_,i)=>({...sample,net:i<200?900:-900}));
  expect(economicCalibration(many,{minimum:-1000,maximum:1000},true).edgeDecay).toBe(true);
  expect(economicCalibration(Array(200).fill(sample),{minimum:-1000,maximum:1000},true).lowerNetCents).toBeGreaterThan(0);
  expect(economicCalibration([sample],{minimum:-1,maximum:1},true).lowerNetCents).toBeNull();
  expect(economicCalibration([sample],{minimum:-1000,maximum:1000},false).brierScore).toBeNull();
});
it('spends one statistical family budget across immutable strategies, modes and repeated looks',()=>{
  registerPolicy();const first=profitabilitySnapshot(other.raw,'p').calibration!.seriesErrorBudget;
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('q','challenger','validating')");
  registerProfitabilityPolicy(other.raw,{...profitPolicy(),opportunityId:'q'});
  const second=profitabilitySnapshot(db.raw,'q').calibration!.seriesErrorBudget;
  expect(first).toBe(0.0125);expect(second).toBeCloseTo(0.025/6);
  registerProfitabilityPolicy(other.raw,profitPolicy());db.raw.exec('VACUUM');
  expect(profitabilitySnapshot(other.raw,'p').calibration!.seriesErrorBudget).toBe(first);
  expect(()=>db.raw.exec('DELETE FROM obolus_profitability_families')).toThrow('immutable');
  const samples=Array.from({length:200},()=>({net:900,cost:100,forecastCost:100,probability:0.8}));
  const a=economicCalibration(samples,{minimum:-1000,maximum:1000},true,3,200,first);
  const b=economicCalibration(samples,{minimum:-1000,maximum:1000},true,3,200,second);
  expect(b.lowerNetCents!).toBeLessThan(a.lowerNetCents!);
  expect(()=>economicCalibration(samples,{minimum:-1000,maximum:1000},true,3,200,1)).toThrow('error budget');
});
it('requires explicit unchanged-policy registration for legacy statistical metadata without rewriting history',()=>{
  registerPolicy();const before=db.raw.prepare('SELECT * FROM obolus_profitability_policies').get();
  db.raw.exec('DROP TABLE obolus_profitability_families');
  expect(()=>profitabilitySnapshot(other.raw,'p')).toThrow('Re-register unchanged');
  registerProfitabilityPolicy(other.raw,profitPolicy());
  expect(db.raw.prepare('SELECT * FROM obolus_profitability_policies').get()).toEqual(before);
  expect(profitabilitySnapshot(other.raw,'p').calibration!.seriesErrorBudget).toBe(0.0125);
});
it('keeps paper results separate, moves backwards on stale evidence and never grants execution',async()=>{
  vi.useFakeTimers();registerPolicy();const s=statement();s.revenueCents=1000;
  registerProfitSource(db.raw,'mock','paper');await reconcileProfit(db.raw,'e',{sourceId:'mock',readVerifiedStatement:async()=>s});
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:'PAPER_VALIDATING',paperSamples:1,liveSamples:0,executionAuthorized:false});
  vi.setSystemTime(Date.now()+60001);
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:'REVALIDATING',action:'REVALIDATE'});
  db.raw.exec("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('fresh','p','planned','new preregistered sample')");
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('fresh','running');store.transitionExperimentStatus('fresh','completed','fixture','fixture');
  const fresh=store.getExperiment('fresh')!;
  await reconcileProfit(db.raw,'fresh',{sourceId:'mock',readVerifiedStatement:async()=>({...s,experimentId:'fresh',statementId:'fresh',sampleUnitId:'fresh',
    periodStart:Date.parse(fresh.startedAt!),periodEnd:Date.parse(fresh.completedAt!),observedAt:Date.now()})});
  expect(profitabilitySnapshot(other.raw,'p')).toMatchObject({state:'PAPER_VALIDATING',expiredSamples:1,historicalSamplesExcluded:1,
    calibration:{samples:1,sequentialLookIndex:3},netProfitCents:2*(1000-10*COST_CATEGORIES.length)});
  expect(()=>registerProfitabilityPolicy(other.raw,{...profitPolicy(),maximumEvidenceAgeMs:100000})).toThrow('immutable');
});
it('enforces the preregistered loss stop independently of model scores',async()=>{
  registerPolicy();const s=statement();s.revenueCents=0;
  registerProfitSource(db.raw,'mock','paper');await reconcileProfit(db.raw,'e',{sourceId:'mock',readVerifiedStatement:async()=>s});
  expect(profitabilitySnapshot(other.raw,'p').state).toBe('TERMINATED');
  db.raw.exec("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_inference_cost_cents) VALUES('new','p','planned','test',100,100)");
  expect(new ExperimentBudgetGovernor(other.raw).checkInferenceBudget('new',1)).toMatchObject({allowed:false,reason:'Profitability governor: TERMINATED'});
});
it('reconciles attributable net economics once across connections without crediting cash',async()=>{
  const s=statement();registerProfitSource(db.raw,'mock','paper');const adapter={sourceId:'mock',readVerifiedStatement:vi.fn(async()=>s)};
  const results=await Promise.all([reconcileProfit(db.raw,'e',adapter),reconcileProfit(other.raw,'e',adapter)]);
  expect(results.filter(r=>!r.duplicate)).toHaveLength(1);
  expect(reconciledProfitEvidence(other.raw,'o')).toMatchObject([{mode:'paper',netProfitCents:100-10*COST_CATEGORIES.length,reconciled:true}]);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  expect(()=>db.raw.exec('DELETE FROM obolus_profit_statements')).toThrow('immutable');
  expect(()=>registerProfitSource(other.raw,'mock','live')).toThrow('cannot change');
});
it.each(['mode','cost','scope','liability','missing-fee'] as const)('rejects inconsistent %s settlement and pauses the affected opportunity',async failure=>{
  const s=statement();registerProfitSource(db.raw,'mock','paper');
  if(failure==='mode')s.mode='live';
  if(failure==='cost')db.raw.exec("INSERT INTO economic_events(id,event_type,experiment_id,amount_cents,currency) VALUES('expense','cost','e',10000,'USD')");
  if(failure==='scope')s.periodStart--;
  if(failure==='liability')s.liabilitiesComplete=false as true;
  if(failure==='missing-fee')delete (s.costs as Partial<ProfitStatement['costs']>).processing;
  await expect(reconcileProfit(db.raw,'e',{sourceId:'mock',readVerifiedStatement:async()=>s})).rejects.toThrow('paused');
  expect(reconciledProfitEvidence(other.raw,'o')).toEqual([]);expect(profitReconciliationBlocked(other.raw,'o')).toBe(true);
});
it('does not overwrite a settled history when the provider changes the result',async()=>{
  const s=statement();registerProfitSource(db.raw,'mock','paper');const adapter={sourceId:'mock',readVerifiedStatement:async()=>s};
  await reconcileProfit(db.raw,'e',adapter);s.revenueCents++;
  await expect(reconcileProfit(other.raw,'e',adapter)).rejects.toThrow('paused');
  expect(reconciledProfitEvidence(db.raw,'o')[0].revenueCents).toBe(100);
});
it('recovers only after a fresh matching statement and preserves a later new incident',async()=>{
  const s=statement();registerProfitSource(db.raw,'mock','paper');let broken=true;
  const adapter={sourceId:'mock',readVerifiedStatement:async()=>{if(broken)throw new Error('PRIVATE_PROVIDER_ERROR');return s;}};
  await expect(reconcileProfit(db.raw,'e',adapter)).rejects.toThrow('paused');
  broken=false;await reviewProfitRecovery(other.raw,'e',adapter,'fixture');
  expect(profitReconciliationBlocked(db.raw,'o')).toBe(false);
  broken=true;await expect(reconcileProfit(db.raw,'e',adapter)).rejects.toThrow('paused');
  expect(profitReconciliationBlocked(other.raw,'o')).toBe(true);
  expect(JSON.stringify(db.raw.prepare('SELECT * FROM obolus_profit_incidents').all())).not.toContain('PRIVATE_PROVIDER_ERROR');
});
it('preserves legacy history without retroactive statistical promotion',async()=>{
  vi.useFakeTimers();const s=statement();registerProfitSource(db.raw,'mock','paper');
  await reconcileProfit(db.raw,'e',{sourceId:'mock',readVerifiedStatement:async()=>s});
  vi.setSystemTime(Date.now()+1);registerProfitabilityPolicy(db.raw,{...profitPolicy(),opportunityId:'o'});
  expect(profitabilitySnapshot(other.raw,'o')).toMatchObject({historicalSamplesExcluded:1,calibration:{samples:0}});
  expect(reconciledProfitEvidence(db.raw,'o')).toHaveLength(1);
});
it('records immutable alternatives without fabricating unseen counterfactual profit',()=>{
  const candidates=[{experimentId:'e',requestedCents:1,maximumLossCents:1,evidenceQuality:0,liquidityDays:1,opportunityCostCents:0}];
  const limits={budgetCents:1,lossCapacityCents:1,maxPerExperimentCents:1,minEvidenceQuality:0,maxLiquidityDays:2};
  const policy={edition:'founder' as const,commercialFeatures:[],permissions:['experiments' as const],emergencyStop:false};
  const first=recordAllocationComparison(db.raw,'compare',candidates,limits,policy);
  expect(recordAllocationComparison(other.raw,'compare',candidates,limits,policy)).toEqual(first);
  expect(observeAllocationComparison(other.raw,'compare')).toMatchObject({executionAuthorized:false,observations:[{observedOutcome:null,estimatedCounterfactual:null}]});
  expect(()=>recordAllocationComparison(db.raw,'compare',candidates,{...limits,budgetCents:2},policy)).toThrow('Conflicting');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
});
it('allows only explicitly bounded revalidation without resetting the lifetime ceiling',()=>{
  const governor=new ExperimentBudgetGovernor(other.raw);
  expect(governor.checkTotalBudget('e',1).allowed).toBe(false);
  const policy=allowance();registerRevalidationAllowance(db.raw,policy);
  expect(registerRevalidationAllowance(other.raw,policy)).toEqual({duplicate:true});
  expect(governor.checkTotalBudget('e',20).allowed).toBe(true);
  const hold=db.raw.transaction(()=>reserveInferenceCost(db.raw,'fixture','e','mock',15)).immediate();
  expect(governor.checkInferenceBudget('e',6).allowed).toBe(false);
  expect(governor.checkTotalBudget('e',5).allowed).toBe(true);
  settleInferenceCost(other.raw,hold,()=>other.raw.exec("INSERT INTO economic_events(id,event_type,experiment_id,amount_cents,currency) VALUES('cost','cost','e',15,'USD')"));
  expect(revalidationAdmission(db.raw,'e',6)?.allowed).toBe(false);
  expect(()=>registerRevalidationAllowance(other.raw,{...policy,maximumCostCents:100})).toThrow('immutable');
  expect(()=>db.raw.exec('DELETE FROM obolus_revalidation_allowances')).toThrow('immutable');
  expect(isProtectedFile('src/revenue/revalidation.ts')).toBe(true);
});
it('expires using host time and does not waive ordinary opportunity or budget limits',()=>{
  vi.useFakeTimers();const policy=allowance();registerRevalidationAllowance(db.raw,policy);
  db.raw.exec("UPDATE revenue_experiments SET max_budget_cents=1 WHERE id='e'");
  expect(new ExperimentBudgetGovernor(other.raw).checkTotalBudget('e',2).allowed).toBe(false);
  vi.setSystemTime(policy.expiresAt);
  expect(revalidationAdmission(other.raw,'e',0)?.allowed).toBe(false);
  expect(()=>registerRevalidationAllowance(other.raw,{...policy,expiresAt:Date.now()+60000})).toThrow('immutable');
});
it('rejects retroactive allowances after any reservation, including zero cost',()=>{
  db.raw.transaction(()=>reserveInferenceCost(db.raw,'fixture','e','mock',0)).immediate();
  expect(()=>registerRevalidationAllowance(db.raw,allowance())).toThrow('before costs');
  expect(revalidationAdmission(other.raw,'e',0)).toBeNull();
});
