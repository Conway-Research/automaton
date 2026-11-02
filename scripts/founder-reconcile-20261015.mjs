import fs from 'node:fs';
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {createFounderPlanner} from './founder-planner.mjs';
import {repairExplicitSourceList} from './founder-evidence-repair.mjs';
const base='artifacts/founder-autonomy-20261013/',apply=process.argv.includes('--apply');
const db=new Database(base+'controller.db',{readonly:!apply});db.pragma('busy_timeout=5000');
const budget=new Database(base+'budget.db',{readonly:true});
const hash=s=>createHash('sha256').update(s).digest('hex');
const report={at:new Date().toISOString(),apply,actions:[],unresolved:[]};
const verify=createFounderPlanner({}).verify;
function reconcile(){
 const power=JSON.parse(fs.readFileSync('artifacts/founder-integration-20261012/power-state.jsonl','utf8').trim().split('\n').at(-1));
 if(!power.enabled||db.prepare('SELECT status FROM founder_control').get().status!=='running')throw Error('Running human-started session required');
 const id='plan-1e5c1a429c458b9d624148868c33e623';
 const row=db.prepare('SELECT j.*,a.result saved,a.receipt FROM founder_jobs j JOIN founder_attempts a ON a.run_id=j.run_id WHERE j.id=?').get(id);
 if(row?.status==='failed'&&row.saved&&row.receipt){
  const old=JSON.parse(row.saved),fix=repairExplicitSourceList(old),receipt=JSON.parse(row.receipt),paid=budget.prepare('SELECT actual_cost,receipt FROM founder_reservations WHERE id=?').get(row.run_id);
  if(!fix||!verify(fix.result)||paid?.actual_cost!==receipt.actualCostRappen||paid?.receipt!==receipt.evidenceRef)throw Error('Explicit citation repair or settled receipt verification failed');
  const payload=JSON.stringify(fix.result),evidence={from:fix.from,to:fix.to,basis:fix.basis,originalHash:hash(row.saved),repairedHash:hash(payload),run:row.run_id,receipt};
  report.actions.push({id,action:'verified-existing-result',...evidence});
  if(apply){
   db.prepare('INSERT INTO founder_reconciliations(task_id,at,evidence) VALUES(?,?,?)').run(id,report.at,JSON.stringify(evidence));
   const changed=db.prepare("UPDATE founder_jobs SET status='done',reason=NULL,result=?,digest=?,next_retry_ms=NULL,updated_ms=? WHERE id=? AND status='failed' AND run_id=? AND updated_ms=?").run(payload,hash(payload),Date.now(),id,row.run_id,row.updated_ms);
   if(changed.changes!==1)throw Error('Concurrent task change');
   db.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(report.at,id,'reconciled-explicit-source-list');
  }
 }
 const stale=db.prepare("SELECT * FROM founder_jobs WHERE id='sofa-research-82961' AND status='blocked'").get();
 if(stale){
  const free=budget.prepare('SELECT * FROM founder_reservations WHERE id=?').get(stale.run_id);
  const newer=db.prepare("SELECT id,result,updated_ms FROM founder_jobs WHERE status='done' AND json_extract(payload,'$.kind')='sofa-research' AND updated_ms>? ORDER BY updated_ms DESC LIMIT 1").get(stale.updated_ms);
  if(!free||free.max_cost!==0||free.actual_cost!==0||!newer||!JSON.parse(newer.result)?.sources?.length)throw Error('Free supersession not proven');
  const evidence={replacementTask:newer.id,replacementDigest:hash(newer.result),oldRun:stale.run_id,costRappen:0,outcome:'Old response unknown; newer successful read replaces stale request'};
  report.actions.push({id:stale.id,action:'cancel-superseded-free-read',...evidence});
  if(apply){db.prepare('INSERT INTO founder_reconciliations(task_id,at,evidence) VALUES(?,?,?)').run(stale.id,report.at,JSON.stringify(evidence));db.prepare("UPDATE founder_jobs SET status='cancelled',reason=?,next_retry_ms=NULL,updated_ms=? WHERE id=? AND status='blocked' AND updated_ms=?").run('Alter kostenloser Abruf durch erfolgreichen neueren SOFA-Abruf ersetzt: '+newer.id,Date.now(),stale.id,stale.updated_ms);db.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(report.at,stale.id,'reconciled-superseded-free-read');}
 }
 for(const r of db.prepare("SELECT id,run_id FROM founder_jobs WHERE reason LIKE 'Unterbrochener Lauf%'").all()){
  const hold=budget.prepare('SELECT max_cost,actual_cost,receipt FROM founder_reservations WHERE id=?').get(r.run_id);
  report.unresolved.push({...r,...hold,reason:'No persisted provider response or receipt; unknown is not zero'});
 }
}
try{if(apply){db.exec('CREATE TABLE IF NOT EXISTS founder_reconciliations(id INTEGER PRIMARY KEY,task_id TEXT NOT NULL,at TEXT NOT NULL,evidence TEXT NOT NULL)');db.transaction(reconcile).immediate();}else reconcile();console.log(JSON.stringify(report,null,2));if(apply)fs.writeFileSync('artifacts/founder-repair-20261015/reconciliation-result.json',JSON.stringify(report,null,2));}finally{budget.close();db.close();}
