// Conservative eligibility check; the running scheduler still enforces its budget and attempt limits.
export function canResumeSettledAnalysis({job,attempt,reservation,dependencies,now=Date.now()}) {
 try {
  const p=JSON.parse(job.payload), result=JSON.parse(attempt.result), receipt=JSON.parse(attempt.receipt);
  if(job.status!=='failed'||!Number.isInteger(job.attempts)||job.attempts<1||job.attempts>=3||p.kind!=='private-analysis')return false;
  if(result.status!=='incomplete'||result.analysis!==null||result.costEvidence?.outputTokens!==2000)return false;
  if(reservation.max_cost!==50||!Number.isSafeInteger(reservation.actual_cost)||reservation.actual_cost<0||reservation.actual_cost>50||!reservation.receipt||receipt.actualCostRappen!==reservation.actual_cost||receipt.evidenceRef!==reservation.receipt)return false;
  if(!Array.isArray(p.dependencies)||!p.dependencies.length||dependencies.length!==p.dependencies.length)return false;
  return dependencies.every(d=>{
   if(d.status!=='done')return false;
   const sources=JSON.parse(d.result).sources;
   return Array.isArray(sources)&&sources.length>0&&sources.every(s=>{
    const at=Date.parse(s.observedAt);return Number.isFinite(at)&&at<=now&&now-at<=7*86400000;
   });
  });
 }catch{return false;}
}
