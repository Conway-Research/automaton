import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {createDatabase} from '../state/database.js';
import {InferenceRouter} from '../inference/router.js';import {InferenceBudgetTracker} from '../inference/budget.js';import {ModelRegistry} from '../inference/registry.js';import {DEFAULT_MODEL_STRATEGY_CONFIG} from '../inference/types.js';
import {registerOptimizationTrial,assessOptimizationTrial} from '../revenue/optimization-trials.js';
import {runOptimizationCase,optimizationInputDigest,type OptimizationCaseRun} from '../revenue/optimization-runner.js';
import {optimizationModelDigest} from '../revenue/optimization-recipe.js';
let dir:string,file:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>;
const messages=(i:number)=>[{role:'user' as const,content:`Return fixture answer ${i}`}];
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-runner-'));file=path.join(dir,'test.db');db=createDatabase(file);other=createDatabase(file);});
afterEach(()=>{db.close();other.close();fs.rmSync(dir,{recursive:true,force:true});});
function router(connection=db,limit=10000){const registry=new ModelRegistry(connection.raw);registry.initialize();return new InferenceRouter(connection.raw,registry,new InferenceBudgetTracker(connection.raw,DEFAULT_MODEL_STRATEGY_CONFIG,limit));}
function trial(maxInferenceCostCents=10000):OptimizationCaseRun {
 const selected=router().selectModel('low_compute','agent_turn')!;
 const recipe={tier:'low_compute' as const,taskType:'agent_turn' as const,maxTokens:100,temperature:0,modelId:selected.modelId,provider:selected.provider,modelDigest:optimizationModelDigest(selected)};
 const {trialId}=registerOptimizationTrial(db.raw,{datasetDigest:'a'.repeat(64),criteriaDigest:'b'.repeat(64),baseline:'baseline',candidate:'candidate',minimumQuality:100,maximumQualityDrop:0,minimumSavingsPercent:10,maximumLatencyRatio:10,
 recipes:{baseline:recipe,candidate:{...recipe,maxTokens:80}},phase:'exploration',maxInferenceCostCents,
 cases:[0,1,2].map(i=>({id:`case-${i}`,inputDigest:optimizationInputDigest(messages(i)),qualityRule:{kind:'exact-output-sha256-v1',expectedOutputDigest:createHash('sha256').update('answer').digest('hex'),maxOutputBytes:50}}))});
 return {trialId,caseId:'case-0',side:'baseline',messages:messages(0),tier:'low_compute',taskType:'agent_turn',maxTokens:100};
}
const response=()=>({message:{content:'answer'},usage:{promptTokens:10,completionTokens:5},finishReason:'stop'});
it('collects the actual routed response and costs without accepting a free-form score',async()=>{
 const request=trial(),provider=vi.fn(async()=>response());
 expect(await runOptimizationCase(db.raw,router(),request,provider)).toMatchObject({status:'recorded'});
 expect(provider).toHaveBeenCalledOnce();
 const result=JSON.parse((db.raw.prepare('SELECT payload FROM obolus_optimization_results').get() as {payload:string}).payload);
 expect(result).toMatchObject({qualityScore:100,completed:true,qualityBasis:'registered-output-digest-v1'});expect(result.costCents).toBeGreaterThan(0);
 expect(assessOptimizationTrial(db.raw,request.trialId).pending).toHaveLength(5);
 expect(assessOptimizationTrial(db.raw,request.trialId).collection).toEqual({directlyCollected:1,expected:6,allDirectlyCollected:false});
 expect(()=>db.raw.exec("UPDATE obolus_optimization_attempts SET result_digest='changed'")).toThrow('receipt immutable');
});
it('claims once across concurrent connections and does not repeat work after restart',async()=>{
 const request=trial();let resolve!:(value:any)=>void;
 const provider=vi.fn(()=>new Promise<any>(r=>{resolve=r;}));const pending=runOptimizationCase(db.raw,router(),request,provider);
 expect(await runOptimizationCase(other.raw,router(other),request,provider)).toMatchObject({status:'already_claimed'});
 resolve(response());expect(await pending).toMatchObject({status:'recorded'});expect(provider).toHaveBeenCalledOnce();
 db.close();db=createDatabase(file);expect(await runOptimizationCase(db.raw,router(),request,provider)).toMatchObject({status:'already_claimed'});
});
it('keeps ambiguous provider failures reserved and refuses automatic retry',async()=>{
 const request=trial(),provider=vi.fn(async()=>{throw Error('private provider error');});
 const first=await runOptimizationCase(db.raw,router(),request,provider);expect(first).toMatchObject({status:'requires_reconciliation'});
 expect(JSON.stringify(first)).not.toContain('private');expect(db.raw.prepare("SELECT COUNT(*) n FROM inference_reservations WHERE status='pending'").get()).toEqual({n:1});
 expect(db.raw.prepare('SELECT actual_cents FROM obolus_optimization_budget_holds').get()).toEqual({actual_cents:null});
 expect(await runOptimizationCase(other.raw,router(other),request,provider)).toMatchObject({status:'already_claimed'});expect(provider).toHaveBeenCalledOnce();
});
it('respects shared budget denial without calling the provider or recording a fake success',async()=>{
 const request=trial(),provider=vi.fn(async()=>response());expect(await runOptimizationCase(db.raw,router(db,0),request,provider)).toMatchObject({status:'not_executed',finishReason:'budget_exceeded',releasedTrialReservation:true});
 expect(provider).not.toHaveBeenCalled();expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_optimization_results').get()).toEqual({n:0});
 expect(db.raw.prepare('SELECT daily_cents FROM inference_budget_policy WHERE id=1').get()).toEqual({daily_cents:0});
});
it('rejects changed input before claiming or calling a provider',async()=>{
 const request=trial(),provider=vi.fn(async()=>response());await expect(runOptimizationCase(db.raw,router(),{...request,messages:messages(9)},provider)).rejects.toThrow('Input differs');expect(provider).not.toHaveBeenCalled();
});
it('records a wrong answer and returned tool calls as failed checks without executing a tool',async()=>{
 const request=trial(),provider=vi.fn(async()=>({...response(),message:{content:'wrong'},toolCalls:[{name:'transfer'}]}));
 expect(await runOptimizationCase(db.raw,router(),request,provider)).toMatchObject({status:'recorded'});
 const saved=JSON.parse((db.raw.prepare('SELECT payload FROM obolus_optimization_results').get() as {payload:string}).payload);
 expect(saved).toMatchObject({qualityScore:0,safetyPassed:false});expect(db.raw.prepare('SELECT COUNT(*) n FROM tool_calls').get()).toEqual({n:0});
});
it('rejects changed execution settings and model pricing before reserving or invoking providers',async()=>{
 const request=trial(),r=router(),provider=vi.fn(async()=>response());
 for(const changed of [{maxTokens:101},{tier:'normal' as const},{taskType:'planning' as const}])
  await expect(runOptimizationCase(db.raw,r,{...request,...changed},provider)).rejects.toThrow('registered recipe');
 db.raw.exec('UPDATE model_registry SET cost_per_1k_input=cost_per_1k_input+1');
 await expect(runOptimizationCase(db.raw,r,request,provider)).rejects.toThrow('model contract');
 expect(provider).not.toHaveBeenCalled();expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
it('uses preregistered sampling and protects attribution against caller mutation during await',async()=>{
 const request=trial();let resolve!:(value:any)=>void;
 const provider=vi.fn((_messages:any,options:any)=>{expect(options.temperature).toBe(0);expect(options.toolChoice).toBe('none');return new Promise<any>(r=>{resolve=r;});});
 const originalId=request.trialId;const pending=runOptimizationCase(db.raw,router(),request,provider);
 request.side='candidate';request.caseId='case-1';request.trialId='changed';request.messages[0].content='changed';resolve(response());
 expect(await pending).toMatchObject({status:'recorded'});
 expect(db.raw.prepare('SELECT trial_id,case_id,side FROM obolus_optimization_results').get()).toEqual({trial_id:originalId,case_id:'case-0',side:'baseline'});
});
it('rolls back result collection if the durable receipt cannot be recorded',async()=>{
 const request=trial();let resolve!:(value:any)=>void;
 const provider=vi.fn(()=>new Promise<any>(r=>{resolve=r;}));const pending=runOptimizationCase(db.raw,router(),request,provider);
 db.raw.exec("CREATE TRIGGER fixture_receipt_failure BEFORE UPDATE ON obolus_optimization_attempts WHEN NEW.result_digest IS NOT NULL BEGIN SELECT RAISE(ABORT,'fixture receipt failure'); END");
 resolve(response());expect(await pending).toMatchObject({status:'requires_reconciliation'});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_optimization_results').get()).toEqual({n:0});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_costs').get()).toEqual({n:1});
 expect(await runOptimizationCase(other.raw,router(other),request,provider)).toMatchObject({status:'already_claimed'});
});
it('migrates old attempt storage without treating historical claims as collection receipts',async()=>{
 db.raw.exec("CREATE TABLE obolus_optimization_attempts(session_id TEXT PRIMARY KEY,request_digest TEXT NOT NULL,status TEXT NOT NULL);INSERT INTO obolus_optimization_attempts VALUES('historical','old','recorded')");
 const request=trial();expect(await runOptimizationCase(db.raw,router(),request,async()=>response())).toMatchObject({status:'recorded'});
 expect(db.raw.prepare("SELECT status,result_digest FROM obolus_optimization_attempts WHERE session_id='historical'").get()).toEqual({status:'recorded',result_digest:null});
});
it('enforces one persistent trial ceiling across parallel routers and frees only settled capacity',async()=>{
 const r=router(),selected=r.selectModel('low_compute','agent_turn')!;
 const ceiling=Math.ceil(selected.contextWindow/1000*selected.costPer1kInput/100+100/1000*selected.costPer1kOutput/100);
 const request=trial(ceiling);let resolve!:(value:any)=>void;const provider=vi.fn(()=>new Promise<any>(r=>{resolve=r;}));
 const first=runOptimizationCase(db.raw,r,request,provider);
 const next={...request,caseId:'case-1',messages:messages(1)};
 await expect(runOptimizationCase(other.raw,router(other),next,provider)).rejects.toThrow('trial cost ceiling');expect(provider).toHaveBeenCalledOnce();
 resolve(response());expect(await first).toMatchObject({status:'recorded'});
 const hold=db.raw.prepare('SELECT actual_cents FROM obolus_optimization_budget_holds').get() as {actual_cents:number};expect(hold.actual_cents).toBeGreaterThan(0);
 // Entire ceiling was the first reservation. Its real cost plus another full reservation still cannot fit.
 db.close();db=createDatabase(file);
 await expect(runOptimizationCase(db.raw,router(),next,provider)).rejects.toThrow('trial cost ceiling');
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_optimization_attempts').get()).toEqual({n:1});
});
it('retains trial holds after failures and blocks changed settled accounting before new spending',async()=>{
 const request=trial(),r=router();expect(await runOptimizationCase(db.raw,r,request,async()=>response())).toMatchObject({status:'recorded'});
 db.raw.exec('UPDATE inference_costs SET cost_cents=cost_cents+1');const provider=vi.fn(async()=>response());
 await expect(runOptimizationCase(db.raw,r,{...request,caseId:'case-1',messages:messages(1)},provider)).rejects.toThrow('accounting changed');expect(provider).not.toHaveBeenCalled();
});
it('does not ignore costs recorded outside the trial reservation path',async()=>{
 const request=trial();const {optimizationSession}=await import('../revenue/optimization-trials.js');
 const foreign=optimizationSession(request.trialId,'case-1','candidate');
 db.raw.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES('foreign',?,'fixture','other',10,1,'low_compute','agent_turn')").run(foreign);
 const provider=vi.fn(async()=>response());await expect(runOptimizationCase(db.raw,router(),request,provider)).rejects.toThrow('Unreserved trial');expect(provider).not.toHaveBeenCalled();
});
it('releases only the unused trial capacity while preserving non-execution across restart',async()=>{
 const selected=router().selectModel('low_compute','agent_turn')!;
 const estimate=Math.ceil(selected.contextWindow/1000*selected.costPer1kInput/100+100/1000*selected.costPer1kOutput/100);
 const request=trial(estimate),provider=vi.fn(async()=>response());
 const rejecting=router();vi.spyOn(rejecting,'route').mockResolvedValue({finishReason:'budget_exceeded'} as any);
 expect(await runOptimizationCase(db.raw,rejecting,request,provider)).toMatchObject({status:'not_executed'});
 expect(db.raw.prepare('SELECT actual_cents FROM obolus_optimization_budget_holds').get()).toEqual({actual_cents:0});
 expect(assessOptimizationTrial(db.raw,request.trialId).pending.find(p=>p.caseId===request.caseId&&p.side===request.side)?.attemptStatus).toBe('not_executed');
 expect(()=>db.raw.exec("UPDATE obolus_optimization_attempts SET status='claimed'")).toThrow('Non-execution receipt immutable');
 db.close();db=createDatabase(file);
 expect(await runOptimizationCase(db.raw,router(),request,provider)).toMatchObject({status:'already_claimed'});expect(provider).not.toHaveBeenCalled();
 expect(await runOptimizationCase(other.raw,router(other),{...request,caseId:'case-1',messages:messages(1)},provider)).toMatchObject({status:'recorded'});
 expect(provider).toHaveBeenCalledOnce();
});
it('closes the provider boundary before releasing so a delayed invocation cannot spend afterwards',async()=>{
 const request=trial(),r=router(),provider=vi.fn(async()=>response());let late!:Parameters<InferenceRouter['route']>[1];
 vi.spyOn(r,'route').mockImplementation(async(_request,callback)=>{late=callback;return {finishReason:'budget_exceeded'} as any;});
 expect(await runOptimizationCase(db.raw,r,request,provider)).toMatchObject({status:'not_executed'});
 expect(()=>late([],{})).toThrow('boundary closed');expect(provider).not.toHaveBeenCalled();
});
it('retains reservation when any inference evidence conflicts with non-execution, including zero-cost holds',async()=>{
 const request=trial(),r=router(),provider=vi.fn(async()=>response());
 vi.spyOn(r,'route').mockImplementation(async(req)=>{
  db.raw.prepare("INSERT INTO inference_reservations(id,session_id,model,reserved_cents) VALUES('conflict',?,'fixture',0)").run(req.sessionId);
  return {finishReason:'budget_exceeded'} as any;
 });
 expect(await runOptimizationCase(db.raw,r,request,provider)).toMatchObject({status:'requires_reconciliation',releasedTrialReservation:false});
 expect(db.raw.prepare('SELECT actual_cents FROM obolus_optimization_budget_holds').get()).toEqual({actual_cents:null});expect(provider).not.toHaveBeenCalled();
});
it('rolls back both non-execution and release when persistence fails',async()=>{
 const request=trial(),r=router();
 vi.spyOn(r,'route').mockImplementation(async()=>{
  db.raw.exec("CREATE TRIGGER fixture_release_failure BEFORE UPDATE ON obolus_optimization_budget_holds BEGIN SELECT RAISE(ABORT,'fixture'); END");
  return {finishReason:'budget_exceeded'} as any;
 });
 expect(await runOptimizationCase(db.raw,r,request,async()=>response())).toMatchObject({status:'requires_reconciliation'});
 expect(db.raw.prepare('SELECT actual_cents FROM obolus_optimization_budget_holds').get()).toEqual({actual_cents:null});
 expect(db.raw.prepare('SELECT status FROM obolus_optimization_attempts').get()).toEqual({status:'requires_reconciliation'});
});
it('rejects late accounting against a released non-execution claim before further spending',async()=>{
 const request=trial(),r=router();vi.spyOn(r,'route').mockResolvedValue({finishReason:'budget_exceeded'} as any);
 const outcome=await runOptimizationCase(db.raw,r,request,async()=>response());expect(outcome.status).toBe('not_executed');
 db.raw.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES('late',?,'fixture','other',0,0,'low_compute','agent_turn')").run(outcome.sessionId);
 const provider=vi.fn(async()=>response());
 await expect(runOptimizationCase(other.raw,router(other),{...request,caseId:'case-1',messages:messages(1)},provider)).rejects.toThrow('Non-execution evidence conflicts');expect(provider).not.toHaveBeenCalled();
});
