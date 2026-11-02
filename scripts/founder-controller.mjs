import {openTaskSightInspection,validateSightInspection} from './founder-sight-inspection.mjs';
import {explainTaskWait,adapterReadyAt} from './founder-task-wait.mjs';
import {splitPrivateTask} from './founder-private-split.mjs';
import {FOUNDER_LIMITS} from './founder-budget.mjs';
import {classifyLocalFailure} from './founder-failure-classification.mjs';
import {retainTerminalJobs} from './founder-task-retention.mjs';
import {controllerExecutionWindow} from './founder-execution-window.mjs';
import {openFounderQueueReview} from './founder-queue-review.mjs';
import Database from 'better-sqlite3';
import {createHash,randomUUID} from 'node:crypto';
const STORED_RESULT_RECHECK_REASON='Gespeichertes Ergebnis wird automatisch erneut gepr\u00fcft.';
const LEGACY_STORED_RESULT_RECHECK_REASON='Gespeichertes Ergebnis wird automatisch erneut gepr\u00c3\u00bcft.';
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
// Existing conversation roots remain in their original budget family; task IDs stay strict.
const validBudgetRoot=x=>validId(x)||(typeof x==='string'&&/^ugig-conversation:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x));
const hash=x=>createHash('sha256').update(x).digest('hex');
const publicDiagnostic=raw=>{if(!raw)return null;const {accessRevision,...data}=JSON.parse(raw);return data;};
export function openFounderController({file,budget,adapters,maxWorkers=FOUNDER_LIMITS.maxWorkers,queueReview=null}){
 if(!Number.isSafeInteger(maxWorkers)||maxWorkers<1||maxWorkers>FOUNDER_LIMITS.maxWorkers)throw Error('Worker limit invalid');
 const db=new Database(file);db.pragma('journal_mode=WAL');db.pragma('busy_timeout=5000');
 db.exec(`CREATE TABLE IF NOT EXISTS founder_control(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
 INSERT OR IGNORE INTO founder_control(id,status,revision) VALUES(1,'stopped',0);
 CREATE TABLE IF NOT EXISTS founder_jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,reason TEXT,run_id TEXT,lease_ms INTEGER,owner_pid INTEGER,result TEXT,digest TEXT,created_ms INTEGER NOT NULL,updated_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS founder_events(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,task_id TEXT,action TEXT NOT NULL);`);
 const columns=new Set(db.prepare('PRAGMA table_info(founder_jobs)').all().map(c=>c.name));
 if(!db.prepare('PRAGMA table_info(founder_control)').all().some(c=>c.name==='generation'))db.exec('ALTER TABLE founder_control ADD COLUMN generation INTEGER NOT NULL DEFAULT 0');
 if(!columns.has('attempts'))db.exec('ALTER TABLE founder_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
 if(!columns.has('retryable'))db.exec('ALTER TABLE founder_jobs ADD COLUMN retryable INTEGER NOT NULL DEFAULT 0');
 if(!columns.has('next_retry_ms'))db.exec('ALTER TABLE founder_jobs ADD COLUMN next_retry_ms INTEGER');
 db.exec('CREATE TABLE IF NOT EXISTS founder_attempts(run_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,stage TEXT NOT NULL,diagnostic TEXT NOT NULL,receipt TEXT,result TEXT,at_ms INTEGER NOT NULL)');
 db.exec(`CREATE TABLE IF NOT EXISTS founder_job_archive AS SELECT * FROM founder_jobs WHERE 0;
 CREATE UNIQUE INDEX IF NOT EXISTS founder_job_archive_id ON founder_job_archive(id);
 CREATE VIEW IF NOT EXISTS founder_job_history AS SELECT * FROM founder_jobs UNION ALL SELECT * FROM founder_job_archive;`);
 db.exec(`CREATE TABLE IF NOT EXISTS founder_access_wait(task_id TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS founder_repairs(task_id TEXT NOT NULL,revision TEXT NOT NULL,attempts INTEGER NOT NULL,status TEXT NOT NULL,next_ms INTEGER NOT NULL,PRIMARY KEY(task_id,revision));`);
 db.exec("CREATE INDEX IF NOT EXISTS founder_jobs_kind_status_updated ON founder_jobs(json_extract(payload,'$.kind'),status,updated_ms DESC); CREATE INDEX IF NOT EXISTS founder_jobs_kind_updated ON founder_jobs(json_extract(payload,'$.kind'),updated_ms DESC);");
 const sightInspection=openTaskSightInspection(db);
 const active=new Map(),ticks=new Set();let closing=false,closePromise;
 const state=()=>db.prepare('SELECT status,revision,generation FROM founder_control WHERE id=1').get();
 const audit=(id,action)=>db.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(new Date().toISOString(),id,action);
 const update=(id,status,reason=null)=>{db.prepare('UPDATE founder_jobs SET status=?,reason=?,updated_ms=? WHERE id=?').run(status,reason,Date.now(),id);audit(id,status);};
 let review;
 try{review=queueReview===null?null:openFounderQueueReview({db,options:queueReview,getControl:state,getActiveWorkers:()=>active.size,audit});}catch(error){db.close();throw error;}
 const admitted=task=>!review||review.isTaskAdmitted(task);
 const rowAdmitted=row=>admitted(JSON.parse(row.payload));
 // Recover only expired or demonstrably dead processes, never another live owner.
 for(const row of db.prepare("SELECT * FROM founder_jobs WHERE status IN ('running','verifying')").all()){
  if(!rowAdmitted(row))continue;
  let alive=false;try{process.kill(row.owner_pid,0);alive=true;}catch{}
  if(!alive||row.lease_ms<Date.now()){
   const attempt=db.prepare('SELECT * FROM founder_attempts WHERE run_id=?').get(row.run_id);
   if(attempt?.receipt)budget.settle({id:row.run_id,...JSON.parse(attempt.receipt)});
   else if(attempt?.stage==='prepared')budget.settle({id:row.run_id,actualCostRappen:0,evidenceRef:`preflight:${row.run_id}`});
   update(row.id,'blocked',attempt?.result&&attempt.receipt?STORED_RESULT_RECHECK_REASON:'Unterbrochener Lauf: Ergebnis und Kosten mÃ¼ssen abgeglichen werden.');
  }
 }
 // Recover only explicit evidence. A missing paid receipt never means zero cost.
 for(const entry of budget.snapshot().entries??[]){
  if(!admitted({id:entry.taskId,rootTaskId:entry.taskId}))continue;
  if(entry.actualCostRappen!==null)continue;
  const attempt=db.prepare('SELECT receipt FROM founder_attempts WHERE run_id=?').get(entry.id);
  if(attempt?.receipt){budget.settle({id:entry.id,...JSON.parse(attempt.receipt)});continue;}
  if(entry.maxCostRappen===0){budget.settle({id:entry.id,actualCostRappen:0,evidenceRef:`local:${entry.id}`});}
 }
 function retryAllowed(row,budgetState,retryView){
  if(!rowAdmitted(row))return false;
  const kind=JSON.parse(row.payload).kind,a=Object.hasOwn(adapters,kind)?adapters[kind]:null;
  if(!['blocked','failed'].includes(row.status)||!a||a.available===false||row.attempts>=3||/^(Budget|Kostenpr(?:\u00fc|\u00c3\u00bc)fung|Voraussetzung|Kein zugelassener)/.test(row.reason??''))return false;
  if(a.retrySafe===true&&a.maxCostRappen===0)return true;
  if(a.manualRetrySafe!==true||!row.run_id)return false;
  if(retryView)return retryView({runId:row.run_id,rootTaskId:JSON.parse(row.payload).rootTaskId,maxCostRappen:a.maxCostRappen});
  if(typeof budget.retryEligible==='function')return budget.retryEligible({runId:row.run_id,rootTaskId:JSON.parse(row.payload).rootTaskId,maxCostRappen:a.maxCostRappen});
  const b=budgetState??budget.snapshot(),entries=b.entries??[],receipt=entries.find(e=>e.id===row.run_id),root=JSON.parse(row.payload).rootTaskId;
  return b.active&&receipt?.actualCostRappen!==null&&receipt?.actualCostRappen!==undefined&&b.entriesComplete!==false&&b.remainingRappen>=a.maxCostRappen&&b.dayRemainingRappen>=a.maxCostRappen&&entries.filter(e=>e.taskId===root).reduce((n,e)=>n+(e.actualCostRappen??e.maxCostRappen),0)+a.maxCostRappen<=b.taskRappen;
 }
 // Local preparation only. Execution still requires the ordinary running state,
 // dependency/resource checks, transport OFF gate and a new budget reservation.
 function prepareInterruptedRetries(){
  for(const row of db.prepare("SELECT * FROM founder_jobs WHERE status='blocked' AND attempts>0 AND attempts<3").all()){
   if(!rowAdmitted(row))continue;
   if(!row.reason?.startsWith('Unterbrochener Lauf:')&&!row.reason?.startsWith('Bearbeitung unterbrochen;'))continue;
   const task=JSON.parse(row.payload),a=adapters[task.kind];
   if(a?.maxCostRappen!==0||a.manualRetrySafe!==true||typeof a.interruptedRetrySafe!=='function'||!retryAllowed(row))continue;
   let safe=false;try{safe=a.interruptedRetrySafe(task)===true;}catch{}
   if(!safe)continue;
   update(row.id,'queued');db.prepare('UPDATE founder_jobs SET next_retry_ms=NULL,retryable=0 WHERE id=?').run(row.id);audit(row.id,'interruption-retry-prepared');
  }
 }
 prepareInterruptedRetries();
 function dependencyResults(task){return task.dependencies.flatMap(id=>{const r=db.prepare("SELECT result,digest FROM founder_job_history WHERE id=? AND status='done'").get(id);return r?.result&&hash(r.result)===r.digest?[JSON.parse(r.result)]:[];});}
 const readyAt=(adapter,task)=>adapterReadyAt(adapter,task,adapter?.nextReadyAtFor?dependencyResults(task):[]);
 function snapshot(){const b=budget.snapshot(),retryView=budget.retryEligibilitySnapshot?.();return {...state(),taskCounts:Object.fromEntries(db.prepare('SELECT status,COUNT(*) n FROM founder_job_history GROUP BY status').all().map(r=>[r.status,r.n])),observedAt:new Date().toISOString(),maxWorkers,activeWorkers:active.size,budget:b,capabilities:Object.entries(adapters).map(([kind,a])=>({kind,status:a.available===false?'blocked':'available',reason:a.reason??null,maxCostRappen:a.planningMaxCostRappen??a.maxCostRappen,lastSuccessAt:db.prepare("SELECT MAX(updated_ms) at FROM founder_jobs WHERE json_extract(payload,'$.kind')=? AND status='done'").get(kind).at,lastOutcome:db.prepare("SELECT status,updated_ms AS at FROM founder_jobs WHERE json_extract(payload,'$.kind')=? AND status IN ('done','failed','blocked') ORDER BY updated_ms DESC LIMIT 1").get(kind)??null})),tasks:db.prepare('SELECT id,payload,status,reason,run_id,digest,created_ms,updated_ms,attempts,next_retry_ms FROM founder_jobs WHERE status NOT IN (?,?) OR id IN (SELECT id FROM founder_jobs WHERE status IN (?,?) ORDER BY created_ms DESC,id LIMIT 100) OR id IN (SELECT dependency.value FROM founder_jobs AS task,json_each(task.payload,?) AS dependency WHERE task.status NOT IN (?,?)) ORDER BY created_ms DESC,id').all('done','cancelled','done','cancelled','$.dependencies','done','cancelled').map(r=>({...r,...JSON.parse(r.payload),operatorHold:review?.inspect(JSON.parse(r.payload))??null,inspection:sightInspection.inspect(JSON.parse(r.payload)),waitState:review?.inspect(JSON.parse(r.payload))?{code:'operator-review-hold',until:null,reason:review.inspect(JSON.parse(r.payload)).reason}:(r.status==='queued'?sightInspection.wait(JSON.parse(r.payload)):null)??explainTaskWait({...r,...JSON.parse(r.payload)},adapters[JSON.parse(r.payload).kind],JSON.parse(r.payload).dependencies.map(id=>{const d=db.prepare('SELECT id,status,payload FROM founder_job_history WHERE id=?').get(id);return {id,status:d?.status,title:d?JSON.parse(d.payload).input?.title:null};}),Date.now(),adapters[JSON.parse(r.payload).kind]?.waitStateFor?dependencyResults(JSON.parse(r.payload)):[]),nextRetryAt:r.next_retry_ms,automaticRetryScheduled:Number.isFinite(r.next_retry_ms)&&adapters[JSON.parse(r.payload).kind]?.autoRetrySafe===true&&retryAllowed(r,b,retryView),nextEligibleAt:Math.max(JSON.parse(r.payload).input?.notBefore??0,readyAt(adapters[JSON.parse(r.payload).kind],JSON.parse(r.payload)),r.next_retry_ms??0)||null,diagnostic:publicDiagnostic(db.prepare('SELECT diagnostic FROM founder_attempts WHERE run_id=?').get(r.run_id)?.diagnostic),retryAllowed:retryAllowed(r,b,retryView),retryMaxCostRappen:adapters[JSON.parse(r.payload).kind]?.maxCostRappen??null,payload:undefined})),audit:db.prepare('SELECT * FROM founder_events ORDER BY seq DESC LIMIT 60').all()};}
 const claim=db.transaction(()=>{
  if(closing||state().status!=='running')return [];
  prepareInterruptedRetries();
  // These hooks are synchronous, registered local corrections, never model-produced code.
  // The immediate claim transaction serializes repairs with other controllers and ticks.
  for(const row of db.prepare("SELECT * FROM founder_jobs WHERE status IN ('failed','blocked')").all()){
   if(!rowAdmitted(row))continue;
   const task=JSON.parse(row.payload),a=adapters[task.kind];
   if(!a||a.available===false)continue;
   if(db.prepare('SELECT 1 FROM founder_access_wait WHERE task_id=?').get(row.id)&&row.attempts===0){
    db.prepare('DELETE FROM founder_access_wait WHERE task_id=?').run(row.id);update(row.id,'queued');audit(row.id,'access-restored');continue;
   }
   if(a.maxCostRappen!==0||a.retrySafe!==true||a.repairSafe!==true||typeof a.repairRevision!=='string'||a.repairRevision.length>100||typeof a.repair!=='function'||typeof a.verifyRepair!=='function')continue;
   const receipt=(budget.snapshot().entries??[]).find(e=>e.id===row.run_id);
   if(receipt&&receipt.actualCostRappen!==0)continue;
   const attempt=db.prepare('SELECT diagnostic,receipt FROM founder_attempts WHERE run_id=?').get(row.run_id);
   if(!attempt?.receipt||JSON.parse(attempt.receipt).actualCostRappen!==0)continue;
   const diagnostic=publicDiagnostic(attempt.diagnostic);
   if(!diagnostic||!['local_read_failed','service_read_failed','service_network_failed','service_dns_failed','service_timeout'].includes(diagnostic.code))continue;
   const prior=db.prepare('SELECT * FROM founder_repairs WHERE task_id=? AND revision=?').get(row.id,a.repairRevision);
   if(prior&&(prior.status==='verified'||prior.attempts>=3||prior.next_ms>Date.now()))continue;
   // An uncertain interrupted repair is not replayed; a new reviewed revision is required.
   if(prior?.status==='running')continue;
   const count=(prior?.attempts??0)+1;
   db.prepare("INSERT INTO founder_repairs VALUES(?,?,?,'running',?) ON CONFLICT(task_id,revision) DO UPDATE SET attempts=excluded.attempts,status='running',next_ms=excluded.next_ms").run(row.id,a.repairRevision,count,Date.now()+3600000);
   const assertActive=()=>{if(closing||state().status!=='running')throw Error('Repair stopped');};
   let verified=false;
   try{assertActive();const result=a.repair({task,diagnostic,assertActive});if(result?.then)throw Error('Async local repair unsupported');verified=a.verifyRepair(result)===true;assertActive();}catch{}
   db.prepare('UPDATE founder_repairs SET status=?,next_ms=? WHERE task_id=? AND revision=?').run(verified?'verified':'waiting',Date.now()+3600000*2**(count-1),row.id,a.repairRevision);
   audit(row.id,verified?'repair-verified':'repair-awaiting-evidence');
   if(verified){update(row.id,'queued');db.prepare('UPDATE founder_jobs SET next_retry_ms=NULL,retryable=0 WHERE id=?').run(row.id);}
  }
  // Stable budget view for retry eligibility only; reservations below keep their own checks.
  let retryBudget;
  const retryPermitted=row=>retryAllowed(row,retryBudget??=budget.snapshot());
  for(const row of db.prepare("SELECT j.*,a.diagnostic AS attempt_diagnostic FROM founder_jobs j LEFT JOIN founder_attempts a ON a.run_id=j.run_id WHERE j.status IN ('failed','blocked') AND j.next_retry_ms IS NULL AND j.attempts<3").all()){
   const a=adapters[JSON.parse(row.payload).kind],d=JSON.parse(row.attempt_diagnostic??'null');
   const changedRequest=d?.httpStatus===400&&a?.requestRevision&&d.requestRevision!==a.requestRevision;
   const changedAccess=d?.code==='invalid_api_key'&&d.accessRevision&&a?.accessRevision&&d.accessRevision!==a.accessRevision;
   const freeRead=a?.retrySafe&&a.maxCostRappen===0;
   if(a?.autoRetrySafe===true&&(changedAccess||changedRequest||freeRead)&&retryPermitted(row))db.prepare('UPDATE founder_jobs SET next_retry_ms=? WHERE id=?').run(changedAccess||changedRequest?Date.now():row.updated_ms+60000,row.id);
  }
  for(const row of db.prepare("SELECT * FROM founder_jobs WHERE status IN ('failed','blocked') AND next_retry_ms IS NOT NULL AND next_retry_ms<=? AND attempts<3").all(Date.now())){
   if(adapters[JSON.parse(row.payload).kind]?.autoRetrySafe&&retryPermitted(row)){update(row.id,'queued');db.prepare('UPDATE founder_jobs SET next_retry_ms=NULL WHERE id=?').run(row.id);audit(row.id,'automatic-retry');}
  }
  for(const row of db.prepare("SELECT * FROM founder_jobs WHERE status='blocked' AND reason='Voraussetzung nicht erfolgreich abgeschlossen.'").all()){
   if(!rowAdmitted(row))continue;
   const deps=JSON.parse(row.payload).dependencies;
   if(deps.every(id=>db.prepare('SELECT status FROM founder_job_history WHERE id=?').get(id)?.status==='done'))update(row.id,'queued');
  }
  for(const row of db.prepare("SELECT id,payload FROM founder_jobs WHERE status='blocked' AND retryable=1 AND attempts<3").all()){
   if(!rowAdmitted(row))continue;
   const task=JSON.parse(row.payload),a=Object.hasOwn(adapters,task.kind)?adapters[task.kind]:null;
   if(a?.retrySafe&&a.maxCostRappen===0)update(row.id,'queued');
  }
  const capacityBudget=budget.snapshot();
  if(capacityBudget.active)for(const row of db.prepare("SELECT id,payload,reason FROM founder_jobs WHERE status='blocked' AND reason IN ('Budget daily limit','Budget task limit') AND attempts<3").all()){
   if(!rowAdmitted(row))continue;
   const task=JSON.parse(row.payload),a=adapters[task.kind];
   const rootUsed=(capacityBudget.entries??[]).filter(e=>e.taskId===task.rootTaskId).reduce((n,e)=>n+(e.actualCostRappen??e.maxCostRappen),0);
   const rootReady=row.reason!=='Budget task limit'||capacityBudget.entriesComplete!==false&&Number.isSafeInteger(capacityBudget.taskRappen)&&rootUsed+(a?.maxCostRappen??Infinity)<=capacityBudget.taskRappen;
   if(rootReady&&a&&a.available!==false&&a.maxCostRappen<=Math.min(capacityBudget.remainingRappen,capacityBudget.dayRemainingRappen))update(row.id,'queued');
  }
  const running=db.prepare("SELECT payload FROM founder_jobs WHERE status IN ('running','verifying')").all();let capacity=maxWorkers-running.length;
  const locked=new Set(running.flatMap(r=>JSON.parse(r.payload).resources));const claimed=[];
  const queued=db.prepare("SELECT * FROM founder_jobs WHERE status='queued' ORDER BY created_ms,id").all();
  // Reserve no extra capacity: let one aged, free history check compete before
  // an older communication backlog. All admission gates below still apply.
  const historyIndex=queued.findIndex(row=>{const task=JSON.parse(row.payload);return task.kind==='adaptive-history'&&adapters[task.kind]?.maxCostRappen===0&&Date.now()-row.created_ms>=60000;});
  if(historyIndex>0)queued.unshift(...queued.splice(historyIndex,1));
  for(const row of queued){
   if(!rowAdmitted(row))continue;
   if(capacity<=0)break;const task=JSON.parse(row.payload),adapter=Object.hasOwn(adapters,task.kind)?adapters[task.kind]:undefined;
   if((task.input?.notBefore??0)>Date.now())continue;
   if(!adapter||adapter.available===false){db.prepare('INSERT OR IGNORE INTO founder_access_wait VALUES(?)').run(row.id);update(row.id,'blocked',adapter?.reason??'Kein zugelassener Bearbeiter fÃ¼r diese Aufgabe.');continue;}
   const deps=task.dependencies.map(id=>db.prepare('SELECT status FROM founder_job_history WHERE id=?').get(id)?.status);
   if(deps.some(s=>['blocked','failed','cancelled'].includes(s))){update(row.id,'blocked','Voraussetzung nicht erfolgreich abgeschlossen.');continue;}
   if(deps.some(s=>s!=='done')||task.resources.some(r=>locked.has(r)))continue;
   const inspection=sightInspection.inspect(task);if(inspection&&inspection.status!=='completed')continue;
   if(readyAt(adapter,task)>Date.now())continue;
   const runId=randomUUID();
   try{const reservation=budget.reserve({id:runId,rootTaskId:task.rootTaskId,maxCostRappen:adapter.maxCostRappen});if(reservation.duplicate)throw Error('Duplicate run');}catch(e){update(row.id,'blocked',String(e.message).startsWith('Budget')?e.message:'KostenprÃ¼fung nicht bestanden.');continue;}
   db.prepare("UPDATE founder_jobs SET status='running',attempts=attempts+1,retryable=0,run_id=?,owner_pid=?,lease_ms=?,updated_ms=? WHERE id=? AND status='queued'").run(runId,process.pid,Date.now()+controllerExecutionWindow(task,adapter).leaseMs,Date.now(),row.id);
   task.resources.forEach(r=>locked.add(r));capacity--;audit(row.id,'running');claimed.push({task,runId,adapter,generation:state().generation});
  }return claimed;
 });
 async function execute({task,runId,adapter,generation}){
  const abort=new AbortController();const record={abort,promise:null};active.set(task.id,record);
  const assertActive=()=>{const s=state();if(closing||abort.signal.aborted||!['running','paused'].includes(s.status)||s.generation!==generation||!admitted(task))throw Error('Execution stopped');};
  const watcher=setInterval(()=>{try{assertActive();}catch{abort.abort();}},100);
  const timeout=setTimeout(()=>abort.abort(),controllerExecutionWindow(task,adapter).executionMs);
  let dispatched=false,diagnostic={code:'preflight',requestRevision:adapter.requestRevision??null,accessRevision:adapter.accessRevision??null},settled=false,returned=false,responseIncomplete=false;
  if(adapter.providerTracked)db.prepare("INSERT INTO founder_attempts VALUES(?,?,'prepared',?,NULL,NULL,?)").run(runId,task.id,JSON.stringify(diagnostic),Date.now());
  const recordProviderEvent=e=>{
   if(!adapter.providerTracked)return;
   if(!['dispatch','response','receipt','rejected'].includes(e.stage))throw Error('Invalid provider stage');
   if(e.stage==='dispatch')assertActive();
   if(e.stage==='dispatch')dispatched=true;
   diagnostic={code:e.code??e.stage,requestRevision:e.requestRevision??adapter.requestRevision??null,parameter:e.parameter??null,accessRevision:diagnostic.accessRevision??null,httpStatus:e.httpStatus??diagnostic.httpStatus,requestId:e.requestId??diagnostic.requestId,clientRequestId:runId,retryable:e.retryable===true,retryAfterMs:e.retryAfterMs??0};
   // Persist receipt before touching the separate budget database; recovery is idempotent.
   db.prepare('UPDATE founder_attempts SET stage=?,diagnostic=?,receipt=COALESCE(?,receipt),at_ms=? WHERE run_id=?').run(e.stage,JSON.stringify(diagnostic),e.costReceipt?JSON.stringify(e.costReceipt):null,Date.now(),runId);
   if(e.costReceipt){budget.settle({id:runId,...e.costReceipt});settled=true;}
  };
  try{
   assertActive();const result=await adapter.execute({task,signal:abort.signal,assertActive,recordProviderEvent,grant:{reservationId:runId,maxCostRappen:adapter.maxCostRappen},dependencies:task.dependencies.map(id=>api.result(id))});returned=true;responseIncomplete=result?.status==='incomplete';
   if(adapter.providerTracked){const payload=JSON.stringify(result);if(Buffer.byteLength(payload)<=262144)db.prepare('UPDATE founder_attempts SET result=?,receipt=COALESCE(?,receipt),at_ms=? WHERE run_id=?').run(payload,result?.costReceipt?JSON.stringify(result.costReceipt):null,Date.now(),runId);}
   // Account for actual provider response even if the operator stopped during the call.
   if(adapter.maxCostRappen===0)budget.settle({id:runId,actualCostRappen:0,evidenceRef:`local:${runId}`});
   else if(result?.costReceipt){budget.settle({id:runId,...result.costReceipt});settled=true;}
   else throw Error('Cost receipt missing');
   assertActive();update(task.id,'verifying');if(!await adapter.verify(result))throw Error('Verification failed');assertActive();
   const payload=JSON.stringify(result);if(Buffer.byteLength(payload)>262144)throw Error('Result too large');
   db.transaction(()=>{assertActive();db.prepare("UPDATE founder_jobs SET status='done',reason=NULL,result=?,digest=?,updated_ms=? WHERE id=? AND run_id=? AND status='verifying'").run(payload,hash(payload),Date.now(),task.id,runId);audit(task.id,'done');}).immediate();
  }catch(error){
   if(adapter.maxCostRappen===0){budget.settle({id:runId,actualCostRappen:0,evidenceRef:`local:${runId}`});settled=true;diagnostic=classifyLocalFailure(error);db.prepare("INSERT OR REPLACE INTO founder_attempts VALUES(?,?,'failed',?,?,NULL,?)").run(runId,task.id,JSON.stringify(diagnostic),JSON.stringify({actualCostRappen:0,evidenceRef:`local:${runId}`}),Date.now());}
   if(adapter.providerTracked){
    if(!dispatched&&!settled){budget.settle({id:runId,actualCostRappen:0,evidenceRef:`preflight:${runId}`});settled=true;}
    diagnostic={...diagnostic,code:responseIncomplete?'response_incomplete':diagnostic.code==='invalid_request_error'||diagnostic.code==='rejected'||diagnostic.code==='rate_limit_exceeded'||diagnostic.code==='insufficient_quota'||diagnostic.code==='invalid_api_key'||diagnostic.code==='provider_http_error'||diagnostic.code==='model_not_found'?diagnostic.code:returned?'verification_failed':!dispatched?'preflight_failed':settled?'response_processing_failed':'provider_outcome_unknown'};
    db.prepare('UPDATE founder_attempts SET diagnostic=?,at_ms=? WHERE run_id=?').run(JSON.stringify(diagnostic),Date.now(),runId);
   }
   const retryable=(abort.signal.aborted||adapter.reconcileSafe===true)&&adapter.retrySafe===true&&adapter.maxCostRappen===0;
   const auto=!responseIncomplete&&adapter.autoRetrySafe===true&&(!adapter.shouldAutoRetry||adapter.shouldAutoRetry(error))&&settled&&(returned||diagnostic.retryable===true||adapter.maxCostRappen===0)&&!closing&&!abort.signal.aborted;
   update(task.id,(abort.signal.aborted||retryable)?'blocked':'failed',responseIncomplete?'Antwort unvollstÃ¤ndig (Ausgabegrenze oder Inhaltsfilter); Kosten abgeglichen. Kein automatischer identischer Neuversuch.':auto?(adapter.maxCostRappen===0?'Dienstabruf fehlgeschlagen; keine Kostenreservierung. Wiederholung nach Abrufpause.':'VorÃ¼bergehender Modellfehler; automatische Wiederholung mit KostenprÃ¼fung.'):retryable?'Lesender Lauf unterbrochen; Fortsetzen erlaubt hÃ¶chstens drei Versuche.':abort.signal.aborted?'Bearbeitung unterbrochen; keine automatische Wiederholung.':adapter.maxCostRappen===0?'Dienstabruf fehlgeschlagen; keine Kostenreservierung.':settled?'Bearbeitung oder ErgebnisprÃ¼fung fehlgeschlagen; Kosten abgeglichen.':'Bearbeitung fehlgeschlagen; Anbieterausgang und Kosten noch ungeklÃ¤rt.');
   if(returned&&settled&&adapter.providerTracked&&(closing||abort.signal.aborted))update(task.id,'blocked',STORED_RESULT_RECHECK_REASON);
   const attempts=db.prepare('SELECT attempts FROM founder_jobs WHERE id=?').get(task.id).attempts;
   db.prepare('UPDATE founder_jobs SET retryable=?,next_retry_ms=? WHERE id=?').run(Number(retryable),auto&&attempts<3?Math.max(readyAt(adapter,task),Date.now()+Math.max(diagnostic.retryAfterMs??0,60000*2**(attempts-1))):null,task.id);
  }
  finally{clearInterval(watcher);clearTimeout(timeout);active.delete(task.id);}
 }
 async function recoverResults(){
  if(closing||state().status!=='running')return;
  for(const row of db.prepare("SELECT j.*,a.result AS saved_result FROM founder_jobs j JOIN founder_attempts a ON a.run_id=j.run_id WHERE j.status='blocked' AND j.reason IN (?,?) AND a.result IS NOT NULL AND a.receipt IS NOT NULL").all(STORED_RESULT_RECHECK_REASON,LEGACY_STORED_RESULT_RECHECK_REASON)){
   if(!rowAdmitted(row))continue;
   const adapter=adapters[JSON.parse(row.payload).kind],generation=state().generation;
   if((!adapter?.providerTracked&&!adapter?.recoverVerify)||adapter.available===false)continue;
   if(closing||state().status!=='running')break;
   update(row.id,'verifying');db.prepare('UPDATE founder_jobs SET owner_pid=?,lease_ms=? WHERE id=?').run(process.pid,Date.now()+180000,row.id);
   try{
    if(Buffer.byteLength(row.saved_result)>262144||!await (adapter.recoverVerify??adapter.verify)(JSON.parse(row.saved_result)))throw Error('Invalid saved result');
    if(closing||state().generation!==generation||!['running','paused'].includes(state().status)||!rowAdmitted(row)){update(row.id,'blocked',STORED_RESULT_RECHECK_REASON);continue;}
    db.prepare("UPDATE founder_jobs SET status='done',reason=NULL,result=?,digest=?,next_retry_ms=NULL,updated_ms=? WHERE id=?").run(row.saved_result,hash(row.saved_result),Date.now(),row.id);audit(row.id,'recovered-verified-result');
   }catch{
    update(row.id,'failed','Gespeichertes Ergebnis hat die erneute PrÃ¼fung nicht bestanden.');
    if(adapter.autoRetrySafe&&row.attempts<3)db.prepare('UPDATE founder_jobs SET next_retry_ms=? WHERE id=?').run(Date.now()+60000,row.id);
   }
  }
 }
 const api={
  databaseFile:file,
  queueReviewStatus:()=>review?.status()??{enabled:false,initialized:false,revision:null,entries:[]},
  isTaskAdmitted:task=>admitted(task),
  holdQueueForReview(input){if(closing||!review)throw Error('Queue review unavailable');return review.hold(input);},
  recordSightInspection(input){if(closing)throw Error('Controller closing');const result=sightInspection.record(input);audit(input.id,'sight-inspection-'+input.outcome);return result;},
  repairStatus(){return db.prepare('SELECT task_id AS taskId,revision,attempts,status,next_ms AS nextCheckAt FROM founder_repairs ORDER BY next_ms DESC LIMIT 100').all();},
  preparePrivateSplits:db.transaction(()=>{
   if(closing||state().status!=='running'||!adapters['private-part'])return [];
   const prepared=[],b=budget.snapshot();
   for(const row of db.prepare("SELECT * FROM founder_jobs WHERE status IN ('queued','failed') OR (status='blocked' AND reason IN (?,?))").all(STORED_RESULT_RECHECK_REASON,LEGACY_STORED_RESULT_RECHECK_REASON)){
    if(!rowAdmitted(row))continue;
    let task=JSON.parse(row.payload);if(!['private-analysis','private-draft'].includes(task.kind)||task.input?.splitAssembly||task.dependencies.length>17)continue;
    if(row.status==='queued'&&row.attempts!==0)continue;
    if(row.status!=='queued'){
     const attempt=db.prepare('SELECT result,receipt FROM founder_attempts WHERE run_id=? AND task_id=?').get(row.run_id,row.id);
     let saved,receipt;try{saved=JSON.parse(attempt?.result);receipt=JSON.parse(attempt?.receipt);}catch{continue;}
     const settled=budget.receipt?.(row.run_id);
     const entries=b.entries?.filter(e=>e.taskId===task.rootTaskId)??[],paid=entries.find(e=>e.id===row.run_id);
     if(saved?.kind!==task.kind||saved?.status!=='incomplete'||saved.analysis!==null||saved.costEvidence?.outputTokens!==2000||saved.incompleteReason==='content_filter'||!receipt||!receipt.evidenceRef||settled?.evidenceRef!==receipt.evidenceRef||settled?.actualCostRappen!==receipt.actualCostRappen||paid?.actualCostRappen!==receipt.actualCostRappen||!Number.isSafeInteger(paid?.actualCostRappen)||saved.costReceipt?.evidenceRef!==receipt.evidenceRef||entries.some(e=>e.actualCostRappen===null)||b.entriesComplete===false||!b.active||Math.min(b.remainingRappen,b.dayRemainingRappen,b.taskRappen-entries.reduce((n,e)=>n+e.actualCostRappen,0))<50)continue;
     const id='split-recovery-'+hash(row.id).slice(0,32);if(api.hasTask(id))continue;
     task={...task,id,input:{...task.input,recoveryOf:row.id}};
    }
    const rootEntries=b.entries?.filter(e=>e.taskId===task.rootTaskId)??[];
    const room=Math.min(b.remainingRappen,b.dayRemainingRappen,b.taskRappen-rootEntries.reduce((n,e)=>n+(e.actualCostRappen??e.maxCostRappen),0));
    const plan=splitPrivateTask(task,{compact:room<150});for(const part of plan.parts)api.enqueue(part);
    if(row.status==='queued')db.prepare('UPDATE founder_jobs SET payload=? WHERE id=? AND status=\'queued\' AND attempts=0').run(JSON.stringify(plan.parent),row.id);
    else api.enqueue(plan.parent);
    audit(task.id,'private-task-decomposed');prepared.push(task.id);
   }
   return prepared;
  }).immediate,
  controlState:()=>({...state(),activeWorkers:active.size}),
  enqueue:db.transaction(input=>{
   if(!input||Object.keys(input).sort().join(',')!=='dependencies,id,input,kind,resources,rootTaskId'||!validId(input.id)||!validBudgetRoot(input.rootTaskId)||!validId(input.kind)||!Array.isArray(input.dependencies)||input.dependencies.length>20||!input.dependencies.every(validId)||input.dependencies.includes(input.id)||!Array.isArray(input.resources)||input.resources.length>10||!input.resources.every(validId))throw Error('Invalid task');
   validateSightInspection(input);
   if(!admitted(input))return {accepted:false,reason:'operator-review-hold',operatorHold:review.inspect(input)};
   const payload=JSON.stringify(input);if(Buffer.byteLength(payload)>20000)throw Error('Task too large');const old=db.prepare('SELECT payload FROM founder_job_history WHERE id=?').get(input.id);if(old){if(old.payload!==payload)throw Error('Conflicting task');return input.id;}
   if(db.prepare('SELECT COUNT(*) n FROM founder_jobs').get().n>=5000){const retained=retainTerminalJobs(db);if(retained)audit(null,'verified-terminal-tasks-retained:'+retained);if(db.prepare('SELECT COUNT(*) n FROM founder_jobs').get().n>=5000)throw Error('Task capacity reached');}
   db.prepare("INSERT INTO founder_jobs(id,payload,status,created_ms,updated_ms) VALUES(?,?,'queued',?,?)").run(input.id,payload,Date.now(),Date.now());audit(input.id,'queued');return input.id;
  }).immediate,
  control:db.transaction((action,revision=state().revision)=>{
   const s=state();if(action!=='emergency-stop'&&s.revision!==revision)throw Error('Controller changed');
   let next={start:'running',resume:'running',pause:'paused',stop:'stopped','emergency-stop':'emergency_stopped'}[action];
   const allowed={start:['stopped','emergency_stopped'],resume:['paused'],pause:['running'],stop:['running','paused','stopped','emergency_stopped'],'emergency-stop':['running','paused','stopped','emergency_stopped']};
   if(!next||!allowed[action].includes(s.status))throw Error('Invalid control transition');
   if(action==='stop'&&s.status==='emergency_stopped')next='emergency_stopped';
   const aborting=['stop','emergency-stop'].includes(action);
   db.prepare('UPDATE founder_control SET status=?,revision=revision+1,generation=generation+? WHERE id=1').run(next,Number(aborting));
   if(aborting)for(const a of active.values())a.abort.abort();audit(null,action);return snapshot();
  }).immediate,
  tick(){if(closing)return Promise.resolve([]);const p=(async()=>{await recoverResults();const jobs=claim.immediate();const promises=jobs.map(job=>{const p=execute(job);const a=active.get(job.task.id);if(a)a.promise=p;return p;});return Promise.allSettled(promises);})();ticks.add(p);p.then(()=>ticks.delete(p),()=>ticks.delete(p));return p;},
  snapshot,
  archive(input={}){
   const {cursor=null,limit=25}=input;
   if(Object.keys(input).some(k=>!['cursor','limit'].includes(k))||!Number.isInteger(limit)||limit<1||limit>50||cursor!==null&&(typeof cursor!=='string'||!/^\d{1,16}:[a-zA-Z0-9_-]{1,100}$/.test(cursor)))throw Error('Invalid archive page');
   const parts=cursor?.split(':'),at=parts?Number(parts[0]):null,id=parts?.[1];if(at!==null&&!Number.isSafeInteger(at))throw Error('Invalid archive cursor');
   const rows=at===null?db.prepare("SELECT id,payload,result,digest,updated_ms FROM founder_job_history WHERE status='done' ORDER BY updated_ms DESC,id DESC LIMIT ?").all(limit+1):db.prepare("SELECT id,payload,result,digest,updated_ms FROM founder_job_history WHERE status='done' AND (updated_ms<? OR (updated_ms=? AND id<?)) ORDER BY updated_ms DESC,id DESC LIMIT ?").all(at,at,id,limit+1);
   const page=rows.slice(0,limit);for(const row of page)if(!row.result||hash(row.result)!==row.digest)throw Error('Archive result integrity check failed');
   const items=page.map(r=>{const p=JSON.parse(r.payload);return {id:r.id,kind:p.kind,input:{title:p.input?.title??p.kind},status:'done',updated_ms:r.updated_ms,digest:r.digest,source:'autonomy'};});
   const last=page.at(-1);return {items,total:db.prepare("SELECT count(*) n FROM founder_job_history WHERE status='done'").get().n,nextCursor:rows.length>limit?`${last.updated_ms}:${last.id}`:null};
  },
  planningHistory(){return db.prepare('SELECT id,payload,status,updated_ms FROM founder_job_history ORDER BY created_ms DESC,id LIMIT 5000').all().map(r=>({...r,...JSON.parse(r.payload),payload:undefined}));},
  hasTask(id){if(!validId(id))throw Error('Invalid task');return !!db.prepare('SELECT 1 FROM founder_job_history WHERE id=?').get(id);},
  retry:db.transaction((id,updatedMs)=>{if(!validId(id)||!Number.isSafeInteger(updatedMs))throw Error('Invalid retry');const row=db.prepare('SELECT * FROM founder_jobs WHERE id=?').get(id);if(!row||row.updated_ms!==updatedMs||!retryAllowed(row))throw Error('Retry unavailable');update(id,'queued');return snapshot();}).immediate,
  result(id){if(!validId(id))throw Error('Invalid result');const r=db.prepare("SELECT result,digest FROM founder_job_history WHERE id=? AND status='done'").get(id);if(!r||hash(r.result)!==r.digest)throw Error('Result unavailable');return JSON.parse(r.result);},
  close(){if(closePromise)return closePromise;closing=true;for(const a of active.values())a.abort.abort();closePromise=(async()=>{await Promise.allSettled([...ticks,...[...active.values()].map(a=>a.promise)]);db.close();})();return closePromise;}
 };return api;
}
