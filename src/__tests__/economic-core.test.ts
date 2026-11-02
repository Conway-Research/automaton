import { beforeEach,afterEach,describe,it,expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "../state/database.js";
import { ProfitLedger, type ProfitEntry } from "../revenue/profit-ledger.js";
import { economicState } from "../revenue/economic-state.js";
import { editionAdmission,type EditionPolicy } from "../revenue/edition-policy.js";
import { ArbitragePaperEngine,ARBITRAGE_COSTS,evaluateArbitrage,type ArbitrageCandidate,type ArbitrageLimits } from "../revenue/arbitrage.js";
import { planCapitalAllocation } from "../revenue/capital-allocation.js";
import { RevenueStore } from "../revenue/store.js";
import { initializeCapitalBudget } from "../revenue/capital-budget.js";
import {calibrateValidationCost,OpportunityProfiles,latestOpportunityProfile} from '../revenue/opportunity-profile.js';

let dir:string,db:ReturnType<typeof createDatabase>,observer:ReturnType<typeof createDatabase>;
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"obolus-core-"));db=createDatabase(path.join(dir,"test.db"));observer=createDatabase(path.join(dir,"test.db"));});
afterEach(()=>{db.close();observer.close();fs.rmSync(dir,{recursive:true});});
const founder:EditionPolicy={edition:"founder",commercialFeatures:[],permissions:["paper_trading","experiments"],emergencyStop:false};
const limits:ArbitrageLimits={capitalCents:5000,liquidityReserveCents:2500,maximumPositionCents:1000,maximumLossCents:100,maximumCumulativeLossCents:200,maxQuoteAgeMs:1000};
const candidate=():ArbitrageCandidate=>({id:"spread-1",category:"cross_exchange",currency:"USD",capitalCents:1000,grossProfitCents:200,
  costs:Object.fromEntries(ARBITRAGE_COSTS.map(key=>[key,1])) as ArbitrageCandidate["costs"],maximumLossCents:100,
  executableLiquidityCents:1000,observedAt:1000,expiresAt:2000,evidence:"paper",legsAvailable:true});
const entry=(id:string,mode:ProfitEntry["mode"],kind:ProfitEntry["kind"],amountCents:number):ProfitEntry=>({id,mode,kind,amountCents,
  category:"experiment",opportunityId:null,experimentId:null,strategyId:"strategy-1",businessId:"business-1",productId:null,occurredAt:"2026-01-01T00:00:00Z"});
