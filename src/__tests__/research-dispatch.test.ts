import {it,expect,vi} from 'vitest';
import {ResearchDispatcher,researchDispatchAllowsInference,cancelReviewedDispatch,researchDispatchSnapshot} from '../orchestration/research-dispatch.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDatabase,insertGoal,insertTask} from '../state/database.js';
import {ResearchStore} from '../revenue/research.js';
import {RevenueStore} from '../revenue/store.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {planResearchExperiment,handoffResearchTask,configureResearchDispatch,claimNextResearchTask,researchTaskLineageBlock} from '../revenue/research-handoff.js';

it('prioritizes admissible work, skips revoked evidence and preserves shared capacity after reopen',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-dispatch-')),file=path.join(dir,'test.db');
  const a=createDatabase(file),b=createDatabase(file);
  try{
    const schemaBefore=a.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all();
    expect(researchDispatchSnapshot(a.raw)).toMatchObject({state:'unconfigured',maxWorkers:null,tasks:[],truncated:false});
    expect(a.raw.prepare('SELECT name FROM sqlite_master ORDER BY name').all()).toEqual(schemaBefore);
    const research=new ResearchStore(a.raw),store=new RevenueStore(a.raw);
    initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:4000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
    registerBudgetPolicy(a.raw,{daily_cents:1000,hourly_cents:1000,session_cents:1000,call_cents:100,halted:0,revision:1});
    const goalId=insertGoal(a.raw,{title:'Fixture goal',description:'Offline dispatch'});
    const ids:string[]=[];
    for(const [i,revenue] of [10000,30000,20000].entries()){
      const id=`candidate${i}`;
      research.import({opportunities:[{id,title:id,sector:'software',hypothesis:'Fixture demand',forecast:{revenueCents:revenue,costCents:100,probability:0.5,days:7,validationBudgetCents:100}}],
        evidence:[0,1].map(n=>({id:`${id}_${n}`,opportunityId:id,sourceUrl:`https://source${n}.example/${id}`,observedAt:new Date().toISOString(),kind:'request',excerpt:`Fixture distinct request ${i} ${n}`,provenance:'reported',reviewedBy:null}))});
      for(const n of [0,1])research.review(`${id}_${n}`,'fixture operator','accept','Offline review');
      const {experimentId}=planResearchExperiment(a.raw,id);ids.push(experimentId);
      store.updateOpportunity(store.getExperiment(experimentId)!.opportunityId,{status:'validating'});
      store.updateExperiment(experimentId,{maxBudgetCents:100,maxInferenceCostCents:50});
      store.transitionExperimentStatus(experimentId,'running','Fixture authorization');
      handoffResearchTask(a.raw,experimentId,goalId);
    }
    // A newly reviewed rejection must invalidate an already prepared handoff,
    // even though neither of the saved positive evidence reviews changed.
    research.import({opportunities:[],evidence:[{id:'later_rejection',opportunityId:'candidate2',
      sourceUrl:'https://buyer.example/rejection',observedAt:new Date().toISOString(),kind:'rejection',
      excerpt:'Synthetic buyer withdrew the task after planning.',provenance:'reported',reviewedBy:null}]});
    expect(researchAdmissionBlock(b.raw,ids[2])).toBeUndefined();
    research.review('later_rejection','fixture operator','accept','Verified synthetic withdrawal');
    expect(research.rank().find(row=>row.id==='candidate2')!.decision).toBe('hold');
    expect(researchAdmissionBlock(b.raw,ids[2])).toContain('rejection');
    expect(()=>handoffResearchTask(b.raw,ids[2],goalId)).toThrow(/rejection/);
    research.review('later_rejection','fixture operator','reject','Synthetic withdrawal invalidated after review');
    expect(researchAdmissionBlock(b.raw,ids[2])).toBeUndefined();
    expect(()=>claimNextResearchTask(a.raw,'local://one')).toThrow('policy required');
    configureResearchDispatch(a.raw,1);
    configureResearchDispatch(b.raw,10);
    expect(b.raw.prepare('SELECT max_workers FROM obolus_research_dispatch_policy').get()).toEqual({max_workers:1});
    research.review('candidate1_0','fixture operator','reject','Withdraw highest score');
    const pool={spawn:vi.fn(()=>({address:'local://worker',name:'fixture',sandboxId:'fixture'})),shutdown:vi.fn(async()=>{})};
    const dispatcher=new ResearchDispatcher(a.raw,pool);
    expect(dispatcher.tick()).toBeNull();
    await dispatcher.control('running');
    const next=dispatcher.tick()!;
    expect(next.reason).toBe('claimed');
    expect(next.task?.id).toBe(store.getExperiment(ids[2])!.taskId);
    expect(next.blocked).toEqual([{experimentId:ids[1],reason:expect.stringContaining('Research evidence')}]);
    expect(pool.spawn).toHaveBeenCalledTimes(1);
    expect(researchDispatchSnapshot(b.raw)).toMatchObject({state:'running',maxWorkers:1,activeTasks:1,tasks:[{task_id:next.task!.id,status:'assigned',worker_address:'local://worker'}]});
    expect(dispatcher.state).toBe('running');
    expect(researchDispatchAllowsInference(b.raw,next.task!.id)).toBe(true);
    await dispatcher.control('paused');
    expect(dispatcher.tick()).toBeNull();
    expect(researchDispatchAllowsInference(b.raw,next.task!.id)).toBe(false);
    await dispatcher.control('emergency');
    expect(pool.shutdown).toHaveBeenCalledTimes(1);
    await expect(dispatcher.control('running')).rejects.toThrow('review emergency');
    await dispatcher.control('stopped');
    await dispatcher.control('running');
    expect(claimNextResearchTask(b.raw,'local://two')).toMatchObject({task:null,reason:'capacity'});
    const reopened=createDatabase(file);
    try{
      const recovered=new ResearchDispatcher(reopened.raw,pool);
      expect(recovered.state).toBe('paused');
      expect(recovered.tick()).toBeNull();
      expect(claimNextResearchTask(reopened.raw,'local://two')).toMatchObject({task:null,reason:'capacity'});
    }finally{reopened.close();}
    expect(a.raw.prepare('SELECT COUNT(*) n FROM inference_reservations').get()).toEqual({n:0});
    expect(a.raw.prepare("SELECT COUNT(*) n FROM task_graph WHERE status='pending'").get()).toEqual({n:2});
    // A delegated child inherits the reviewed root experiment and economic priority.
    a.raw.prepare("UPDATE task_graph SET status='completed' WHERE id=?").run(next.task!.id);
    const child=insertTask(a.raw,{goalId,parentId:next.task!.id,title:'Fixture child',description:'Inherited budget',maxRetries:0});
    await dispatcher.control('running');
    const delegated=dispatcher.tick();
    expect(delegated?.task?.id).toBe(child);
    expect(store.getActiveExperimentForTask(child,true)?.id).toBe(ids[2]);
    a.raw.prepare("UPDATE task_graph SET status='completed' WHERE id=?").run(child);
    // Simulate reconciled completion of the first task, then an uncertain spawn.
    a.raw.prepare("UPDATE task_graph SET status='completed' WHERE id=?").run(next.task!.id);
    pool.spawn.mockImplementation(()=>{throw new Error('fixture spawn failure');});
    await dispatcher.control('running');
    expect(()=>dispatcher.tick()).toThrow('claim retained');
    expect(a.raw.prepare('SELECT COUNT(*) n FROM obolus_dispatched_tasks WHERE error IS NOT NULL').get()).toEqual({n:1});
    expect(researchDispatchSnapshot(b.raw).tasks.some(t=>t.start_uncertain===1&&t.review==='Start unklar; prüfen')).toBe(true);
    expect(dispatcher.tick()).toMatchObject({task:null,reason:'capacity'});
    const orphan=store.getExperiment(ids[0])!.taskId!;
    expect(()=>cancelReviewedDispatch(a.raw,orphan,'Reviewed fixture',true)).toThrow('Stop dispatch');
    await dispatcher.control('stopped');
    expect(()=>cancelReviewedDispatch(a.raw,orphan,'Reviewed fixture',false)).toThrow('attestation');
    a.raw.exec("CREATE TABLE obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT,status TEXT,actual_cost INTEGER); INSERT INTO obolus_reserved_operations VALUES('fixture','{}','pending',NULL)");
    expect(()=>cancelReviewedDispatch(b.raw,orphan,'Reviewed fixture',true)).toThrow('Unresolved operations');
    expect(a.raw.prepare('SELECT status FROM task_graph WHERE id=?').get(orphan)).toEqual({status:'assigned'});
    a.raw.exec("UPDATE obolus_reserved_operations SET status='settled',actual_cost=0");
    expect(cancelReviewedDispatch(b.raw,orphan,'Reviewed fixture',true)).toEqual({cancelled:true,duplicate:false});
    expect(cancelReviewedDispatch(a.raw,orphan,'Reviewed fixture',true)).toEqual({cancelled:true,duplicate:true});
    expect(()=>a.raw.exec('DELETE FROM obolus_dispatch_cancellations')).toThrow('immutable');
    await dispatcher.control('running');
    expect(researchDispatchAllowsInference(b.raw,orphan)).toBe(false);
    const cancelledChild=insertTask(a.raw,{goalId,parentId:orphan,title:'Child after cancellation',description:'Must never run',maxRetries:0});
    const spawnsBefore=pool.spawn.mock.calls.length;
    expect(dispatcher.tick()?.reason).toBe('no_admissible_task');
    expect(pool.spawn).toHaveBeenCalledTimes(spawnsBefore);
    expect(researchDispatchAllowsInference(b.raw,cancelledChild)).toBe(false);
    expect(a.raw.prepare('SELECT status FROM task_graph WHERE id=?').get(cancelledChild)).toEqual({status:'pending'});
    // Even a legacy status reset cannot erase the immutable cancellation.
    a.raw.prepare("UPDATE task_graph SET status='completed' WHERE id=?").run(orphan);
    expect(researchTaskLineageBlock(b.raw,cancelledChild)).toContain('permanent cancellation');
    expect(dispatcher.tick()?.reason).toBe('no_admissible_task');
    const clock=vi.spyOn(Date,'now').mockReturnValue(Date.now()+8*24*3600000);
    try{
      await dispatcher.control('paused');
      expect(dispatcher.tick()).toBeNull();
      expect(ids.every(id=>store.getExperiment(id)?.status==='running')).toBe(true);
      await dispatcher.control('running');
      expect(dispatcher.tick()?.reason).toBe('no_admissible_task');
      expect(ids.every(id=>store.getExperiment(id)?.status==='stopped')).toBe(true);
      expect(researchDispatchAllowsInference(b.raw,child)).toBe(false);
      expect(pool.spawn).toHaveBeenCalledTimes(spawnsBefore);
    }finally{clock.mockRestore();}
  }finally{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
});

