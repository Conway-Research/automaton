import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import type {InferenceRouter} from '../inference/router.js';
import type {InferenceRequest} from '../types.js';
import {optimizationCaseSpec,optimizationSession,recordOptimizationResult,optimizationTrialRecipe} from './optimization-trials.js';
import {optimizationModelDigest} from './optimization-recipe.js';
import {reserveOptimizationBudget,settleOptimizationBudget,releaseUnexecutedOptimizationBudget} from './optimization-budget.js';
import {collectEfficiencyVerification} from '../inference/efficiency.js';

/** Deliberately narrow text-only benchmark. All inference still passes through the shared router. */
export interface OptimizationCaseRun {
 trialId:string;caseId:string;side:'baseline'|'candidate';messages:InferenceRequest['messages'];
 tier:InferenceRequest['tier'];taskType:InferenceRequest['taskType'];maxTokens:number;experimentId?:string;
}
export const optimizationInputDigest=(messages:InferenceRequest['messages'])=>createHash('sha256').update(JSON.stringify(messages)).digest('hex');
export async function runOptimizationCase(db:Database,router:InferenceRouter,input:OptimizationCaseRun,provider:Parameters<InferenceRouter['route']>[1]){
 if(!input||!['baseline','candidate'].includes(input.side)||!Array.isArray(input.messages)||input.messages.length<1||input.messages.length>20||
   Buffer.byteLength(JSON.stringify(input.messages),'utf8')>32768||!Number.isSafeInteger(input.maxTokens)||input.maxTokens<1||input.maxTokens>16384)
  throw Error('Bounded text comparison request required');
 for(const message of input.messages)if(!message||!['system','user','assistant'].includes(message.role)||typeof message.content!=='string'||
   Object.keys(message).some(k=>!['role','content'].includes(k)))throw Error('Text-only comparison messages required');
 // Keep caller mutation during the provider await from changing attribution or results.
 input={...input,messages:input.messages.map(m=>({...m}))};
 const spec=optimizationCaseSpec(db,input.trialId,input.caseId);
 if(!spec.qualityRule)throw Error('Machine-evaluated case required for automatic collection');
 if(optimizationInputDigest(input.messages)!==spec.inputDigest)throw Error('Input differs from registered case');
 const recipe=optimizationTrialRecipe(db,input.trialId,input.side);
 if(!recipe)throw Error('Preregister execution recipes before automatic collection');
 const selected=router.selectModel(input.tier,input.taskType);
 if(recipe.tier!==input.tier||recipe.taskType!==input.taskType||recipe.maxTokens!==input.maxTokens||!selected||
  recipe.modelId!==selected.modelId||recipe.provider!==selected.provider||recipe.modelDigest!==optimizationModelDigest(selected)||
  input.maxTokens>selected.maxTokens||input.maxTokens>selected.contextWindow)throw Error('Execution differs from registered recipe or model contract');
 const sessionId=optimizationSession(input.trialId,input.caseId,input.side);
 const claimed=db.transaction(()=>{
  db.exec(`CREATE TABLE IF NOT EXISTS obolus_optimization_attempts(session_id TEXT PRIMARY KEY,request_digest TEXT NOT NULL,status TEXT NOT NULL,result_digest TEXT);
    CREATE TRIGGER IF NOT EXISTS optimization_attempt_no_delete BEFORE DELETE ON obolus_optimization_attempts BEGIN SELECT RAISE(ABORT,'Attempt cannot be retried by deletion'); END;
    CREATE TRIGGER IF NOT EXISTS optimization_attempt_binding_immutable BEFORE UPDATE ON obolus_optimization_attempts WHEN NEW.session_id!=OLD.session_id OR NEW.request_digest!=OLD.request_digest BEGIN SELECT RAISE(ABORT,'Attempt binding immutable'); END;`);
  if(!(db.prepare('PRAGMA table_info(obolus_optimization_attempts)').all() as {name:string}[]).some(c=>c.name==='result_digest'))db.exec('ALTER TABLE obolus_optimization_attempts ADD COLUMN result_digest TEXT');
  db.exec("CREATE TRIGGER IF NOT EXISTS optimization_receipt_immutable BEFORE UPDATE ON obolus_optimization_attempts WHEN OLD.result_digest IS NOT NULL BEGIN SELECT RAISE(ABORT,'Execution receipt immutable'); END");
  db.exec("CREATE TRIGGER IF NOT EXISTS optimization_nonexecution_immutable BEFORE UPDATE ON obolus_optimization_attempts WHEN OLD.status='not_executed' BEGIN SELECT RAISE(ABORT,'Non-execution receipt immutable'); END");
  if(db.prepare('SELECT 1 FROM obolus_optimization_attempts WHERE session_id=?').get(sessionId))return false;
  if(db.prepare('SELECT 1 FROM inference_costs WHERE session_id=? LIMIT 1').get(sessionId)||db.prepare('SELECT 1 FROM inference_reservations WHERE session_id=? LIMIT 1').get(sessionId)||
    db.prepare('SELECT 1 FROM obolus_optimization_results WHERE trial_id=? AND case_id=? AND side=?').get(input.trialId,input.caseId,input.side))throw Error('Case already has execution or results');
  const digest=createHash('sha256').update(JSON.stringify({messages:input.messages,recipe,experimentId:input.experimentId??null})).digest('hex');
  const estimate=Math.ceil(selected.contextWindow/1000*selected.costPer1kInput/100+input.maxTokens/1000*selected.costPer1kOutput/100);
  reserveOptimizationBudget(db,input.trialId,sessionId,estimate);
  db.prepare("INSERT INTO obolus_optimization_attempts(session_id,request_digest,status) VALUES(?,?,'claimed')").run(sessionId,digest);return true;
 }).immediate();
 if(!claimed)return {sessionId,status:'already_claimed',retriesAuthorized:false};
 const update=(status:string)=>db.prepare('UPDATE obolus_optimization_attempts SET status=? WHERE session_id=?').run(status,sessionId);
 let invoked=false,closed=false;
 const guardedProvider:typeof provider=(messages,options)=>{
  if(closed)throw Error('Optimization provider boundary closed');
  invoked=true;return provider(messages,options);
 };
 const finishFailure=(finishReason?:string)=>{
  closed=true;
  if(!invoked){
   try{db.transaction(()=>releaseUnexecutedOptimizationBudget(db,sessionId)).immediate();
    return {sessionId,status:'not_executed',finishReason,releasedTrialReservation:true,retriesAuthorized:false};
   }catch{/* Conflicting evidence or failed persistence retains the hold. */}
  }
  update('requires_reconciliation');return {sessionId,status:'requires_reconciliation',finishReason,releasedTrialReservation:false,retriesAuthorized:false};
 };
 try{
  const response=await router.route({messages:input.messages,tier:input.tier,taskType:input.taskType,maxTokens:input.maxTokens,temperature:recipe.temperature,
    toolChoice:'none',responseFormat:{type:'text'},experimentId:input.experimentId,sessionId},guardedProvider);
  closed=true;
  if(['budget_exceeded','error','timeout'].includes(response.finishReason))return finishFailure(response.finishReason);
  // No returned tool call is executed. This flag covers text-only execution, not general semantic safety.
  const textOnly=!response.toolCalls?.length;
  db.transaction(()=>{
   recordOptimizationResult(db,{trialId:input.trialId,caseId:input.caseId,side:input.side,output:response.content,
     completed:response.finishReason==='stop',safetyPassed:textOnly});
   const row=db.prepare('SELECT digest FROM obolus_optimization_results WHERE trial_id=? AND case_id=? AND side=?').get(input.trialId,input.caseId,input.side) as {digest:string};
   settleOptimizationBudget(db,sessionId);
   db.prepare("UPDATE obolus_optimization_attempts SET status='recorded',result_digest=? WHERE session_id=?").run(row.digest,sessionId);
   collectEfficiencyVerification(db,input.trialId,input.caseId,input.side);
  }).immediate();
  return {sessionId,status:'recorded',model:response.model,provider:response.provider,retriesAuthorized:false,
    safetyScope:'No tool execution; not an independent semantic safety assessment'};
 }catch{return finishFailure();}
}
