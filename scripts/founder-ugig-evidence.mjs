import fs from 'node:fs';import path from 'node:path';
import {bounded,checkedJSON,digest,orderKey} from './founder-restoration-integrity.mjs';
import {validatePilotAgreement} from './founder-ugig-pilot-contract.mjs';
/** Trusted operator-reviewed evidence, never model/task input. Reads only; creates
 * neither agreements nor grants. Re-read on every boundary to observe revocation. */
export function createUgigEvidenceReaders({base,isEnabled,now=Date.now,validateAgreement=validatePilotAgreement}){
 const root=path.resolve(base);
 function pack(order){
  if(isEnabled()!==true)throw Error('uGig evidence OFF');
  const relative=path.join('artifacts/founder-autonomy-20261013/ugig-contracts',digest(orderKey(order))+'.json');
  let current=root;
  try{for(const part of relative.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error();}
   const stat=fs.statSync(current);if(!stat.isFile()||stat.size>256000)throw Error();
  }catch{throw Error('Reviewed uGig evidence unavailable or unsafe');}
  const p=checkedJSON(JSON.parse(fs.readFileSync(current,'utf8').replace(/^\uFEFF/,''))),a=p.agreement,g=p.grant;
  if(p.schema!=='numaron-ugig-reviewed-v1'||!validateAgreement(a).valid||digest(orderKey(a))!==digest(orderKey(order))||a.rootTaskId!==order.rootTaskId||a.sourceRevision!==order.sourceRevision||g?.approved!==true||g.agreementDigest!==digest(a)||!Number.isFinite(g.expiresAt)||g.expiresAt<=now()||!bounded(g.evidenceRef,2000)||!['read','work','verify','submit','reconcile'].every(k=>g.operations?.includes(k)))throw Error('Exact unexpired reviewed agreement and grant required');
  if(isEnabled()!==true)throw Error('uGig evidence OFF');return p;
 }
 return {pack,agreement:o=>pack(o).agreement,
  access(o){const p=pack(o),a=p.agreement;return {verified:true,accountId:a.ownerId,sourceId:a.sourceId,gigId:a.gigId,scopeDigest:a.scopeDigest,rootTaskId:a.rootTaskId,observedAt:now(),expiresAt:Math.min(p.grant.expiresAt,now()+59000),evidenceRef:p.grant.evidenceRef,operations:p.grant.operations};},
  lifecycleMessages(o){const p=pack(o),a=p.acceptance;if(!['submitted','accepted','paid'].includes(o.state)||a?.reviewed!==true||a.noContractChangeReviewed!==true||a.deliveryDigest!==o.deliveryDigest)return [];return [{messageId:a.messageId,senderId:p.agreement.buyerId,contentDigest:a.contentDigest}];}
 };
}
