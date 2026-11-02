import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const DAY=86400000;
const fields=['activationApproved','checkpointDigest','expiresAt','gapDigest','gapId','schemaVersion','serviceReportSha256'].sort().join(',');
const unchanged=o=>o&&Object.keys(o).length>0&&Object.values(o).every(v=>v===true);
/** A new observation only. Never mutates or requeues the uncertain predecessor. */
export function recoveryObservation({manifest,report,reportSha256,snapshot,history,context:c,digest}){
 try{
  if(!manifest||Object.keys(manifest).sort().join(',')!==fields||manifest.schemaVersion!==1||manifest.activationApproved!==true)return null;
  if(!c||c.powerEnabled!==true||c.controllerRunning!==true||c.activationApproved!==true||c.budgetActive!==true||!Number.isSafeInteger(c.now)||!Number.isSafeInteger(manifest.expiresAt)||manifest.expiresAt<=c.now||manifest.expiresAt>c.now+DAY)return null;
  if(Math.floor(c.now/21600000)%2!==0)return null; // Existing SearXNG windows only.
  if(![c.availableSlots,c.budgetRemainingRappen,c.dayRemainingRappen,c.rootRemainingRappen].every(n=>Number.isSafeInteger(n)&&n>0))return null;
  const at=Date.parse(report?.at);
  if(!Number.isSafeInteger(at)||at>c.now||c.now-at>DAY||reportSha256!==manifest.serviceReportSha256||!/^[a-f0-9]{64}$/.test(reportSha256)||report.status!=='search-service-started-no-search'||report.power?.enabled!==false||report.controller?.status!=='stopped'||report.activeJobs!==0||report.searchRequestsTriggeredByMaintenance!==0||!unchanged(report.controlsUnchanged)||!unchanged(report.ledgersUnchanged))return null;
  if(snapshot?.truncated!==false)return null;
  const gap=snapshot.gaps.find(g=>g.id===manifest.gapId);
  if(!gap||digest(gap)!==manifest.gapDigest||gap.estimatedCostRappen!==0||gap.goalId!==c.goalId||gap.goalVersion!==c.goalVersion)return null;
  const predecessor=history.find(t=>t.id==='learning-'+gap.id);
  if(predecessor?.status!=='failed'||predecessor.kind!=='adaptive-learning'||predecessor.rootTaskId!==gap.rootTaskId||predecessor.input?.gapId!==gap.id)return null;
  const checkpoints=snapshot.events.filter(e=>e.kind==='checkpoint'&&e.subjectId==='checkpoint:'+gap.id);
  const cp=checkpoints.at(-1)?.detail;
  if(!cp||digest(cp)!==manifest.checkpointDigest||cp.phase!=='complete'||cp.report?.status!=='waiting-evidence'||cp.report.gapId!==gap.id)return null;
  if(checkpoints.some(e=>!['discovering','complete'].includes(e.detail?.phase)))return null;
  const failures=snapshot.events.filter(e=>e.kind==='failure'&&e.subjectId===gap.id);
  if(!failures.length||failures.some(e=>e.detail?.phase!=='discovering'||e.detail?.code!=='step-failed'||!Number.isSafeInteger(e.createdAt)||at<=e.createdAt))return null;
  const marker='continuation-of-'+digest(gap.id),proof='service-repair-'+reportSha256;
  // One successor per original gap. Reopening the same approval stays deterministic.
  if(snapshot.gaps.some(g=>g.evidenceIds.includes(marker)&&!g.evidenceIds.includes(proof)))return null;
  return {goalId:gap.goalId,goalVersion:gap.goalVersion,kind:gap.kind,capability:gap.capability,...(gap.topicId?{topicId:gap.topicId}:{}),...(gap.publicFocus?{publicFocus:gap.publicFocus}:{}),title:gap.title,application:gap.application,successCriterion:gap.successCriterion,scores:gap.scores,evidenceIds:[...new Set([...gap.evidenceIds,marker,proof])].sort(),observedAt:at,estimatedCostRappen:0};
 }catch{return null;}
}
/** Fixed local files; no network, writes, controller calls or power actions. */
export function readLearningRecovery({base,...input}){
 try{
  const manifest=JSON.parse(fs.readFileSync(path.join(base,'artifacts/founder-learning-recovery.json'),'utf8'));
  const bytes=fs.readFileSync(path.join(base,'outputs/searxng-network-fix-20261019/activation-report.json'));
  const root=input.snapshot.gaps.find(g=>g.id===manifest.gapId)?.rootTaskId;
  const observation=recoveryObservation({...input,context:input.getContext?input.getContext(root):input.context,manifest,report:JSON.parse(bytes),reportSha256:createHash('sha256').update(bytes).digest('hex')});
  return observation?[observation]:[];
 }catch{return [];}
}
