import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {createDatabase} from '../state/database.js';
import {InferenceRouter} from '../inference/router.js';
import {InferenceBudgetTracker} from '../inference/budget.js';
import {ModelRegistry} from '../inference/registry.js';
import {DEFAULT_MODEL_STRATEGY_CONFIG} from '../inference/types.js';
import {efficiencySnapshot,chooseEfficientModel} from '../inference/efficiency.js';
import {registerOptimizationTrial} from '../revenue/optimization-trials.js';
import {runOptimizationCase,optimizationInputDigest} from '../revenue/optimization-runner.js';
import {optimizationModelDigest} from '../revenue/optimization-recipe.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const messages=(i:number)=>[{role:'user' as const,content:`Return verified fixture ${i}`}];
const response=(content='answer')=>({message:{content},usage:{promptTokens:10000,completionTokens:5},finishReason:'stop'});
function setup(){const db=createDatabase(':memory:'),registry=new ModelRegistry(db.raw);registry.initialize();
 for(const id of ['gpt-5.2','gpt-5-mini'])registry.upsert({...registry.get(id)!,contextWindow:20000});
 const router=new InferenceRouter(db.raw,registry,new InferenceBudgetTracker(db.raw,DEFAULT_MODEL_STRATEGY_CONFIG,10000));
 return {db,registry,router};}
