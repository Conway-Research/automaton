import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDatabase,insertGoal} from '../state/database.js';
import {ResearchStore} from '../revenue/research.js';
import {RevenueStore} from '../revenue/store.js';
import {CUSTOMER_FIELDS,type CustomerAnalysis} from '../revenue/customer-analysis.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';
import {planResearchExperiment,handoffResearchTask,claimResearchTask,configureResearchDispatch} from '../revenue/research-handoff.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';

let db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>,dir:string,goal:string;
beforeEach(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-boundary-audit-'));
 db=createDatabase(path.join(dir,'fixture.db'));other=createDatabase(path.join(dir,'fixture.db'));
 goal=insertGoal(db.raw,{title:'Synthetic audit',description:'No providers or workers'});
 registerBudgetPolicy(db.raw,{daily_cents:1000,hourly_cents:1000,session_cents:1000,call_cents:100,halted:0,revision:1});
 initializeCapitalBudget(db.raw,{capitalChfCents:5000,reserveChfCents:4000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
});
afterEach(()=>{vi.restoreAllMocks();other.close();db.close();fs.rmSync(dir,{recursive:true,force:true});});
function prepared(id:string,customer=false){
 const research=new ResearchStore(db.raw),store=new RevenueStore(db.raw),now=Date.now();
 const evidence=['a','b',...(customer?['z']:[])].map(key=>({id:`${id}_${key}`,opportunityId:id,
  sourceUrl:`https://${key==='z'?'a':key}.example/${id}/${key}`,observedAt:new Date(now-(key==='z'?89*86400000:0)).toISOString(),
  kind:'request' as const,excerpt:`Synthetic ${id} ${key} request`,provenance:'reported' as const,reviewedBy:null}));
 const z=evidence.at(-1)!,digest=createHash('sha256').update(JSON.stringify(z)).digest('hex');
 const customerAnalysis:CustomerAnalysis={version:1,
  claims:CUSTOMER_FIELDS.map(field=>({field,statement:z.excerpt,method:'Synthetic quote',confidence:1,
   citations:[{evidenceId:z.id,evidenceDigest:digest,quote:z.excerpt,direction:'supports'}]})),
  alternatives:['first','second'].map(name=>({name,kind:'direct',currency:'USD',priceCents:100,periodDays:30,units:1,
   scope:'fixture',evidenceId:z.id,evidenceDigest:digest}))};
 research.import({opportunities:[{id,title:id,sector:'software',hypothesis:`Synthetic ${id}`,
  forecast:{revenueCents:1000,costCents:100,probability:0.8,days:7,validationBudgetCents:100},...(customer?{customerAnalysis}:{})}],evidence});
 for(const e of evidence)research.review(e.id,'fixture','accept','Synthetic review');
 const {experimentId}=planResearchExperiment(db.raw,id);
 store.updateOpportunity(store.getExperiment(experimentId)!.opportunityId,{status:'validating'});
 store.updateExperiment(experimentId,{maxBudgetCents:100,maxInferenceCostCents:50});
 store.transitionExperimentStatus(experimentId,'running','Synthetic authorization');
 const {taskId}=handoffResearchTask(db.raw,experimentId,goal);
 return {experimentId,taskId,research};
}
it('requires explicit shared capacity for direct research claims',()=>{
 const {experimentId,taskId}=prepared('missing-policy');
 expect(()=>claimResearchTask(other.raw,experimentId,goal,'local://one')).toThrow(/policy/i);
 expect(db.raw.prepare('SELECT status FROM task_graph WHERE id=?').get(taskId)).toEqual({status:'pending'});
});
it.each(['capacity','worker_busy','invalid-policy'] as const)('direct claims preserve shared dispatch boundary: %s',mode=>{
 const first=prepared('first'),second=prepared('second');
 configureResearchDispatch(db.raw,mode==='worker_busy'?2:1);
 claimResearchTask(db.raw,first.experimentId,goal,'local://one');
 if(mode==='invalid-policy')db.raw.exec('UPDATE obolus_research_dispatch_policy SET max_workers=0');
 expect(()=>claimResearchTask(other.raw,second.experimentId,goal,mode==='worker_busy'?'local://one':'local://two')).toThrow(/capacity|worker_busy|policy/i);
 expect(db.raw.prepare('SELECT status FROM task_graph WHERE id=?').get(second.taskId)).toEqual({status:'pending'});
 expect(db.raw.prepare("SELECT COUNT(*) n FROM task_graph WHERE status='assigned'").get()).toEqual({n:1});
});
it.each([0.5,NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])('rejects invalid cent estimates at both budget boundaries: %s',amount=>{
 const {experimentId}=prepared('budget');
 const governor=new ExperimentBudgetGovernor(other.raw);
 expect(governor.checkInferenceBudget(experimentId,amount).allowed).toBe(false);
 expect(governor.checkTotalBudget(experimentId,amount).allowed).toBe(false);
 expect(governor.checkTotalBudget(experimentId,1).allowed).toBe(true);
});
it.each(['withdrawn','expired'] as const)('revalidates customer evidence outside the demand source snapshot: %s',mode=>{
 const {experimentId,research}=prepared('customer',true);
 expect(researchAdmissionBlock(other.raw,experimentId)).toBeUndefined();
 if(mode==='withdrawn')research.review('customer_z','fixture','reject','Synthetic revocation');
 else vi.spyOn(Date,'now').mockReturnValue(Date.now()+2*86400000);
 expect(research.rank().find(r=>r.id==='customer')).toMatchObject({decision:'hold',score:0});
 const before=other.raw.prepare('SELECT total_changes() n').get();
 expect(researchAdmissionBlock(other.raw,experimentId)).toContain('Customer');
 expect(other.raw.prepare('SELECT total_changes() n').get()).toEqual(before);
 expect(new ExperimentBudgetGovernor(other.raw).checkInferenceBudget(experimentId,1).allowed).toBe(false);
});
it.each(['future-start','negative-duration','infinite-duration','overflow-expiry','invalid-start'] as const)(
 'fails closed on malformed experiment timing: %s',mode=>{
 const {experimentId}=prepared('timing');
 if(mode==='future-start'||mode==='invalid-start')db.raw.prepare('UPDATE revenue_experiments SET started_at=? WHERE id=?')
  .run(mode==='future-start'?new Date(Date.now()+86400000).toISOString():'invalid',experimentId);
 else db.raw.prepare('UPDATE revenue_experiments SET max_duration_hours=? WHERE id=?')
  .run(mode==='negative-duration'?-1:mode==='infinite-duration'?Infinity:1e20,experimentId);
 const governor=new ExperimentBudgetGovernor(other.raw);
 expect(()=>governor.checkDuration(experimentId)).not.toThrow();
 expect(governor.checkDuration(experimentId).allowed).toBe(false);
});