describe("economic invariants",()=>{
  it('prefers greater absolute net value over a tiny high-ratio opportunity without relaxing budget or risk',()=>{
    initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:2500,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+100000});
    const store=new RevenueStore(db.raw);
    const opportunityId=store.createOpportunity({goalId:null,name:'Fixture',niche:null,status:'validating',evidenceLevel:'paper',confidence:1,
      probabilitySuccess:1,expectedRevenueCents:30000,expectedCostCents:50,expectedNetValueCents:29950,timeToRevenueDays:1,maxExperimentBudgetCents:100,
      focusRank:null,hypothesis:'test',killCondition:'no demand',nextAction:null});
    const make=(cost:number,revenue:number,hypothesis:string)=>store.createExperiment({opportunityId,goalId:null,taskId:null,status:'planned',hypothesis,channel:null,offer:null,
      maxBudgetCents:100,maxInferenceCostCents:50,maxDurationHours:1,successCriteria:'customer',failureCriteria:'none',stopCondition:'one hour',forecastRevenueCents:revenue,
      forecastCostCents:cost,forecastProbabilitySuccess:1,forecastTimeToRevenueHours:1,actualRevenueCents:0,actualCostCents:0,result:null,lesson:null,startedAt:null,completedAt:null});
    const tiny=make(1,1001,'tiny'),large=make(50,25050,'large');
    const candidate=(experimentId:string,requestedCents:number)=>({experimentId,requestedCents,maximumLossCents:1,evidenceQuality:1,liquidityDays:1,opportunityCostCents:0});
    const report=planCapitalAllocation(db.raw,[candidate(tiny,1),candidate(large,50)],{budgetCents:50,lossCapacityCents:1,maxPerExperimentCents:50,minEvidenceQuality:0.5,maxLiquidityDays:2},founder);
    expect(report.candidates.find(c=>c.experimentId===tiny)!.marginalForecast.netPerCapitalCent).toBeGreaterThan(report.candidates.find(c=>c.experimentId===large)!.marginalForecast.netPerCapitalCent!);
    expect(report.candidates.filter(c=>c.selected).map(c=>c.experimentId)).toEqual([large]);
    expect(report.proposedCents).toBe(50);expect(report.maximumLossCents).toBe(1);expect(report.executionAuthorized).toBe(false);
  });
  it("keeps forecast, paper and unrealized gains out of realized profit and shared capital",()=>{
    const ledger=new ProfitLedger(db.raw);
    ledger.record(entry("revenue","realized","revenue",100));
    ledger.record(entry("expense","realized","expense",140));
    ledger.record(entry("forecast","expected","revenue",10000));
    ledger.record(entry("paper","paper","revenue",20000));
    ledger.record(entry("mark","unrealized","revenue",30000));
    const report=new ProfitLedger(observer.raw).aggregate({dimension:"strategyId"});
    expect(report.groups["strategy-1"].realized).toEqual({revenueCents:100,expensesCents:140,netProfitCents:-40});
    expect(report.groups["strategy-1"].paper.netProfitCents).toBe(20000);
    const state=economicState(observer.raw);
    expect(state.recordedClaims.netProfitCents).toBe(-40);
    expect(state.realizedNetProfitCents).toBeNull();
    expect(state.availableCapitalChfCents).toBeNull();
    expect(state.capitalAdmission.allowed).toBe(false);
  });
  it("retries accounting exactly once across connections and rejects changed settlements",()=>{
    const input=entry("same","realized","expense",10);
    new ProfitLedger(db.raw).record(input);new ProfitLedger(observer.raw).record(input);
    expect(new ProfitLedger(db.raw).aggregate().groups.all.realized.expensesCents).toBe(10);
    expect(()=>new ProfitLedger(observer.raw).record({...input,amountCents:11})).toThrow("idempotency");
  });
  it("distinguishes unlimited product features from permissions and immutable safety",()=>{
    expect(editionAdmission(founder,"paper_trading").allowed).toBe(true);
    for(const edition of ["personal","business"] as const)expect(editionAdmission({...founder,edition},"paper_trading").allowed).toBe(false);
    expect(editionAdmission(founder,"live_trading").allowed).toBe(false);
    expect(editionAdmission({...founder,emergencyStop:true},"paper_trading").allowed).toBe(false);
  });
  it("requires all arbitrage costs, fresh quotes, liquidity and bounded loss irrespective of gross spread",()=>{
    expect(evaluateArbitrage(candidate(),limits,1100).expectedNetCents).toBe(200-ARBITRAGE_COSTS.length);
    expect(evaluateArbitrage({...candidate(),costs:{...candidate().costs,failedLeg:null}},limits,1100).eligibleForPaper).toBe(false);
    expect(evaluateArbitrage({...candidate(),grossProfitCents:10000000,maximumLossCents:101},limits,1100).eligibleForPaper).toBe(false);
    expect(evaluateArbitrage(candidate(),limits,2000).eligibleForPaper).toBe(false);
    expect(evaluateArbitrage({...candidate(),executableLiquidityCents:999},limits,1100).eligibleForPaper).toBe(false);
  });
  it("persists failed-leg paper losses, halts unexpected loss and never books real profit",()=>{
    const first=new ArbitragePaperEngine(db.raw),second=new ArbitragePaperEngine(observer.raw);first.initialize(limits);second.initialize(limits);
    const input={candidate:candidate(),now:1100,actualGrossCents:0,actualCostsCents:10,failedLegLossCents:150};
    const result=first.executePaper(input,founder);
    expect(result.paperProfitCents).toBe(-160);expect(result.realizedProfitCents).toBe(0);
    expect(second.executePaper(input,founder)).toEqual(result);
    expect(()=>second.executePaper({...input,candidate:{...candidate(),id:"next"}},founder)).toThrow("not active");
    expect(economicState(db.raw).recordedClaims.netProfitCents).toBe(0);
    expect(()=>second.initialize({...limits,capitalCents:10000})).toThrow("cannot be reset");
  });
  it("rejects high-scoring allocation beyond hard budgets or risk and can preserve capital",()=>{
    initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:2500,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+100000});
    const store=new RevenueStore(db.raw);
    const opportunityId=store.createOpportunity({goalId:null,name:"test",niche:null,status:"validating",evidenceLevel:"paper",confidence:1,
      probabilitySuccess:1,expectedRevenueCents:100000,expectedCostCents:50,expectedNetValueCents:99950,timeToRevenueDays:1,maxExperimentBudgetCents:100,
      focusRank:null,hypothesis:"test",killCondition:"no demand",nextAction:null});
    const experimentId=store.createExperiment({opportunityId,goalId:null,taskId:null,status:"planned",hypothesis:"demand",channel:null,offer:null,
      maxBudgetCents:100,maxInferenceCostCents:50,maxDurationHours:1,successCriteria:"one customer",failureCriteria:"none",stopCondition:"one hour",
      forecastRevenueCents:100000,forecastCostCents:50,forecastProbabilitySuccess:1,forecastTimeToRevenueHours:1,actualRevenueCents:0,actualCostCents:0,
      result:null,lesson:null,startedAt:null,completedAt:null});
    const c={experimentId,requestedCents:50,maximumLossCents:50,evidenceQuality:1,liquidityDays:1,opportunityCostCents:0};
    const constraints={budgetCents:49,lossCapacityCents:49,maxPerExperimentCents:100,minEvidenceQuality:0.5,maxLiquidityDays:2};
    const denied=planCapitalAllocation(db.raw,[c],constraints,founder);
    expect(denied.decision).toBe("preserve_capital");expect(denied.candidates[0].reasons).toEqual(expect.arrayContaining(["budget_limit","risk_limit"]));
    expect(planCapitalAllocation(db.raw,[c],{...constraints,budgetCents:100,lossCapacityCents:100},founder).proposedCents).toBe(50);
    const secondId=store.createExperiment({...store.getExperiment(experimentId)!});
    const peers=[c,{...c,experimentId:secondId}];
    expect(planCapitalAllocation(db.raw,peers,{...constraints,budgetCents:100,lossCapacityCents:100},founder).proposedCents).toBe(100);
    observer.raw.prepare('UPDATE revenue_experiments SET forecast_probability_success=150 WHERE id=?').run(secondId);
    expect(()=>planCapitalAllocation(db.raw,[{...c,experimentId:secondId,opportunityCostCents:1}],{...constraints,budgetCents:100,lossCapacityCents:100},founder)).toThrow('Invalid economic probability');
    observer.raw.prepare('UPDATE revenue_experiments SET forecast_probability_success=1 WHERE id=?').run(secondId);
    const profiles=new OpportunityProfiles(db.raw);
    profiles.record({opportunityId,revisionId:'profile-1',capitalRequiredCents:100,startupCostCents:20,ongoingCostCents:10,
      validationCostCents:60,timeToValidationHours:1,timeToRevenueHours:24,maximumLossCents:60,opportunityCostCents:0,
      liquidityDays:1,scalability:0.5,repeatability:0.5,automationPotential:0.5,reversibility:0.5,evidenceQuality:0.7});
    expect(latestOpportunityProfile(observer.raw,opportunityId)?.validationCostCents).toBe(60);
    // Snapshot-local reuse must never hide a revision written by another connection.
    expect(planCapitalAllocation(observer.raw,peers,{...constraints,budgetCents:100,lossCapacityCents:100},founder).candidates.every(candidate=>candidate.reasons.includes('profile_underfunded_or_risk_understated'))).toBe(true);
    expect(planCapitalAllocation(db.raw,[c],{...constraints,budgetCents:100,lossCapacityCents:100},founder).candidates[0].reasons)
      .toContain('profile_underfunded_or_risk_understated');
    store.transitionExperimentStatus(experimentId,"stopped","No demand","Stop early");
    expect(planCapitalAllocation(db.raw,[c],{...constraints,budgetCents:100,lossCapacityCents:100},founder).decision).toBe("preserve_capital");
  });
  it('learns conservative validation costs without turning revenue claims into success probabilities',()=>{
    const history=[100,200,300].map(actualCostCents=>({forecastCostCents:100,actualCostCents,resolved:true}));
    expect(calibrateValidationCost(50,history)).toMatchObject({calibratedCents:150,samples:3,verifiedProbability:null});
    expect(calibrateValidationCost(50,history.map(row=>({...row,resolved:false})))).toMatchObject({calibratedCents:50,samples:0});
  });
});


