import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {auditFounderTasks} from './founder-task-audit.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
test('targeted audit never changes a different task',()=>{
 const f=fixture();try{f.add('old');f.add('other');f.add('new','done');const r=auditFounderTasks({...f,power:{enabled:true},apply:true,taskIds:['old']});assert.equal(r.applied,1);assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='other'").get().status,'failed');}finally{f.close();}
});
function fixture(){
 const controller=new Database(':memory:'),budget=new Database(':memory:');
 controller.exec("CREATE TABLE founder_control(status TEXT);INSERT INTO founder_control VALUES('running');CREATE TABLE founder_jobs(id TEXT PRIMARY KEY,payload TEXT,status TEXT,reason TEXT,run_id TEXT,result TEXT,digest TEXT,updated_ms INTEGER,attempts INTEGER,next_retry_ms INTEGER);CREATE TABLE founder_events(at TEXT,task_id TEXT,action TEXT);CREATE TABLE founder_reconciliations(task_id TEXT,at TEXT,evidence TEXT);");
 budget.exec('CREATE TABLE founder_reservations(id TEXT,root_task TEXT,max_cost INTEGER,actual_cost INTEGER,receipt TEXT)');
 const add=(id,status='failed',kind='exa-research',cost=0,actual=0,attempts=1)=>{
  const result=status==='done'?JSON.stringify({kind,provider:'exa',sources:[{id:'exa-source',url:'https://github.com/example/project',claim:'Public source',digest:hash('Public source')}],costReceipt:{actualCostRappen:0,evidenceRef:'free:'+id}}):null;
  controller.prepare('INSERT INTO founder_jobs VALUES(?,?,?,?,?,?,?,?,?,NULL)').run(id,JSON.stringify({id,rootTaskId:id,kind,input:{},dependencies:[]}),status,'Old failure','run-'+id,result,result?hash(result):null,status==='done'?20:10,attempts);
  budget.prepare('INSERT INTO founder_reservations VALUES(?,?,?,?,?)').run('run-'+id,id,cost,actual,actual===null?null:'free:'+id);
 };
 return {controller,budget,add,close(){controller.close();budget.close();}};
}
test('supersedes only a proven free obsolete search, retains evidence and never changes budget',()=>{
 const f=fixture();try{f.add('old');f.add('new','done');const before=f.budget.serialize();
  assert.equal(auditFounderTasks({...f,power:{enabled:true}}).actions[0].action,'superseded-free-search');assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='old'").get().status,'failed');
  const report=auditFounderTasks({...f,power:{enabled:true},apply:true});assert.equal(report.applied,1);assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='old'").get().status,'cancelled');assert.deepEqual(f.budget.serialize(),before);assert.equal(auditFounderTasks({...f,power:{enabled:true},apply:true}).applied,0);
 }finally{f.close();}
});
test('unknown paid outcomes and exhausted attempts get truthful reasons without retry or success',()=>{
 const f=fixture();try{f.add('unknown','failed','work-planner',50,null);f.add('exhausted','failed','private-draft',50,12,3);f.add('new','done');
  auditFounderTasks({...f,power:{enabled:true},apply:true});const rows=f.controller.prepare("SELECT id,status,reason,attempts,next_retry_ms FROM founder_jobs WHERE status='failed' ORDER BY id").all();assert.equal(rows.length,2);assert.match(rows[0].reason,/3 Versuche/);assert.match(rows[1].reason,/ungeklärt/);assert.ok(rows.every(r=>r.next_retry_ms===null));assert.equal(f.budget.prepare("SELECT actual_cost FROM founder_reservations WHERE id='run-unknown'").get().actual_cost,null);
 }finally{f.close();}
});
test('does not supersede searches with dependents, positive reservations or unverified replacement',()=>{
 for(const mode of ['dependent','cost','digest']){const f=fixture();try{f.add('old');f.add('new','done');if(mode==='dependent'){f.add('child','queued','work-planner');f.controller.prepare("UPDATE founder_jobs SET payload=? WHERE id='child'").run(JSON.stringify({kind:'work-planner',dependencies:['old']}));}if(mode==='cost')f.budget.exec("UPDATE founder_reservations SET max_cost=50 WHERE id='run-old'");if(mode==='digest')f.controller.exec("UPDATE founder_jobs SET digest='invalid' WHERE id='new'");const r=auditFounderTasks({...f,power:{enabled:true},apply:true});assert.equal(r.actions.some(a=>a.action==='superseded-free-search'),false);assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='old'").get().status,'failed');}finally{f.close();}}
});
test('requires the personally started running session for writes',()=>{
 const f=fixture();try{f.add('old');f.add('new','done');assert.throws(()=>auditFounderTasks({...f,power:{enabled:false},apply:true}),/running/);assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='old'").get().status,'failed');}finally{f.close();}
});
test('accepts the controller local zero-cost receipt for a verified replacement',()=>{
 const f=fixture();try{f.add('old');f.add('new','done');f.budget.exec("UPDATE founder_reservations SET receipt='local:run-new' WHERE id='run-new'");assert.equal(auditFounderTasks({...f,power:{enabled:true},apply:true}).actions[0].action,'superseded-free-search');}finally{f.close();}
});


test('identifies stored truncated paid responses and cancels futile retry without changing costs or attempts',()=>{
 const f=fixture();try{f.controller.exec('CREATE TABLE founder_attempts(run_id TEXT PRIMARY KEY,task_id TEXT,result TEXT,receipt TEXT,diagnostic TEXT,stage TEXT)');f.add('partial','failed','private-analysis',50,12,2);
 const r={kind:'private-analysis',status:'incomplete',analysis:null,costReceipt:{actualCostRappen:12,evidenceRef:'free:partial'},costEvidence:{outputTokens:2000}};
 f.controller.prepare('INSERT INTO founder_attempts VALUES(?,?,?,?,?,?)').run('run-partial','partial',JSON.stringify(r),JSON.stringify(r.costReceipt),'{}','receipt');f.controller.exec("UPDATE founder_jobs SET next_retry_ms=123 WHERE id='partial'");const before=f.budget.serialize();
 const report=auditFounderTasks({...f,power:{enabled:true},apply:true});assert.equal(report.actions[0].action,'clarify-truncated-response');const j=f.controller.prepare("SELECT * FROM founder_jobs WHERE id='partial'").get();assert.match(j.reason,/Ausgabegrenze/);assert.equal(j.status,'failed');assert.equal(j.attempts,2);assert.equal(j.next_retry_ms,null);assert.deepEqual(f.budget.serialize(),before);assert.equal(auditFounderTasks({...f,power:{enabled:true},apply:true}).applied,0);
 }finally{f.close();}
});


test('partial response annotation requires matching receipt and never clears an uncertain hold',()=>{
 for(const mode of ['unknown','receipt-mismatch','complete']){const f=fixture();try{f.controller.exec('CREATE TABLE founder_attempts(run_id TEXT PRIMARY KEY,task_id TEXT,result TEXT,receipt TEXT,diagnostic TEXT,stage TEXT)');f.add('candidate','failed','private-analysis',50,mode==='unknown'?null:12,2);
 const r={kind:'private-analysis',status:mode==='complete'?'completed':'incomplete',analysis:null,costEvidence:{outputTokens:2000}};
 f.controller.prepare('INSERT INTO founder_attempts VALUES(?,?,?,?,?,?)').run('run-candidate','candidate',JSON.stringify(r),JSON.stringify({actualCostRappen:12,evidenceRef:mode==='receipt-mismatch'?'wrong':'free:candidate'}),'{}','receipt');const before=f.budget.serialize();const report=auditFounderTasks({...f,power:{enabled:true},apply:true});assert.equal(report.actions.some(x=>x.action==='clarify-truncated-response'),false);assert.deepEqual(f.budget.serialize(),before);
 }finally{f.close();}}
});


test('recovers an actual local partial order report with provenance, never paid or uncertain work',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'audit-report-')),dir=path.join(base,'artifacts/order-monitor-20261015-1726');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'completion.json'),JSON.stringify({checkedAt:'2026-10-15T17:33:51Z',github:{tracked:25,newComments:0,stateChanges:0}}));const f=fixture();
 try{f.add('report','failed','order-report');f.add('paid','failed','order-report',50,null);const before=f.budget.serialize();const report=auditFounderTasks({...f,base,power:{enabled:true},apply:true,now:Date.parse('2026-10-15T18:00:00Z')});assert.equal(report.actions.find(a=>a.id==='report').action,'recover-local-order-report');const j=f.controller.prepare("SELECT * FROM founder_jobs WHERE id='report'").get();assert.equal(j.status,'done');assert.equal(hash(j.result),j.digest);const r=JSON.parse(j.result);assert.equal(r.report.status,'partial');assert.deepEqual(r.report.prs,[]);assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='paid'").get().status,'failed');assert.deepEqual(f.budget.serialize(),before);assert.equal(auditFounderTasks({...f,base,power:{enabled:true},apply:true}).applied,0);
 }finally{f.close();fs.rmSync(base,{recursive:true,force:true});}
});


