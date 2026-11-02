import {beforeEach,afterEach,expect,it} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDatabase} from '../state/database.js';
import {registerOptimizationTrial,recordOptimizationResult,assessOptimizationTrial,optimizationSession,type TrialManifest} from '../revenue/optimization-trials.js';
import {createBuiltinTools} from '../agent/tools.js';import type {ToolContext} from '../types.js';
import {economicMissionAgenda,economicAgendaContext} from '../revenue/mission.js';
let dir:string,file:string,db:ReturnType<typeof createDatabase>;
const manifest:TrialManifest={datasetDigest:'a'.repeat(64),criteriaDigest:'b'.repeat(64),baseline:'baseline',candidate:'candidate',minimumQuality:90,
 maximumQualityDrop:0,minimumSavingsPercent:10,maximumLatencyRatio:1.2,cases:[0,1,2].map(i=>({id:`case-${i}`,inputDigest:String(i).repeat(64)}))};
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-trial-'));file=path.join(dir,'test.db');db=createDatabase(file);});
afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
function cost(id:string,session:string,cents:number){db.raw.prepare("INSERT INTO inference_costs(id,session_id,model,provider,cost_cents,latency_ms,tier,task_type) VALUES(?,?,'mock','mock',?,10,'normal','agent_turn')").run(id,session,cents);}
function record(trialId:string,caseId:string,side:'baseline'|'candidate'){
 const session=optimizationSession(trialId,caseId,side);cost(session,session,side==='baseline'?10:6);
 return recordOptimizationResult(db.raw,{trialId,caseId,side,outputDigest:'c'.repeat(64),qualityScore:95,safetyPassed:true,completed:true});
}
it('registers before execution and reports incomplete cases without substituting successful zero-cost results',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest),report=assessOptimizationTrial(db.raw,trialId);
 expect(report).toMatchObject({comparison:null,executionAuthorized:false});expect(report.pending).toHaveLength(6);
 expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_costs').get()).toEqual({n:0});
 expect(()=>db.raw.exec('DELETE FROM obolus_optimization_trials')).toThrow('immutable');
});
it('uses all local ledger costs and resumes consistently across connections and restart',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);
 for(const c of manifest.cases)for(const side of ['baseline','candidate'] as const)record(trialId,c.id,side);
 const first=assessOptimizationTrial(db.raw,trialId);
 expect(first.comparison).toMatchObject({decision:'candidate_for_replication',baselineCostCents:30,candidateCostCents:18,savingsPercent:40,adoptionAuthorized:false});
 const other=createDatabase(file);try{expect(registerOptimizationTrial(other.raw,manifest)).toMatchObject({trialId,duplicate:true});expect(assessOptimizationTrial(other.raw,trialId)).toEqual(first);}finally{other.close();}
 db.close();db=createDatabase(file);expect(assessOptimizationTrial(db.raw,trialId)).toEqual(first);
});
it('does not let a caller provide cheaper costs or improve a persisted score',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest),session=optimizationSession(trialId,'case-0','candidate');
 cost('one',session,7);cost('two',session,8);
 const result={trialId,caseId:'case-0',side:'candidate' as const,outputDigest:'c'.repeat(64),qualityScore:90,safetyPassed:true,completed:true,costCents:0};
 recordOptimizationResult(db.raw,result);expect(recordOptimizationResult(db.raw,result)).toEqual({duplicate:true});
 expect(()=>recordOptimizationResult(db.raw,{...result,qualityScore:100})).toThrow('rewritten');
 const saved=JSON.parse((db.raw.prepare('SELECT payload FROM obolus_optimization_results').get() as {payload:string}).payload);expect(saved.costCents).toBe(15);
});
it('blocks zero-cost pending calls and any changed accounting after recording',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);record(trialId,'case-0','candidate');
 const session=optimizationSession(trialId,'case-0','candidate');
 db.raw.prepare("INSERT INTO inference_reservations(id,session_id,model,reserved_cents) VALUES('pending',?,'mock',0)").run(session);
 expect(()=>assessOptimizationTrial(db.raw,trialId)).toThrow('unresolved');
 db.raw.exec("UPDATE inference_reservations SET status='settled' WHERE id='pending'");
 cost('late-cost',session,1);expect(()=>assessOptimizationTrial(db.raw,trialId)).toThrow('changed');
});
it('refuses nonregistered cases, absent costs and synthetic manifest retrofitting',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);
 const result={trialId,caseId:'case-0',side:'baseline' as const,outputDigest:'c'.repeat(64),qualityScore:95,safetyPassed:true,completed:true};
 expect(()=>recordOptimizationResult(db.raw,result)).toThrow('settled inference');
 expect(()=>recordOptimizationResult(db.raw,{...result,caseId:'other'})).toThrow('absent');
 // A separate database with pre-existing attributed calls cannot retroactively register this manifest.
 const other=createDatabase(path.join(dir,'other.db'));
 try{
  other.raw.prepare("INSERT INTO inference_costs(id,session_id,model,provider,tier,task_type) VALUES('old',?,'mock','mock','normal','agent_turn')").run(optimizationSession(trialId,'case-0','baseline'));
  expect(()=>registerOptimizationTrial(other.raw,manifest)).toThrow('before attributed');
 }finally{other.close();}
});
it('rejects corrupt manifest and result digests rather than trusting saved reports',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);record(trialId,'case-0','baseline');
 db.raw.exec("DROP TRIGGER optimization_result_immutable_update; UPDATE obolus_optimization_results SET payload='{}'");
 expect(()=>assessOptimizationTrial(db.raw,trialId)).toThrow('integrity');
 db.raw.exec("DROP TRIGGER optimization_trial_immutable_update; UPDATE obolus_optimization_trials SET payload='{}'");
 expect(()=>assessOptimizationTrial(db.raw,trialId)).toThrow('changed');
});
it('allows the actual coordinator tool to register and inspect without starting providers',async()=>{
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_optimization_trial')!;
 const registered=JSON.parse(await tool.execute({action:'register',manifest},{db} as unknown as ToolContext));
 const report=JSON.parse(await tool.execute({action:'assess',trial_id:registered.trialId},{db} as unknown as ToolContext));
 expect(report.pending).toHaveLength(6);expect(report.comparison).toBeNull();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
it('surfaces persisted trials in the actual compact learning context without assuming completion',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);record(trialId,'case-0','baseline');
 const context=economicAgendaContext(economicMissionAgenda(db.raw));
 expect(context.learning.operational.optimizationTrials).toMatchObject({truncated:false,trials:[{trialId,expectedResults:6,recordedResults:1,executionAuthorized:false}]});
});
it('exposes the read-only payback tool without turning an incomplete trial into adoption permission',async()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_optimization_payback')!;
 const before=db.raw.prepare('SELECT total_changes() n').get();
 const report=JSON.parse(await tool.execute({scenario:{trialId,forecastExecutions:100,maximumPaybackExecutions:50,
  additionalOneTimeCostCents:10,additionalPerExecutionCostCents:1,minimumNetSavingsCents:10,savingsRetentionPercent:50}},{db} as unknown as ToolContext));
 expect(report).toMatchObject({decision:'do_not_introduce',projection:null,adoptionAuthorized:false});
 expect(db.raw.prepare('SELECT total_changes() n').get()).toEqual(before);
});
it('allows the coordinator to attribute existing costs without creating expenses or paying',async()=>{
 const {trialId}=registerOptimizationTrial(db.raw,manifest);
 db.raw.exec("INSERT INTO economic_events(id,event_type,category,amount_cents) VALUES('evaluation-fee','cost','evaluation',10)");
 const tool=createBuiltinTools('fixture').find(t=>t.name==='revenue_optimization_cost')!;
 expect(JSON.parse(await tool.execute({trial_id:trialId,event_id:'evaluation-fee'},{db} as unknown as ToolContext))).toEqual({duplicate:false});
 expect(JSON.parse(await tool.execute({trial_id:trialId,event_id:'evaluation-fee'},{db} as unknown as ToolContext))).toEqual({duplicate:true});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:1});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
});
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
function machineManifest():TrialManifest{return {...manifest,cases:manifest.cases.map(c=>({...c,qualityRule:{kind:'exact-output-sha256-v1',expectedOutputDigest:sha('expected'),maxOutputBytes:32}}))};}
it('derives quality from registered exact-output rules without persisting the output text',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,machineManifest());
 for(const c of manifest.cases)for(const side of ['baseline','candidate'] as const){
  const session=optimizationSession(trialId,c.id,side);cost(session,session,side==='baseline'?10:6);
  recordOptimizationResult(db.raw,{trialId,caseId:c.id,side,output:side==='candidate'&&c.id==='case-0'?'wrong':'expected',safetyPassed:true,completed:true});
 }
 expect(assessOptimizationTrial(db.raw,trialId)).toMatchObject({qualityBasis:'registered-output-digest-v1',comparison:{decision:'reject_candidate',qualityLosses:1}});
 const rows=db.raw.prepare('SELECT payload FROM obolus_optimization_results').all() as {payload:string}[];
 expect(rows.every(r=>!r.payload.includes('expected')&&!r.payload.includes('wrong'))).toBe(true);
});
it('rejects fake self-scores, mismatched digests, missing output and overlong UTF-8 output',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,machineManifest()),session=optimizationSession(trialId,'case-0','candidate');cost('one',session,1);
 const base={trialId,caseId:'case-0',side:'candidate' as const,safetyPassed:true,completed:true};
 for(const extra of [{output:'wrong',qualityScore:100},{output:'expected',outputDigest:sha('wrong')},{qualityScore:100,outputDigest:sha('expected')},{output:'ü'.repeat(17)}])
  expect(()=>recordOptimizationResult(db.raw,{...base,...extra})).toThrow();
 expect(db.raw.prepare('SELECT COUNT(*) n FROM obolus_optimization_results').get()).toEqual({n:0});
});
it('keeps exact bytes significant and safety independent of an exact quality match',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,machineManifest());
 for(const c of manifest.cases)for(const side of ['baseline','candidate'] as const){
  const session=optimizationSession(trialId,c.id,side);cost(session,session,side==='baseline'?10:6);
  recordOptimizationResult(db.raw,{trialId,caseId:c.id,side,output:side==='candidate'&&c.id==='case-0'?'expected\n':'expected',safetyPassed:!(side==='candidate'&&c.id==='case-1'),completed:true});
 }
 expect(assessOptimizationTrial(db.raw,trialId).comparison?.blockers).toEqual(expect.arrayContaining(['candidate_quality_below_floor','candidate_safety_failure']));
});
it('binds rule changes into the trial identity and disallows partial or executable rules',()=>{
 const a=machineManifest(),first=registerOptimizationTrial(db.raw,a);a.cases[0].qualityRule!.expectedOutputDigest=sha('different');
 expect(registerOptimizationTrial(db.raw,a).trialId).not.toBe(first.trialId);
 delete a.cases[0].qualityRule;expect(()=>registerOptimizationTrial(db.raw,a)).toThrow('every');
 const invalid=machineManifest();(invalid.cases[0].qualityRule as any).kind='shell';expect(()=>registerOptimizationTrial(db.raw,invalid)).toThrow('Invalid');
});
it('rechecks machine scoring on reading persisted results and retains legacy scoring mode',()=>{
 const {trialId}=registerOptimizationTrial(db.raw,machineManifest()),session=optimizationSession(trialId,'case-0','candidate');cost('one',session,1);
 recordOptimizationResult(db.raw,{trialId,caseId:'case-0',side:'candidate',output:'wrong',safetyPassed:true,completed:true});
 const row=db.raw.prepare('SELECT payload FROM obolus_optimization_results').get() as {payload:string};const data=JSON.parse(row.payload);data.qualityScore=100;
 const forged=JSON.stringify(data);db.raw.exec('DROP TRIGGER optimization_result_immutable_update');db.raw.prepare('UPDATE obolus_optimization_results SET payload=?,digest=?').run(forged,sha(forged));
 expect(()=>assessOptimizationTrial(db.raw,trialId)).toThrow('Stored quality');
 expect(assessOptimizationTrial(db.raw,registerOptimizationTrial(db.raw,manifest).trialId).qualityBasis).toBe('supplied-scores');
});
