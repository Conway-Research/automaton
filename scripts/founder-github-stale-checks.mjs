// One-shot local reconciliation of exhausted historical GET checks. Never dispatches IO.
export function reconcileGithubChecks({controller,budget,communication,evidence,now=Date.now(),dryRun=false}){
 if(!Array.isArray(evidence)||evidence.length>100||!Number.isSafeInteger(now))throw Error('Bounded evidence required');
 const changed=[],skipped=[];
 const run=controller.transaction(()=>{
  for(const e of evidence){
   const skip=reason=>skipped.push({id:e.taskId,reason});
   const at=Date.parse(e.observedAt),canonical=typeof e.url==='string'&&/^https:\/\/github\.com\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9]\d*$/.test(e.url);
   if(!canonical||!Number.isFinite(at)||at>now||now-at>15*60000){skip('invalid-or-stale-evidence');continue;}
   const code=e.httpStatus===404?'source-unavailable':e.httpStatus===200&&e.state==='closed'?'closed-issue':e.httpStatus===200&&e.state==='open'&&e.aiApproval===false?'no-ai-communication-approval':null;
   if(!code){skip('no-permanent-gate-proved');continue;}
   const row=controller.prepare('SELECT * FROM founder_jobs WHERE id=?').get(e.taskId);
   if(!row||row.status!=='blocked'||row.attempts!==3){skip('not-an-exhausted-blocked-check');continue;}
   let task;try{task=JSON.parse(row.payload);}catch{skip('invalid-task');continue;}
   if(task.kind!=='external-communication'||task.input?.url!==e.url){skip('task-binding-mismatch');continue;}
   if(communication.prepare("SELECT 1 FROM outreach_messages WHERE target=? AND state!='sent'").get(e.url)){skip('uncertain-outbound-message');continue;}
   const attempts=controller.prepare('SELECT * FROM founder_attempts WHERE task_id=?').all(row.id);
   if(attempts.length!==row.attempts||!attempts.some(a=>a.run_id===row.run_id)){skip('attempt-history-incomplete');continue;}
   const zero=attempts.every(a=>{try{const r=JSON.parse(a.receipt),d=JSON.parse(a.diagnostic),b=budget.prepare('SELECT * FROM founder_reservations WHERE id=?').get(a.run_id);return d.code==='local_read_failed'&&r.actualCostRappen===0&&b?.root_task===task.rootTaskId&&b.max_cost===0&&b.actual_cost===0;}catch{return false;}});
   if(!zero){skip('unsettled-or-nonzero-attempt');continue;}
   const reason={ 'closed-issue':'Prüfung beendet: GitHub-Issue ist geschlossen; keine automatische Kontaktaufnahme.', 'no-ai-communication-approval':'Prüfung beendet: Keine ausdrückliche Freigabe für automatische KI-Kontaktaufnahme; keine automatische Wiederholung.', 'source-unavailable':'Prüfung beendet: GitHub-Ziel aktuell nicht zugänglich (404); keine automatische Kontaktaufnahme.'}[code];
   if(!dryRun){controller.prepare("UPDATE founder_jobs SET status='cancelled',reason=?,next_retry_ms=NULL,retryable=0,updated_ms=? WHERE id=? AND status='blocked'").run(reason,now,row.id);controller.prepare('INSERT INTO founder_events(at,task_id,action) VALUES(?,?,?)').run(new Date(now).toISOString(),row.id,'legacy-communication-reconciled:'+code);}
   changed.push({id:row.id,url:e.url,code,previousStatus:row.status,previousReason:row.reason,attemptsPreserved:row.attempts});
  }
 });run.immediate();return {dryRun,changed,skipped};
}
