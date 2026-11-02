// Explicit one-shot operator recovery; never starts or stops Numaron or changes budget limits.
import fs from 'node:fs';import path from 'node:path';import dns from 'node:dns/promises';import {randomUUID,createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import Database from 'better-sqlite3';
import {openFounderBudget} from './founder-budget.mjs';import {createFounderConnectors} from './founder-connectors.mjs';import {legacyExaRetryEligible} from './founder-exa-legacy.mjs';import {transientExaFailure} from './founder-exa-retry.mjs';
const base=fileURLToPath(new URL('../',import.meta.url)),dir=path.join(base,'artifacts/founder-autonomy-20261013'),id='source-repair-2a654007d99f8f1daba5c5736de0fcec';
const power=()=>JSON.parse(fs.readFileSync(path.join(base,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8').trim().split(/\r?\n/).at(-1));
const control=new Database(path.join(dir,'controller.db'));control.pragma('busy_timeout=5000');const budget=openFounderBudget(path.join(dir,'budget.db')),usage=new Database(path.join(dir,'connectors/connector-usage.db'),{readonly:true});
let connectors,watcher,reserved=false,claimed=false;const run=randomUUID(),abort=new AbortController(),report={at:new Date().toISOString(),taskId:id,runId:run,restartPerformed:false,powerModified:false,budgetLimitsModified:false,success:false};
try{
 const initial=power(),state=control.prepare('SELECT * FROM founder_control').get(),job=control.prepare('SELECT * FROM founder_jobs WHERE id=?').get(id);
 const attempt=job&&control.prepare('SELECT * FROM founder_attempts WHERE run_id=? AND task_id=?').get(job.run_id,id),reservation=job&&budget.receipt(job.run_id),rawBudget=new Database(path.join(dir,'budget.db'),{readonly:true});
 let stored;try{stored=job&&rawBudget.prepare('SELECT * FROM founder_reservations WHERE id=?').get(job.run_id);}finally{rawBudget.close();}
 const last=usage.prepare('SELECT * FROM exa_attempts ORDER BY at DESC,seq DESC LIMIT 1').get(),count=last&&usage.prepare('SELECT COUNT(*) n FROM exa_attempts WHERE window=?').get(last.window).n;
 if(!legacyExaRetryEligible({power:initial,control:state,job,attempt,reservation:stored,last,count,now:Date.now()}))throw Error('Legacy recovery no longer eligible; no work performed');
 if(!budget.snapshot().active)throw Error('Budget inactive');
 // In restricted terminals this fails BEFORE any reservation, job claim or quota override.
 await dns.lookup('mcp.exa.ai');await dns.lookup('api.github.com');
 const task=JSON.parse(job.payload),assertActive=()=>{const p=power(),s=control.prepare('SELECT status,generation FROM founder_control').get();if(!p.enabled||p.revision!==initial.revision||s.status!=='running'||s.generation!==state.generation||abort.signal.aborted)throw Error('Operating session changed; recovery stopped');};assertActive();
 connectors=createFounderConnectors({directory:path.join(dir,'connectors'),legacyExaRetry:{window:last.window,at:last.at,reference:'operator:'+job.run_id,expiresAt:Date.now()+120000}});
 control.transaction(()=>{
  assertActive();const current=control.prepare('SELECT * FROM founder_jobs WHERE id=?').get(id);if(current.status!=='queued'||current.updated_ms!==job.updated_ms||current.run_id!==job.run_id||current.attempts!==1)throw Error('Concurrent task change');
  if(control.prepare("SELECT COUNT(*) n FROM founder_jobs WHERE status IN ('running','verifying')").get().n>=4)throw Error('Worker pool full');
  budget.reserve({id:run,rootTaskId:task.rootTaskId,maxCostRappen:0});reserved=true;
  control.prepare("UPDATE founder_jobs SET status='running',run_id=?,attempts=attempts+1,owner_pid=?,lease_ms=?,updated_ms=?,reason=NULL,next_retry_ms=NULL WHERE id=?").run(run,process.pid,Date.now()+180000,Date.now(),id);claimed=true;
  control.prepare('INSERT INTO founder_reconciliations(task_id,at,evidence) VALUES(?,?,?)').run(id,new Date().toISOString(),JSON.stringify({action:'operator-authorized-legacy-zero-cost-retry',oldRun:job.run_id,oldDiagnostic:attempt.diagnostic,oldReceipt:attempt.receipt,oldExaRecord:last,basis:'One bounded retry explicitly requested; unknown historical error remains unknown; attempts preserved'}));
 }).immediate();
 watcher=setInterval(()=>{try{assertActive();}catch{abort.abort();}},100);
 const dependencies=task.dependencies.map(dep=>{const j=control.prepare('SELECT status,result FROM founder_jobs WHERE id=?').get(dep);if(j?.status!=='done'||!j.result)throw Error('Dependency unavailable');return JSON.parse(j.result);});
 const adapter=connectors.adapters['exa-research'],result=await adapter.execute({task,dependencies,signal:abort.signal,assertActive,grant:{reservationId:run,maxCostRappen:0}});assertActive();if(!adapter.verify(result))throw Error('Result verification failed');
 const encoded=JSON.stringify(result);budget.settle({id:run,actualCostRappen:0,evidenceRef:result.costReceipt.evidenceRef});
 control.transaction(()=>{assertActive();const current=control.prepare('SELECT status,run_id FROM founder_jobs WHERE id=?').get(id);if(current.status!=='running'||current.run_id!==run)throw Error('Concurrent task change');control.prepare("INSERT INTO founder_attempts VALUES(?,?,'receipt',?,?,?,?)").run(run,id,JSON.stringify({code:'operator-recovery-completed'}),JSON.stringify(result.costReceipt),encoded,Date.now());control.prepare("UPDATE founder_jobs SET status='done',result=?,digest=?,reason=NULL,updated_ms=?,next_retry_ms=NULL WHERE id=? AND run_id=?").run(encoded,createHash('sha256').update(encoded).digest('hex'),Date.now(),id,run);control.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(new Date().toISOString(),id,'operator-legacy-retry-done');}).immediate();
 report.success=true;report.sources=result.sources.map(s=>s.url);
}catch(error){
 report.error=error.cause?.code??error.message;
 if(reserved&&budget.receipt(run)?.actualCostRappen===null)budget.settle({id:run,actualCostRappen:0,evidenceRef:'local:'+run});
 if(claimed){const diagnostic=error.diagnostic??{code:'local_read_failed'},retry=transientExaFailure(diagnostic.code,diagnostic.httpStatus),at=Date.now();control.transaction(()=>{control.prepare("INSERT OR REPLACE INTO founder_attempts VALUES(?,?,'failed',?,?,NULL,?)").run(run,id,JSON.stringify(diagnostic),JSON.stringify(budget.receipt(run)),at);control.prepare("UPDATE founder_jobs SET status='failed',reason=?,updated_ms=?,next_retry_ms=? WHERE id=? AND run_id=? AND status='running'").run('Einmaliger kostenloser Altfall-Neuversuch fehlgeschlagen; Diagnose gespeichert.',at,retry?Math.max(at+600000,connectors?.adapters['exa-research'].nextReadyAt??0):null,id,run);}).immediate();}
 process.exitCode=1;
}finally{
 clearInterval(watcher);connectors?.close();usage.close();budget.close();control.close();
 const file=path.join(base,'artifacts/founder-repair-20261015/exa-legacy-retry-result-20261017.json');fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,reportFile:file},null,2));
}
