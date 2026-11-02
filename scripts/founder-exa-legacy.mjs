export function legacyExaRetryEligible({power,control,job,attempt,reservation,last,count,now}){
 try{const p=JSON.parse(job.payload),receipt=JSON.parse(attempt.receipt),diagnostic=JSON.parse(attempt.diagnostic);
  return power.enabled===true&&control.status==='running'&&job.status==='queued'&&job.attempts===1&&p.kind==='exa-research'&&!!p.input?.sourceRepair&&attempt.stage==='failed'&&diagnostic.code==='local_read_failed'&&reservation.id===job.run_id&&reservation.root_task===p.rootTaskId&&reservation.max_cost===0&&reservation.actual_cost===0&&receipt.actualCostRappen===0&&receipt.evidenceRef==='local:'+job.run_id&&reservation.receipt===receipt.evidenceRef&&last.status==='attempted'&&last.seq===1&&count===1&&last.retry_after_ms===0&&last.at<=attempt.at_ms&&attempt.at_ms-last.at<120000&&now-last.at>=300000&&last.window===Math.floor(now/21600000);
 }catch{return false;}
}
