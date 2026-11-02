import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../state/database.js";
import { RevenueStore, type RevenueOpportunity, type RevenueExperiment } from "../revenue/store.js";
import { economicMissionAgenda, selectMissionActions, type MissionAction } from "../revenue/mission.js";
import { ExperimentBudgetGovernor } from "../revenue/budget-governor.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { InferenceRouter } from "../inference/router.js";
import { ModelRegistry } from "../inference/registry.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import { createWorkerInferenceBridge } from "../agent/worker-inference-bridge.js";
import {stopExhaustedResearchExperiments} from '../revenue/research-handoff.js';
import {reserveInferenceCost,pendingInferenceCost,settleInferenceCost} from '../inference/reservations.js';

let db: ReturnType<typeof createDatabase>;
let store: RevenueStore;
let governor: ExperimentBudgetGovernor;

beforeEach(() => {
  db = createDatabase(":memory:");
  store = new RevenueStore(db.raw);
  governor = new ExperimentBudgetGovernor(db.raw);
});
afterEach(() => { vi.useRealTimers(); db.close(); });

function opportunity(overrides: Partial<RevenueOpportunity> = {}) {
  return store.createOpportunity({
    goalId: null, name: "Validation", niche: null, status: "validating",
    evidenceLevel: null, confidence: null, probabilitySuccess: 0.5,
    expectedRevenueCents: 1000, expectedCostCents: 100, expectedNetValueCents: 900,
    timeToRevenueDays: 7, maxExperimentBudgetCents: 100, focusRank: null,
    hypothesis: null, killCondition: null, nextAction: null, ...overrides,
  });
}
function experiment(opportunityId = opportunity(), overrides: Partial<RevenueExperiment> = {}) {
  return store.createExperiment({
    opportunityId, goalId: null, taskId: null, status: "running", hypothesis: "Demand",
    channel: null, offer: null, maxBudgetCents: 100, maxInferenceCostCents: 50,
    maxDurationHours: 24, successCriteria: null, failureCriteria: null, stopCondition: null,
    forecastRevenueCents: 1000, forecastCostCents: 100, forecastProbabilitySuccess: 0.5,
    forecastTimeToRevenueHours: 24, actualRevenueCents: 0, actualCostCents: 0,
    result: null, lesson: null, startedAt: new Date().toISOString(), completedAt: null,
    ...overrides,
  });
}
function router() {
  const registry = new ModelRegistry(db.raw);
  registry.initialize();
  return new InferenceRouter(db.raw, registry, new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG));
}

