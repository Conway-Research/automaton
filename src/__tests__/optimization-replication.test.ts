import {it,expect,afterEach,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {createDatabase} from '../state/database.js';
import {registerOptimizationTrial,recordOptimizationResult,assessOptimizationTrial,optimizationSession,type TrialManifest} from '../revenue/optimization-trials.js';
import {isProtectedFile} from '../self-mod/code.js';
import {assessOptimizationPayback} from '../revenue/optimization-payback.js';
import {optimizationWorkload} from '../revenue/optimization-workload.js';
import {bindOptimizationCost,optimizationOverhead} from '../revenue/optimization-overhead.js';
import {stageOptimizationRollout,runOptimizationRollout,inspectOptimizationRollout,rollbackOptimization,executeCoordinatorRollout} from '../revenue/optimization-rollout.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {optimizationModelDigest} from '../revenue/optimization-recipe.js';
import {InferenceRouter} from '../inference/router.js';
import {ModelRegistry} from '../inference/registry.js';
import {InferenceBudgetTracker} from '../inference/budget.js';
import {DEFAULT_MODEL_STRATEGY_CONFIG} from '../inference/types.js';
import type {ModelEntry} from '../types.js';
import {createBuiltinTools} from '../agent/tools.js';
const dirs:string[]=[],dbs:ReturnType<typeof createDatabase>[]=[];
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function setup(){const dir=mkdtempSync(join(tmpdir(),'replication-'));dirs.push(dir);const db=createDatabase(join(dir,'db.sqlite'));dbs.push(db);return db.raw;}
afterEach(()=>{dbs.splice(0).forEach(d=>d.close());dirs.splice(0).forEach(d=>rmSync(d,{recursive:true,force:true}));});
const model:ModelEntry={modelId:'fixture',provider:'other',displayName:'Fixture',tierMinimum:'low_compute',costPer1kInput:1000,costPer1kOutput:1000,maxTokens:1000,contextWindow:1000,supportsTools:false,supportsVision:false,parameterStyle:'max_tokens',enabled:true,lastSeen:null,createdAt:'',updatedAt:''};
const recipe={tier:'low_compute' as const,taskType:'agent_turn' as const,maxTokens:100,temperature:0,modelId:'fixture',provider:'other' as const,modelDigest:optimizationModelDigest(model)};
const manifest=(prefix='train'):TrialManifest=>({datasetDigest:sha(prefix),criteriaDigest:sha('criteria'),baseline:'original',candidate:'cheaper',minimumQuality:100,maximumQualityDrop:0,minimumSavingsPercent:10,maximumLatencyRatio:1.2,
 recipes:{baseline:recipe,candidate:{...recipe,maxTokens:80}},phase:'exploration',cases:[0,1,2].map(i=>({id:`case-${i}`,inputDigest:sha(JSON.stringify([{role:'user',content:prefix+i}])),qualityRule:{kind:'exact-output-sha256-v1',expectedOutputDigest:sha('answer'),maxOutputBytes:50}}))});
function complete(db:ReturnType<typeof setup>,trialId:string,m:TrialManifest){for(const c of m.cases)for(const side of ['baseline','candidate'] as const){
 const session=optimizationSession(trialId,c.id,side);
 db.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES(?,?,'fixture','other',?,10,'low_compute','agent_turn')").run(session,session,side==='baseline'?10:5);
 recordOptimizationResult(db,{trialId,caseId:c.id,side,output:'answer',safetyPassed:true,completed:true});
}}
it('requires successful exploration, binds criteria and separates held-out inputs',()=>{
 const db=setup(),m=manifest(),parent=registerOptimizationTrial(db,m).trialId;
 const replication={...manifest('held-out'),phase:'replication' as const,parentTrialId:parent};
 expect(()=>registerOptimizationTrial(db,replication)).toThrow('Parent must pass');complete(db,parent,m);
 expect(()=>registerOptimizationTrial(db,{...replication,cases:m.cases})).toThrow('held-out');
 expect(()=>registerOptimizationTrial(db,{...replication,minimumQuality:90})).toThrow('retain');
 expect(()=>registerOptimizationTrial(db,{...replication,recipes:{...m.recipes!,candidate:{...recipe,maxTokens:40}}})).toThrow('retain');
 const id=registerOptimizationTrial(db,replication).trialId;complete(db,id,replication);
 expect(assessOptimizationTrial(db,id)).toMatchObject({phase:'replication',recipesBound:true,parentTrialId:parent,collection:{directlyCollected:0,allDirectlyCollected:false},comparison:{decision:'candidate_for_replication',adoptionAuthorized:false}});
 db.prepare('UPDATE inference_costs SET cost_cents=cost_cents+1 WHERE session_id=?').run(optimizationSession(parent,'case-0','candidate'));
 expect(()=>assessOptimizationTrial(db,id)).toThrow('accounting changed');
});
it('rejects unrelated model costs instead of presenting them as a bound comparison',()=>{
 const db=setup(),m=manifest(),trialId=registerOptimizationTrial(db,m).trialId,session=optimizationSession(trialId,'case-0','candidate');
 db.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES('bad',?,'different','other',1,10,'low_compute','agent_turn')").run(session);
 expect(()=>recordOptimizationResult(db,{trialId,caseId:'case-0',side:'candidate',output:'answer',safetyPassed:true,completed:true})).toThrow('bound execution');
});
it('protects validation invariants from agent self-modification',()=>{
 for(const name of ['optimization-recipe','optimization-trials','optimization-runner','optimization-comparison'])for(const ext of ['ts','js'])expect(isProtectedFile(`src/revenue/${name}.${ext}`)).toBe(true);
});
function paybackFixture(){
 const db=setup(),m=manifest(),parent=registerOptimizationTrial(db,m).trialId;complete(db,parent,m);
 const rep={...manifest('held-out'),phase:'replication' as const,parentTrialId:parent};const trialId=registerOptimizationTrial(db,rep).trialId;complete(db,trialId,rep);
 const end=Math.floor(Date.now()/86400000)*86400000;
 db.transaction(()=>{for(let day=1;day<=14;day++)for(let i=0;i<20;i++)db.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type,created_at) VALUES(?,?,'fixture','other',10,1,'low_compute','agent_turn',?)").run(`usage-${day}-${i}`,`usage-${day}-${i}`,new Date(end-day*86400000).toISOString());})();
 return {db,parent,trialId,scenario:{trialId,forecastExecutions:100,additionalOneTimeCostCents:30,additionalPerExecutionCostCents:1,savingsRetentionPercent:80,minimumNetSavingsCents:100,maximumPaybackExecutions:50,workload:{lookbackDays:14,horizonDays:7}}};
}
// Synthetic receipt fixture for arithmetic/eligibility tests; actual collection is tested with the router separately.
function receipts(db:ReturnType<typeof setup>){
 db.exec('CREATE TABLE obolus_optimization_attempts(session_id TEXT PRIMARY KEY,status TEXT,result_digest TEXT)');
 for(const row of db.prepare('SELECT trial_id,case_id,side,digest FROM obolus_optimization_results').all() as {trial_id:string;case_id:string;side:'baseline'|'candidate';digest:string}[])
  db.prepare("INSERT INTO obolus_optimization_attempts VALUES(?,'recorded',?)").run(optimizationSession(row.trial_id,row.case_id,row.side),row.digest);
}
it('includes both complete trials, one-time overhead and ongoing costs in conservative payback without writing',()=>{
 const {db,scenario}=paybackFixture();receipts(db);const before=db.prepare('SELECT total_changes() n').get();
 const report=assessOptimizationPayback(db,scenario);
 expect(report).toMatchObject({decision:'scenario_supports_controlled_trial',adoptionAuthorized:false,profitabilityProven:false,
  projection:{measuredTrialCostCents:90,totalInvestmentCents:120,minimumObservedSavingsPerExecutionCents:5,projectedNetSavingsPerExecutionCents:3,projectedTotalNetSavingsCents:180,paybackExecutions:40}});
 expect(db.prepare('SELECT total_changes() n').get()).toEqual(before);expect(assessOptimizationPayback(db,scenario)).toEqual(report);
});
it('never upgrades supplied scores into directly collected evidence for adoption planning',()=>{
 const {db,scenario}=paybackFixture();const report=assessOptimizationPayback(db,scenario);
 expect(report.decision).toBe('do_not_introduce');expect(report.blockers).toContain('trial_0_not_directly_collected');expect(report.blockers).toContain('trial_1_not_directly_collected');
});
it('rejects unamortized costs, excessive payback horizon and overhead that consumes savings',()=>{
 const {db,scenario}=paybackFixture();receipts(db);
 expect(assessOptimizationPayback(db,{...scenario,forecastExecutions:20}).blockers).toContain('insufficient_projected_net_savings');
 expect(assessOptimizationPayback(db,{...scenario,maximumPaybackExecutions:20}).blockers).toContain('payback_horizon_exceeded');
 const costly=assessOptimizationPayback(db,{...scenario,additionalPerExecutionCostCents:5});expect(costly.blockers).toContain('no_conservative_unit_savings');expect(costly.projection?.paybackExecutions).toBeNull();
});
it('refuses a single trial and rechecks accounting before projecting savings',()=>{
 const {db,scenario,parent}=paybackFixture();receipts(db);
 expect(assessOptimizationPayback(db,{...scenario,trialId:parent})).toMatchObject({projection:null,decision:'do_not_introduce'});
 db.prepare('UPDATE inference_costs SET cost_cents=cost_cents+1 WHERE session_id=?').run(optimizationSession(parent,'case-0','baseline'));
 expect(()=>assessOptimizationPayback(db,scenario)).toThrow('accounting changed');
});
it('requires explicit bounded assumptions and protects payback rules',()=>{
 const {db,scenario}=paybackFixture();
 for(const change of [{forecastExecutions:NaN},{additionalOneTimeCostCents:-1},{savingsRetentionPercent:0},{additionalPerExecutionCostCents:undefined},{maximumPaybackExecutions:1000001}])
  expect(()=>assessOptimizationPayback(db,{...scenario,...change} as any)).toThrow('assumptions');
 expect(isProtectedFile('src/revenue/optimization-payback.ts')).toBe(true);
});
it('requires workload evidence and rejects forecasts exceeding either observed window',()=>{
 const {db,scenario,trialId}=paybackFixture();receipts(db);
 expect(assessOptimizationPayback(db,{...scenario,workload:undefined}).blockers).toContain('workload_evidence_required');
 expect(optimizationWorkload(db,trialId,14,7)).toMatchObject({olderCalls:140,recentCalls:140,supportedExecutions:140});
 expect(assessOptimizationPayback(db,{...scenario,forecastExecutions:141}).blockers).toContain('forecast_exceeds_observed_workload');
 for(let day=1;day<=6;day++)db.prepare('DELETE FROM inference_costs WHERE session_id LIKE ?').run(`usage-${day}-%`);
 expect(optimizationWorkload(db,trialId,14,7)).toMatchObject({olderCalls:140,recentCalls:20,supportedExecutions:20});
});
it('excludes benchmark traffic and incomplete current day instead of inventing recurring demand',()=>{
 const {db,trialId}=paybackFixture();const baseline=optimizationWorkload(db,trialId,14,7);
 const add=db.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type,created_at) VALUES(?,?,'fixture','other',1,1,'low_compute','agent_turn',?)");
 add.run('benchmark','opt-benchmark',new Date(Date.now()-86400000).toISOString());add.run('today','today',new Date().toISOString());
 expect(optimizationWorkload(db,trialId,14,7)).toEqual(baseline);
});
it('blocks invalid dates, ambiguous sessions and truncated workload samples',()=>{
 const {db,trialId}=paybackFixture();
 db.prepare("UPDATE inference_costs SET created_at='invalid-date' WHERE id='usage-1-0'").run();
 db.prepare("INSERT INTO inference_reservations(id,session_id,model,reserved_cents) VALUES('unresolved-usage','usage-2-0','fixture',0)").run();
 expect(optimizationWorkload(db,trialId,14,7).blockers).toEqual(expect.arrayContaining(['invalid_workload_records','unresolved_workload_sessions']));
 const add=db.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type,created_at) VALUES(?,?,'fixture','other',1,1,'low_compute','agent_turn',?)");
 db.transaction(()=>{for(let i=0;i<1001;i++)add.run(`excess-${i}`,`excess-${i}`,new Date(Date.now()-86400000).toISOString());})();
 expect(optimizationWorkload(db,trialId,14,7).blockers).toContain('workload_sample_truncated');
 expect(()=>optimizationWorkload(db,trialId,14,15)).toThrow('windows');
 expect(isProtectedFile('src/revenue/optimization-workload.ts')).toBe(true);
});
it('attributes recorded overhead once across a trial chain and refuses understated assumptions',()=>{
 const {db,parent,trialId,scenario}=paybackFixture();receipts(db);
 const add=db.prepare("INSERT INTO economic_events(id,event_type,category,amount_cents) VALUES(?,'cost','evaluation',?)");add.run('fee-1',40);add.run('fee-2',20);
 expect(bindOptimizationCost(db,{trialId:parent,eventId:'fee-1'})).toEqual({duplicate:false});
 expect(bindOptimizationCost(db,{trialId:parent,eventId:'fee-1'})).toEqual({duplicate:true});
 expect(()=>bindOptimizationCost(db,{trialId,eventId:'fee-1'})).toThrow('already attributed');bindOptimizationCost(db,{trialId,eventId:'fee-2'});
 const before=db.prepare('SELECT total_changes() n').get();const report=assessOptimizationPayback(db,scenario);
 expect(report).toMatchObject({decision:'do_not_introduce',overhead:{recordedCostCents:60,eventCount:2},projection:{totalInvestmentCents:150}});
 expect(report.blockers).toContain('declared_cost_below_recorded_overhead');expect(db.prepare('SELECT total_changes() n').get()).toEqual(before);
 expect(assessOptimizationPayback(db,{...scenario,additionalOneTimeCostCents:60}).projection?.totalInvestmentCents).toBe(150);
 expect(()=>db.exec('DELETE FROM obolus_optimization_extra_costs')).toThrow('immutable');
});
it('revalidates attributed source costs across another connection and detects edits or removal',()=>{
 const {db,trialId,scenario}=paybackFixture();
 db.exec("INSERT INTO economic_events(id,event_type,category,amount_cents) VALUES('fee','cost','deployment',15)");bindOptimizationCost(db,{trialId,eventId:'fee'});
 const other=createDatabase(db.name);try{expect(optimizationOverhead(other.raw,[trialId])).toEqual(optimizationOverhead(db,[trialId]));
  other.raw.exec("UPDATE economic_events SET amount_cents=16 WHERE id='fee'");expect(()=>assessOptimizationPayback(db,scenario)).toThrow('cost changed');
  other.raw.exec("DELETE FROM economic_events WHERE id='fee'");expect(()=>optimizationOverhead(db,[trialId])).toThrow('cost event');
 }finally{other.close();}
});
it('rejects revenue, foreign currency and inference expense attribution instead of silently double counting',()=>{
 const {db,trialId}=paybackFixture();const add=db.prepare('INSERT INTO economic_events(id,event_type,category,amount_cents,currency) VALUES(?,?,?,?,?)');
 for(const [id,type,category,amount,currency] of [['revenue','payment','sale',10,'USD'],['foreign','cost','deployment',10,'CHF'],['inference','cost','inference',10,'USD'],['negative','cost','deployment',-1,'USD']]){
  add.run(id,type,category,amount,currency);expect(()=>bindOptimizationCost(db,{trialId,eventId:String(id)})).toThrow('cost event');
 }
 expect(isProtectedFile('src/revenue/optimization-overhead.ts')).toBe(true);
});
function rolloutRouter(db:ReturnType<typeof setup>){const registry=new ModelRegistry(db);registry.upsert(model);return new InferenceRouter(db,registry,new InferenceBudgetTracker(db,{...DEFAULT_MODEL_STRATEGY_CONFIG,inferenceModel:'fixture',lowComputeModel:'fixture',criticalModel:'fixture'},10000));}
function rolloutFixture(){const fixture=paybackFixture();receipts(fixture.db);const limits={maxRuns:2,maxCostCents:30,expiresAt:Date.now()+60000};
 const {rolloutId}=stageOptimizationRollout(fixture.db,fixture.scenario,limits);
 return {...fixture,limits,rolloutId,router:rolloutRouter(fixture.db),input:{rolloutId,operationId:'run-1',caseId:'case-0',messages:[{role:'user' as const,content:'held-out0'}]}};
}
const routedAnswer=(content='answer')=>({message:{content},usage:{promptTokens:10,completionTokens:5},finishReason:'stop'});
it('executes the bounded lower-token variant and automatically withdraws it on a wrong answer',async()=>{
 const {db,router,input,rolloutId,scenario,limits}=rolloutFixture();
 expect(stageOptimizationRollout(db,scenario,limits)).toMatchObject({duplicate:true});
 expect(()=>stageOptimizationRollout(db,scenario,{...limits,maxRuns:3})).toThrow('already has');
 const provider=vi.fn(async(_m:any,options:any)=>{expect(options.maxTokens).toBe(80);expect(options.toolChoice).toBe('none');return routedAnswer();});
 expect(await runOptimizationRollout(db,router,input,provider)).toMatchObject({status:'accepted',content:'answer'});
 const wrong=await runOptimizationRollout(db,router,{...input,operationId:'run-2'},async()=>routedAnswer('wrong'));
 expect(wrong).toMatchObject({status:'rolled_back',outputWithheld:true});expect(JSON.stringify(wrong)).not.toContain('wrong');
 expect(await runOptimizationRollout(db,router,{...input,operationId:'run-3'},provider)).toMatchObject({status:'blocked'});expect(provider).toHaveBeenCalledOnce();
 expect(inspectOptimizationRollout(db,rolloutId).status).toBe('rolled_back');
});
it('serializes canary calls across connections and preserves no-retry claims',async()=>{
 const {db,input,router,rolloutId}=rolloutFixture();const other=createDatabase(db.name);
 try{let release!:(v:any)=>void;const provider=vi.fn(()=>new Promise<any>(resolve=>{release=resolve;}));const pending=runOptimizationRollout(db,router,input,provider);
  expect(await runOptimizationRollout(other.raw,rolloutRouter(other.raw),{...input,operationId:'run-2'},provider)).toMatchObject({status:'busy'});
  expect(await runOptimizationRollout(other.raw,rolloutRouter(other.raw),input,provider)).toMatchObject({status:'already_claimed'});
  release(routedAnswer());expect(await pending).toMatchObject({status:'accepted'});expect(provider).toHaveBeenCalledOnce();
  expect(await runOptimizationRollout(other.raw,rolloutRouter(other.raw),{...input,operationId:'run-2'},async()=>routedAnswer())).toMatchObject({status:'accepted'});
  expect(await runOptimizationRollout(db,router,{...input,operationId:'run-3'},provider)).toMatchObject({status:'blocked'});
  expect(inspectOptimizationRollout(other.raw,rolloutId).reason).toBe('exposure_limit');
 }finally{other.close();}
});
it('withholds output if evidence changes or rollback occurs while the provider is pending',async()=>{
 for(const mode of ['evidence','rollback']){
  const {db,input,router,parent,rolloutId}=rolloutFixture();let release!:(v:any)=>void;
  const pending=runOptimizationRollout(db,router,input,()=>new Promise<any>(resolve=>{release=resolve;}));
  if(mode==='evidence')db.prepare('UPDATE inference_costs SET cost_cents=cost_cents+1 WHERE session_id=?').run(optimizationSession(parent,'case-0','baseline'));
  else rollbackOptimization(db,rolloutId);
  release(routedAnswer());expect(await pending).toMatchObject({status:'rolled_back',outputWithheld:true});
 }
});
it('retains ambiguous provider costs and rejects automatic restart of a failed canary',async()=>{
 const {db,input,router,rolloutId}=rolloutFixture();
 const provider=vi.fn(async()=>{throw Error('private provider failure');});
 const result=await runOptimizationRollout(db,router,input,provider);expect(result).toMatchObject({status:'rolled_back'});expect(JSON.stringify(result)).not.toContain('private');
 const other=createDatabase(db.name);try{
  expect(await runOptimizationRollout(other.raw,rolloutRouter(other.raw),input,provider)).toMatchObject({status:'already_claimed'});
  expect(inspectOptimizationRollout(other.raw,rolloutId).status).toBe('rolled_back');
  expect(other.raw.prepare("SELECT COUNT(*) n FROM inference_reservations WHERE status='pending'").get()).toEqual({n:1});
 }finally{other.close();}expect(provider).toHaveBeenCalledOnce();
});
it('rolls back before new spending on expiry, registry drift or changed rollout accounting',async()=>{
 for(const mode of ['expiry','model','cost']){
  const {db,input,router,rolloutId,limits}=rolloutFixture();const provider=vi.fn(async()=>routedAnswer());let clock:ReturnType<typeof vi.spyOn>|undefined;
  try{
   if(mode==='expiry')clock=vi.spyOn(Date,'now').mockReturnValue(limits.expiresAt+1);
   if(mode==='model')db.exec("UPDATE model_registry SET cost_per_1k_input=999 WHERE model_id='fixture'");
   if(mode==='cost'){
    expect(await runOptimizationRollout(db,router,input,async()=>routedAnswer())).toMatchObject({status:'accepted'});
    db.exec("UPDATE inference_costs SET cost_cents=cost_cents+1 WHERE session_id LIKE 'opt-rollout-%'");
   }
   expect(await runOptimizationRollout(db,router,{...input,operationId:'next'},provider)).toMatchObject({status:'blocked'});
   expect(provider).not.toHaveBeenCalled();expect(inspectOptimizationRollout(db,rolloutId).status).toBe('rolled_back');
  }finally{clock?.mockRestore();}
 }
});
it('rejects oversized exposure, foreign inputs and still obeys the shared router stop',async()=>{
 const {db,scenario}=paybackFixture();receipts(db);
 expect(()=>stageOptimizationRollout(db,scenario,{maxRuns:1,maxCostCents:1000,expiresAt:Date.now()+60000})).toThrow('projected net');
 const {rolloutId}=stageOptimizationRollout(db,scenario,{maxRuns:1,maxCostCents:30,expiresAt:Date.now()+60000});
 const router=rolloutRouter(db),provider=vi.fn(async()=>routedAnswer());
 await expect(runOptimizationRollout(db,router,{rolloutId,operationId:'foreign',caseId:'case-0',messages:[{role:'user',content:'arbitrary business task'}]},provider)).rejects.toThrow('registered cases');
 db.exec('UPDATE inference_budget_policy SET daily_cents=0');
 expect(await runOptimizationRollout(db,router,{rolloutId,operationId:'blocked',caseId:'case-0',messages:[{role:'user',content:'held-out0'}]},provider)).toMatchObject({status:'rolled_back'});
 expect(provider).not.toHaveBeenCalled();expect(db.prepare('SELECT daily_cents FROM inference_budget_policy').get()).toEqual({daily_cents:0});
});
it('exposes inspect and rollback management without provider execution or global routing changes',async()=>{
 const {db,rolloutId}=rolloutFixture();const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_optimization_rollout')!;
 const ctx={db:{raw:db}} as any;
 expect(JSON.parse(await tool.execute({action:'inspect',rollout_id:rolloutId},ctx))).toMatchObject({status:'active',runs:[],globalRoutingChanged:false});
 expect(JSON.parse(await tool.execute({action:'rollback',rollout_id:rolloutId},ctx))).toMatchObject({status:'rolled_back'});
 expect(db.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
 expect(isProtectedFile('src/revenue/optimization-rollout.ts')).toBe(true);
});
function assignRolloutExperiment(db:ReturnType<typeof setup>){
 db.exec("INSERT INTO goals(id,title,description,created_at) VALUES('rollout-goal','Fixture','Fixture',datetime('now')); INSERT INTO task_graph(id,goal_id,title,description,status,assigned_to,created_at) VALUES('rollout-task','rollout-goal','Fixture','Fixture','running','coordinator',datetime('now')); INSERT INTO revenue_opportunities(id,name,status) VALUES('rollout-opportunity','Fixture','validating'); INSERT INTO revenue_experiments(id,opportunity_id,task_id,status,hypothesis,max_budget_cents,max_inference_cost_cents,max_duration_hours,started_at) VALUES('rollout-experiment','rollout-opportunity','rollout-task','running','Fixture',100,100,24,datetime('now'))");
 // Synthetic historical usage is already a liability; retain a reserve after accounting for it.
 initializeCapitalBudget(db,{capitalChfCents:5000,reserveChfCents:1000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
}
it('executes through the coordinator tool with a fresh assigned experiment and ledger attribution',async()=>{
 const {db,router,input}=rolloutFixture(),provider=vi.fn(async()=>routedAnswer());
 await expect(executeCoordinatorRollout(db,router,'coordinator','low_compute',input,provider)).rejects.toThrow('running coordinator');
 assignRolloutExperiment(db);
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_run_optimization_rollout')!;
 await expect(tool.execute({},{db:{raw:db}} as any)).rejects.toThrow('unavailable');
 const ctx={optimizationRollout:async(value:any)=>JSON.stringify(await executeCoordinatorRollout(db,router,'coordinator','low_compute',value,provider))} as any;
 const result=JSON.parse(await tool.execute({rollout_id:input.rolloutId,operation_id:input.operationId,case_id:input.caseId,messages:input.messages,experimentId:'foreign'},ctx));
 expect(result).toMatchObject({status:'accepted'});expect(provider).toHaveBeenCalledOnce();
 expect(db.prepare("SELECT experiment_id FROM inference_costs WHERE session_id LIKE 'opt-rollout-%'").get()).toEqual({experiment_id:'rollout-experiment'});
 db.exec("UPDATE revenue_experiments SET status='stopped' WHERE id='rollout-experiment'");
 await expect(executeCoordinatorRollout(db,router,'coordinator','low_compute',{...input,operationId:'after-stop'},provider)).rejects.toThrow('running coordinator');
});
it('refuses a changed survival tier before invoking the provider',async()=>{
 const {db,router,input}=rolloutFixture();assignRolloutExperiment(db);const provider=vi.fn(async()=>routedAnswer());
 expect(await executeCoordinatorRollout(db,router,'coordinator','critical',input,provider)).toMatchObject({status:'blocked'});expect(provider).not.toHaveBeenCalled();
});
it('withholds an otherwise correct answer when its assigned experiment stops in flight',async()=>{
 const {db,router,input}=rolloutFixture();assignRolloutExperiment(db);let release!:(value:any)=>void;
 const pending=executeCoordinatorRollout(db,router,'coordinator','low_compute',input,()=>new Promise<any>(resolve=>{release=resolve;}));
 db.exec("UPDATE revenue_experiments SET status='stopped' WHERE id='rollout-experiment'");release(routedAnswer());
 expect(await pending).toMatchObject({status:'rolled_back',outputWithheld:true});
 expect(db.prepare("SELECT experiment_id FROM inference_costs WHERE session_id LIKE 'opt-rollout-%'").get()).toEqual({experiment_id:'rollout-experiment'});
});

it('charges settled rollout costs once against projected savings without mutating the original evidence',async()=>{
 const {db,router,input,rolloutId,scenario}=rolloutFixture();
 const before=assessOptimizationPayback(db,scenario);
 await runOptimizationRollout(db,router,input,async()=>routedAnswer());
 const changes=db.prepare('SELECT total_changes() n').get();
 const report=inspectOptimizationRollout(db,rolloutId).economics;
 expect(report).toMatchObject({settledCostCents:1,unresolvedExposureCents:0,exposureCents:1,projectedNetAfterRolloutCents:before.projection!.projectedTotalNetSavingsCents-1,blockers:[],profitabilityProven:false});
 expect(assessOptimizationPayback(db,scenario).scenarioId).toBe(before.scenarioId);
 expect(inspectOptimizationRollout(db,rolloutId).economics).toEqual(report);
 expect(db.prepare('SELECT total_changes() n').get()).toEqual(changes);
});
it('retains ambiguous rollout exposure after reopening a database connection',async()=>{
 const {db,router,input,rolloutId}=rolloutFixture();
 await runOptimizationRollout(db,router,input,async()=>{throw Error('mock timeout');});
 const other=createDatabase(db.name);try{
  expect(inspectOptimizationRollout(other.raw,rolloutId).economics).toMatchObject({settledCostCents:0,unresolvedExposureCents:11,exposureCents:11,blockers:['unresolved_rollout_accounting']});
 }finally{other.close();}
});
it('blocks spending when rollout overhead would violate the required minimum net benefit',async()=>{
 const {db,scenario}=paybackFixture();receipts(db);
 const net=assessOptimizationPayback(db,scenario).projection!.projectedTotalNetSavingsCents;
 const {rolloutId}=stageOptimizationRollout(db,{...scenario,minimumNetSavingsCents:net-10},{maxRuns:1,maxCostCents:30,expiresAt:Date.now()+60000});
 const provider=vi.fn(async()=>routedAnswer());
 expect(await runOptimizationRollout(db,rolloutRouter(db),{rolloutId,operationId:'net-limit',caseId:'case-0',messages:[{role:'user',content:'held-out0'}]},provider)).toMatchObject({status:'blocked'});
 expect(provider).not.toHaveBeenCalled();expect(inspectOptimizationRollout(db,rolloutId).reason).toBe('net_benefit_limit');
 expect(db.prepare('SELECT COUNT(*) n FROM obolus_optimization_rollout_runs').get()).toEqual({n:0});
});
it('does not report changed or missing rollout ledger costs as settled savings',async()=>{
 const {db,router,input,rolloutId}=rolloutFixture();await runOptimizationRollout(db,router,input,async()=>routedAnswer());
 db.exec("UPDATE inference_costs SET cost_cents=20 WHERE session_id LIKE 'opt-rollout-%'");
 expect(inspectOptimizationRollout(db,rolloutId).economics).toMatchObject({settledCostCents:0,unresolvedExposureCents:20,blockers:['unresolved_rollout_accounting']});
 db.exec("DELETE FROM inference_costs WHERE session_id LIKE 'opt-rollout-%'");
 expect(inspectOptimizationRollout(db,rolloutId).economics).toMatchObject({settledCostCents:0,unresolvedExposureCents:11,blockers:['unresolved_rollout_accounting']});
});
