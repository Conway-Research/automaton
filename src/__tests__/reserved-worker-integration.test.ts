import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase, getTaskById, insertTask } from "../state/database.js";
import { LocalWorkerPool } from "../orchestration/local-worker.js";
import { HarnessRegistry } from "../agent/harness-registry.js";
import { createGoal, decomposeGoal, getReadyTasks, assignTask } from "../orchestration/task-graph.js";
import { createTestConfig, createTestIdentity, MockConwayClient } from "./mocks.js";
import { ModelRegistry } from "../inference/registry.js";
import { InferenceRouter } from "../inference/router.js";
import { InferenceBudgetTracker } from "../inference/budget.js";
import { DEFAULT_MODEL_STRATEGY_CONFIG } from "../inference/types.js";
import { ProviderRegistry } from "../inference/provider-registry.js";
import { UnifiedInferenceClient } from "../inference/inference-client.js";
import { createWorkerInferenceBridge } from "../agent/worker-inference-bridge.js";
import { pendingInferenceCost } from "../inference/reservations.js";
import { RevenueStore } from "../revenue/store.js";
import { economicMissionAgenda } from "../revenue/mission.js";
import { createBuiltinTools } from "../agent/tools.js";
import type { ToolContext } from "../types.js";
import {ResearchStore} from '../revenue/research.js';
import {planResearchExperiment,handoffResearchTask,claimResearchTask,configureResearchDispatch} from '../revenue/research-handoff.js';
import {ResearchDispatcher} from '../orchestration/research-dispatch.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {OnlineRuntime} from '../online/runtime.js';
import {planGoal,type PlannerContext} from '../orchestration/planner.js';

const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: mock.create } }; } }));
let dir: string;
let db: ReturnType<typeof createDatabase>;
let second: ReturnType<typeof createDatabase>;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "aureus-worker-"));
  db = createDatabase(path.join(dir, "test.db")); second = createDatabase(path.join(dir, "test.db"));
  vi.stubEnv("OPENAI_API_KEY", "test-only"); mock.create.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); db.close(); second.close(); fs.rmSync(dir, { recursive: true }); });