describe("revenue prioritization", () => {
  it.each(['economic','inference'] as const)('rejects malformed %s amounts even when their sum looks valid',kind=>{
    const parent=opportunity(),id=experiment(parent);
    if(kind==='economic'){
      for(let i=0;i<2;i++)db.raw.prepare("INSERT INTO economic_events(id,opportunity_id,experiment_id,event_type,amount_cents,currency) VALUES(?,?,?,'cost',?,'USD')").run(`event-${i}`,parent,id,0.5);
    }else{
      for(let i=0;i<2;i++)db.raw.prepare("INSERT INTO inference_costs(id,session_id,experiment_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES(?,'fixture',?,'mock','mock',0.5,1,'normal','agent_turn')").run(`cost-${i}`,id);
    }
    expect(()=>store.getOpportunityEconomics(parent)).toThrow('Unsafe accounting totals');
    expect(()=>store.getForecastVsActual(id)).toThrow('Unsafe accounting totals');
  });
  it('withholds unsafe opportunity aggregates and reports zero counts for empty ledgers',()=>{
    const parent=opportunity(),id=experiment(parent);
    expect(store.getOpportunityEconomics(parent)).toMatchObject({revenueCents:0,costCents:0,paymentCount:0,commitmentCount:0,qualifiedLeadCount:0,leadCount:0});
    for(let i=0;i<2;i++)store.addEconomicEvent({opportunityId:parent,experimentId:id,goalId:null,taskId:null,eventType:'payment',category:null,
      amountCents:Number.MAX_SAFE_INTEGER,currency:'USD',channel:null,offer:null,customerRef:null,metadata:{},occurredAt:new Date().toISOString()});
    expect(()=>store.getOpportunityEconomics(parent)).toThrow('Unsafe accounting totals');
  });
  it('distinguishes success-case and weighted forecast errors using the immutable start probability',()=>{
    const parent=opportunity(),id=experiment(parent,{forecastProbabilitySuccess:0.2});
    store.addEconomicEvent({opportunityId:parent,experimentId:id,goalId:null,taskId:null,eventType:'payment',category:null,
      amountCents:300,currency:'USD',channel:null,offer:null,customerRef:null,metadata:{},occurredAt:new Date().toISOString()});
    store.updateExperiment(id,{forecastProbabilitySuccess:0.9,forecastRevenueCents:9000});
    expect(store.getForecastVsActual(id)).toMatchObject({forecastBasis:'start-snapshot',forecastProbabilitySuccess:0.2,
      forecastNetCents:900,expectedRevenueCents:200,expectedNetCents:100,actualNetCents:300,netErrorCents:-600,expectedNetErrorCents:200});
    store.transitionExperimentStatus(id,'stopped','Fixture','Needs further validation');
    expect(store.getLearningContext().lessons[0]).toMatchObject({recordedNetBelowForecast:true,recordedNetBelowExpectation:false,verification:'unverified-ledger-claims'});
  });
  it.each([null,0,1,25,100])('preserves unknown and boundary probability semantics: %s',probability=>{
    const id=experiment(undefined,{forecastRevenueCents:101,forecastCostCents:100,forecastProbabilitySuccess:probability});
    const p=probability===null?null:probability>1?probability/100:probability;
    store.updateExperiment(id,{forecastProbabilitySuccess:0.5});
    expect(store.getForecastVsActual(id)).toMatchObject({forecastProbabilitySuccess:p,expectedRevenueCents:p===null?null:Math.floor(101*p),
      expectedNetCents:p===null?null:Math.floor(101*p)-100});
  });
  it('withholds unsafe aggregated money totals instead of feeding rounded profit into learning',()=>{
    const parent=opportunity(),id=experiment(parent);
    for(let i=0;i<2;i++)store.addEconomicEvent({opportunityId:parent,experimentId:id,goalId:null,taskId:null,eventType:'payment',category:null,
      amountCents:Number.MAX_SAFE_INTEGER,currency:'USD',channel:null,offer:null,customerRef:null,metadata:{},occurredAt:new Date().toISOString()});
    expect(()=>store.getForecastVsActual(id)).toThrow('Unsafe accounting totals');
    store.transitionExperimentStatus(id,'stopped','Fixture','Reconcile history');
    expect(store.getLearningContext().lessons[0]).toMatchObject({accounting:null,recordedNetBelowExpectation:null,blockers:expect.arrayContaining(['accounting_requires_reconciliation'])});
  });
  it.each(['opportunity','experiment'] as const)('blocks new provider work for corrupt stored %s economics without releasing existing reservations',async target=>{
    const parent=opportunity(),id=experiment(parent);
    const reservation=db.raw.transaction(()=>reserveInferenceCost(db.raw,'held',id,'mock',7)).immediate();
    if(target==='opportunity')db.raw.prepare('UPDATE revenue_opportunities SET expected_cost_cents=-1 WHERE id=?').run(parent);
    else db.raw.prepare('UPDATE revenue_experiments SET forecast_probability_success=101 WHERE id=?').run(id);
    const before=store.getExperiment(id);
    for(const check of [governor.checkInferenceBudget(id,0),governor.checkTotalBudget(id,0)]) {
      expect(check).toMatchObject({allowed:false,remainingCents:0,reason:expect.stringContaining('Invalid stored')});
    }
    const provider=vi.fn();
    const result=await router().route({messages:[{role:'user',content:'validate'}],tier:'low_compute',taskType:'agent_turn',sessionId:'new',experimentId:id},provider);
    expect(result.finishReason).toBe('budget_exceeded');
    expect(provider).not.toHaveBeenCalled();
    expect(pendingInferenceCost(db.raw,{experimentId:id})).toBe(7);
    expect(store.getExperiment(id)).toEqual(before);
    expect(governor.checkTotalBudget(experiment(),1).allowed).toBe(true);
    // Failed accounting keeps the liability; corruption cannot prevent later settlement.
    expect(()=>settleInferenceCost(db.raw,reservation,()=>{throw Error('fixture accounting failure');})).toThrow('fixture accounting failure');
    expect(pendingInferenceCost(db.raw,{experimentId:id})).toBe(7);
    const record=vi.fn();
    settleInferenceCost(db.raw,reservation,record);
    expect(record).toHaveBeenCalledOnce();
    expect(pendingInferenceCost(db.raw,{experimentId:id})).toBe(0);
  });
  it.each(['planned','running'] as const)('does not recommend continuation under corrupt parent economics for %s experiments',status=>{
    const parent=opportunity(),child=experiment(parent,{status,successCriteria:'One buyer',failureCriteria:'No demand',stopCondition:'Budget or duration'});
    const valid=experiment(undefined,{successCriteria:'One buyer',failureCriteria:'No demand',stopCondition:'Budget or duration'});
    db.raw.prepare('UPDATE revenue_opportunities SET expected_cost_cents=-1 WHERE id=?').run(parent);
    const before=store.getExperiment(child);
    const agenda=economicMissionAgenda(db.raw);
    expect(agenda.actions).toContainEqual(expect.objectContaining({experimentId:child,action:'stop_or_redesign',score:null,reason:expect.stringContaining('Invalid parent opportunity economics')}));
    expect(agenda.actions.some(a=>a.experimentId===child&&a.action==='continue_experiment')).toBe(false);
    expect(agenda.actions).toContainEqual(expect.objectContaining({experimentId:valid,action:'continue_experiment'}));
    expect(store.getExperiment(child)).toEqual(before);
  });
  it('does not let a terminal task hide invalid parent economics',()=>{
    db.raw.exec("INSERT INTO goals (id,title,description,status,created_at) VALUES ('parent-check-goal','Fixture','fixture','active',datetime('now')); INSERT INTO task_graph (id,goal_id,title,description,status,created_at) VALUES ('parent-check-task','parent-check-goal','Fixture','fixture','completed',datetime('now'))");
    const parent=opportunity(),child=experiment(parent,{taskId:'parent-check-task',successCriteria:'One buyer',failureCriteria:'No demand',stopCondition:'Budget or duration'});
    db.raw.prepare('UPDATE revenue_opportunities SET expected_cost_cents=-1 WHERE id=?').run(parent);
    expect(economicMissionAgenda(db.raw).actions.find(action=>action.experimentId===child)).toMatchObject({action:'stop_or_redesign',reason:expect.stringContaining('Invalid parent opportunity economics')});
    expect(store.getExperiment(child)?.status).toBe('running');
  });
  it.each(['active','discovered'] as const)('requires reconciliation of invalid stored opportunity inputs instead of proposing normal work: %s',status=>{
    const invalid=opportunity({status}),valid=opportunity({status,name:'Valid alternative'});
    db.raw.prepare('UPDATE revenue_opportunities SET expected_cost_cents=-1 WHERE id=?').run(invalid);
    const before=db.raw.prepare('SELECT * FROM revenue_opportunities WHERE id=?').get(invalid);
    const actions=economicMissionAgenda(db.raw).actions;
    expect(actions).toContainEqual(expect.objectContaining({opportunityId:invalid,action:'review',score:null,reason:expect.stringContaining('Invalid historical opportunity economics')}));
    expect(actions.some(a=>a.opportunityId===invalid&&['screen','design_experiment'].includes(a.action))).toBe(false);
    expect(actions).toContainEqual(expect.objectContaining({opportunityId:valid,action:status==='active'?'design_experiment':'screen'}));
    expect(db.raw.prepare('SELECT * FROM revenue_opportunities WHERE id=?').get(invalid)).toEqual(before);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
  });
  it('stops exhausted mapped research, preserves holds and leaves unresolved forecasts out of decisions',()=>{
    const expired=experiment(undefined,{startedAt:new Date(Date.now()-25*3600000).toISOString()});
    const exhausted=experiment();
    const reserved=experiment();
    const legacy=experiment(undefined,{startedAt:new Date(Date.now()-25*3600000).toISOString()});
    db.raw.exec('CREATE TABLE obolus_research_experiments(experiment_id TEXT PRIMARY KEY)');
    for(const id of [expired,exhausted,reserved])db.raw.prepare('INSERT INTO obolus_research_experiments VALUES(?)').run(id);
    for(const id of [expired,reserved])db.raw.transaction(()=>reserveInferenceCost(db.raw,'fixture',id,'mock',100)).immediate();
    store.addEconomicEvent({opportunityId:store.getExperiment(exhausted)!.opportunityId,experimentId:exhausted,goalId:null,taskId:null,
      eventType:'cost',category:null,amountCents:100,currency:'USD',channel:null,offer:null,customerRef:null,metadata:{},occurredAt:new Date().toISOString()});
    const before=store.getForecastVsActual(exhausted);
    expect(stopExhaustedResearchExperiments(db.raw).sort()).toEqual([expired,exhausted].sort());
    expect(store.getExperiment(expired)).toMatchObject({status:'stopped',lesson:null});
    expect(store.getExperiment(exhausted)).toMatchObject({status:'stopped',lesson:null});
    expect(store.getExperiment(reserved)?.status).toBe('running');
    expect(store.getExperiment(legacy)?.status).toBe('running');
    expect(pendingInferenceCost(db.raw)).toBe(200);
    expect(store.getForecastVsActual(exhausted)).toEqual(before);
    expect(stopExhaustedResearchExperiments(db.raw)).toEqual([]);
  });

  it('rolls back all automatic stops when any experiment cannot persist its transition',()=>{
    const first=experiment(undefined,{startedAt:new Date(Date.now()-25*3600000).toISOString()});
    const second=experiment(undefined,{startedAt:new Date(Date.now()-25*3600000).toISOString()});
    db.raw.exec('CREATE TABLE obolus_research_experiments(experiment_id TEXT PRIMARY KEY)');
    for(const id of [first,second])db.raw.prepare('INSERT INTO obolus_research_experiments VALUES(?)').run(id);
    db.raw.exec("CREATE TRIGGER fixture_stop_failure BEFORE UPDATE ON revenue_experiments WHEN NEW.status='stopped' AND (SELECT COUNT(*) FROM revenue_experiments WHERE status='stopped')>0 BEGIN SELECT RAISE(ABORT,'fixture persistence failure'); END");
    expect(()=>stopExhaustedResearchExperiments(db.raw)).toThrow('fixture persistence failure');
    expect(store.getExperiment(first)?.status).toBe('running');
    expect(store.getExperiment(second)?.status).toBe('running');
  });

  it('keeps uncertain zero-cost operations visible in review and learning',()=>{
    const id=experiment();
    db.raw.exec('CREATE TABLE obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,actual_cost INTEGER)');
    db.raw.prepare('INSERT INTO obolus_reserved_operations VALUES(?,?,?,NULL)').run('fixture',JSON.stringify({experimentId:id,maxCostUsdCents:0}),'pending');
    expect(store.getExperimentReview(id)).toMatchObject({unresolvedCostCents:0,blockers:expect.arrayContaining(['unresolved_operation'])});
    store.transitionExperimentStatus(id,'failed','Uncertain operation','Review before new attempt');
    expect(store.getLearningContext().lessons[0].blockers).toContain('unresolved_operation');
    expect(()=>store.transitionExperimentStatus(id,'completed')).toThrow('Invalid experiment status transition');
    db.raw.exec("UPDATE obolus_reserved_operations SET status='settled',actual_cost=0");
    expect(store.getExperimentReview(id)?.blockers).not.toContain('unresolved_operation');
  });
  it('surfaces a budget stop outside the top 100 economic rankings',()=>{
    const parent=opportunity();
    const criteria={successCriteria:'buyer',failureCriteria:'no buyer',stopCondition:'budget or duration'};
    for(let i=0;i<100;i++)experiment(parent,{...criteria,forecastRevenueCents:100000});
    const low=experiment(parent,{...criteria,maxBudgetCents:0,forecastRevenueCents:1,forecastCostCents:100});
    expect(store.listPriorityExperiments(undefined,100).some(e=>e.id===low)).toBe(false);
    const agenda=economicMissionAgenda(db.raw);
    expect(agenda.actions[0]).toMatchObject({experimentId:low,action:'stop_or_redesign'});
    expect(agenda.actions.length).toBeLessThanOrEqual(20);
  });
  it("keeps budget stops visible after task completion and blocks missing task attribution", () => {
    db.raw.exec("INSERT INTO goals (id,title,description,status,created_at) VALUES ('g','Goal','fixture','active',datetime('now'))");
    db.raw.exec("INSERT INTO task_graph (id,goal_id,title,description,status,created_at) VALUES ('done','g','Task','fixture','completed',datetime('now'))");
    const exp = experiment(undefined, {taskId:'done',successCriteria:'buyer',failureCriteria:'no buyer',stopCondition:'budget or duration'});
    expect(economicMissionAgenda(db.raw).actions.find(a=>a.experimentId===exp)?.action).toBe('review');
    store.updateExperiment(exp,{maxBudgetCents:0});
    expect(economicMissionAgenda(db.raw).actions.find(a=>a.experimentId===exp)).toMatchObject({action:'stop_or_redesign',reason:expect.stringContaining('Budget or duration exhausted')});
    store.updateExperiment(exp,{maxBudgetCents:100});
    // Simulate damaged/imported history; ordinary FK-protected writes reject this.
    db.raw.pragma('foreign_keys = OFF');
    db.raw.prepare("DELETE FROM task_graph WHERE id='done'").run();
    db.raw.pragma('foreign_keys = ON');
    expect(economicMissionAgenda(db.raw).actions.find(a=>a.experimentId===exp)).toMatchObject({action:'stop_or_redesign',reason:expect.stringContaining('task is missing')});
    expect(store.getExperiment(exp)?.status).toBe('running');
  });
  it('captures forecasts and criteria atomically at start and preserves them after edits',()=>{
    const id=opportunity();const exp=experiment(id,{status:'planned',startedAt:null,successCriteria:'original success'});
    expect(store.getExperimentBaseline(exp)).toBeNull();
    store.updateExperiment(exp,{forecastRevenueCents:2000});
    store.transitionExperimentStatus(exp,'running');
    store.updateExperiment(exp,{forecastRevenueCents:9000,forecastCostCents:0,successCriteria:'edited success'});
    expect(new RevenueStore(db.raw).getForecastVsActual(exp)).toMatchObject({forecastBasis:'start-snapshot',forecastRevenueCents:2000,forecastCostCents:100});
    expect(store.getExperimentReview(exp)?.originalCriteria?.success).toBe('original success');
    expect(()=>db.raw.prepare('UPDATE revenue_experiment_baselines SET snapshot=? WHERE experiment_id=?').run('{}',exp)).toThrow('immutable');
    expect(()=>db.raw.prepare('DELETE FROM revenue_experiment_baselines WHERE experiment_id=?').run(exp)).toThrow('immutable');
  });
  it('captures directly running experiments but never invents a forecast for imported terminal history',()=>{
    const exp=experiment();expect(store.getForecastVsActual(exp)?.forecastBasis).toBe('start-snapshot');
    const historical=experiment(undefined,{status:'completed'});expect(store.getExperimentBaseline(historical)).toBeNull();
    expect(store.getForecastVsActual(historical)?.forecastBasis).toBe('legacy-current-values');
  });
  it('rolls back start when persisting its baseline fails',()=>{
    const exp=experiment(undefined,{status:'planned',startedAt:null});
    db.raw.exec("CREATE TRIGGER baseline_failure BEFORE INSERT ON revenue_experiment_baselines BEGIN SELECT RAISE(ABORT,'fixture'); END");
    expect(()=>store.transitionExperimentStatus(exp,'running')).toThrow('fixture');
    expect(store.getExperiment(exp)?.status).toBe('planned');expect(store.getExperimentBaseline(exp)).toBeNull();
  });
  it.each([-1,NaN,Infinity,0.5,Number.MAX_SAFE_INTEGER+1])('rejects invalid economic cents %s without changing valid records',value=>{
    expect(()=>opportunity({expectedCostCents:value})).toThrow('economic');
    const id=opportunity();const exp=experiment(id);
    expect(()=>store.updateOpportunity(id,{expectedRevenueCents:value})).toThrow('economic');
    expect(()=>store.updateExperiment(exp,{forecastCostCents:value})).toThrow('economic');
    expect(store.getOpportunity(id)?.expectedRevenueCents).toBe(1000);
    expect(store.getExperiment(exp)?.forecastCostCents).toBe(100);
  });
  it('rejects invalid probabilities and horizons and deprioritizes malformed legacy rows',()=>{
    expect(()=>opportunity({probabilitySuccess:101})).toThrow('probability');
    expect(()=>opportunity({timeToRevenueDays:Infinity})).toThrow('horizon');
    const id=opportunity();const exp=experiment(id);
    expect(()=>experiment(id,{forecastProbabilitySuccess:-0.1})).toThrow('probability');
    const valid=store.getOpportunity(id)!;
    expect(store.getOpportunityPriorityScore({...valid,expectedCostCents:-10000})).toBe(Number.MIN_SAFE_INTEGER);
    expect(store.getExperimentPriorityScore({...store.getExperiment(exp)!,forecastRevenueCents:Infinity})).toBe(Number.MIN_SAFE_INTEGER);
    expect(store.getOpportunityPriorityScore({...valid,expectedNetValueCents:-100})).toBe(store.getOpportunityPriorityScore(valid));
    store.updateExperiment(exp,{successCriteria:'one buyer',failureCriteria:'no buyers',stopCondition:'24 hours'});
    db.raw.prepare('UPDATE revenue_experiments SET forecast_cost_cents=-100 WHERE id=?').run(exp);
    expect(economicMissionAgenda(db.raw).actions).toContainEqual(expect.objectContaining({experimentId:exp,action:'stop_or_redesign',reason:expect.stringContaining('Invalid historical')}));
  });
  it("keeps urgent stops, execution and alternatives visible beside a review backlog", () => {
    for (let i=0;i<5;i++) experiment(opportunity(),{status:"completed"});
    const stopped = experiment(opportunity(),{maxBudgetCents:0});
    const live = experiment(opportunity(),{successCriteria:"3 qualified responses",failureCriteria:"0 responses",stopCondition:"24h or budget"});
    const candidate = opportunity({status:"discovered",name:"New alternative"});
    const next = economicMissionAgenda(db.raw).actions.slice(0,4);
    expect(next.map(a=>a.action)).toEqual(["stop_or_redesign","continue_experiment","review","screen"]);
    expect(next[0].experimentId).toBe(stopped);
    expect(next[1].experimentId).toBe(live);
    expect(next[3].opportunityId).toBe(candidate);
  });
  it("bounds agenda selection without comparing incompatible score units or duplicating actions", () => {
    const actions: MissionAction[] = ["review","screen","continue_experiment"].map((a,i)=>({action:a as MissionAction["action"],opportunityId:String(i),experimentId:null,reason:"test",score:i}));
    expect(selectMissionActions(actions,0)).toEqual([]);
    expect(selectMissionActions(actions,2).map(a=>a.action)).toEqual(["continue_experiment","review"]);
    expect(new Set(selectMissionActions(actions))).toHaveProperty("size",3);
    expect(()=>selectMissionActions(actions,NaN)).toThrow();
  });
  it("continues the open mission after completion without a fixed discovery topic", () => {
    opportunity({status:"completed", name:"Unanticipated specialist service"});
    expect(economicMissionAgenda(db.raw).actions[0].action).toBe("discover");
  });
  it("surfaces discovered opportunities and does not authorize them", () => {
    const id = opportunity({status:"discovered", name:"Museum archive digitization"});
    const agenda = economicMissionAgenda(db.raw);
    expect(agenda.actions[0]).toMatchObject({action:"screen",opportunityId:id});
    expect(store.getOpportunity(id)?.status).toBe("discovered");
    expect(agenda.authorization).toContain("No additional permissions");
  });
  it("requires post-experiment lessons before designing the next experiment", () => {
    const id = opportunity();
    const exp = experiment(id, {status:"failed"});
    expect(economicMissionAgenda(db.raw).actions[0]).toMatchObject({action:"review",experimentId:exp});
    store.updateExperiment(exp,{lesson:"No reachable buyers; test a different acquisition channel"});
    expect(economicMissionAgenda(db.raw).actions[0]).toMatchObject({action:"design_experiment",opportunityId:id});
  });
  it("retains lessons from killed opportunities without reviving their execution", () => {
    const id=opportunity({status:"kill"});
    const exp=experiment(id,{status:"failed",result:"No reachable buyers"});
    expect(economicMissionAgenda(db.raw).actions).toContainEqual(expect.objectContaining({action:"review",experimentId:exp}));
    store.updateExperiment(exp,{lesson:"No reachable buyers; do not repeat without new evidence"});
    expect(economicMissionAgenda(db.raw).actions).toEqual([expect.objectContaining({action:"discover"})]);
    expect(store.getOpportunity(id)?.status).toBe("kill");
    expect(economicMissionAgenda(db.raw).learning.lessons[0]).toMatchObject({experimentId:exp,lesson:"No reachable buyers; do not repeat without new evidence",verification:"unverified-ledger-claims"});
  });
  it("bounds historical learning and exposes forecast misses without asserting verified profit",()=>{
    const id=opportunity();
    for(let i=0;i<12;i++)experiment(id,{status:"failed",lesson:"No demand "+'x'.repeat(2000),forecastRevenueCents:1000,forecastCostCents:0});
    const learning=store.getLearningContext();expect(learning.lessons).toHaveLength(10);expect(learning.truncated).toBe(true);
    expect(learning.lessons.every(l=>l.lesson!.length===1500&&l.recordedNetBelowForecast)).toBe(true);
    expect(learning.limitation).toContain('not immutable');
    expect(()=>store.getLearningContext(100)).toThrow();
  });
  it("keeps learning usable when historical accounting needs currency reconciliation",()=>{
    const id=opportunity();const exp=experiment(id,{status:"stopped",lesson:null});
    const report=store.getLearningContext();expect(report.lessons[0].blockers).toContain('lesson_not_recorded');
    expect(report.lessons[0].experimentId).toBe(exp);
    const original=store.getForecastVsActual.bind(store);
    vi.spyOn(store,'getForecastVsActual').mockImplementation(()=>{throw Error('Historical non-USD events');});
    expect(store.getLearningContext().lessons[0]).toMatchObject({accounting:null,recordedNetBelowForecast:null,blockers:expect.arrayContaining(['accounting_requires_reconciliation'])});
    expect(original(exp)).not.toBeNull();
  });
  it("blocks incomplete and exhausted experiments while retaining bounded alternatives", () => {
    const id = opportunity();
    const incomplete = experiment(id);
    const exhausted = experiment(id,{maxBudgetCents:0});
    const valid = experiment(id,{successCriteria:"3 qualified responses",failureCriteria:"0 responses",stopCondition:"24 hours or budget"});
    const actions = economicMissionAgenda(db.raw).actions;
    expect(actions.find(a=>a.experimentId===incomplete)?.action).toBe("stop_or_redesign");
    expect(actions.find(a=>a.experimentId===exhausted)?.action).toBe("stop_or_redesign");
    expect(actions.find(a=>a.experimentId===valid)?.action).toBe("continue_experiment");
    expect(store.getExperiment(exhausted)?.status).toBe("running");
  });
  it("ranks risk-adjusted speed above optimistic revenue and manual rank", () => {
    const slow = opportunity({ expectedRevenueCents: 100000, probabilitySuccess: 0.01, timeToRevenueDays: 90, focusRank: 1 });
    const fast = opportunity({ focusRank: 9 });
    opportunity({ status: "paused", expectedRevenueCents: 1000000 });
    expect(store.listFocusOpportunities().map(o => o.id)).toEqual([fast, slow]);
  });
  it("treats fractional and percentage probabilities equivalently", () => {
    const item = store.getOpportunity(opportunity())!;
    expect(store.getOpportunityPriorityScore(item)).toBe(store.getOpportunityPriorityScore({ ...item, probabilitySuccess: 50 }));
  });
  it("keeps empty scope empty and excludes terminal experiments and inactive parents", () => {
    const active = opportunity();
    const expected = experiment(active);
    experiment(active, { status: "completed" });
    experiment(opportunity({ status: "kill" }));
    expect(store.listPriorityExperiments([])).toEqual([]);
    expect(store.listPriorityExperiments().map(e => e.id)).toEqual([expected]);
    expect(store.listPriorityExperiments([active], 0)).toEqual([]);
  });
  it("ranks bounded fast experiments above slow expensive alternatives", () => {
    const parent = opportunity();
    const slow = experiment(parent, { forecastCostCents: 900, forecastTimeToRevenueHours: 168 });
    const fast = experiment(parent);
    expect(store.listPriorityExperiments([parent]).map(e => e.id)).toEqual([fast, slow]);
  });
});