it('rejects failed, cyclic, missing and cross-goal task ancestry',()=>{
  const db=createDatabase(':memory:');
  try{
    const goalId=insertGoal(db.raw,{title:'Fixture',description:'Ancestry guards'});
    const other=insertGoal(db.raw,{title:'Other',description:'Different authority'});
    const root=insertTask(db.raw,{goalId,title:'Root',description:'Root'});
    const child=insertTask(db.raw,{goalId,parentId:root,title:'Child',description:'Child'});
    expect(researchTaskLineageBlock(db.raw,child)).toBeNull();
    db.raw.prepare("UPDATE task_graph SET status='failed' WHERE id=?").run(root);
    expect(researchTaskLineageBlock(db.raw,child)).toContain('failed or cancelled');
    db.raw.prepare("UPDATE task_graph SET status='completed',parent_id=? WHERE id=?").run(child,root);
    expect(researchTaskLineageBlock(db.raw,child)).toContain('reconciliation');
    db.raw.prepare('UPDATE task_graph SET parent_id=NULL,goal_id=? WHERE id=?').run(other,root);
    expect(researchTaskLineageBlock(db.raw,child)).toContain('crosses goals');
    expect(researchTaskLineageBlock(db.raw,'missing')).toContain('missing');
  }finally{db.close();}
});