test('only settled free research with failed local-read evidence can requeue, without resetting attempts or costs',()=>{
 for(const mode of ['safe','unknown','paid','exhausted','other-kind','wrong-receipt']){const f=fixture();try{f.controller.exec('CREATE TABLE founder_attempts(run_id TEXT PRIMARY KEY,task_id TEXT,result TEXT,receipt TEXT,diagnostic TEXT,stage TEXT)');f.add('read','failed',mode==='other-kind'?'firecrawl-research':'research',mode==='paid'?50:0,mode==='unknown'?null:0,mode==='exhausted'?3:1);f.budget.prepare('UPDATE founder_reservations SET receipt=? WHERE id=?').run('local:run-read','run-read');f.controller.prepare('INSERT INTO founder_attempts VALUES(?,?,?,?,?,?)').run('run-read','read',null,JSON.stringify({actualCostRappen:0,evidenceRef:mode==='wrong-receipt'?'wrong':'local:run-read'}),JSON.stringify({code:'local_read_failed'}),'failed');const before=f.budget.serialize();const report=auditFounderTasks({...f,power:{enabled:true},resumeFreeResearch:true,apply:true});const action=report.actions.find(a=>a.action==='resume-repaired-free-research');assert.equal(!!action,mode==='safe');assert.equal(f.controller.prepare("SELECT attempts FROM founder_jobs WHERE id='read'").get().attempts,mode==='exhausted'?3:1);assert.deepEqual(f.budget.serialize(),before);if(mode==='safe')assert.equal(f.controller.prepare("SELECT status FROM founder_jobs WHERE id='read'").get().status,'queued');
 }finally{f.close();}}
});