describe("experiment budget safeguards", () => {
  it("prevents extending a running experiment by rewriting its start time", () => {
    const id = experiment();
    expect(() => store.updateExperiment(id, { startedAt: "2099-01-01T00:00:00Z" })).toThrow("immutable");
    expect(() => store.updateExperiment(id, { startedAt: null })).toThrow("immutable");
  });
  it("deduplicates economic events and rejects conflicting or mixed-currency retries", () => {
    const parent = opportunity();
    const input = { opportunityId: parent, experimentId: null, goalId: null, taskId: null,
      eventType: "payment", category: null, amountCents: 100, currency: "USD", channel: null,
      offer: null, customerRef: null, metadata: {}, occurredAt: "2026-09-26T00:00:00Z" };
    const id = store.addEconomicEvent(input, "invoice-1");
    expect(store.addEconomicEvent(input, "invoice-1")).toBe(id);
    expect(store.getOpportunityEconomics(parent).revenueCents).toBe(100);
    expect(() => store.addEconomicEvent({ ...input, amountCents: 101 }, "invoice-1")).toThrow("different data");
    expect(() => store.addEconomicEvent({ ...input, currency: "CHF" })).toThrow("Mixed-currency");
    expect(() => store.addEconomicEvent({ ...input, amountCents: -1 })).toThrow("nonnegative");
  });
  it("enforces treasury daily limits across sessions before calling the provider", async () => {
    const budget = new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG, 5);
    budget.recordCost({ sessionId: "previous-session", turnId: null, experimentId: null,
      model: "mock", provider: "mock", inputTokens: 1, outputTokens: 1, costCents: 5,
      latencyMs: 0, tier: "low_compute", taskType: "agent_turn", cacheHit: false });
    const registry = new ModelRegistry(db.raw); registry.initialize();
    const call = vi.fn();
    const result = await new InferenceRouter(db.raw, registry, budget).route({
      messages: [{ role: "user", content: "work" }], tier: "low_compute",
      taskType: "agent_turn", sessionId: "new-session" }, call);
    expect(result.finishReason).toBe("budget_exceeded");
    expect(result.content).toContain("Daily inference budget exhausted");
    expect(call).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity])("blocks paid calls with invalid or zero treasury budget %s", limit => {
    expect(new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG, limit).checkBudget(1, "mock").allowed).toBe(false);
  });
  it("allows the exact boundary and rejects overspend", () => {
    const id = experiment();
    expect(governor.checkInferenceBudget(id, 50).allowed).toBe(true);
    expect(governor.checkInferenceBudget(id, 51).allowed).toBe(false);
    expect(governor.checkTotalBudget(id, 101).allowed).toBe(false);
  });
  it("zero budgets allow only zero cost", () => {
    const id = experiment(undefined, { maxBudgetCents: 0, maxInferenceCostCents: 0 });
    expect(governor.checkInferenceBudget(id, 0).allowed).toBe(true);
    expect(governor.checkInferenceBudget(id, 1).allowed).toBe(false);
    expect(governor.checkTotalBudget(id, 1).allowed).toBe(false);
  });
  it.each([-1, NaN, Infinity])("rejects invalid estimates: %s", estimate => {
    const id = experiment();
    expect(governor.checkInferenceBudget(id, estimate).allowed).toBe(false);
    expect(governor.checkTotalBudget(id, estimate).allowed).toBe(false);
  });
  it.each(["stopped", "failed", "completed"] as const)("blocks %s experiments", status => {
    expect(governor.checkInferenceBudget(experiment(undefined, { status }), 1).allowed).toBe(false);
  });
  it("blocks inactive parent opportunities", () => {
    expect(governor.checkTotalBudget(experiment(opportunity({ status: "paused" })), 1).allowed).toBe(false);
  });
  it("rejects missing experiments and invalid transitions", () => {
    expect(governor.checkInferenceBudget("missing", 1).allowed).toBe(false);
    const id = experiment();
    store.transitionExperimentStatus(id, "completed");
    expect(() => store.transitionExperimentStatus(id, "running")).toThrow("Invalid experiment status transition");
  });
  it("expires at the exact deadline and stops idempotently", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00Z"));
    const id = experiment(undefined, { startedAt: "2026-09-26 09:00:00", maxDurationHours: 1 });
    expect(governor.checkDuration(id).allowed).toBe(false);
    governor.stopExperiment(id, "deadline");
    governor.stopExperiment(id, "second reason");
    expect(store.getExperiment(id)).toMatchObject({ status: "stopped", result: "deadline" });
  });
  it("combines economic and inference costs", () => {
    const parent = opportunity();
    const id = experiment(parent);
    store.addEconomicEvent({ opportunityId: parent, experimentId: id, goalId: null, taskId: null,
      eventType: "cost", category: null, amountCents: 95, currency: "USD", channel: null,
      offer: null, customerRef: null, metadata: {}, occurredAt: new Date().toISOString() });
    new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG).recordCost({
      sessionId: "test", turnId: null, experimentId: id, model: "mock", provider: "mock",
      inputTokens: 1, outputTokens: 1, costCents: 5, latencyMs: 0, tier: "normal", taskType: "agent_turn", cacheHit: false,
    });
    expect(governor.checkTotalBudget(id, 1)).toMatchObject({ allowed: false, currentTotalCostCents: 100 });
    expect(store.getForecastVsActual(id)?.actualCostCents).toBe(100);
    expect(store.getOpportunityEconomics(parent).costCents).toBe(100);
  });
});

