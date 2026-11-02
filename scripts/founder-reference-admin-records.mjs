import {validateReferenceRecord} from './founder-reference-approvals.mjs';
const exact=(p,k)=>p&&Object.getPrototypeOf(p)===Object.prototype&&Object.keys(p).sort().join(',')===k.sort().join(',');
export function validateAcceptanceRecord(p){
 if(!exact(p,['protocol','recordedAt','reviewerId'])||!Number.isSafeInteger(p.recordedAt)||p.recordedAt<0)throw Error('Invalid acceptance record');
 const q=p.protocol;if(!exact(q,['schema','scope','filesDigest','status','accepted','executionAuthorized','steps'])||q.schema!=='founder-reference-acceptance-v1'||q.accepted!==false||q.executionAuthorized!==false||!['blocked','ready-for-source-review'].includes(q.status)||!/^[a-f0-9]{64}$/.test(q.filesDigest))throw Error('Invalid local acceptance protocol');
 validateReferenceRecord('reference-approval',{scope:q.scope,reviewerId:p.reviewerId,ref:'contract:protocol',reviewedAt:p.recordedAt,expiresAt:p.recordedAt+1});
 const ids=['reference-approval','artifact-quality','fresh-source-assignment','native-delivery-readback','buyer-acceptance'];
 if(!Array.isArray(q.steps)||q.steps.length!==5||!q.steps.every((s,i)=>exact(s,['id','status'])&&s.id===ids[i]&&(i<2?['passed','blocked'].includes(s.status):s.status==='pending-external'))|| (q.status==='ready-for-source-review')!==q.steps.slice(0,2).every(s=>s.status==='passed'))throw Error('Invalid protocol steps');
 return p;
}
