// Read-only projection. Inputs are trusted local snapshots, never permissions
// inferred from model output. This module does not load evidence references.
const operations={qualify:'read',apply:'apply','reconcile-application':'reconcile',prepare:'work',work:'work',verify:'verify',submit:'submit','reconcile-delivery':'reconcile',acceptance:'reconcile',payment:'reconcile'};
const dimensions=['authorization','availability','offlineVerification','liveVerification'];
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
const revision=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>=0&&x<=8640000000000000;
const safeRef=x=>typeof x==='string'&&/^(test|policy|receipt|contract|report):[a-zA-Z0-9_.:-]{1,120}$/.test(x);
const outcomeStatus={
 authorization:{passed:'confirmed',failed:'denied'},
 availability:{passed:'observed-available',failed:'unavailable'},
 offlineVerification:{passed:'passed',failed:'failed'},
 liveVerification:{passed:'observed-success',failed:'observed-failure'}
};
function checkProof(p,entry,now){
 if(!entry.sourceId||!entry.operation)return null;
 if(!p||!dimensions.includes(p.dimension)||!['passed','failed'].includes(p.outcome)||!safeRef(p.ref)||
    !time(p.observedAt)||p.observedAt>now||!revision(p.revision))return null;
 if(p.capabilityId!==entry.capabilityId||p.sourceId!==entry.sourceId||p.operation!==entry.operation)return null;
 if(!['production','offline'].includes(p.environment))return null;
 if(p.dimension==='offlineVerification'){
  if(p.environment!=='offline'||p.origin!=='offline-test')return null;
 }else{
  if(p.environment!=='production')return null;
  if(p.dimension==='authorization'&&!['operator-policy','source-contract'].includes(p.origin))return null;
  if(p.dimension!=='authorization'&&p.origin!=='runtime-receipt')return null;
 }
 if(p.resultStatus!==undefined&&!['completed','succeeded'].includes(p.resultStatus))return null;
 if(p.expiresAt!==undefined&&(!time(p.expiresAt)||p.expiresAt<=p.observedAt))return null;
 if(['authorization','availability'].includes(p.dimension)&&p.expiresAt===undefined)return null;
 return {dimension:p.dimension,outcome:p.outcome,environment:p.environment,origin:p.origin,ref:p.ref,
  observedAt:p.observedAt,expiresAt:p.expiresAt??null,revision:p.revision,
  stale:p.revision!==entry.revision||(p.expiresAt!==undefined&&p.expiresAt<=now)};
}
export function projectCapabilityEvidence({capabilities=[],sources=[],proofs=[],revocations=[],now,powerEnabled=false,controllerRunning=false,budgetActive=false}={}){
 const result={schemaVersion:1,observedAt:time(now)?new Date(now).toISOString():null,entries:[],diagnostics:[]};
 const reject=reason=>({...result,diagnostics:[reason]});
 if(!time(now))return reject('invalid-observation-time');
 if(!Array.isArray(capabilities)||capabilities.length>512||!Array.isArray(sources)||sources.length>512||
    !Array.isArray(proofs)||proofs.length>2048||!Array.isArray(revocations)||revocations.length>2048)return reject('bounded-input-required');
 // Explicit trusted local withdrawals, not provider/model instructions. A newer
 // timestamp cannot resurrect this exact revision; no expiry or auto-regrant.
 for(const r of revocations)if(!r||!id(r.capabilityId)||!id(r.sourceId)||!id(r.operation)||!revision(r.revision)||!dimensions.includes(r.dimension)||!time(r.revokedAt)||r.revokedAt>now||!safeRef(r.ref))return reject('invalid-revocation');
 const kinds=new Set(),sourceMap=new Map();
 for(const s of sources){if(!s||!id(s.id)||sourceMap.has(s.id))return reject('invalid-or-duplicate-source');sourceMap.set(s.id,s);}
 for(const c of capabilities){
  if(!c||!id(c.kind)||kinds.has(c.kind)||c.sourceIds!==undefined&&(!Array.isArray(c.sourceIds)||c.sourceIds.length>64||c.sourceIds.some(s=>!id(s))||new Set(c.sourceIds).size!==c.sourceIds.length))return reject('invalid-or-duplicate-capability');
  kinds.add(c.kind);
 }
 if(capabilities.reduce((n,c)=>n+Math.max(1,c.sourceIds?.length??0),0)>1024)return reject('bounded-expansion-required');
 for(const c of capabilities)for(const sourceId of c.sourceIds?.length?c.sourceIds:[null]){
  const operationKey=c.kind.replace(/^source-/,'');
  const operation=sourceId&&c.kind.startsWith('source-')&&Object.hasOwn(operations,operationKey)?operations[operationKey]:null;
  const bindingVerified=!!(sourceId&&operation&&sourceMap.has(sourceId));
  const entry={capabilityId:c.kind,sourceId,operation:operation??null,revision:revision(c.revision)?c.revision:null,
   implementation:c.implemented===true?'present':c.implemented===false?'missing':'unknown',
   authorization:'unknown',availability:'unknown',offlineVerification:'unknown',liveVerification:'unknown',
   executionBlockers:[],evidence:[],revocations:[]};
  const block=reason=>{if(!entry.executionBlockers.includes(reason))entry.executionBlockers.push(reason);};
  if(powerEnabled!==true)block('power-off');
  if(controllerRunning!==true)block('controller-not-running');
  if(budgetActive!==true)block('budget-inactive');
  if(entry.implementation!=='present')block('implementation-'+entry.implementation);
  if(!entry.revision)block('revision-unverified');
  if((c.kind.startsWith('source-')||sourceId)&&!bindingVerified)block('source-binding-unverified');
  if(sourceId){
   const s=sourceMap.get(sourceId),cap=operation?s?.capabilities?.[operation]:null;
   if(!s||!operation)block('source-binding-unverified');
   if(!cap||cap.state!=='live-verified'||!time(cap.expiresAt)||cap.expiresAt<=now||!Array.isArray(cap.evidenceRefs)||!cap.evidenceRefs.length)
    block(time(cap?.expiresAt)&&cap.expiresAt<=now?'source-evidence-expired':'source-evidence-unverified');
  }
  const accepted=bindingVerified?proofs.map(p=>checkProof(p,entry,now)).filter(Boolean):[];
  // Duplicates are harmless only if all accepted fields match.
  entry.evidence=[...new Map(accepted.map(e=>[JSON.stringify(e),e])).values()].sort((a,b)=>a.observedAt-b.observedAt);
  for(const dimension of dimensions){
   const rows=entry.evidence.filter(e=>e.dimension===dimension);
   const invalidNewer=proofs.some(p=>p&&p.dimension===dimension&&p.capabilityId===entry.capabilityId&&p.sourceId===entry.sourceId&&p.operation===entry.operation&&(!rows.length||!time(p.observedAt)||p.observedAt>=rows.at(-1).observedAt)&&(!bindingVerified||!checkProof(p,entry,now)));
   if(invalidNewer){block(dimension+'-evidence-invalid');continue;}
   if(!rows.length)continue;
   const latest=rows.filter(e=>e.observedAt===rows.at(-1).observedAt);
   if(new Set(latest.map(e=>[e.outcome,e.revision,e.expiresAt,e.environment].join('|'))).size>1){block(dimension+'-evidence-conflict');continue;}
   const p=latest[0];
   entry[dimension]=p.stale?(dimension==='authorization'?'unknown':'stale'):outcomeStatus[dimension][p.outcome];
  }
  if(c.status==='blocked'||entry.implementation==='missing')entry.availability='unavailable';
  const withdrawals=revocations.filter(r=>r.capabilityId===entry.capabilityId&&r.sourceId===entry.sourceId&&r.operation===entry.operation&&r.revision===entry.revision)
   .map(r=>({dimension:r.dimension,revokedAt:r.revokedAt,revision:r.revision,ref:r.ref}));
  entry.revocations=[...new Map(withdrawals.map(r=>[JSON.stringify(r),r])).values()].sort((a,b)=>a.revokedAt-b.revokedAt);
  for(const r of entry.revocations){entry[r.dimension]='revoked';block(r.dimension+'-evidence-revoked');}
  if(entry.authorization!=='confirmed')block('authorization-'+entry.authorization);
  if(entry.availability!=='observed-available')block('availability-'+entry.availability);
  if(entry.offlineVerification!=='passed')block('offline-verification-'+entry.offlineVerification);
  // Absence of live evidence is a proof gap, not a new execution permission.
  result.entries.push(entry);
 }
 return result;
}
