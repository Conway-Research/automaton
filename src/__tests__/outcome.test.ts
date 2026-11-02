import {fixtureGrantAdapterPermission as grantAdapterPermission} from './fixtures/security-review.js';
import {fixtureSecurityReview,fixturePublicationContext} from './fixtures/security-review.js';
import {checkoutActionScope,PRODUCT_RELEASE_EVIDENCE} from '../commerce/stripe-checkout.js';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase,insertGoal,insertTask} from '../state/database.js';
import {RevenueStore} from '../revenue/store.js';
import {registerOutcomeContract,recordCustomerEvidence,assessExperimentOutcome,assessRunningOutcomeContracts,previewExperimentOutcome,opportunityDemandEvidence} from '../revenue/outcome.js';
import {economicMissionAgenda} from '../revenue/mission.js';
import {reserveInferenceCost,settleInferenceCost} from '../inference/reservations.js';
import {registerRevalidationAllowance} from '../revenue/revalidation.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {runReservedOperation} from '../revenue/reserved-operation.js';
import {createBuiltinTools} from '../agent/tools.js';
import {isProtectedFile} from '../self-mod/code.js';
import {main} from '../v1/cli.js';
import Database from 'better-sqlite3';
import {createHmac} from 'node:crypto';
import {StripeCheckout} from '../commerce/stripe-checkout.js';
import {DigitalDelivery} from '../commerce/delivery.js';
import {attributeCommerceObservation,syncCommerceHolds} from '../commerce/attribution.js';
import {ResearchDispatcher} from '../orchestration/research-dispatch.js';
import {configureResearchDispatch} from '../revenue/research-handoff.js';
import {setSalesPaused} from '../commerce/sales-control.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {planCapitalAllocation} from '../revenue/capital-allocation.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {LocalWorkerPool} from '../orchestration/local-worker.js';
import {HarnessRegistry} from '../agent/harness-registry.js';
import {getReadyTasks,assignTask} from '../orchestration/task-graph.js';
import {createTestConfig,createTestIdentity,MockConwayClient,MockInferenceClient} from './mocks.js';
import {ModelRegistry} from '../inference/registry.js';
import {InferenceRouter} from '../inference/router.js';
import {InferenceBudgetTracker} from '../inference/budget.js';
import {DEFAULT_MODEL_STRATEGY_CONFIG} from '../inference/types.js';
import {ProviderRegistry} from '../inference/provider-registry.js';
import {UnifiedInferenceClient} from '../inference/inference-client.js';
import {createWorkerInferenceBridge} from '../agent/worker-inference-bridge.js';
import type {ToolContext} from '../types.js';

