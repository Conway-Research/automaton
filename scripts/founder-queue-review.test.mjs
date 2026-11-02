import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {openFounderController} from './founder-controller.mjs';
const task=(id,rootTaskId='root',url)=>({id,rootTaskId,kind:'read',input:url?{url}:{},dependencies:[],resources:[]});

test('cost-review blocks retain their protection for correct and historical encoded reasons without queue review',()=>fixture(async f=>{
 const c=f.open();c.enqueue(task('cost','cost-root'));const db=f.db();
 try{for(const reason of ['Kostenpr\u00fcfung erforderlich','Kostenpr\u00c3\u00bcfung erforderlich']){
  db.prepare("UPDATE founder_jobs SET status='blocked',reason=?,attempts=1 WHERE id='cost'").run(reason);
  const row=db.prepare("SELECT updated_ms FROM founder_jobs WHERE id='cost'").get();
  assert.equal(c.snapshot().tasks.find(t=>t.id==='cost').retryAllowed,false,reason);
  assert.throws(()=>c.retry('cost',row.updated_ms),/Retry unavailable/);
  assert.equal(db.prepare("SELECT status FROM founder_jobs WHERE id='cost'").get().status,'blocked');
 }assert.deepEqual(f.counts(),{reserves:0,settles:0,calls:0});}finally{db.close();}
}));
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'queue-review-'));const file=path.join(dir,'controller.db');let c,on=false,reserves=0,settles=0,calls=0;const entries=[];
 const budget={snapshot:()=>({entries,active:true,remainingRappen:1000,dayRemainingRappen:1000,taskRappen:250}),reserve(){reserves++;return {};},settle(){settles++;}};
 const adapters={read:{available:true,maxCostRappen:0,retrySafe:true,manualRetrySafe:true,autoRetrySafe:true,interruptedRetrySafe:()=>true,execute:async()=>{calls++;return {};},verify:()=>true}};
 const open=queueReview=>c=openFounderController({file,budget,adapters,...(queueReview?{queueReview}:{} )});
 const options=(extra={})=>({isEnabled:()=>on,holdExistingOnFirstUse:true,repeatBlockedTaskIds:[],...extra});
 const db=()=>new Database(file);
 try{await fn({open,options,db,file,entries,setOn:v=>on=v,counts:()=>({reserves,settles,calls}),close:async()=>{await c?.close();c=null;}});}finally{await c?.close();fs.rmSync(dir,{recursive:true,force:true});}
}

test('bootstrap before recovery preserves blocked attempts, reservation, journal and status across restart',()=>fixture(async f=>{
 let c=f.open();c.enqueue(task('blocked'));c.enqueue(task('queued'));await f.close();const db=f.db();db.prepare("UPDATE founder_jobs SET status='blocked',reason='Bearbeitung unterbrochen; keine automatische Wiederholung.',attempts=1,run_id='old-run' WHERE id='blocked'").run();db.exec("CREATE TABLE outreach_messages(key TEXT PRIMARY KEY,state TEXT); INSERT INTO outreach_messages VALUES('uncertain','unknown')");const before=db.prepare('SELECT * FROM founder_jobs ORDER BY id').all();db.close();f.entries.push({id:'old-run',taskId:'root',maxCostRappen:0,actualCostRappen:null});
 c=f.open(f.options());assert.equal(c.queueReviewStatus().heldTaskCount,2);for(const t of c.snapshot().tasks){assert.equal(t.operatorHold.held,true);assert.equal(t.retryAllowed,false);assert.equal(t.waitState.code,'operator-review-hold');}assert.deepEqual(f.counts(),{calls:0,reserves:0,settles:0});
 assert.equal(c.isTaskAdmitted(task('derived')),false);assert.equal(c.enqueue(task('derived')).accepted,false);await assert.rejects(async()=>c.retry('blocked',before.find(r=>r.id==='blocked').updated_ms),/Retry unavailable/);
 await f.close();c=f.open(f.options());const check=f.db();assert.deepEqual(check.prepare('SELECT * FROM founder_jobs ORDER BY id').all(),before);assert.equal(check.prepare('SELECT state FROM outreach_messages').get().state,'unknown');check.close();assert.equal(c.queueReviewStatus().heldTaskCount,2);
 f.setOn(true);c.control('start');await c.tick();assert.deepEqual(f.counts(),{calls:0,reserves:0,settles:0});
}));

