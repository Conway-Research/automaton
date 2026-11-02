import {digest,orderKey} from './founder-restoration-integrity.mjs';
export function planOrderFollowup({order,evidence}){
 const base={orderKey:orderKey(order),rootTaskId:order.rootTaskId};if(order.pendingWrite)return {...base,kind:'reconcile-delivery',resubmit:false};
 if(evidence?.verified!==true||!evidence.evidenceRef||digest(orderKey(evidence))!==digest(base.orderKey))return {...base,kind:'blocked',reason:'authentic-own-review-required'};
 if(evidence.status==='changes-requested'&&evidence.revision)return {...base,kind:'review-correction',revision:evidence.revision,previousSubmissionDigest:order.submissionDigest,requiresIndependentVerification:true};
 if(evidence.status==='accepted')return {...base,kind:'payment-reconciliation',acceptanceConfirmed:true,paymentConfirmed:false};
 if(evidence.status==='closed'||evidence.status==='superseded')return {...base,kind:'retain-history',resubmit:false,paymentConfirmed:false};
 return {...base,kind:'wait-for-review',resubmit:false};
}
