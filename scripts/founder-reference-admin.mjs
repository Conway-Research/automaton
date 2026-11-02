import {randomBytes} from 'node:crypto';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {referenceScope,createReferenceAuthority} from './founder-reference-approvals.mjs';
import {prepareReferenceAcceptance} from './founder-reference-acceptance.mjs';
const exact=(p,k)=>p&&Object.getPrototypeOf(p)===Object.prototype&&Object.keys(p).sort().join(',')===k.sort().join(',');
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
export function createReferenceAdmin({store,readProducts,readPower,reviewerId,now=Date.now}){
 if(!id(reviewerId)||typeof readProducts!=='function'||typeof readPower!=='function')throw Error('Reviewed admin composition required');
 const pending=new Map();
 const off=()=>{if(readPower()?.enabled!==false)throw Error('Administration requires confirmed OFF');};
 const products=()=>{const rows=checkedJSON(readProducts(),2000000);if(!Array.isArray(rows)||rows.length>100||rows.some(r=>!id(r.id))||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Invalid local candidates');for(const row of rows){referenceScope(row.product?.binding);if(!Array.isArray(row.product?.files))throw Error('Candidate files required');}return rows;};
 const candidate=id=>{const p=products().find(r=>r.id===id);if(!p)throw Error('Candidate unavailable');return p.product;};
 const revision=()=>digest(store.snapshot());
 const authority=sourceId=>createReferenceAuthority({sourceId,store,now});
 const current=r=>{if(r!==revision())throw Error('Stale administration view');};
 const prune=()=>{for(const [k,v] of pending)if(now()>=v.expiresAt)pending.delete(k);};
 return {
 snapshot(){
  // Ledger integrity is mandatory even when the separate candidate reader fails.
  const s=store.snapshot();let ps=[],candidateReadStatus='available';
  try{ps=products();}catch{candidateReadStatus='unavailable';pending.clear();}
  const withdrawn=new Set(s.referenceWithdrawals.map(r=>r.approvalId));
  return {revision:digest(s),reviewerId,candidateReadStatus,capacity:s.capacity??null,
   candidates:ps.map(r=>({id:r.id,scope:referenceScope(r.product.binding),filesDigest:digest({files:r.product.files})})),
   approvals:s.referenceApprovals.map(a=>({...a,status:withdrawn.has(a.id)?'withdrawn':now()>=a.expiresAt?'expired':now()<a.reviewedAt?'future':'active'})),
   withdrawals:s.referenceWithdrawals,
   protocols:(s.acceptanceProtocols??[]).map(p=>({...p,currentReferenceApproved:ps.some(r=>digest(referenceScope(r.product.binding))===digest(p.protocol.scope)&&digest({files:r.product.files})===p.protocol.filesDigest&&authority(r.product.binding.sourceId).allows(r.product.binding))}))};
 },
 prepare(body,session){off();if(!exact(body,['candidateId'])||!id(body.candidateId)||typeof session!=='string'||!session)throw Error('Invalid preparation');prune();if(pending.size>=256)throw Error('Too many pending reviews');const product=candidate(body.candidateId),scope=referenceScope(product.binding),previewToken=randomBytes(32).toString('hex');pending.set(previewToken,{session,candidateId:body.candidateId,productDigest:digest(product),scope,revision:revision(),expiresAt:now()+300000});return {previewToken,scope,filesDigest:digest({files:product.files}),referenceDigest:product.binding.qualityContract.referenceDigest,expiresAt:now()+300000};},
 approve(body,session){off();if(!exact(body,['previewToken','expiresAt','ref']))throw Error('Invalid approval request');prune();const p=pending.get(body.previewToken);if(!p||p.session!==session)throw Error('Preview unavailable');pending.delete(body.previewToken);current(p.revision);if(digest(candidate(p.candidateId))!==p.productDigest)throw Error('Candidate changed');const at=now();if(!Number.isSafeInteger(at)||at>=p.expiresAt)throw Error('Preview expired');if(!Number.isSafeInteger(body.expiresAt)||body.expiresAt<=at||body.expiresAt>at+30*86400000)throw Error('Expiry must be within 30 days');off();return {id:store.recordReferenceApproval({scope:p.scope,reviewerId,reviewedAt:at,expiresAt:body.expiresAt,ref:body.ref})};},
 withdraw(body){off();if(!exact(body,['approvalId','revision','ref']))throw Error('Invalid withdrawal request');current(body.revision);const revokedAt=now();off();return {id:store.recordReferenceWithdrawal({approvalId:body.approvalId,revokedAt,ref:body.ref,reviewerId})};},
 protocol(body){off();if(!exact(body,['candidateId','revision']))throw Error('Invalid protocol request');current(body.revision);const product=candidate(body.candidateId),protocol=prepareReferenceAcceptance({product,authority:authority(product.binding.sourceId)});off();const record={protocol,recordedAt:now(),reviewerId};return {id:store.recordAcceptanceProtocol(record),...record};}
 };
}