let dir:string,file:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>;
const sdk=vi.hoisted(()=>({create:vi.fn()}));
vi.mock('openai',()=>({default:class{chat={completions:{create:sdk.create}};}}));
const contract={minimumQualifiedCustomers:3,minimumPaidOrders:1,evidenceMaxAgeMs:86400000,mode:'live' as const,reviewedBy:'fixture reviewer'};
beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-outcome-'));file=path.join(dir,'test.db');db=createDatabase(file);other=createDatabase(file);
  db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','validating'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition) VALUES('e','o','planned','fixture demand',100,24,'Three qualified customers and a paid pilot','No demand','Ceiling')");
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();sdk.create.mockReset();db.close();other.close();fs.rmSync(dir,{recursive:true,force:true});});
function start(mode:'live'|'test'='live',completed=true){
  registerOutcomeContract(db.raw,'e',{...contract,mode});
  new RevenueStore(db.raw).transitionExperimentStatus('e','running');
  const goalId=insertGoal(db.raw,{title:'Fixture',description:'No actual customers'});
  const taskId=insertTask(db.raw,{goalId,title:'Fixture research',description:'Offline only'});
  new RevenueStore(db.raw).updateExperiment('e',{taskId,goalId});
  if(completed)db.raw.prepare("UPDATE task_graph SET status='completed',result=? WHERE id=?").run(JSON.stringify({success:true,output:'Synthetic fixture only'}),taskId);
  return taskId;
}
function customers(){
  for(let i=1;i<=3;i++)recordCustomerEvidence(db.raw,{id:`review${i}`,experimentId:'e',customerHash:String(i).repeat(64),evidenceSha256:String(i+3).repeat(64),qualified:true,observedAt:Date.now(),reviewedBy:'fixture reviewer'});
}
function payment(mode:'live'|'test'='live'){
  db.raw.exec('CREATE TABLE obolus_commerce_observations(id TEXT PRIMARY KEY,experiment_id TEXT,account_id TEXT,mode TEXT,order_id TEXT,transaction_id TEXT,report TEXT,observed_ms INTEGER)');
  const now=Date.now();
  // Unit fixture only; no provider or bank is contacted and no real receipt is claimed.
  db.raw.prepare('INSERT INTO obolus_commerce_observations VALUES(?,?,?,?,?,?,?,?)').run('payment','e','acct_fixture',mode,'order','txn_fixture',
    JSON.stringify({orderId:'order',mode,observedAt:now,currency:'chf',grossCents:1000,providerFeeCents:59,providerNetCents:941}),now);
}
it('revalidates only preregistered older demand cohorts and retains financial holds',()=>{
  start();customers();payment();assessExperimentOutcome(db.raw,'e');
  recordCustomerEvidence(db.raw,{id:'revocation',experimentId:'e',customerHash:'1'.repeat(64),evidenceSha256:'a'.repeat(64),qualified:false,observedAt:Date.now(),reviewedBy:'fixture'});
  expect(opportunityDemandEvidence(other.raw,'o').blocked).toBe(true);
  db.raw.exec("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition) VALUES('r','o','planned','new cohort',20,1,'demand','no demand','ceiling')");
  registerRevalidationAllowance(db.raw,{opportunityId:'o',experimentId:'r',maximumCostCents:20,expiresAt:Date.now()+60000,reviewedBy:'fixture'});
  registerOutcomeContract(db.raw,'r',contract);
  const store=new RevenueStore(db.raw);store.transitionExperimentStatus('r','running');
  const goalId=insertGoal(db.raw,{title:'Revalidation',description:'Offline fixture'}),taskId=insertTask(db.raw,{goalId,title:'New cohort',description:'Offline fixture'});
  store.updateExperiment('r',{goalId,taskId});db.raw.prepare("UPDATE task_graph SET status='completed',result=? WHERE id=?").run(JSON.stringify({success:true,output:'Fixture'}),taskId);
  for(let i=1;i<=3;i++)recordCustomerEvidence(db.raw,{id:`new_${i}`,experimentId:'r',customerHash:String(i).repeat(64),evidenceSha256:String(i+3).repeat(64),qualified:true,observedAt:Date.now(),reviewedBy:'fixture'});
  const now=Date.now();db.raw.prepare('INSERT INTO obolus_commerce_observations VALUES(?,?,?,?,?,?,?,?)').run('fresh','r','acct_fixture','live','fresh_order','txn_fresh',JSON.stringify({orderId:'fresh_order',mode:'live',observedAt:now,currency:'chf',grossCents:1000,providerFeeCents:59,providerNetCents:941}),now);
  expect(assessExperimentOutcome(db.raw,'r')!.decision).toBe('demand_criteria_met');
  expect(opportunityDemandEvidence(other.raw,'o')).toMatchObject({state:'demand_observed',blocked:false,experiments:2});
  expect(previewExperimentOutcome(db.raw,'e')!.decision).toBe('review_required');
  db.raw.exec("CREATE TABLE obolus_commerce_holds(observation_id TEXT PRIMARY KEY,reason TEXT,detected_at INTEGER); INSERT INTO obolus_commerce_holds VALUES('payment','refund requires reconciliation',0)");
  expect(opportunityDemandEvidence(other.raw,'o').blocked).toBe(true);
});
it.each(['revoked','stale','refund','simulation'] as const)('rechecks %s demand before follow-up allocation despite high model confidence',async failure=>{
  start();customers();payment();assessExperimentOutcome(db.raw,'e');
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:2500,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+100000});
  db.raw.exec(`INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_inference_cost_cents,max_duration_hours,
    success_criteria,failure_criteria,stop_condition,forecast_revenue_cents,forecast_cost_cents,forecast_probability_success,forecast_time_to_revenue_hours)
    VALUES('follow','o','planned','Follow up',100,100,24,'Demand','No demand','Ceiling',10000,10,1,1)`);
  const candidate={experimentId:'follow',requestedCents:10,maximumLossCents:10,evidenceQuality:1,liquidityDays:1,opportunityCostCents:0};
  const limits={budgetCents:100,lossCapacityCents:100,maxPerExperimentCents:100,minEvidenceQuality:0.5,maxLiquidityDays:2};
  const policy={edition:'founder' as const,commercialFeatures:[],permissions:['experiments' as const],emergencyStop:false};
  expect(planCapitalAllocation(other.raw,[candidate],limits,policy).candidates[0]).toMatchObject({evidenceState:'demand_observed',selected:true});
  const governor=new ExperimentBudgetGovernor(other.raw);
  expect(governor.checkInferenceBudget('follow',10).allowed).toBe(true);
  new RevenueStore(db.raw).transitionExperimentStatus('follow','running');
  registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  grantAdapterPermission(db.raw,{adapter:'mock',experimentId:'follow',maxCostUsdCents:100,expiresAt:Date.now()+60000,reviewedBy:'fixture'});
  const reserved=db.raw.transaction(()=>reserveInferenceCost(db.raw,'upgrade-fixture','follow','mock',5)).immediate();
  if(failure==='revoked')recordCustomerEvidence(db.raw,{id:'revoked',experimentId:'e',customerHash:'1'.repeat(64),evidenceSha256:'a'.repeat(64),qualified:false,observedAt:Date.now(),reviewedBy:'fixture'});
  else if(failure==='stale')db.raw.prepare('UPDATE obolus_commerce_observations SET observed_ms=0').run();
  else if(failure==='simulation')db.raw.prepare("UPDATE obolus_commerce_observations SET mode='test'").run();
  else db.raw.prepare("UPDATE obolus_commerce_observations SET report=json_set(report,'$.providerNetCents',0)").run();
  const result=planCapitalAllocation(other.raw,[candidate],limits,policy);
  expect(result.decision).toBe('preserve_capital');
  expect(result.candidates[0]).toMatchObject({evidenceState:'revalidation_required',selected:false});
  expect(result.candidates[0].reasons).toContain('demand_evidence_requires_revalidation');
  expect(governor.checkInferenceBudget('follow',10)).toMatchObject({allowed:false,reason:expect.stringContaining('Demand evidence changed')});
  expect(governor.checkTotalBudget('follow',10).allowed).toBe(false);
  const execute=vi.fn(async()=>({actualCostUsdCents:10})),recordCost=vi.fn();
  await expect(runReservedOperation(other.raw,{id:'op_upgrade',adapter:'mock',experimentId:'follow',purpose:'Offline regression',maxCostUsdCents:10},execute,recordCost))
    .rejects.toThrow('Demand evidence changed');
  expect(execute).not.toHaveBeenCalled();expect(recordCost).not.toHaveBeenCalled();
  expect(other.raw.prepare('SELECT COUNT(*) n FROM aureus_capital_commitments').get()).toEqual({n:0});
  // A circuit breaker must not strand the accounting for work already admitted.
  settleInferenceCost(db.raw,reserved,()=>{});
  expect(other.raw.prepare('SELECT status FROM inference_reservations WHERE id=?').get(reserved)).toEqual({status:'settled'});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_assessments').get()).toEqual({n:1});
});
it('does not turn unverified historical completion or model confidence into demand proof',()=>{
  db.raw.exec("UPDATE revenue_experiments SET status='completed',result='Profitable according to model' WHERE id='e'");
  expect(opportunityDemandEvidence(other.raw,'o')).toEqual({state:'unvalidated',blocked:false,experiments:0});
  expect(other.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_outcome_assessments'").get()).toBeUndefined();
});
it('preregisters immutable criteria and rejects retroactive changes without starting anything',()=>{
  expect(assessExperimentOutcome(db.raw,'e')).toBeNull();
  expect(registerOutcomeContract(db.raw,'e',contract)).toEqual({duplicate:false});
  expect(registerOutcomeContract(other.raw,'e',contract)).toEqual({duplicate:true});
  expect(()=>registerOutcomeContract(other.raw,'e',{...contract,minimumPaidOrders:2})).toThrow('immutable');
  expect(()=>db.raw.exec('DELETE FROM obolus_outcome_contracts')).toThrow('immutable');
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('planned');
  db.raw.exec("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,started_at) VALUES('late','o','running','fixture',datetime('now'))");
  expect(()=>registerOutcomeContract(db.raw,'late',contract)).toThrow('Preregister');
  expect(isProtectedFile('src/revenue/outcome.ts')).toBe(true);
  expect(isProtectedFile('dist/revenue/outcome.js')).toBe(true);
});
it('completes demand validation transactionally, survives restart and never credits money or scaling',()=>{
  start();customers();payment();
  expect(previewExperimentOutcome(other.raw,'e')?.decision).toBe('demand_criteria_met');
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('running');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_assessments').get()).toEqual({n:0});
  const first=assessRunningOutcomeContracts(other.raw)[0]!;
  expect(first).toMatchObject({decision:'demand_criteria_met',blockers:[],capitalCreditedCents:0,scalingAuthorized:false});
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('completed');
  db.close();db=createDatabase(file);
  expect(assessExperimentOutcome(db.raw,'e')?.assessmentId).toBe(first.assessmentId);
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_assessments').get()).toEqual({n:1});
  expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_reconciled_cash'").get()).toBeUndefined();
  expect(()=>db.raw.exec('DELETE FROM obolus_outcome_assessments')).toThrow('immutable');
});
it('blocks simulation receipts, duplicate customer proof and arbitrary model completion',async()=>{
  start();payment('test');
  for(let i=1;i<=3;i++)recordCustomerEvidence(db.raw,{id:`review${i}`,experimentId:'e',customerHash:String(i).repeat(64),evidenceSha256:'a'.repeat(64),qualified:true,observedAt:Date.now(),reviewedBy:'fixture'});
  const assessment=assessExperimentOutcome(other.raw,'e')!;
  expect(assessment.customerEvidence).toHaveLength(1);
  expect(assessment.blockers).toEqual(expect.arrayContaining(['qualified_customer_threshold_not_met','paid_order_threshold_not_met']));
  const tool=createBuiltinTools("fixture-sandbox").find(t=>t.name==='revenue_update_experiment')!;
  await expect(tool.execute({experiment_id:'e',status:'completed',result:'Model says profitable'}, {db} as ToolContext)).rejects.toThrow('criteria not met');
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('running');
});
it('reports successful synthetic criteria without promoting test demand to a live completion',()=>{
  start('test');customers();payment('test');
  expect(assessExperimentOutcome(db.raw,'e')?.decision).toBe('simulation_criteria_met');
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('running');
});
it('retains ambiguous costs and requires successful tasks before economic completion',()=>{
  const task=start();customers();payment();
  db.raw.transaction(()=>reserveInferenceCost(db.raw,'fixture','e','mock',0)).immediate();
  db.raw.prepare("UPDATE task_graph SET status='failed' WHERE id=?").run(task);
  expect(assessExperimentOutcome(other.raw,'e')?.blockers).toEqual(expect.arrayContaining(['unresolved_inference_cost','task_success_not_established']));
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('running');
});
it('detects later customer revocation, payment holds and stale observations',()=>{
  start();customers();payment();
  expect(assessExperimentOutcome(db.raw,'e')?.decision).toBe('demand_criteria_met');
  recordCustomerEvidence(other.raw,{id:'revoke',experimentId:'e',customerHash:'1'.repeat(64),evidenceSha256:'f'.repeat(64),qualified:false,observedAt:Date.now(),reviewedBy:'fixture reviewer'});
  db.raw.exec("CREATE TABLE obolus_commerce_holds(observation_id TEXT PRIMARY KEY,reason TEXT,detected_at TEXT); INSERT INTO obolus_commerce_holds VALUES('payment','refund',datetime('now'))");
  expect(assessExperimentOutcome(db.raw,'e')?.blockers).toEqual(expect.arrayContaining(['provider_payment_hold','qualified_customer_threshold_not_met','paid_order_threshold_not_met']));
  const count=db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_assessments').get();
  const agenda=economicMissionAgenda(other.raw);
  expect(agenda.actions).toContainEqual(expect.objectContaining({action:'review',experimentId:'e'}));
  expect(agenda.actions).not.toContainEqual(expect.objectContaining({action:'design_experiment',opportunityId:'o'}));
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_assessments').get()).toEqual(count);
  const time=vi.spyOn(Date,'now').mockReturnValue(Date.now()+2*3600000);
  expect(assessExperimentOutcome(db.raw,'e')?.paymentEvidence).toEqual([]);time.mockRestore();
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('completed'); // Historical completion is not current permission.
});

it('refuses preregistration after a zero-cost unresolved execution',()=>{
  db.raw.transaction(()=>reserveInferenceCost(db.raw,'fixture','e','mock',0)).immediate();
  expect(()=>registerOutcomeContract(db.raw,'e',contract)).toThrow('before any execution');
});
it('rolls back completion and assessment together on persistence failure',()=>{
  start();customers();payment();
  db.raw.exec("CREATE TRIGGER fixture_failure BEFORE UPDATE ON revenue_experiments WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'fixture write failure'); END");
  expect(()=>assessExperimentOutcome(other.raw,'e')).toThrow('fixture write failure');
  expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_outcome_assessments').get()).toEqual({n:0});
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('running');
});
it('exposes bounded operator commands and no agent tool for fabricating customer reviews',async()=>{
  const input=path.join(dir,'contract.json');fs.writeFileSync(input,JSON.stringify(contract));
  vi.spyOn(process.stdout,'write').mockImplementation(()=>true);
  const args=['outcome-contract','--database',file,'--experiment-id','e','--input',input];
  await expect(main(args)).rejects.toThrow('--apply');
  await main([...args,'--apply']);
  expect(createBuiltinTools("fixture-sandbox").some(t=>t.name==='revenue_assess_outcome')).toBe(true);
  expect(createBuiltinTools("fixture-sandbox").some(t=>/customer_evidence|outcome_contract/.test(t.name))).toBe(false);
  await main(['outcome-assess','--database',file,'--experiment-id','e','--apply']);
  expect(new RevenueStore(db.raw).getExperiment('e')?.status).toBe('planned');
});

it('connects mocked checkout, signed event, delivery, provider reconciliation, automatic demand decision and refund hold',async()=>{
  const taskId=start('live',false);customers();
  const commerceFile=path.join(dir,'commerce.db'),commerce=new Database(commerceFile);
  try{
    const session={id:'cs_live_fixture',livemode:true,client_reference_id:'order',amount_total:1000,currency:'chf',url:'https://checkout.stripe.com/c/pay/fixture',
      metadata:{aureus_order_id:'order'},payment_intent:'pi_fixture',mode:'payment',status:'complete',payment_status:'paid'};
    const provider=vi.fn(async(url:unknown)=>new Response(JSON.stringify(String(url).endsWith('/account')?
      {object:'account',id:'acct_fixture',charges_enabled:true,payouts_enabled:true}:String(url).includes('/payment_intents/')?
      {id:'pi_fixture',status:'succeeded',livemode:true,amount:1000,amount_received:1000,currency:'chf',latest_charge:{id:'ch_fixture',payment_intent:'pi_fixture',livemode:true,
        amount:1000,amount_captured:1000,currency:'chf',paid:true,captured:true,refunded:false,amount_refunded:0,disputed:false,
        balance_transaction:{id:'txn_fixture',source:'ch_fixture',type:'charge',currency:'chf',amount:1000,fee:59,net:941,status:'available',available_on:Math.floor(Date.now()/1000)}}}:session)));
    // Live-format fixtures exercise the live-mode decision branch; every request is mocked.
    const secret='whsec_synthetic_fixture_only';
    const checkout=new StripeCheckout(commerce,{mode:'live',allowLive:true,accountId:'acct_fixture',secretKey:'sk_live_fixture_not_a_key',webhookSecret:secret},provider);
    const {registerProductQuality,assessProductQuality}=await import('../commerce/product-quality.js');
    registerProductQuality(commerce,{productId:'product',format:'text',purpose:'Synthetic economic cycle',audience:'Fixture buyer',minBytes:1,maxBytes:100,requiredText:['Synthetic product'],forbiddenText:[],requiredJsonKeys:[]});
    assessProductQuality(commerce,'product','fixture.txt',Buffer.from('Synthetic product'));
    setSalesPaused(commerce,false);
    initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:4000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    registerBudgetPolicy(db.raw,{daily_cents:1000,hourly_cents:1000,session_cents:1000,call_cents:1000,halted:0,revision:1});
    new RevenueStore(db.raw).updateExperiment('e',{maxBudgetCents:10000,maxInferenceCostCents:10000});
    grantAdapterPermission(db.raw,{adapter:'local-product',experimentId:'e',maxCostUsdCents:0,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'});
    db.raw.exec("INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('other','o','running','foreign experiment',100,24,'success','failure','ceiling',datetime('now'))");
    grantAdapterPermission(db.raw,{adapter:'local-product',experimentId:'other',maxCostUsdCents:0,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'});
    vi.stubEnv('OBOLUS_COMMERCE_DB',commerceFile);vi.stubEnv('OPENAI_API_KEY','test-only');vi.spyOn(os,'homedir').mockReturnValue(dir);
    sdk.create.mockResolvedValue({choices:[{message:{content:null,tool_calls:[
      {id:'foreign',type:'function',function:{name:'revenue_register_local_product',arguments:JSON.stringify({operation_id:'op_foreign',experiment_id:'other',product_id:'foreign',filename:'fixture.txt',content:'Must not register'})}},
      {id:'product',type:'function',function:{name:'revenue_register_local_product',arguments:JSON.stringify({operation_id:'op_cycle_product',experiment_id:'e',product_id:'product',filename:'fixture.txt',content:'Synthetic product'})}},
      {id:'done',type:'function',function:{name:'task_done',arguments:JSON.stringify({summary:'Fixture product registered; demand separately verified',success:true})}}
    ]}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});
    const registry=new ModelRegistry(db.raw);registry.initialize();
    const inference=createWorkerInferenceBridge(new InferenceRouter(db.raw,registry,new InferenceBudgetTracker(db.raw,DEFAULT_MODEL_STRATEGY_CONFIG,1000)),
      new UnifiedInferenceClient(ProviderRegistry.fromConfig(path.join(dir,'no-config.json'))),'outcome-cycle');
    const identity=createTestIdentity(),config=createTestConfig(),conway=new MockConwayClient();
    const workerPool=new LocalWorkerPool({db:db.raw,inference,conway,harnessRegistry:new HarnessRegistry(),identity,config,allowedEditRoot:dir,maxTurns:1,
      tools:createBuiltinTools("fixture-sandbox"),toolContext:{db,identity,config,conway,inference:new MockInferenceClient()}});
    const task=getReadyTasks(db.raw).find(task=>task.id===taskId)!;assignTask(db.raw,taskId,'local://fixture');
    try{
      workerPool.spawn({...task,status:'assigned',assignedTo:'local://fixture'});
      await vi.waitFor(()=>expect(workerPool.getActiveCount()).toBe(0),{timeout:5000});
    }finally{await workerPool.shutdown();}
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(db.raw.prepare('SELECT status FROM task_graph WHERE id=?').get(taskId)).toEqual({status:'completed'});
    expect(commerce.prepare("SELECT experiment_id FROM obolus_product_experiments WHERE product_id='product'").get()).toEqual({experiment_id:'e'});
    expect(commerce.prepare("SELECT 1 FROM commerce_assets WHERE product_id='foreign'").get()).toBeUndefined();
    expect(db.raw.prepare("SELECT 1 FROM obolus_reserved_operations WHERE id='op_foreign'").get()).toBeUndefined();
    const workerCost=new RevenueStore(db.raw).getForecastVsActual('e')!.actualCostCents;
    expect(workerCost).toBeGreaterThan(0);
    db.close();db=createDatabase(file);
    expect(new RevenueStore(db.raw).getForecastVsActual('e')!.actualCostCents).toBe(workerCost);
    const delivery=new DigitalDelivery(commerce);
    const offer={orderId:'order',productId:'product',title:'Fixture',amountCents:1000,currency:'chf' as const,successUrl:'https://example.com/success',cancelUrl:'https://example.com/cancel',publication:fixturePublicationContext};
    fixtureSecurityReview(commerce,checkoutActionScope('acct_fixture',offer,commerce),Date.now(),PRODUCT_RELEASE_EVIDENCE);
    await checkout.checkout(offer);
    const event=(id:string,type:string,object:unknown)=>{
      const raw=Buffer.from(JSON.stringify({id,type,livemode:true,data:{object}})),timestamp=Math.floor(Date.now()/1000);
      const signature=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
      return checkout.webhook(raw,`t=${timestamp},v1=${signature}`);
    };
    event('evt_fixture','checkout.session.completed',session);
    expect(event('evt_fixture','checkout.session.completed',session)).toMatchObject({duplicate:true});
    const access=delivery.issue('order');expect(delivery.download(access.token).content.toString()).toBe('Synthetic product');
    await checkout.reconcile('order');attributeCommerceObservation(commerce,other.raw,'order','e');
    configureResearchDispatch(db.raw,1);
    const pool={spawn:vi.fn(),shutdown:vi.fn(async()=>{})},dispatcher=new ResearchDispatcher(db.raw,pool);
    await dispatcher.control('running');dispatcher.tick();
    expect(new RevenueStore(other.raw).getExperiment('e')?.status).toBe('completed');
    expect(pool.spawn).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledTimes(3);
    expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
    event('evt_refund','charge.refunded',{payment_intent:'pi_fixture',amount_refunded:1000,currency:'chf'});
    expect(syncCommerceHolds(commerce,other.raw)).toEqual({checked:1,held:1});
    expect(()=>delivery.download(access.token)).toThrow('unavailable');
    expect(previewExperimentOutcome(db.raw,'e')?.decision).toBe('review_required');
    expect(economicMissionAgenda(other.raw).actions).toContainEqual(expect.objectContaining({action:'review',experimentId:'e'}));
    expect(db.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_reconciled_cash'").get()).toBeUndefined();
  }finally{commerce.close();}
});
