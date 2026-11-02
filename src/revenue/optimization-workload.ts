import type {Database} from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {optimizationTrialRecipe} from './optimization-trials.js';
/** Bounded historical activity, never a guarantee of future demand or task equivalence. */
export function optimizationWorkload(db:Database,trialId:string,lookbackDays:number,horizonDays:number,now=Date.now()){
 if(!Number.isSafeInteger(lookbackDays)||lookbackDays<7||lookbackDays>90||!Number.isSafeInteger(horizonDays)||horizonDays<1||horizonDays>lookbackDays||
  !Number.isSafeInteger(now)||now<0||now>8640000000000000)throw Error('Bounded workload windows required');
 const recipe=optimizationTrialRecipe(db,trialId,'baseline');if(!recipe)throw Error('Bound workload recipe required');
 const day=86400,end=Math.floor(now/1000/day)*day,start=end-lookbackDays*day;
 const olderDays=Math.floor(lookbackDays/2),recentDays=lookbackDays-olderDays,split=start+olderDays*day;
 return db.transaction(()=>{
  const rows=db.prepare(`SELECT id,session_id,created_at,unixepoch(created_at) stamp,cost_cents,
    EXISTS(SELECT 1 FROM inference_reservations r WHERE r.session_id=c.session_id AND r.status='pending') unresolved
    FROM inference_costs c WHERE model=? AND provider=? AND task_type=? AND tier=?
    AND session_id IS NOT NULL AND length(session_id)>0 AND session_id NOT LIKE 'opt-%'
    AND (unixepoch(created_at) IS NULL OR (unixepoch(created_at)>=? AND unixepoch(created_at)<?))
    ORDER BY created_at,id LIMIT 1001`).all(recipe.modelId,recipe.provider,recipe.taskType,recipe.tier,start,end) as
    {id:string;session_id:string;created_at:string;stamp:number|null;cost_cents:number;unresolved:number}[];
  let older=0,recent=0,invalid=0,unresolved=0;
  for(const row of rows.slice(0,1000)){
   if(row.stamp===null||!Number.isSafeInteger(row.stamp)||!Number.isSafeInteger(row.cost_cents)||row.cost_cents<0){invalid++;continue;}
   if(row.unresolved){unresolved++;continue;}
   if(row.stamp<split)older++;else recent++;
  }
  const blockers:string[]=[];
  if(rows.length>1000)blockers.push('workload_sample_truncated');
  if(invalid)blockers.push('invalid_workload_records');
  if(unresolved)blockers.push('unresolved_workload_sessions');
  const supportedExecutions=Math.min(Math.floor(older*horizonDays/olderDays),Math.floor(recent*horizonDays/recentDays));
  if(!supportedExecutions)blockers.push('insufficient_observed_workload');
  return {sampleDigest:createHash('sha256').update(JSON.stringify({recipe,start,end,rows})).digest('hex'),
   lookbackDays,horizonDays,startUtc:new Date(start*1000).toISOString(),endExclusiveUtc:new Date(end*1000).toISOString(),
   olderCalls:older,recentCalls:recent,invalidRecords:invalid,unresolvedRecords:unresolved,truncated:rows.length>1000,
   supportedExecutions,blockers,source:'local_inference_ledger',
   limitation:'Uses the lower call rate of two completed UTC windows for the same model/provider/task type/tier. Excludes optimization sessions and the partial current day. Does not prove production provenance, successful tasks, equivalent inputs, future demand or profit.'};
 })();
}
