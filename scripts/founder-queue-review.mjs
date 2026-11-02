import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const terminal=new Set(['done','cancelled','canceled']);
const tuple=row=>({id:row.id,status:row.status,updatedMs:row.updated_ms,payloadDigest:digest(row.payload),attempts:row.attempts,runId:row.run_id});
function target(task){
 if(task?.kind!=='external-communication'||typeof task.input?.url!=='string')return null;
 try{const url=new URL(task.input.url);if(url.protocol!=='https:'||url.username||url.password)return null;url.hash='';url.search='';url.pathname=url.pathname.replace(/\/+$/,'');return url.href.toLowerCase();}catch{return null;}
}
// This ledger only removes admission. It never grants execution, retries or power.
// The supplied DB is the controller's existing connection, never a second owner.
export function openFounderQueueReview({db,options,getControl,getActiveWorkers=()=>0,audit=()=>{}}){
 if(!options||typeof options.isEnabled!=='function'||typeof options.holdExistingOnFirstUse!=='boolean'||!Array.isArray(options.repeatBlockedTaskIds)||options.repeatBlockedTaskIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))||new Set(options.repeatBlockedTaskIds).size!==options.repeatBlockedTaskIds.length)throw Error('Invalid queue review configuration');
 const configuration=digest(JSON.stringify({holdExistingOnFirstUse:options.holdExistingOnFirstUse,repeatBlockedTaskIds:[...options.repeatBlockedTaskIds].sort()}));
 const offline=()=>{let enabled;try{enabled=options.isEnabled();}catch{throw Error('Explicit OFF required; power unreadable');}if(enabled!==false)throw Error('Explicit OFF required for queue review');const s=getControl();if(s.status!=='stopped'||getActiveWorkers()!==0||db.prepare("SELECT 1 FROM founder_job_history WHERE status IN ('running','verifying') LIMIT 1").get())throw Error('Stopped controller and zero active/running workers required for queue review');};
 const rows=()=>db.prepare('SELECT id,payload,status,updated_ms,attempts,run_id FROM founder_job_history ORDER BY id').all();
 const add=(task,reason,kind='task')=>{
  db.prepare('INSERT OR IGNORE INTO founder_queue_holds(kind,hold_key,task_id,reason) VALUES(?,?,?,?)').run(kind,task.id,task.id,reason);
  db.prepare("INSERT OR IGNORE INTO founder_queue_holds(kind,hold_key,task_id,reason) VALUES('root',?,?,?)").run(task.rootTaskId,task.id,reason);
  const key=target(task);if(key)db.prepare('INSERT OR IGNORE INTO founder_queue_holds(kind,hold_key,task_id,reason) VALUES(?,?,?,?)').run(kind==='repeat-task'?'repeat-target':'target',key,task.id,reason);
 };
 db.transaction(()=>{
  const exists=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='founder_queue_review'").get();
  if(exists){const previous=db.prepare('SELECT initialized,configuration FROM founder_queue_review WHERE id=1').get();if(previous?.initialized===1){if(previous.configuration!==configuration)throw Error('Queue review configuration changed; existing holds preserved');return;}}
  offline();
  // Validate trusted historical prohibitions before creating any review records.
  const repeats=options.repeatBlockedTaskIds.map(id=>{const r=db.prepare('SELECT * FROM founder_job_history WHERE id=?').get(id);if(!r||!['cancelled','canceled'].includes(r.status))throw Error('Exact cancelled repeat-blocked task required: '+id);const t=JSON.parse(r.payload);if(!target(t))throw Error('Exact repeat-blocked communication target required');return {task:t,reason:r.reason??'Operator repeat blocked'};});
  db.exec(`CREATE TABLE IF NOT EXISTS founder_queue_review(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,initialized INTEGER NOT NULL,configuration TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS founder_queue_holds(kind TEXT NOT NULL,hold_key TEXT NOT NULL,task_id TEXT NOT NULL,reason TEXT NOT NULL,PRIMARY KEY(kind,hold_key));
   CREATE TABLE IF NOT EXISTS founder_queue_review_actions(revision INTEGER PRIMARY KEY,reason TEXT NOT NULL,entries TEXT NOT NULL,control_revision INTEGER NOT NULL,generation INTEGER NOT NULL,at_ms INTEGER NOT NULL);
   CREATE TRIGGER IF NOT EXISTS founder_queue_holds_no_update BEFORE UPDATE ON founder_queue_holds BEGIN SELECT RAISE(ABORT,'Operator holds immutable'); END;
   CREATE TRIGGER IF NOT EXISTS founder_queue_holds_no_delete BEFORE DELETE ON founder_queue_holds BEGIN SELECT RAISE(ABORT,'Operator holds immutable'); END;`);
  for(const r of rows())if(options.holdExistingOnFirstUse&&!terminal.has(r.status))add(JSON.parse(r.payload),'Existing queue requires current operator scope review');
  for(const r of repeats)add(r.task,r.reason,'repeat-task');
  db.prepare('INSERT INTO founder_queue_review VALUES(1,1,1,?)').run(configuration);audit(null,'queue-review-initialized');offline();
 }).immediate();
 function inspect(task){
  if(!task||typeof task!=='object')return {held:true,code:'operator-review-hold',reason:'Task admission unavailable'};
  const key=target(task),hold=db.prepare("SELECT kind,task_id AS taskId,reason FROM founder_queue_holds WHERE (kind IN ('task','repeat-task') AND hold_key=?) OR (kind='root' AND hold_key=?) OR (kind IN ('target','repeat-target') AND hold_key=?) ORDER BY CASE kind WHEN 'repeat-task' THEN 0 WHEN 'repeat-target' THEN 1 WHEN 'target' THEN 2 WHEN 'task' THEN 3 ELSE 4 END LIMIT 1").get(task.id??'',task.rootTaskId??'',key??'');
  return hold?{held:true,code:'operator-review-hold',...hold}:null;
 }
 function status(){const state=db.prepare('SELECT revision,initialized FROM founder_queue_review WHERE id=1').get();return {enabled:true,revision:state.revision,initialized:state.initialized===1,heldTaskCount:db.prepare("SELECT count(*) n FROM founder_queue_holds WHERE kind='task'").get().n,heldRootCount:db.prepare("SELECT count(*) n FROM founder_queue_holds WHERE kind='root'").get().n,repeatBlockedTargetCount:db.prepare("SELECT count(*) n FROM founder_queue_holds WHERE kind='repeat-target'").get().n,entries:rows().filter(r=>!terminal.has(r.status)).map(tuple)};}
 const hold=db.transaction(input=>{
  offline();if(!input||Object.keys(input).sort().join(',')!=='entries,reason,revision'||!Number.isSafeInteger(input.revision)||!Array.isArray(input.entries)||input.entries.length===0||input.entries.length>5000||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw Error('Exact bounded queue review required');
  if(db.prepare('SELECT revision FROM founder_queue_review WHERE id=1').get().revision!==input.revision)throw Error('Queue review revision changed');
  const seen=new Set(),matched=[];
  for(const expected of input.entries){if(!expected||Object.keys(expected).sort().join(',')!=='attempts,id,payloadDigest,runId,status,updatedMs'||seen.has(expected.id))throw Error('Invalid or duplicate queue review CAS entry');seen.add(expected.id);const row=db.prepare('SELECT * FROM founder_job_history WHERE id=?').get(expected.id);if(!row||terminal.has(row.status)||Object.entries(tuple(row)).some(([k,v])=>expected[k]!==v))throw Error('Queue review CAS changed: '+expected.id);matched.push(row);}
  for(const row of matched)add(JSON.parse(row.payload),input.reason.trim());
  const control=getControl();db.prepare('INSERT INTO founder_queue_review_actions VALUES(?,?,?,?,?,?)').run(input.revision+1,input.reason.trim(),JSON.stringify(input.entries),control.revision,control.generation,Date.now());
  db.prepare('UPDATE founder_queue_review SET revision=revision+1 WHERE id=1').run();audit(null,'queue-review-held:'+matched.length);offline();return status();
 }).immediate;
 return {inspect,isTaskAdmitted:task=>inspect(task)===null,status,hold};
}
