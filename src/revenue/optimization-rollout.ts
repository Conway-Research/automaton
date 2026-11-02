import {createHash} from 'node:crypto';
import type {Database} from 'better-sqlite3';
import type {InferenceRouter} from '../inference/router.js';
import type {InferenceRequest} from '../types.js';
import {assessOptimizationPayback,type OptimizationPaybackInput} from './optimization-payback.js';
import {optimizationTrialRecipe,optimizationCaseSpec} from './optimization-trials.js';
import {optimizationModelDigest} from './optimization-recipe.js';
import {RevenueStore} from './store.js';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function executeCoordinatorRollout(db:Database,router:InferenceRouter,assignee:string,tier:InferenceRequest['tier'],
 input:{rolloutId:string;operationId:string;caseId:string;messages:InferenceRequest['messages']},provider:Parameters<InferenceRouter['route']>[1]){
 const assigned=new RevenueStore(db).getActiveExperimentForAssignee(assignee,true);
 if(!assigned||assigned.status!=='running')throw Error('A running coordinator experiment is required for rollout execution');
 return runOptimizationRollout(db,router,{...input,experimentId:assigned.id,currentTier:tier},provider);
}
interface Limits {maxRuns:number;maxCostCents:number;expiresAt:number}
function schema(db:Database){db.exec(`
 CREATE TABLE IF NOT EXISTS obolus_optimization_rollouts(id TEXT PRIMARY KEY,payload TEXT NOT NULL,digest TEXT NOT NULL,status TEXT NOT NULL,reason TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS optimization_rollout_one_per_trial ON obolus_optimization_rollouts(json_extract(payload,'$.scenario.trialId'));
 CREATE TABLE IF NOT EXISTS obolus_optimization_rollout_runs(id TEXT PRIMARY KEY,rollout_id TEXT NOT NULL,request_digest TEXT NOT NULL,session_id TEXT NOT NULL UNIQUE,reserved_cents INTEGER NOT NULL,actual_cents INTEGER,status TEXT NOT NULL,output_digest TEXT);
 CREATE TRIGGER IF NOT EXISTS rollout_config_immutable BEFORE UPDATE ON obolus_optimization_rollouts WHEN NEW.id!=OLD.id OR NEW.payload!=OLD.payload OR NEW.digest!=OLD.digest OR OLD.status!='active' BEGIN SELECT RAISE(ABORT,'Rollout immutable or terminal'); END;
 CREATE TRIGGER IF NOT EXISTS rollout_no_delete BEFORE DELETE ON obolus_optimization_rollouts BEGIN SELECT RAISE(ABORT,'Rollout history immutable'); END;
 CREATE TRIGGER IF NOT EXISTS rollout_run_immutable BEFORE UPDATE ON obolus_optimization_rollout_runs WHEN NEW.id!=OLD.id OR NEW.rollout_id!=OLD.rollout_id OR NEW.request_digest!=OLD.request_digest OR NEW.session_id!=OLD.session_id OR NEW.reserved_cents!=OLD.reserved_cents OR OLD.status!='claimed' BEGIN SELECT RAISE(ABORT,'Rollout run immutable or terminal'); END;
 CREATE TRIGGER IF NOT EXISTS rollout_run_no_delete BEFORE DELETE ON obolus_optimization_rollout_runs BEGIN SELECT RAISE(ABORT,'Rollout run history immutable'); END;`);}
