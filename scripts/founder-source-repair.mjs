import {createHash} from 'node:crypto';
import {researchGoalFor,selectResearchSource} from './founder-source-quality.mjs';
const publicGithub=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&!u.port&&!u.search?u.href:null;}catch{return null;}};
export function resumableLegacySourceRepair(task,receipt){
 return task.kind==='exa-research'&&task.status==='failed'&&task.attempts===1&&!!task.input?.sourceRepair&&task.diagnostic?.code==='local_read_failed'&&receipt?.actualCostRappen===0&&receipt.evidenceRef==='local:'+task.run_id;
}
export function sourceRepairTask(task,history,result){
 if(task.kind!=='firecrawl-research'||!['queued','failed','blocked'].includes(task.status)||task.input?.sourceRepair)return null;
 const goal=researchGoalFor(task,history);if(!goal)return null;
 const sources=id=>{try{const r=result(id);return r?.privacy==='private'?[]:(r?.sources??[]).filter(s=>s.privacy!=='private');}catch{return [];}};
 if(selectResearchSource((task.dependencies??[]).flatMap(sources),goal,publicGithub))return null;
 const id='source-repair-'+createHash('sha256').update(JSON.stringify([task.rootTaskId,goal])).digest('hex').slice(0,32);
 if(history.some(t=>t.id===id))return null;
 // Only send repository identity already evidenced by a public source. No arbitrary mission text.
 for(const parent of history.filter(t=>t.status==='done')){
  const evidence=selectResearchSource(sources(parent.id),goal,publicGithub);if(!evidence)continue;
  const u=new URL(evidence.url),parts=u.pathname.split('/').filter(Boolean);if(parts.length<2)continue;
  return {id,rootTaskId:task.rootTaskId,kind:'exa-research',input:{title:goal,researchGoal:goal,repairTargetUrl:evidence.url,sourceRepair:{originalTaskId:task.id,maxSearches:1}},dependencies:[parent.id],resources:['exa']};
 }
 return null;
}
