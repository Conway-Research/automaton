import {createHash} from 'node:crypto';
import {canonical} from './founder-restoration-integrity.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const actionKey=action=>{const {id,...binding}=action??{};return canonical(binding);};
// Explicit one-shot operator repair; native scheduler still checks access, cooldown and grants.
export function queueReviewedFreeRetry({controller,budget,communication,taskId,expectedUpdatedMs,admitTask,now=Date.now()}){
 return controller.transaction(()=>{
  const row=controller.prepare('SELECT * FROM founder_jobs WHERE id=?').get(taskId),old=row&&parse(row);
  if(!old||!['failed','blocked'].includes(old.status)||old.updated_ms!==expectedUpdatedMs||!Number.isInteger(old.attempts)||old.attempts<1||old.attempts>=3||!['firecrawl-research','external-communication'].includes(old.task.kind)||admitTask?.(old.task)!==true)return false;
  if(old.task.kind==='external-communication'&&(!old.task.input?.url?.startsWith('https://ugig.net/api/conversations/')||communication.prepare("SELECT 1 FROM outreach_messages WHERE target=? AND state!='sent'").get(old.task.input.url)))return false;
  const attempts=controller.prepare('SELECT * FROM founder_attempts WHERE task_id=?').all(taskId);
  if(attempts.length!==old.attempts||!attempts.some(a=>a.run_id===old.run_id)||!attempts.every(a=>{try{const b=budget.prepare('SELECT * FROM founder_reservations WHERE id=?').get(a.run_id);return JSON.parse(a.receipt).actualCostRappen===0&&b?.root_task===old.task.rootTaskId&&b.max_cost===0&&b.actual_cost===0;}catch{return false;}}))return false;
  controller.prepare("UPDATE founder_jobs SET status='queued',reason=NULL,retryable=0,next_retry_ms=NULL,updated_ms=? WHERE id=?").run(now,taskId);
  controller.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(new Date(now).toISOString(),taskId,'operator-reviewed-free-retry');return true;
 }).immediate();
}
function parse(row){try{return {...row,task:JSON.parse(row.payload),value:row.result?JSON.parse(row.result):null};}catch{return null;}}
export function reconcileSupersededReads({controller,budget,communication,now=Date.now(),dryRun=false}){
 const changed=[];
 controller.transaction(()=>{
  const rows=controller.prepare('SELECT * FROM founder_jobs').all().map(parse).filter(Boolean);
  for(const old of rows.filter(r=>['failed','blocked'].includes(r.status))){
   const t=old.task;if(!['source-reconcile-application','external-communication','firecrawl-research'].includes(t.kind))continue;
   if(t.kind==='external-communication'&&(!t.input?.url?.startsWith('https://ugig.net/api/conversations/')||communication.prepare("SELECT 1 FROM outreach_messages WHERE target=? AND state!='sent'").get(t.input.url)))continue;
   const attempts=controller.prepare('SELECT * FROM founder_attempts WHERE task_id=?').all(old.id);
   if(attempts.length!==old.attempts||!attempts.some(a=>a.run_id===old.run_id)||!attempts.every(a=>{try{const b=budget.prepare('SELECT * FROM founder_reservations WHERE id=?').get(a.run_id);return JSON.parse(a.receipt).actualCostRappen===0&&b?.root_task===t.rootTaskId&&b.max_cost===0&&b.actual_cost===0;}catch{return false;}}))continue;
   const newer=rows.filter(r=>r.status==='done'&&r.updated_ms>old.updated_ms&&r.task.kind===t.kind&&r.task.rootTaskId===t.rootTaskId&&r.result&&hash(r.result)===r.digest&&r.value?.kind===t.kind).sort((a,b)=>b.updated_ms-a.updated_ms).find(r=>{
    if(t.kind==='source-reconcile-application')return t.input?.action?.kind==='reconcile-application'&&t.input.action.maxCostRappen===0&&actionKey(t.input.action)===actionKey(r.task.input?.action)&&r.value.outcome?.confirmed===true&&typeof r.value.outcome.evidenceRef==='string'&&canonical(r.value.orderKey)===canonical(t.input.action.orderKey);
    if(t.kind==='external-communication')return r.task.input?.url===t.input.url&&r.value.url===t.input.url&&r.value.status==='not-required';
    return r.task.input?.sourceRepair?.originalTaskId===old.id&&r.value.sources?.length>0&&r.value.sources.every(s=>typeof s.url==='string'&&/^[a-f0-9]{64}$/.test(s.digest??''));
   });
   if(!newer)continue;
   const reason='Durch späteren erfolgreichen Abgleich ersetzt: '+newer.id+'. Alter Fehlversuch und Kostenbelege bleiben erhalten.';
   if(!dryRun){controller.prepare("UPDATE founder_jobs SET status='cancelled',reason=?,next_retry_ms=NULL,retryable=0,updated_ms=? WHERE id=? AND status IN ('failed','blocked')").run(reason,now,old.id);controller.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(new Date(now).toISOString(),old.id,'superseded-by:'+newer.id);}
   changed.push({id:old.id,kind:t.kind,replacement:newer.id,previousStatus:old.status,previousReason:old.reason,attemptsPreserved:old.attempts});
  }
 }).immediate();return {dryRun,changed};
}
