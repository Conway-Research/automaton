import {qualityProfiles} from './founder-quality-profiles.mjs';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
export function validateQualityBinding(b){
 const keys=['certificateId','capabilityId','sourceId','operation','revision','profile','createdAt'];
 if(!b||Object.keys(b).sort().join(',')!==keys.sort().join(',')||!hex(b.certificateId)||!hex(b.revision)||!id(b.sourceId)||!qualityProfiles.includes(b.profile)||!Number.isSafeInteger(b.createdAt)||b.createdAt<0||b.createdAt>8640000000000000||!['source-work','source-verify'].includes(b.capabilityId)||b.operation!==(b.capabilityId==='source-work'?'work':'verify'))throw Error('Invalid quality binding');
 return b;
}
export function coveringCertificate(c,b){return c?.suite==='founder-quality-v2'&&c.status==='passed'&&c.exitCode===0&&Number.isSafeInteger(c.tests)&&c.tests>0&&c.tests===c.passed&&[c.failed,c.skipped,c.cancelled,c.todo].every(n=>n===0)&&c.scope==='offline-synthetic'&&c.revision===b.revision&&c.finishedRevision===b.revision&&b.createdAt>=c.finishedAt;}
// Reviewed applicability is not proof of a source transport or source rights.
export function projectQualityBindings({bindings=[],certificates=[],entries=[],currentRevision,now=Date.now()}){
 if(!Array.isArray(bindings)||bindings.length>2048||!Array.isArray(certificates)||certificates.length>2048||!Array.isArray(entries)||entries.length>1024)throw Error('Invalid quality projection bounds');
 return bindings.map(b=>{
  validateQualityBinding(b);const c=certificates.find(c=>c.id===b.certificateId),entry=entries.find(e=>e.capabilityId===b.capabilityId&&e.sourceId===b.sourceId&&e.operation===b.operation);
  let status='profile-tested';
  if(!coveringCertificate(c,b)||!Number.isSafeInteger(now)||b.createdAt>now)status='certificate-unavailable';
  else if(!entry||entry.implementation!=='present'||entry.executionBlockers?.includes('source-binding-unverified'))status='source-binding-unverified';
  else if(!Array.isArray(entry.qualityProfiles)||!entry.qualityProfiles.includes(b.profile))status='profile-not-supported';
  else if(entry.offlineVerification==='revoked')status='revoked';
  else if(!hex(currentRevision))status='revision-unverified';
  else if(currentRevision!==b.revision||entry.revision!==b.revision)status='stale';
  return {...b,status,sourceConnectionVerified:false};
 });
}