function read(db:Database,id:string){
 const row=db.prepare('SELECT payload,digest,status,reason FROM obolus_optimization_rollouts WHERE id=?').get(id) as {payload:string;digest:string;status:string;reason:string|null}|undefined;
 if(!row||hash(row.payload)!==row.digest||row.digest!==id)throw Error('Intact rollout required');
 return {...row,data:JSON.parse(row.payload) as {scenario:OptimizationPaybackInput;scenarioId:string;limits:Limits}};
}
/** Activates only this bounded executor, never edits global routing or starts a provider. */
export function stageOptimizationRollout(db:Database,scenario:OptimizationPaybackInput,limits:Limits){
 if(!limits||!Number.isSafeInteger(limits.maxRuns)||limits.maxRuns<1||limits.maxRuns>10||
  !Number.isSafeInteger(limits.maxCostCents)||limits.maxCostCents<1||limits.maxCostCents>1000||
  !Number.isSafeInteger(limits.expiresAt)||limits.expiresAt<=Date.now()||limits.expiresAt>Date.now()+86400000)throw Error('Rollout requires 1..10 runs, 1..1000 USD cents and expiry within 24 hours');
 return db.transaction(()=>{
  const assessment=assessOptimizationPayback(db,scenario);
  if(assessment.decision!=='scenario_supports_controlled_trial')throw Error('Current payback and replication evidence required');
  if(!assessment.projection||limits.maxCostCents>assessment.projection.projectedTotalNetSavingsCents)throw Error('Rollout ceiling exceeds projected net benefit');
  const baseline=optimizationTrialRecipe(db,scenario.trialId,'baseline'),candidate=optimizationTrialRecipe(db,scenario.trialId,'candidate');
  if(!baseline||!candidate||candidate.maxTokens>=baseline.maxTokens||
   ['tier','taskType','modelId','provider','modelDigest','temperature'].some(k=>baseline[k as keyof typeof baseline]!==candidate[k as keyof typeof candidate]))throw Error('Only lower-token same-model text rollout supported');
  const data={scenario:assessment.assumptions,scenarioId:assessment.scenarioId,limits:{maxRuns:limits.maxRuns,maxCostCents:limits.maxCostCents,expiresAt:limits.expiresAt}};
  const payload=JSON.stringify(data),id=hash(payload);schema(db);
  const old=db.prepare('SELECT id FROM obolus_optimization_rollouts WHERE id=?').get(id);
  if(old)return {rolloutId:id,duplicate:true,status:read(db,id).status,providerStarted:false};
  if(db.prepare("SELECT 1 FROM obolus_optimization_rollouts WHERE json_extract(payload,'$.scenario.trialId')=?").get(scenario.trialId))throw Error('Trial already has a rollout; no reset through changed limits');
  if((db.prepare('SELECT COUNT(*) n FROM obolus_optimization_rollouts').get() as {n:number}).n>=1000)throw Error('Rollout history capacity reached');
  db.prepare("INSERT INTO obolus_optimization_rollouts VALUES(?,?,?,'active',NULL)").run(id,payload,id);
  return {rolloutId:id,duplicate:false,status:'active',providerStarted:false};
 }).immediate();
}
export function rollbackOptimization(db:Database,id:string,reason='operator_stop'){
 if(!/^[a-z_]{1,80}$/.test(reason))throw Error('Bounded rollback reason required');
 return db.transaction(()=>{const row=read(db,id);if(row.status==='active')db.prepare("UPDATE obolus_optimization_rollouts SET status='rolled_back',reason=? WHERE id=?").run(reason,id);
  return {rolloutId:id,status:read(db,id).status};}).immediate();
}
export function inspectOptimizationRollout(db:Database,id:string){
 return db.transaction(()=>{const row=read(db,id);const runs=db.prepare('SELECT status,reserved_cents,actual_cents,output_digest FROM obolus_optimization_rollout_runs WHERE rollout_id=? ORDER BY rowid LIMIT 11').all(id);
  return {rolloutId:id,status:row.status,reason:row.reason,limits:row.data.limits,trialId:row.data.scenario.trialId,runs,economics:rolloutEconomics(db,id),globalRoutingChanged:false};})();
}
/** Trial investment already belongs to payback. Add rollout costs once, without claiming realized savings. */
export function rolloutEconomics(db:Database,id:string){
 return db.transaction(()=>{
  const row=read(db,id),assessment=assessOptimizationPayback(db,row.data.scenario);
  const runs=db.prepare('SELECT session_id,reserved_cents,actual_cents,status FROM obolus_optimization_rollout_runs WHERE rollout_id=? LIMIT 11').all(id) as {session_id:string;reserved_cents:number;actual_cents:number|null;status:string}[];
  if(runs.length>10)throw Error('Invalid rollout history');
  let settledCostCents=0,unresolvedExposureCents=0;
  const blockers:string[]=[];
  for(const run of runs){
   if(!Number.isSafeInteger(run.reserved_cents)||run.reserved_cents<0||run.actual_cents!==null&&(!Number.isSafeInteger(run.actual_cents)||run.actual_cents<0))throw Error('Invalid rollout accounting');
   const costs=db.prepare('SELECT cost_cents FROM inference_costs WHERE session_id=? LIMIT 2').all(run.session_id) as {cost_cents:number}[];
   const pending=!!db.prepare("SELECT 1 FROM inference_reservations WHERE session_id=? AND status='pending'").get(run.session_id);
   if(run.actual_cents!==null&&run.status!=='claimed'&&costs.length===1&&costs[0].cost_cents===run.actual_cents&&!pending)settledCostCents+=run.actual_cents;
   else{
    blockers.push('unresolved_rollout_accounting');
    const ledgerCost=costs.reduce((sum,c)=>{if(!Number.isSafeInteger(c.cost_cents)||c.cost_cents<0)throw Error('Invalid rollout ledger');return sum+c.cost_cents;},0);
    unresolvedExposureCents+=Math.max(run.reserved_cents,run.actual_cents??0,ledgerCost);
   }
  }
  const exposureCents=settledCostCents+unresolvedExposureCents;
  const projectedNetAfterRolloutCents=assessment.projection===null?null:assessment.projection.projectedTotalNetSavingsCents-exposureCents;
  for(const value of [settledCostCents,unresolvedExposureCents,exposureCents,...(projectedNetAfterRolloutCents===null?[]:[projectedNetAfterRolloutCents])])if(!Number.isSafeInteger(value))throw Error('Unsafe rollout totals');
  if(assessment.scenarioId!==row.data.scenarioId||assessment.decision!=='scenario_supports_controlled_trial')blockers.push('changed_or_invalid_trial_evidence');
  if(projectedNetAfterRolloutCents===null||projectedNetAfterRolloutCents<=0||projectedNetAfterRolloutCents<row.data.scenario.minimumNetSavingsCents)blockers.push('insufficient_net_after_rollout');
  return {currency:'USD',settledCostCents,unresolvedExposureCents,exposureCents,projectedNetAfterRolloutCents,blockers:[...new Set(blockers)],profitabilityProven:false,
   limitation:'Rollout costs are charged in full against projected savings; no realized benefit is assumed. Other undeclared costs and future demand remain unverified.'};
 })();
}
/** Only exact registered text inputs. One in-flight call, no tools, no fallback spending or ambiguous retries. */
export async function runOptimizationRollout(db:Database,router:InferenceRouter,input:{rolloutId:string;operationId:string;caseId:string;messages:InferenceRequest['messages'];experimentId?:string;currentTier?:InferenceRequest['tier']},provider:Parameters<InferenceRouter['route']>[1]){
 if(!input||!/^[a-f0-9]{64}$/.test(input.rolloutId)||typeof input.operationId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.operationId)||
  !Array.isArray(input.messages)||input.messages.length<1||input.messages.length>20||Buffer.byteLength(JSON.stringify(input.messages))>32768||
  input.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||Object.keys(m).some(k=>!['role','content'].includes(k))))throw Error('Bounded exact-input rollout required');
 input={...input,messages:input.messages.map(m=>({...m}))};
 const requestDigest=hash(JSON.stringify(input)),sessionId='opt-rollout-'+hash(input.operationId).slice(0,40);
 const claim=db.transaction(()=>{
  const row=read(db,input.rolloutId),old=db.prepare('SELECT request_digest FROM obolus_optimization_rollout_runs WHERE id=?').get(input.operationId) as {request_digest:string}|undefined;
  if(old){if(old.request_digest!==requestDigest)throw Error('Rollout operation ID conflict');return {status:'already_claimed'} as const;}
  if(row.status!=='active')return {status:'blocked'} as const;
  if(Date.now()>=row.data.limits.expiresAt){rollbackOptimization(db,input.rolloutId,'expired');return {status:'blocked'} as const;}
  try{if(assessOptimizationPayback(db,row.data.scenario).scenarioId!==row.data.scenarioId){rollbackOptimization(db,input.rolloutId,'evidence_changed');return {status:'blocked'} as const;}}
  catch{rollbackOptimization(db,input.rolloutId,'evidence_invalid');return {status:'blocked'} as const;}
  const spec=optimizationCaseSpec(db,row.data.scenario.trialId,input.caseId),recipe=optimizationTrialRecipe(db,row.data.scenario.trialId,'candidate')!;
  if(input.currentTier!==undefined&&input.currentTier!==recipe.tier){rollbackOptimization(db,input.rolloutId,'survival_tier_changed');return {status:'blocked'} as const;}
  if(hash(JSON.stringify(input.messages))!==spec.inputDigest||!spec.qualityRule)throw Error('Rollout input absent from exact registered cases');
  const model=router.selectModel(recipe.tier,recipe.taskType);
  if(!model||optimizationModelDigest(model)!==recipe.modelDigest){rollbackOptimization(db,input.rolloutId,'model_changed');return {status:'blocked'} as const;}
  const runs=db.prepare('SELECT reserved_cents,actual_cents,status FROM obolus_optimization_rollout_runs WHERE rollout_id=? LIMIT 11').all(input.rolloutId) as {reserved_cents:number;actual_cents:number|null;status:string}[];
  if(runs.some(r=>!Number.isSafeInteger(r.reserved_cents)||r.reserved_cents<0||r.actual_cents!==null&&(!Number.isSafeInteger(r.actual_cents)||r.actual_cents<0)||!['claimed','accepted','rejected'].includes(r.status)))throw Error('Invalid rollout history');
  if(runs.some(r=>r.status==='claimed'))return {status:'busy'} as const;
  const estimate=Math.ceil(model.contextWindow/1000*model.costPer1kInput/100+recipe.maxTokens/1000*model.costPer1kOutput/100);
  const spent=runs.reduce((sum,r)=>sum+(r.actual_cents??r.reserved_cents),0);
  for(const run of db.prepare('SELECT session_id,actual_cents FROM obolus_optimization_rollout_runs WHERE rollout_id=? AND actual_cents IS NOT NULL LIMIT 11').all(input.rolloutId) as {session_id:string;actual_cents:number}[]){
   const ledger=db.prepare('SELECT cost_cents FROM inference_costs WHERE session_id=? LIMIT 2').all(run.session_id) as {cost_cents:number}[];
   if(ledger.length!==1||ledger[0].cost_cents!==run.actual_cents||db.prepare("SELECT 1 FROM inference_reservations WHERE session_id=? AND status='pending'").get(run.session_id)){
    rollbackOptimization(db,input.rolloutId,'accounting_changed');return {status:'blocked'} as const;
   }
  }
  if(!Number.isSafeInteger(estimate)||estimate<0||!Number.isSafeInteger(spent)||spent<0)throw Error('Invalid rollout accounting');
  if(runs.length>=row.data.limits.maxRuns||spent+estimate>row.data.limits.maxCostCents){rollbackOptimization(db,input.rolloutId,'exposure_limit');return {status:'blocked'} as const;}
  const economics=rolloutEconomics(db,input.rolloutId);
  if(economics.blockers.length||economics.projectedNetAfterRolloutCents===null||economics.projectedNetAfterRolloutCents-estimate<=0||economics.projectedNetAfterRolloutCents-estimate<row.data.scenario.minimumNetSavingsCents){rollbackOptimization(db,input.rolloutId,'net_benefit_limit');return {status:'blocked'} as const;}
  if(db.prepare('SELECT 1 FROM inference_costs WHERE session_id=?').get(sessionId)||db.prepare('SELECT 1 FROM inference_reservations WHERE session_id=?').get(sessionId))throw Error('Rollout session already used');
  db.prepare("INSERT INTO obolus_optimization_rollout_runs(id,rollout_id,request_digest,session_id,reserved_cents,status) VALUES(?,?,?,?,?,'claimed')").run(input.operationId,input.rolloutId,requestDigest,sessionId,estimate);
  return {status:'claimed',recipe,rule:spec.qualityRule} as const;
 }).immediate();
 if(claim.status!=='claimed')return {status:claim.status,retriesAuthorized:false};
 let closed=false;
 try{
  const response=await router.route({messages:input.messages,tier:claim.recipe.tier,taskType:claim.recipe.taskType,maxTokens:claim.recipe.maxTokens,
   temperature:claim.recipe.temperature,toolChoice:'none',responseFormat:{type:'text'},sessionId,experimentId:input.experimentId},(messages,options)=>{if(closed)throw Error('Rollout provider boundary closed');return provider(messages,options);});closed=true;
  return db.transaction(()=>{
   const costs=db.prepare('SELECT cost_cents FROM inference_costs WHERE session_id=? LIMIT 2').all(sessionId) as {cost_cents:number}[];
   const settled=costs.length===1&&Number.isSafeInteger(costs[0].cost_cents)&&costs[0].cost_cents>=0&&!db.prepare("SELECT 1 FROM inference_reservations WHERE session_id=? AND status='pending'").get(sessionId);
   const quality=response.finishReason==='stop'&&!response.toolCalls?.length&&Buffer.byteLength(response.content)<=claim.rule.maxOutputBytes&&hash(response.content)===claim.rule.expectedOutputDigest;
   const current=read(db,input.rolloutId);
   const run=db.prepare('SELECT reserved_cents FROM obolus_optimization_rollout_runs WHERE id=?').get(input.operationId) as {reserved_cents:number};
   const stillValid=assessOptimizationPayback(db,current.data.scenario).scenarioId===current.data.scenarioId;
   const experimentStillRunning=input.experimentId===undefined||!!db.prepare("SELECT 1 FROM revenue_experiments WHERE id=? AND status='running'").get(input.experimentId);
   const accepted=settled&&costs[0].cost_cents<=run.reserved_cents&&quality&&stillValid&&experimentStillRunning&&current.status==='active'&&Date.now()<current.data.limits.expiresAt;
   db.prepare('UPDATE obolus_optimization_rollout_runs SET actual_cents=?,status=?,output_digest=? WHERE id=?').run(settled?costs[0].cost_cents:null,accepted?'accepted':'rejected',
    Buffer.byteLength(response.content)<=claim.rule.maxOutputBytes?hash(response.content):null,input.operationId);
   if(!accepted){rollbackOptimization(db,input.rolloutId,'execution_or_quality_failure');return {status:'rolled_back',outputWithheld:true,retriesAuthorized:false};}
   return {status:'accepted',content:response.content,costCents:costs[0].cost_cents,retriesAuthorized:false};
  }).immediate();
 }catch{closed=true;rollbackOptimization(db,input.rolloutId,'uncertain_execution');return {status:'rolled_back',outputWithheld:true,retriesAuthorized:false};}
}