test('trusted historical cancelled targets suppress new IDs and changed roots without changing cancelled row',()=>fixture(async f=>{
 const url='https://github.com/Synthetic/Project/issues/1';let c=f.open();const cancelled={...task('cancelled','old',url),kind:'external-communication'};c.enqueue(cancelled);await f.close();const db=f.db();db.prepare("UPDATE founder_jobs SET status='cancelled',reason='Patrice repeat blocked',attempts=1 WHERE id='cancelled'").run();const old=db.prepare('SELECT * FROM founder_jobs').get();db.close();
 c=f.open(f.options({repeatBlockedTaskIds:['cancelled']}));assert.equal(c.queueReviewStatus().repeatBlockedTargetCount,1);const replacement={...cancelled,id:'new-window',rootTaskId:'different'};assert.equal(c.isTaskAdmitted(replacement),false);assert.equal(c.enqueue(replacement).accepted,false);await f.close();const after=f.db();assert.deepEqual(after.prepare('SELECT * FROM founder_jobs').get(),old);after.close();
}));

test('hold action is OFF-only, exact CAS and all-or-nothing with persistent semantic/root suppression',()=>fixture(async f=>{
 let c=f.open(f.options({holdExistingOnFirstUse:false}));c.enqueue(task('one','one'));c.enqueue(task('two','two'));let s=c.queueReviewStatus();assert.equal(s.heldTaskCount,0);assert.equal(s.entries.length,2);
 const bad=s.entries.map(e=>({...e}));bad[1].attempts=7;assert.throws(()=>c.holdQueueForReview({revision:s.revision,entries:bad,reason:'review'}),/changed|stale|CAS/i);assert.equal(c.queueReviewStatus().heldTaskCount,0);
 f.setOn(true);assert.throws(()=>c.holdQueueForReview({revision:s.revision,entries:s.entries,reason:'review'}),/OFF/);assert.equal(c.queueReviewStatus().heldTaskCount,0);f.setOn(false);
 c.holdQueueForReview({revision:s.revision,entries:s.entries,reason:'review'});s=c.queueReviewStatus();assert.equal(s.heldTaskCount,2);assert.throws(()=>c.holdQueueForReview({revision:s.revision-1,entries:s.entries,reason:'review'}),/revision|changed|stale/i);assert.equal(c.isTaskAdmitted(task('new-derived','two')),false);const check=f.db();assert.equal(check.prepare('SELECT count(*) n FROM founder_queue_review_actions').get().n,1);assert.equal(check.prepare('SELECT reason FROM founder_queue_review_actions').get().reason,'review');check.close();
}));

test('first-use bootstrap refuses ON, unreadable power or a non-stopped controller without queue mutations',()=>fixture(async f=>{
 let c=f.open();c.enqueue(task('one'));await f.close();for(const isEnabled of [()=>true,()=>undefined,()=>{throw Error('unreadable');}])assert.throws(()=>f.open(f.options({isEnabled})),/OFF|unreadable/);
 const db=f.db();assert.equal(db.prepare('SELECT status FROM founder_jobs').get().status,'queued');db.prepare("UPDATE founder_control SET status='running'").run();db.close();assert.throws(()=>f.open(f.options()),/stopped/i);
}));

test('hold rechecks OFF before commit and rolls back every hold and revision if power changes',()=>fixture(async f=>{
 let checks=0,armed=false;const isEnabled=()=>armed?++checks>1:false;
 const c=f.open(f.options({isEnabled,holdExistingOnFirstUse:false}));c.enqueue(task('one','one'));c.enqueue(task('two','two'));const before=c.queueReviewStatus();armed=true;
 assert.throws(()=>c.holdQueueForReview({revision:before.revision,entries:before.entries,reason:'review'}),/OFF/);armed=false;assert.deepEqual(c.queueReviewStatus(),before);assert.equal(c.isTaskAdmitted(task('one','one')),true);
}));

test('invalid repeat import and running rows leave no partial review ledger or job changes',()=>fixture(async f=>{
 let c=f.open();c.enqueue(task('one'));await f.close();const db=f.db();const before=db.prepare('SELECT * FROM founder_jobs').all();db.close();
 assert.throws(()=>f.open(f.options({repeatBlockedTaskIds:['missing']})),/cancelled/);const check=f.db();assert.deepEqual(check.prepare('SELECT * FROM founder_jobs').all(),before);assert.equal(check.prepare("SELECT 1 FROM sqlite_master WHERE name='founder_queue_review'").get(),undefined);check.prepare("UPDATE founder_jobs SET status='running',owner_pid=99999999,lease_ms=0").run();const running=check.prepare('SELECT * FROM founder_jobs').all();check.close();assert.throws(()=>f.open(f.options()),/running/);const after=f.db();assert.deepEqual(after.prepare('SELECT * FROM founder_jobs').all(),running);after.close();
}));

test('reopen cannot silently omit newly configured historical repeat prohibitions',()=>fixture(async f=>{
 let c=f.open(f.options({holdExistingOnFirstUse:false}));await f.close();assert.throws(()=>f.open(f.options({repeatBlockedTaskIds:['missing']})),/configuration|cancelled/);
}));