async function teach(env:ReturnType<typeof setup>,bad=false){
 const {db,registry,router}=env;
 for(let n=0;n<3;n++){
  const recipe=(tier:'normal'|'low_compute')=>{const m=router.selectModel(tier,'agent_turn')!;return {tier,taskType:'agent_turn' as const,maxTokens:100,temperature:0,modelId:m.modelId,provider:m.provider,modelDigest:optimizationModelDigest(m)};};
  const trial=registerOptimizationTrial(db.raw,{datasetDigest:hash(`dataset-${n}`),criteriaDigest:hash('exact-answer'),baseline:'default',candidate:'economical',
   minimumQuality:100,maximumQualityDrop:0,minimumSavingsPercent:10,maximumLatencyRatio:10,maxInferenceCostCents:1000,
   recipes:{baseline:recipe('normal'),candidate:recipe('low_compute')},cases:[0,1,2].map(i=>({id:`case-${i}`,inputDigest:optimizationInputDigest(messages(i)),
    qualityRule:{kind:'exact-output-sha256-v1' as const,expectedOutputDigest:hash('answer'),maxOutputBytes:100}}))});
  for(const side of ['baseline','candidate'] as const)for(let i=0;i<3;i++){
   const result=await runOptimizationCase(db.raw,router,{trialId:trial.trialId,caseId:`case-${i}`,side,messages:messages(i),tier:side==='baseline'?'normal':'low_compute',taskType:'agent_turn',maxTokens:100},async()=>response(bad&&side==='candidate'?'wrong':'answer'));
   expect(result.status).toBe('recorded');
  }
 }
 return {baseline:registry.get('gpt-5.2')!,candidate:registry.get('gpt-5-mini')!};
}
const request={messages:messages(0),taskType:'agent_turn' as const,tier:'normal' as const,sessionId:'new-work',maxTokens:100,temperature:0,toolChoice:'none' as const,responseFormat:{type:'text' as const}};
it('learns a cheaper sufficient model through actual router -> provider -> machine check -> durable receipt',async()=>{
 const env=setup();try{
  const before=await env.router.route(request,async()=>response());expect(before.model).toBe('gpt-5.2');
  const {baseline,candidate}=await teach(env);
  const provider=vi.fn(async()=>response());const after=await env.router.route({...request,sessionId:'next-work'},provider);
  expect(after.model).toBe('gpt-5-mini');expect(after.costCents).toBeLessThan(before.costCents);expect(after.content).toBe(before.content);
  expect(provider).toHaveBeenCalledOnce();
  expect(efficiencySnapshot(env.db.raw)).toMatchObject({attempts:20,unknownCosts:0,actualCostCents:null,realizedExternalSavings:null});
  expect(chooseEfficientModel(env.db.raw,{...request,messages:messages(999)},baseline,[candidate])).toEqual(baseline);
  expect(chooseEfficientModel(env.db.raw,request,baseline,[{...candidate,provider:'other'}])).toEqual(baseline);
  expect(chooseEfficientModel(env.db.raw,request,baseline,[{...candidate,costPer1kInput:candidate.costPer1kInput+1}])).toEqual(baseline);
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate],Date.now()+8*86400000)).toEqual(baseline);
  const changedGenesis=new InferenceRouter(env.db.raw,env.registry,new InferenceBudgetTracker(env.db.raw,DEFAULT_MODEL_STRATEGY_CONFIG,10000),'Changed authoritative context');
  expect((await changedGenesis.route(request,async()=>response())).model).toBe('gpt-5.2');
  await expect(env.router.route(request,async()=>{throw Error('new candidate failure');})).rejects.toThrow('new candidate failure');
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate])).toEqual(baseline);
  env.db.raw.exec('UPDATE inference_budget_policy SET halted=1');
  expect((await env.router.route(request,provider)).finishReason).toBe('budget_exceeded');expect(provider).toHaveBeenCalledOnce();
 }finally{env.db.close();}
});
it('cheap failing models never displace adequate models or mandatory safety checks',async()=>{
 const env=setup();try{const {baseline,candidate}=await teach(env,true);
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate])).toEqual(baseline);
  expect(chooseEfficientModel(env.db.raw,{...request,taskType:'safety_check'},baseline,[candidate])).toEqual(baseline);
 }finally{env.db.close();}
});
it('rejects newly degraded cheap output, records its cost, and invalidates the learned route without retry',async()=>{
 const env=setup();try{
  const {baseline,candidate}=await teach(env);
  const provider=vi.fn(async()=>({...response('wrong'),usage:{promptTokens:10000,completionTokens:5,cachedPromptTokens:4000}}));
  const result=await env.router.route(request,provider);
  expect(result.model).toBe(candidate.modelId);expect(result.finishReason).toBe('error');expect(result.content).not.toBe('wrong');
  expect(result.costCents).toBeGreaterThan(0);expect(result.toolCalls).toBeUndefined();expect(provider).toHaveBeenCalledOnce();
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate])).toEqual(baseline);
  const measurement=JSON.parse((env.db.raw.prepare("SELECT r.payload FROM efficiency_results r JOIN efficiency_observations o ON o.id=r.id WHERE o.session_id=?").get(request.sessionId) as {payload:string}).payload);
  expect(measurement).toMatchObject({status:'failed',qualityVerified:false,costState:'ESTIMATED_COST',actualCostCents:null,cachedInputTokens:4000});
  expect(env.db.raw.prepare("SELECT COUNT(*) n FROM inference_reservations WHERE session_id=? AND status='pending'").get(request.sessionId)).toEqual({n:0});
 }finally{env.db.close();}
});
it('corrected accounting invalidates historical promotion evidence',async()=>{
 const env=setup();try{
  const {baseline,candidate}=await teach(env);
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate])).toEqual(candidate);
  env.db.raw.prepare('UPDATE inference_costs SET cost_cents=cost_cents+1 WHERE model=?').run(candidate.modelId);
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate])).toEqual(baseline);
 }finally{env.db.close();}
});
it('a new latency spike withdraws a promoted route and tools never use learned text shortcuts',async()=>{
 const env=setup();let clock:ReturnType<typeof vi.spyOn>|undefined;try{
  const {baseline,candidate}=await teach(env);
  expect(chooseEfficientModel(env.db.raw,{...request,tools:[{type:'function',function:{name:'mandatory_check',description:'Required check',parameters:{}}}]},baseline,[candidate])).toEqual(baseline);
  let now=Date.now();clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
  const result=await env.router.route(request,async()=>{now+=1000;return response();});
  expect(result.model).toBe(candidate.modelId);expect(result.finishReason).toBe('stop');
  expect(chooseEfficientModel(env.db.raw,request,baseline,[candidate])).toEqual(baseline);
 }finally{clock?.mockRestore();env.db.close();}
});
it('missing costs remain unknown, failed attempts retain holds and cannot be relabeled as free work',async()=>{
 const env=setup();try{
  await expect(env.router.route(request,async()=>{throw Error('offline provider failure');})).rejects.toThrow();
  expect(efficiencySnapshot(env.db.raw)).toMatchObject({attempts:1,unknownCosts:1,actualCostCents:null});
  expect(env.db.raw.prepare("SELECT COUNT(*) n FROM inference_reservations WHERE status='pending'").get()).toEqual({n:1});
  expect(()=>env.db.raw.exec("UPDATE efficiency_results SET payload='{}'")).toThrow('immutable');
 }finally{env.db.close();}
});
