// Offline reconciliation only: no adapters, provider requests, power controls or budget writes.
import {createHash} from 'node:crypto';
import {readFounderReports} from './founder-operations.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function auditFounderTasks({controller,budget,power,base,resumeFreeResearch=false,apply=false,now=Date.now(),taskIds=null}){
 if(taskIds!==null&&(!Array.isArray(taskIds)||!taskIds.length||!taskIds.every(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id))))throw Error('Invalid audit task scope');
 const run=()=>{
  if(apply&&(power?.enabled!==true||controller.prepare('SELECT status FROM founder_control').get()?.status!=='running'))throw Error('A personally started running session is required');
  const jobs=controller.prepare('SELECT * FROM founder_jobs').all(),reservations=budget.prepare('SELECT * FROM founder_reservations').all();
  const payload=j=>JSON.parse(j.payload),cost=j=>reservations.find(r=>r.id===j.run_id);
  const result=j=>{try{return JSON.parse(j.result);}catch{return null;}};
  const isFree=r=>r?.max_cost===0&&r.actual_cost===0;
  const validReplacement=j=>{
   if(j.status!=='done'||payload(j).kind!=='exa-research'||payload(j).dependencies?.length!==0||!j.result||hash(j.result)!==j.digest||!isFree(cost(j)))return false;
   const r=result(j);return r?.kind==='exa-research'&&r.provider==='exa'&&r.sources?.length>0&&r.sources.every(s=>typeof s.claim==='string'&&hash(s.claim)===s.digest&&typeof s.url==='string'&&s.url.startsWith('https://github.com/'))&&r.costReceipt?.actualCostRappen===0&&(r.costReceipt.evidenceRef===cost(j).receipt||cost(j).receipt==='local:'+j.run_id);
  };
  const attemptLookup=controller.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='founder_attempts'").get()?controller.prepare('SELECT result,receipt,diagnostic,stage FROM founder_attempts WHERE run_id=? AND task_id=?'):null;
  const replacements=jobs.filter(validReplacement).sort((a,b)=>b.updated_ms-a.updated_ms);
  const localReport=base?readFounderReports(base,now).orders:null;
  const report={at:new Date(now).toISOString(),apply,applied:0,actions:[],remaining:[]};
  for(const j of jobs.filter(j=>['failed','blocked'].includes(j.status)&&(taskIds===null||taskIds.includes(j.id)))){
   const p=payload(j),r=cost(j);let status=j.status,reason=j.reason,action,evidence,recoveredResult;
   const attempt=attemptLookup?.get(j.run_id,j.id);let saved,receipt,diagnostic;try{diagnostic=JSON.parse(attempt?.diagnostic);saved=JSON.parse(attempt?.result??'null');receipt=JSON.parse(attempt?.receipt??'null');}catch{}
   const truncated=['private-analysis','private-draft','work-planner'].includes(p.kind)&&saved?.kind===p.kind&&saved?.status==='incomplete'&&saved?.analysis===null&&saved?.costEvidence?.outputTokens===2000&&Number.isSafeInteger(r?.actual_cost)&&r.actual_cost>=0&&receipt?.actualCostRappen===r.actual_cost&&receipt?.evidenceRef===r.receipt;
   const newer=replacements.find(n=>n.updated_ms>j.updated_ms);
   if(resumeFreeResearch&&j.status==='failed'&&p.kind==='research'&&j.attempts>0&&j.attempts<3&&isFree(r)&&!j.result&&attempt?.stage==='failed'&&diagnostic?.code==='local_read_failed'&&receipt?.actualCostRappen===0&&receipt?.evidenceRef==='local:'+j.run_id&&r.receipt===receipt.evidenceRef&&p.dependencies.every(id=>jobs.find(other=>other.id===id)?.status==='done')){
    status='queued';reason=null;action='resume-repaired-free-research';evidence={run:j.run_id,costRappen:0,attemptsPreserved:j.attempts,basis:'Explicitly requested repair: bounded public GET adapter; settled zero receipt. Resume through the existing scheduler and its cooldowns, resources and three-attempt limit; no reset or new grant.'};
   }else if(j.status==='failed'&&p.kind==='order-report'&&isFree(r)&&!j.result&&localReport?.summaryOnly===true&&['partial','stale'].includes(localReport.status)){
    status='done';reason=null;action='recover-local-order-report';recoveredResult=JSON.stringify({kind:'order-report',observedAt:report.at,report:localReport});evidence={source:localReport.source,reportStatus:localReport.status,normalizedReportDigest:hash(JSON.stringify(localReport)),costRappen:0,basis:'Read local summary report with valid timestamp. Partial evidence only; no individual PR, acceptance or payment is inferred.'};
   }else if(j.status==='failed'&&p.kind==='exa-research'&&p.dependencies?.length===0&&isFree(r)&&newer&&!jobs.some(other=>payload(other).dependencies?.includes(j.id))){
    status='cancelled';reason='Alter kostenloser Exa-Abruf durch erfolgreiche neuere Suche ersetzt: '+newer.id;action='superseded-free-search';
    evidence={replacementTask:newer.id,replacementDigest:newer.digest,costRappen:0,basis:'Both root searches have no dependencies, so the public-query adapter uses the same fixed fallback query. Original failure remains in audit history; no fabricated result.'};
   }else if(r?.max_cost>0&&r.actual_cost===null){
    reason='Anbieterausgang und Kosten ungeklärt; Reservierung bleibt bestehen. Ohne zuordenbaren Einzelbeleg kein automatischer Neuversuch.';action='clarify-unknown-cost';evidence={run:j.run_id,heldRappen:r.max_cost};
   }else if(truncated){
    reason='Antwort an bestehender Ausgabegrenze unvollständig; Kosten abgeglichen. Kein automatischer identischer Neuversuch. Antwortumfang muss zuerst korrigiert werden.';action='clarify-truncated-response';evidence={run:j.run_id,actualCostRappen:r.actual_cost,outputTokens:2000,basis:'Persisted incomplete response and matching settled receipt; no usable complete JSON, no cost reset.'};
   }else if(j.status==='failed'&&j.attempts>=3&&Number.isSafeInteger(r?.actual_cost)){
    reason='Kosten abgeglichen; 3 Versuche ausgeschöpft. Kein automatischer Neuversuch; kein vollständig geprüftes Ergebnis vorhanden.';action='clarify-exhausted-attempts';evidence={run:j.run_id,actualCostRappen:r.actual_cost,attempts:j.attempts};
   }
   if(!action||status===j.status&&reason===j.reason&&!(truncated&&j.next_retry_ms!==null)){report.remaining.push({id:j.id,kind:p.kind,status:j.status,reason:j.reason});continue;}
   report.actions.push({id:j.id,action,status,reason,evidence});
   if(apply){
    const changed=controller.prepare('UPDATE founder_jobs SET status=?,reason=?,updated_ms=?,next_retry_ms=NULL WHERE id=? AND status=? AND updated_ms=? AND run_id IS ?').run(status,reason,status===j.status?j.updated_ms:now,j.id,j.status,j.updated_ms,j.run_id);
    if(changed.changes!==1)throw Error('Concurrent task change; reconciliation rolled back');
    if(recoveredResult)controller.prepare('UPDATE founder_jobs SET result=?,digest=? WHERE id=?').run(recoveredResult,hash(recoveredResult),j.id);
    controller.prepare('INSERT INTO founder_reconciliations(task_id,at,evidence) VALUES(?,?,?)').run(j.id,report.at,JSON.stringify({action,previousStatus:j.status,previousReason:j.reason,...evidence}));
    controller.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(report.at,j.id,'reconciled-'+action);report.applied++;
   }
  }
  return report;
 };
 return apply?controller.transaction(run).immediate():run();
}
