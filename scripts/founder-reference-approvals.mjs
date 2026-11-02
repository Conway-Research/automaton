import {validateInvoiceReferenceRows} from './founder-quality-profiles.mjs';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
const fields=['sourceId','externalId','ownerId','rootTaskId','sourceRevision','scopeDigest'];
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>=0&&x<=8640000000000000;
const keys=(p,ks)=>p&&Object.getPrototypeOf(p)===Object.prototype&&Object.keys(p).sort().join(',')===ks.slice().sort().join(',');
export function referenceScope(binding){
 const b=checkedJSON(binding),q=b.qualityContract;
 if(!fields.every(k=>id(b[k]))||b.profileId!=='structured-data'||!keys(q,['profile','referenceRows','referenceDigest','evidenceRef'])||typeof q.evidenceRef!=='string'||!/^contract:[a-zA-Z0-9_.:-]{1,120}$/.test(q.evidenceRef)||q.profile!=='invoice-reconciliation-v1'||q.referenceDigest!==digest(q.referenceRows))throw Error('Exact invoice reference scope required');
 validateInvoiceReferenceRows(q.referenceRows);
 return {...Object.fromEntries(fields.map(k=>[k,b[k]])),profile:q.profile,contractDigest:digest(q)};
}
export function validateReferenceRecord(kind,p){
 if(kind==='reference-approval'){
  if(typeof p?.reviewerId==='string'&&typeof p?.scope?.ownerId==='string'&&p.reviewerId.trim()===p.scope.ownerId.trim())throw Error('Independent reference approval required');
  if(!keys(p,['scope','reviewerId','ref','reviewedAt','expiresAt'])||!keys(p.scope,[...fields,'profile','contractDigest'])||!fields.every(k=>id(p.scope[k]))||p.scope.profile!=='invoice-reconciliation-v1'||!hex(p.scope.contractDigest)||!id(p.reviewerId)||!time(p.reviewedAt)||!time(p.expiresAt)||p.expiresAt<=p.reviewedAt)throw Error('Invalid reference approval');
 }else if(kind==='reference-withdrawal'){
  if(!keys(p,['approvalId','revokedAt','ref',...(p.reviewerId!==undefined?['reviewerId']:[])])||p.reviewerId!==undefined&&!id(p.reviewerId)||!hex(p.approvalId)||!time(p.revokedAt))throw Error('Invalid reference withdrawal');
 }else throw Error('Unknown reference record');
 if(typeof p.ref!=='string'||!/^contract:[a-zA-Z0-9_.:-]{1,120}$/.test(p.ref))throw Error('Reference provenance required');
 return p;
}
export function createReferenceAuthority({sourceId,store,now=Date.now}){
 if(!id(sourceId)||typeof store?.snapshot!=='function')throw Error('Reviewed local reference store required');
 return {sourceId,allows(binding){try{
  if(binding?.sourceId!==sourceId)return false;
  const scope=referenceScope(binding),s=store.snapshot(),at=now();if(!time(at))return false;
  const revoked=new Set((s.referenceWithdrawals??[]).map(r=>{validateReferenceRecord('reference-withdrawal',r);return r.approvalId;}));
  return (s.referenceApprovals??[]).some(row=>{const {id:approvalId,...p}=row;validateReferenceRecord('reference-approval',p);return approvalId===digest({kind:'reference-approval',payload:p})&&!revoked.has(approvalId)&&p.reviewedAt<=at&&at<p.expiresAt&&digest(p.scope)===digest(scope);});
 }catch{return false;}}};
}