describe('zero-forecast cash cost learning',()=>{
  const history=[20,40,80].map(actualCostCents=>({forecastCostCents:0,actualCostCents,resolved:true}));
  it('blocks an underfunded new experiment using persisted completed zero-forecast cash costs',()=>{
    initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:2500,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+100000});
    const store=new RevenueStore(db.raw);
    const opportunityId=store.createOpportunity({goalId:null,name:'Synthetic cost-learning fixture',niche:null,status:'validating',evidenceLevel:'paper',confidence:1,
      probabilitySuccess:1,expectedRevenueCents:1000,expectedCostCents:0,expectedNetValueCents:1000,timeToRevenueDays:1,maxExperimentBudgetCents:100,
      focusRank:null,hypothesis:'bounded validation',killCondition:'no demand',nextAction:null});
    const make=()=>store.createExperiment({opportunityId,goalId:null,taskId:null,status:'planned',hypothesis:'same bounded work',channel:null,offer:null,
      maxBudgetCents:100,maxInferenceCostCents:50,maxDurationHours:1,successCriteria:'customer',failureCriteria:'none',stopCondition:'one hour',
      forecastRevenueCents:1000,forecastCostCents:0,forecastProbabilitySuccess:1,forecastTimeToRevenueHours:1,actualRevenueCents:0,actualCostCents:0,
      result:null,lesson:null,startedAt:null,completedAt:null});
    for(const row of history){
      const experimentId=make();store.transitionExperimentStatus(experimentId,'running');
      store.addEconomicEvent({opportunityId,experimentId,goalId:null,taskId:null,eventType:'cost',category:'compute',amountCents:row.actualCostCents,
        currency:'USD',channel:null,offer:null,customerRef:null,metadata:{synthetic:true},occurredAt:new Date().toISOString()});
      store.transitionExperimentStatus(experimentId,'completed','Synthetic completion','Free forecast missed cash costs');
      expect(store.getForecastVsActual(experimentId)?.forecastBasis).toBe('start-snapshot');
    }
    const experimentId=make();
    const result=planCapitalAllocation(observer.raw,[{experimentId,requestedCents:50,maximumLossCents:100,evidenceQuality:1,liquidityDays:1,opportunityCostCents:0}],
      {budgetCents:100,lossCapacityCents:100,maxPerExperimentCents:100,minEvidenceQuality:0.5,maxLiquidityDays:2},founder);
    expect(result.candidates[0].reasons).toContain('calibrated_cost_exceeds_request');
    expect(result.candidates[0].costCalibration).toMatchObject({baseCents:0,calibratedCents:80,shortfallCents:30,
      historyRows:3,resolvedRows:3,zeroForecastSamples:3,verifiedProbability:null});
    expect(result.proposedCents).toBe(0);
    expect(store.getExperiment(experimentId)?.status).toBe('planned');
    // Same opportunity, different declared delivery scope: never reuse the
    // previous candidate's cached cohort or present those costs as comparable.
    const differentId=make();store.updateExperiment(differentId,{hypothesis:'different delivery scope'});
    const proposals=[experimentId,differentId].map(id=>({experimentId:id,requestedCents:50,maximumLossCents:100,evidenceQuality:1,liquidityDays:1,opportunityCostCents:0}));
    const limits={budgetCents:100,lossCapacityCents:100,maxPerExperimentCents:100,minEvidenceQuality:0.5,maxLiquidityDays:2};
    const compared=planCapitalAllocation(observer.raw,proposals,limits,founder);
    const matched=compared.candidates.find(c=>c.experimentId===experimentId)!;
    const unmatched=compared.candidates.find(c=>c.experimentId===differentId)!;
    expect(matched.costCalibration).toMatchObject({calibratedCents:80,historyRows:3,excludedScopeRows:0});
    expect(unmatched.costCalibration).toMatchObject({calibratedCents:0,historyRows:0,excludedScopeRows:3,verifiedProbability:null});
    expect(unmatched.costCalibration?.scopeDigest).not.toBe(matched.costCalibration?.scopeDigest);
    expect(planCapitalAllocation(observer.raw,[...proposals].reverse(),limits,founder)).toEqual(compared);
    // Editing terminal display fields cannot rewrite the immutable learning scope.
    db.raw.prepare("UPDATE revenue_experiments SET hypothesis='different delivery scope' WHERE opportunity_id=? AND status='completed'").run(opportunityId);
    expect(planCapitalAllocation(observer.raw,proposals,limits,founder)).toEqual(compared);
    store.updateExperiment(differentId,{successCriteria:null});
    const unknown=planCapitalAllocation(observer.raw,[proposals[1]],limits,founder).candidates[0];
    expect(unknown.costCalibration).toMatchObject({scopeDigest:null,historyRows:0,excludedScopeRows:3});
    expect(unknown.reasons).toContain('missing_validation_criteria');
  });
  it('does not invent calibration evidence for a missing experiment',()=>{
    const result=planCapitalAllocation(db.raw,[{experimentId:'missing',requestedCents:50,maximumLossCents:50,evidenceQuality:1,liquidityDays:1,opportunityCostCents:0}],
      {budgetCents:100,lossCapacityCents:100,maxPerExperimentCents:100,minEvidenceQuality:0.5,maxLiquidityDays:2},founder);
    expect(result.candidates[0].costCalibration).toBeNull();
    expect(result.candidates[0].reasons).toContain('experiment_unavailable');
    expect(result.proposedCents).toBe(0);
  });
  it('does not repeatedly treat observed cash-consuming work as free',()=>{
    expect(calibrateValidationCost(0,history)).toMatchObject({calibratedCents:80,zeroForecastSamples:3,observedFreeCostFloorCents:80,verifiedProbability:null});
    expect(calibrateValidationCost(0,[...history].reverse())).toEqual(calibrateValidationCost(0,history));
  });
  it('does not infer a floor from unresolved outcomes or insufficient samples',()=>{
    expect(calibrateValidationCost(0,history.slice(0,2)).calibratedCents).toBe(0);
    expect(calibrateValidationCost(0,history.map(row=>({...row,resolved:false}))).calibratedCents).toBe(0);
  });
  it('preserves paid-work ratio scaling and does not monetize effort',()=>{
    expect(calibrateValidationCost(50,history).calibratedCents).toBe(50);
    expect(calibrateValidationCost(0,history.map(row=>({...row,actualCostCents:0}))).calibratedCents).toBe(0);
  });
});
