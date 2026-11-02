import {orderKey,checkedJSON,bounded} from './founder-restoration-integrity.mjs';
export function normalizeNativeWork(binding,sourcePolicy){
 const key=orderKey(binding),blockers=[];if(binding.assignmentConfirmed!==true)blockers.push('own-assignment-required');if(binding.funding?.verified!==true&&sourcePolicy.paymentAuthority?.allows(binding)!==true)blockers.push('funding-required');
 if(!bounded(binding.buyerId)||binding.buyerId===key.ownerId)blockers.push('customer-identity-required');
 if(binding.termsVerified!==true)blockers.push('agreed-terms-required');
 if(binding.aiAllowed!==true)blockers.push('ai-permission-required');
 if(binding.profileId==='office-generation'&&(binding.privacy!=='public'||binding.inputs?.some(i=>i.privacy!=='public')))blockers.push('public-office-inputs-required');
 const terms=binding.paymentAuthorization??binding.funding;
 if(!terms||!Number.isSafeInteger(terms.amountMinor)||terms.amountMinor<=0||!Number.isSafeInteger(terms.netAmountMinor)||terms.netAmountMinor<=0||terms.netAmountMinor>terms.amountMinor||!/^[A-Z]{3}$/.test(terms.currency??'')||!bounded(terms.recipient))blockers.push('price-fees-and-recipient-required');
 if(!sourcePolicy.profiles?.includes(binding.profileId))blockers.push('unsupported-deliverable');if(!bounded(binding.scopeDigest))blockers.push('exact-scope-required');
 if(!Array.isArray(binding.inputs)||!binding.inputs.length)blockers.push('inputs-required');if(!Array.isArray(binding.acceptanceCriteria)||!binding.acceptanceCriteria.length||!binding.acceptanceCriteria.every(x=>bounded(x,2000)))blockers.push('acceptance-criteria-required');
 if(binding.inputs?.some(x=>x.privacy==='private')&&binding.dataUse?.privateProcessingAllowed!==true)blockers.push('private-data-use-not-authorized');
 return {orderKey:key,profileId:binding.profileId,scopeDigest:binding.scopeDigest??null,inputs:checkedJSON(binding.inputs??[]),acceptanceCriteria:checkedJSON(binding.acceptanceCriteria??[]),blockers};
}
