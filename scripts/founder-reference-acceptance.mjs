import {digest} from './founder-restoration-integrity.mjs';
import {referenceScope} from './founder-reference-approvals.mjs';
import {checkOrderQuality} from './founder-order-quality.mjs';
export function prepareReferenceAcceptance({product,authority}){
 const scope=referenceScope(product.binding),approved=authority?.allows(product.binding)===true;
 let quality=false;try{quality=checkOrderQuality(product,{qualityProfiles:['invoice-reconciliation-v1'],validateQualityContract:b=>authority?.allows(b)===true},{requireReview:true})?.passed===true;}catch{}
 return {schema:'founder-reference-acceptance-v1',scope,filesDigest:digest({files:product.files}),status:approved&&quality?'ready-for-source-review':'blocked',accepted:false,executionAuthorized:false,steps:[{id:'reference-approval',status:approved?'passed':'blocked'},{id:'artifact-quality',status:quality?'passed':'blocked'},{id:'fresh-source-assignment',status:'pending-external'},{id:'native-delivery-readback',status:'pending-external'},{id:'buyer-acceptance',status:'pending-external'}]};
}
