import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export function licensedTaskObservation({manifest:m,gap,checkpoint:cp,history,snapshot,methodDigest,context:c,digest}){
 try{
  if(!m||Object.keys(m).sort().join(',')!=='activationApproved,checkpointDigest,gapDigest,gapId,methodDigest,schemaVersion'||m.schemaVersion!==1||m.activationApproved!==true)return null;
  if(!c||[c.powerEnabled,c.controllerRunning,c.activationApproved,c.budgetActive].some(v=>v!==true)||![c.availableSlots,c.budgetRemainingRappen,c.dayRemainingRappen,c.rootRemainingRappen].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isSafeInteger(c.now)||c.now<0||Math.floor(c.now/21600000)%2!==0)return null;
  if(snapshot?.truncated!==false||!gap||gap.id!==m.gapId||digest(gap)!==m.gapDigest||gap.estimatedCostRappen!==0||gap.goalId!==c.goalId||gap.goalVersion!==c.goalVersion||!cp||digest(cp)!==m.checkpointDigest)return null;
  if(!/^[a-f0-9]{64}$/.test(methodDigest)||methodDigest!==m.methodDigest||cp.phase!=='complete'||cp.report?.gapId!==gap.id||cp.report.status!=='waiting-data'||cp.report.reason!=='No source passed purpose, rights and quality checks'||!cp.report.sourceIds?.length)return null;
  if(cp.report.sourceIds.some(id=>{const s=snapshot.sources.find(s=>s.id===id);return s?.status!=='rejected'||!s.assessment?.reasons?.includes('commercial-purpose-not-allowed');}))return null;
  const task=history.find(t=>t.id==='learning-'+gap.id);
  if(task?.status!=='done'||task.kind!=='adaptive-learning'||task.rootTaskId!==gap.rootTaskId||task.input?.gapId!==gap.id)return null;
  const marker='licensed-followup-of-'+digest(gap.id),method='licensed-method-'+methodDigest;
  if(snapshot.gaps.some(g=>g.evidenceIds.includes(marker)&&!g.evidenceIds.includes(method)))return null;
  return {goalId:gap.goalId,goalVersion:gap.goalVersion,kind:gap.kind,capability:gap.capability,...(gap.topicId?{topicId:gap.topicId}:{}),title:gap.title,application:gap.application,successCriterion:gap.successCriterion,scores:gap.scores,evidenceIds:[...new Set([...gap.evidenceIds,marker,method,'waiting-data-'+digest(cp)])].sort(),observedAt:gap.createdAt,estimatedCostRappen:0};
 }catch{return null;}
}
/** Only fixed local files. No provider, controller mutation or old permission access. */
export function readLicensedTask({base,store,history,getContext,digest}){
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'artifacts/founder-licensed-task.json'),'utf8'));
  const snapshot=store.snapshot(),gap=snapshot.gaps.find(g=>g.id===manifest.gapId);
  if(!gap)return [];
  const methodDigest=licensedMethodDigest(base,digest);
  const o=licensedTaskObservation({manifest,snapshot,gap,checkpoint:store.checkpoint(gap.id),history,methodDigest,context:getContext(gap.rootTaskId),digest});return o?[o]:[];
 }catch{return [];}
}
export function licensedMethodDigest(base,digest){return digest(['scripts/founder-general-web.mjs','scripts/founder-learning-adapters.mjs'].map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(path.join(base,file))).digest('hex')})));}