describe("revenue router integration", () => {
  it('preserves started attribution and rejects reopening through the direct update path',()=>{
    db.raw.exec("INSERT INTO goals (id,title,description,status,created_at) VALUES ('durable-goal','Goal','fixture','active',datetime('now'))");
    db.raw.exec("INSERT INTO task_graph (id,goal_id,title,description,status,created_at) VALUES ('durable-task','durable-goal','Task','fixture','pending',datetime('now'))");
    const id=experiment();
    store.updateExperiment(id,{taskId:'durable-task',goalId:'durable-goal'});
    const original=store.getExperiment(id)!;
    for(const status of ['running','stopped'] as const){
      store.updateExperiment(id,{status});
      for(const change of [{taskId:null},{taskId:'replacement'},{goalId:null},{opportunityId:opportunity()}]){
        expect(()=>store.updateExperiment(id,{...change,maxBudgetCents:999})).toThrow('immutable');
        expect(store.getExperiment(id)).toMatchObject({taskId:original.taskId,goalId:original.goalId,opportunityId:original.opportunityId,maxBudgetCents:100});
      }
    }
    expect(()=>store.updateExperiment(id,{status:'planned',maxBudgetCents:999})).toThrow('Invalid experiment status transition');
    expect(()=>store.updateExperiment(id,{status:'running'})).toThrow('Invalid experiment status transition');
    expect(store.getExperiment(id)).toMatchObject({status:'stopped',maxBudgetCents:100});
    // Imported legacy data may already contain a reset; attribution must still survive.
    db.raw.prepare("UPDATE revenue_experiments SET status='planned' WHERE id=?").run(id);
    expect(()=>store.updateExperiment(id,{taskId:null})).toThrow('immutable');
    store.updateExperiment(id,{taskId:original.taskId,goalId:original.goalId});
  });
  it("inherits a delegated task's experiment including a terminal budget stop", () => {
    db.raw.exec("INSERT INTO goals (id,title,description,status,created_at) VALUES ('g','Goal','fixture','active',datetime('now'))");
    db.raw.exec("INSERT INTO task_graph (id,goal_id,title,description,status,created_at) VALUES ('parent','g','Parent','fixture','running',datetime('now'))");
    db.raw.exec("INSERT INTO task_graph (id,parent_id,goal_id,title,description,status,created_at) VALUES ('child','parent','g','Child','fixture','pending',datetime('now'))");
    const id=experiment(undefined,{taskId:'parent',goalId:'g'});
    expect(store.getActiveExperimentForTask('child',true)?.id).toBe(id);
    db.raw.prepare("UPDATE task_graph SET status='assigned',assigned_to='delegate' WHERE id='child'").run();
    expect(store.getActiveExperimentForAssignee('delegate',true)?.id).toBe(id);
    governor.stopExperiment(id,'budget exhausted');
    expect(store.getActiveExperimentForTask('child')).toBeNull();
    expect(store.getActiveExperimentForTask('child',true)?.id).toBe(id);
    expect(store.getActiveExperimentForAssignee('delegate',true)?.id).toBe(id);
    db.raw.prepare("UPDATE task_graph SET parent_id='child' WHERE id='parent'").run();
    expect(()=>store.updateExperiment(id,{taskId:null})).toThrow('immutable');
    // Simulate external corruption to test the ancestry guard independently.
    db.raw.prepare('UPDATE revenue_experiments SET task_id=NULL WHERE id=?').run(id);
    expect(()=>store.getActiveExperimentForTask('child',true)).toThrow('ancestry');
  });
  it("keeps terminal experiment attribution so the next call remains blocked", async () => {
    db.raw.prepare("INSERT INTO goals (id, title, description, status, created_at) VALUES ('g', 'Goal', 'test', 'active', datetime('now'))").run();
    db.raw.prepare("INSERT INTO task_graph (id, goal_id, title, description, status, assigned_to, created_at) VALUES ('t', 'g', 'Task', 'test', 'running', 'worker', datetime('now'))").run();
    const id = experiment(undefined, { taskId: "t", goalId: "g" });
    governor.stopExperiment(id, "budget exhausted");
    expect(store.getActiveExperimentForTask("t")).toBeNull();
    expect(store.getActiveExperimentForTask("t", true)?.id).toBe(id);
    expect(store.getActiveExperimentForAssignee("worker", true)?.id).toBe(id);
    const call = vi.fn();
    const result = await router().route({ messages: [{ role: "user", content: "continue" }],
      tier: "low_compute", taskType: "agent_turn", sessionId: "test",
      experimentId: store.getActiveExperimentForTask("t", true)!.id }, call);
    expect(result.finishReason).toBe("budget_exceeded");
    expect(call).not.toHaveBeenCalled();
  });
  it("blocks a worker before contacting a provider when its budget is too small", async () => {
    const chatDirect = vi.fn();
    const bridge = createWorkerInferenceBridge(router(), { chatDirect }, "worker-session");
    const id = experiment(undefined, { maxInferenceCostCents: 1 });
    await expect(bridge.chat({ messages: [{ role: "user", content: "validate" }], experimentId: id, maxTokens: 200000 })).rejects.toThrow();
    expect(chatDirect).not.toHaveBeenCalled();
  });
  it("records actual provider usage against the experiment", async () => {
    const id = experiment(undefined, { maxBudgetCents: 1000, maxInferenceCostCents: 1000 });
    const call = vi.fn().mockResolvedValue({ message: { content: "ok" }, usage: { promptTokens: 100, completionTokens: 10 } });
    const result = await router().route({ messages: [{ role: "user", content: "test" }], tier: "low_compute", taskType: "agent_turn", sessionId: "test", experimentId: id }, call);
    expect(call).toHaveBeenCalledOnce();
    expect(governor.checkInferenceBudget(id, 0).currentInferenceCostCents).toBe(result.costCents);
  });
  it("estimates the output limit actually passed to the provider", async () => {
    const registry = new ModelRegistry(db.raw); registry.initialize();
    const budget = new InferenceBudgetTracker(db.raw, DEFAULT_MODEL_STRATEGY_CONFIG);
    const check = vi.spyOn(budget, "checkBudget");
    const call = vi.fn().mockResolvedValue({ message: { content: "ok" }, usage: {} });
    await new InferenceRouter(db.raw, registry, budget).route({ messages: [{ role: "user", content: "x" }], tier: "normal", taskType: "agent_turn", sessionId: "test" }, call);
    const opts = call.mock.calls[0][1];
    const model = registry.get(opts.model)!;
    expect(check.mock.calls[0][0]).toBeGreaterThanOrEqual(Math.ceil(opts.maxTokens / 1000 * model.costPer1kOutput / 100));
  });
});