function bridge(connection: typeof db, session: string, dailyLimit = 100) {
  const registry = new ModelRegistry(connection.raw); registry.initialize();
  return createWorkerInferenceBridge(new InferenceRouter(connection.raw, registry,
    new InferenceBudgetTracker(connection.raw, DEFAULT_MODEL_STRATEGY_CONFIG, dailyLimit)),
    new UnifiedInferenceClient(ProviderRegistry.fromConfig(path.join(dir, "no-config.json"))), session);
}
const request = { messages: [{ role: "user" as const, content: "validate" }], maxTokens: 100 };
it('bounds real local worker fanout and duplicate tasks before provider calls',async()=>{
 vi.spyOn(os,'homedir').mockReturnValue(dir);
 const goal=createGoal(db.raw,'Worker cap fixture','Temporary isolated workers');
 const tasks=['one','two','three'].map(title=>{
  insertTask(db.raw,{goalId:goal.id,title,description:'Fixture only',estimatedCostCents:10,maxRetries:0});
  return getReadyTasks(db.raw).find(t=>t.title===title)!;
 });
 const finishes:Array<(value:unknown)=>void>=[];
 mock.create.mockImplementation(()=>new Promise(resolve=>{finishes.push(resolve);}));
 const pool=new LocalWorkerPool({db:db.raw,inference:bridge(db,'bounded-worker',10000),conway:new MockConwayClient(),
  harnessRegistry:new HarnessRegistry(),identity:createTestIdentity(),config:createTestConfig({maxChildren:2}),allowedEditRoot:dir,maxTurns:1});
 try{
  pool.spawn(tasks[0]);expect(()=>pool.spawn(tasks[0])).toThrow('already has an active');
  pool.spawn(tasks[1]);expect(()=>pool.spawn(tasks[2])).toThrow('concurrency limit');
  await vi.waitFor(()=>expect(mock.create).toHaveBeenCalledTimes(2));
  expect(pool.getActiveCount()).toBe(2);
 }finally{
  for(const finish of finishes)finish({choices:[{message:{content:'Fixture complete'}}],usage:{prompt_tokens:10,completion_tokens:1,total_tokens:11}});
  await pool.shutdown();
 }
 expect(pool.getActiveCount()).toBe(0);
});
it('reserves planner costs through the shared router and blocks a competing planning connection',async()=>{
  const goal=createGoal(db.raw,'Plan fixture','No external execution');
  const context:PlannerContext={creditsCents:100,usdcBalance:0,survivalTier:'low_compute',availableRoles:['generalist'],customRoles:[],activeGoals:[],recentOutcomes:[],marketIntel:'Synthetic fixture',idleAgents:0,busyAgents:0,maxAgents:1,workspaceFiles:[]};
  const output={analysis:'Fixture',strategy:'Validate',customRoles:[],tasks:[{title:'Validate',description:'Check synthetic evidence',agentRole:'generalist',dependencies:[],estimatedCostCents:1,priority:1,timeoutMs:60000}],risks:['No real demand proved'],estimatedTotalCostCents:1,estimatedTimeMinutes:1};
  let finish!:(value:unknown)=>void;
  mock.create.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const first=bridge(db,'planner-one'),secondPlanner=bridge(second,'planner-two');
  const pending=planGoal(goal,context,{chat:params=>first.chat({...params,maxTokens:100})});
  expect(pendingInferenceCost(second.raw)).toBeGreaterThan(0);
  try{
    await expect(planGoal(goal,context,{chat:params=>secondPlanner.chat({...params,maxTokens:100})})).rejects.toThrow('Daily inference budget');
    expect(mock.create).toHaveBeenCalledOnce();
  }finally{finish({choices:[{message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}});}
  expect(await pending).toMatchObject({strategy:'Validate'});
  expect(pendingInferenceCost(second.raw)).toBe(0);
  expect(second.raw.prepare('SELECT session_id,input_tokens,output_tokens FROM inference_costs').all()).toEqual([{session_id:'planner-one',input_tokens:10,output_tokens:10}]);
});
it.each(['normal','discovered','economics','delegated','revoked','paused','emergency','uncertain'] as const)('runs research worker with control=%s',async(mode)=>{
  const revoked=mode==='revoked',interrupted=mode==='paused'||mode==='emergency';
  let dispatcher:ResearchDispatcher;
  let stopping:Promise<void>|undefined;
  const research=new ResearchStore(db.raw),store=new RevenueStore(db.raw);
  let researchId='fixture';
  if(mode==='discovered'){
    const request=vi.fn<typeof fetch>(async input=>{
      const url=String(input),time=Math.floor(Date.now()/1000)-60;
      if(url.includes('api.github.com'))return new Response(JSON.stringify({incomplete_results:false,items:[{html_url:'https://github.com/fixture/archive/issues/1',title:'Archive automation requested',body:'A distinct workflow needs validation',created_at:new Date(time*1000).toISOString()}]}));
      if(url.includes('askstories'))return new Response(JSON.stringify([1]));
      return new Response(JSON.stringify({type:'story',time,title:'Ask HN archive workflow',text:'Second synthetic demand report, not a paying customer'}));
    });
    const online=new OnlineRuntime(db.raw,request);
    online.enqueue('archive automation',{revenueCents:100000,costCents:1000,probability:0.5,days:7,validationBudgetCents:10000});
    online.control('start');expect(await online.tick()).toBe(1);online.control('pause');
    expect(request).toHaveBeenCalledTimes(3);
    researchId=research.rank()[0].id;
    expect(research.rank()[0].decision).toBe('hold');
    expect(db.raw.prepare('SELECT COUNT(*) n FROM revenue_experiments').get()).toEqual({n:0});
    expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
  }else research.import({opportunities:[{id:'fixture',title:'Archive pilot',sector:'b2b-services',hypothesis:'Reachable demand for archive repair',
    forecast:{revenueCents:100000,costCents:1000,probability:0.5,days:7,validationBudgetCents:10000}}],
    evidence:['one','two'].map((id,i)=>({id,opportunityId:'fixture',sourceUrl:`https://${id}.example/request`,observedAt:new Date().toISOString(),
      kind:'request',excerpt:`Offline fixture of distinct customer request ${i}`,provenance:'reported',reviewedBy:null}))});
  if(mode==='economics'){
    researchId=research.reviseEconomics(researchId,{currency:'USD',product:'Archive repair pilot',audience:'Archive operators',channel:'Permission-based pilot',offer:'Repair one archive',
      successCriterion:'One verified paying pilot',stopCriterion:'Stop at seven days without paid demand',priceCents:100000,deliveryCostCents:100,paymentFeeCents:50,
      refundAllowanceCents:50,taxAllowanceCents:100,acquisitionCostPerSaleCents:100,fixedTestCostCents:100,operatingCostCents:100,availableTestBudgetCents:10000,conservativeSales:1},0.5,7,'Complete fixture cost basis').id;
    expect(research.rank().find(x=>x.id===researchId)?.decision).toBe('hold');
  }
  for(const {id} of research.evidence())research.review(id,'fixture operator','accept','Synthetic fixture review, no real customer');
  const {experimentId}=planResearchExperiment(db.raw,researchId);
  const opportunityId=store.getExperiment(experimentId)!.opportunityId;
  store.updateOpportunity(opportunityId,{status:'validating'});
  store.updateExperiment(experimentId,{maxBudgetCents:10000,maxInferenceCostCents:10000});
  store.transitionExperimentStatus(experimentId,'running','Explicit fixture admission');
  initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:4000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(db.raw,{daily_cents:1000,hourly_cents:1000,session_cents:1000,call_cents:1000,halted:0,revision:1});
  const goal=createGoal(db.raw,'Validate fixture','Offline only');
  const {taskId}=handoffResearchTask(db.raw,experimentId,goal.id);
  configureResearchDispatch(db.raw,1);
  const childId=mode==='delegated'?insertTask(db.raw,{goalId:goal.id,parentId:taskId,title:'Verify delegated evidence',description:'Synthetic child, shared experiment budget',maxRetries:0}):null;
  expect(handoffResearchTask(second.raw,experimentId,goal.id)).toEqual({taskId,duplicate:true});
  const task=getReadyTasks(db.raw).find(t=>t.id===taskId)!;
  expect(JSON.parse(task.description).researchId).toBe(researchId);
  const output='No verified buyer; do not infer revenue from task completion';
  let economicsRead=false;
  mock.create.mockImplementation(async(params)=>{
    expect(pendingInferenceCost(second.raw,{experimentId})).toBeGreaterThan(0);
    if(mode==='uncertain')throw new Error('Fixture ambiguous provider failure');
    if(interrupted){
      stopping=dispatcher.control(mode as 'paused'|'emergency');
      expect(pendingInferenceCost(second.raw,{experimentId})).toBeGreaterThan(0);
    }
    if(mode==='economics'&&mock.create.mock.calls.length===1)return {
      choices:[{message:{content:null,tool_calls:[{id:'brief',type:'function',function:{name:'revenue_research_economics',arguments:JSON.stringify({action:'brief',opportunity_id:researchId})}}]}}],
      usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
    if(mode==='economics')economicsRead=JSON.stringify(params.messages).includes('profitabilityProven')&&JSON.stringify(params.messages).includes('grossOutlayCents');
    return {choices:[{message:{content:null,tool_calls:[{id:'done',type:'function',function:{name:'task_done',arguments:JSON.stringify({summary:output,success:true})}}]}}],
      usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
  });
  if(revoked)new ResearchStore(second.raw).review('one','fixture operator','reject','Withdrawn before worker dispatch');
  vi.spyOn(os,'homedir').mockReturnValue(dir);
  if(revoked){
    expect(()=>claimResearchTask(db.raw,experimentId,goal.id,'local://fixture')).toThrow('Research evidence');
    expect(getTaskById(second.raw,taskId)?.status).toBe('pending');
    // Exercise the independent router guard even if a legacy dispatcher assigns stale work.
    assignTask(db.raw,taskId,'local://fixture');
  }else if(!interrupted){
    expect(claimResearchTask(db.raw,experimentId,goal.id,'local://fixture')).toMatchObject({id:taskId,status:'assigned',assignedTo:'local://fixture'});
    expect(()=>claimResearchTask(second.raw,experimentId,goal.id,'local://competitor')).toThrow('already claimed');
  }
  if(!interrupted)expect(()=>assignTask(second.raw,taskId,'local://competitor')).toThrow('not assignable');
  const workerInference=bridge(db,'research-cycle',1000);
  const inferenceCalls=vi.spyOn(workerInference,'chat');
  const pool=new LocalWorkerPool({db:db.raw,inference:workerInference,conway:new MockConwayClient(),
    harnessRegistry:new HarnessRegistry(),identity:createTestIdentity(),config:createTestConfig(),allowedEditRoot:dir,maxTurns:mode==='economics'?2:1,
    ...(mode==='economics'?{tools:createBuiltinTools('fixture'),toolContext:{db} as unknown as ToolContext}:{})});
  if(interrupted){
    configureResearchDispatch(db.raw,1);
    dispatcher=new ResearchDispatcher(db.raw,pool);
    await dispatcher.control('running');
    expect(dispatcher.tick()?.task?.id).toBe(taskId);
  }else pool.spawn({...task,status:'assigned',assignedTo:'local://fixture'});
  try{
    await vi.waitFor(()=>expect(pool.getActiveCount()).toBe(0),{timeout:5000});await stopping;
    if(childId){
      configureResearchDispatch(db.raw,1);
      dispatcher=new ResearchDispatcher(db.raw,pool);
      await dispatcher.control('running');
      expect(dispatcher.tick()?.task?.id).toBe(childId);
      await vi.waitFor(()=>expect(pool.getActiveCount()).toBe(0),{timeout:5000});
      expect(getTaskById(second.raw,childId)?.status).toBe('completed');
      expect(store.getActiveExperimentForTask(childId,true)?.id).toBe(experimentId);
    }
  }finally{await pool.shutdown();}
  const providerCalls=revoked?0:childId||mode==='economics'?2:1;
  expect(mock.create).toHaveBeenCalledTimes(providerCalls);
  expect(inferenceCalls).toHaveBeenCalledTimes(childId||mode==='economics'?2:1);
  if(mode==='economics')expect(economicsRead).toBe(true);
  if(mode==='uncertain')expect(pendingInferenceCost(second.raw,{experimentId})).toBeGreaterThan(0);
  else expect(pendingInferenceCost(second.raw,{experimentId})).toBe(0);
  const accounting=store.getForecastVsActual(experimentId)!;
  expect(accounting).toMatchObject({actualRevenueCents:0,forecastBasis:'start-snapshot'});
  if(revoked){expect(accounting.actualCostCents).toBe(0);expect(getTaskById(second.raw,taskId)?.status).toBe('failed');}
  else if(mode==='uncertain'){
    expect(accounting.actualCostCents).toBe(0);
    expect(getTaskById(second.raw,taskId)?.status).toBe('failed');
    expect(store.getExperimentReview(experimentId)?.blockers).toContain('unresolved_inference_cost');
  }else if(interrupted){
    expect(accounting.actualCostCents).toBeGreaterThan(0);
    expect(getTaskById(second.raw,taskId)?.status).toBe('failed');
    expect(dispatcher!.tick()).toBeNull();
  }else{
    expect(accounting.actualCostCents).toBeGreaterThan(0);
    expect(getTaskById(second.raw,taskId)).toMatchObject({status:'completed',result:{success:true,output}});
    expect(store.getExperimentReview(experimentId)?.blockers).toEqual([]);
  }
  store.transitionExperimentStatus(experimentId,'failed','No verified paid demand');
  store.updateExperiment(experimentId,{lesson:revoked?'Withdrawn evidence blocks spending':'Completed research is not a paying customer'});
  db.close();second.close();db=createDatabase(path.join(dir,'test.db'));second=createDatabase(path.join(dir,'test.db'));
  expect(new RevenueStore(second.raw).getForecastVsActual(experimentId)).toEqual(accounting);
  if(mode==='uncertain')expect(pendingInferenceCost(second.raw,{experimentId})).toBeGreaterThan(0);
  expect(new RevenueStore(second.raw).getLearningContext().lessons[0]).toMatchObject({experimentId,status:'failed',verification:'unverified-ledger-claims'});
  await expect(bridge(db,'after-restart',1000).chat({...request,experimentId})).rejects.toThrow();
  expect(mock.create).toHaveBeenCalledTimes(providerCalls);
});
it("persists a ranked experiment, attributable worker cost and learning across restart", async () => {
  const store = new RevenueStore(db.raw);
  const create = (name: string, probabilitySuccess: number) => store.createOpportunity({
    goalId:null,name,niche:"museum archives",status:"validating",evidenceLevel:null,confidence:null,
    probabilitySuccess,expectedRevenueCents:1000,expectedCostCents:100,expectedNetValueCents:900,
    timeToRevenueDays:7,maxExperimentBudgetCents:100,focusRank:null,hypothesis:"Paid archive cleanup demand",
    killCondition:"No qualified buyer",nextAction:"Validate demand",
  });
  const selected=create("Archive metadata repair",.8), alternative=create("Archive image indexing",.1);
  expect(store.listFocusOpportunities().map(o=>o.id)).toEqual([selected,alternative]);
  const experimentId=store.createExperiment({
    opportunityId:selected,goalId:null,taskId:null,status:"running",hypothesis:"Reachable buyer",
    channel:"fixture",offer:"Archive repair",maxBudgetCents:10000,maxInferenceCostCents:10000,maxDurationHours:24,
    successCriteria:"One verified buyer",failureCriteria:"No qualified buyer",stopCondition:"24h or budget",
    forecastRevenueCents:1000,forecastCostCents:100,forecastProbabilitySuccess:.8,forecastTimeToRevenueHours:24,
    actualRevenueCents:0,actualCostCents:0,result:null,lesson:null,startedAt:new Date().toISOString(),completedAt:null,
  });
  expect(economicMissionAgenda(second.raw).actions[0]).toMatchObject({action:"continue_experiment",experimentId});
  expect(store.getExperimentReview(experimentId)?.blockers).toContain('missing_linked_task');
  const output="Unverified interest only; no buyer or payment evidence";
  mock.create.mockImplementation(async () => {
    const pendingReview=new RevenueStore(second.raw).getExperimentReview(experimentId)!;
    expect(pendingReview.blockers).toEqual(expect.arrayContaining(['tasks_unfinished','unresolved_inference_cost']));
    expect(pendingReview.unresolvedCostCents).toBeGreaterThan(0);
    return {choices:[{message:{content:null,tool_calls:[{id:"finish",type:"function",function:{name:"task_done",arguments:JSON.stringify({summary:output,success:true})}}]}}],
      usage:{prompt_tokens:10,completion_tokens:10,total_tokens:20}};
  });
  vi.spyOn(os,"homedir").mockReturnValue(dir);
  const goal=createGoal(db.raw,"Validate archive demand","Offline fixture only");
  decomposeGoal(db.raw,goal.id,[{parentId:null,goalId:goal.id,title:"Evaluate evidence",description:"Summarize the supplied fixture",status:"pending",assignedTo:null,agentRole:"researcher",priority:50,dependencies:[],result:null}]);
  const task=getReadyTasks(db.raw)[0];
  store.updateExperiment(experimentId,{goalId:goal.id,taskId:task.id});
  assignTask(db.raw,task.id,"local://fixture");
  expect(()=>assignTask(second.raw,task.id,"local://competitor")).toThrow("not assignable");
  const pool=new LocalWorkerPool({db:db.raw,inference:bridge(db,"economic-cycle",10000),conway:new MockConwayClient(),
    harnessRegistry:new HarnessRegistry(),identity:createTestIdentity(),config:createTestConfig(),allowedEditRoot:dir,maxTurns:1});
  pool.spawn({...task,status:"assigned",assignedTo:"local://fixture"});
  try {await vi.waitFor(()=>expect(pool.getActiveCount()).toBe(0),{timeout:5000});}
  finally {await pool.shutdown();}
  expect(getTaskById(second.raw,task.id)).toMatchObject({status:"completed",result:{success:true,output}});
  const review = store.getExperimentReview(experimentId)!;
  expect(review).toMatchObject({blockers:[],unresolvedCostCents:0,tasks:[{id:task.id,reportedSuccess:true,output}],events:[]});
  const snapshotTool=createBuiltinTools('test').find(t=>t.name==='revenue_get_snapshot')!;
  const snapshot=JSON.parse(await snapshotTool.execute({experiment_id:experimentId},{db} as ToolContext));
  expect(snapshot.experiment_review).toEqual(review);
  expect(JSON.parse(await snapshotTool.execute({experiment_id:experimentId,opportunity_id:alternative},{db} as ToolContext))).toMatchObject({ok:false,error:'experiment_opportunity_mismatch'});
  const updateTool=createBuiltinTools('test').find(t=>t.name==='revenue_update_experiment')!;
  await expect(updateTool.execute({experiment_id:experimentId,status:'completed',lesson:'premature',started_at:'2099-01-01T00:00:00Z'},{db} as ToolContext)).rejects.toThrow('immutable');
  expect(store.getExperiment(experimentId)).toMatchObject({status:'running',lesson:null,completedAt:null});
  expect(store.getExperiment(experimentId)?.status).toBe("running");
  expect(economicMissionAgenda(second.raw).actions).toContainEqual(expect.objectContaining({action:"review",experimentId}));
  expect(economicMissionAgenda(second.raw).actions).not.toContainEqual(expect.objectContaining({action:"continue_experiment",experimentId}));
  store.updateExperiment(experimentId,{status:"failed",result:output});
  expect(store.getForecastVsActual(experimentId)).toMatchObject({actualRevenueCents:0});
  expect(store.getForecastVsActual(experimentId)!.actualCostCents).toBeGreaterThan(0);
  const accounting=store.getForecastVsActual(experimentId);
  db.close();second.close();
  db=createDatabase(path.join(dir,"test.db"));second=createDatabase(path.join(dir,"test.db"));
  const reopened=new RevenueStore(db.raw);
  expect(reopened.getForecastVsActual(experimentId)).toEqual(accounting);
  expect(reopened.getExperimentReview(experimentId)).toEqual(review);
  expect(pendingInferenceCost(second.raw)).toBe(0);
  expect(economicMissionAgenda(second.raw).actions).toContainEqual(expect.objectContaining({action:"review",experimentId}));
  reopened.updateExperiment(experimentId,{lesson:"Interest is not payment; validate a different buyer channel"});
  expect(economicMissionAgenda(second.raw).actions).toContainEqual(expect.objectContaining({action:"design_experiment",opportunityId:selected}));
  await expect(bridge(db,"terminal").chat({...request,experimentId})).rejects.toThrow();
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(reopened.getForecastVsActual(experimentId)).toEqual(accounting);
});
it("runs two worker bridges through real routers and the unified client with one mocked SDK call", async () => {
  let finish!: (value: unknown) => void;
  mock.create.mockImplementation((_payload, options) => {
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    return new Promise(resolve => { finish = resolve; });
  });
  const a = bridge(db, "a"), b = bridge(second, "b");
  const pending = a.chat(request);
  expect(pendingInferenceCost(second.raw)).toBeGreaterThan(50);
  await expect(b.chat(request)).rejects.toThrow("Daily inference budget");
  finish({ choices: [{ message: { content: "done" } }], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } });
  expect(await pending).toMatchObject({ content: "done" });
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(mock.create.mock.calls[0][0]).toMatchObject({ model: "gpt-5-mini", max_completion_tokens: 100 });
  expect(pendingInferenceCost(second.raw)).toBe(0);
});
it("does not retry an ambiguous worker failure and blocks the competing worker", async () => {
  mock.create.mockRejectedValue(Object.assign(new Error("unavailable"), { status: 503 }));
  await expect(bridge(db, "a").chat(request)).rejects.toThrow("unavailable");
  await expect(bridge(second, "b").chat(request)).rejects.toThrow("Daily inference budget");
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(pendingInferenceCost(second.raw)).toBeGreaterThan(50);
});
