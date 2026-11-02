import {checkedJSON,bounded} from './founder-restoration-integrity.mjs';
const fields=['orderUrl','amountMinor','currency','recipient'];
/** Local contract preparation only. Operations and decoded fields below are an
 * internal fixture protocol, NOT an assertion about the real Opire API.
 * No default HTTP transport, credentials, claim comment, PR or payout action. */
export function createOpireLocalPreparation({isEnabled,bindings=[],transport,decode,now=Date.now}={}){
 if(typeof isEnabled!=='function'||!Array.isArray(bindings)||bindings.length>100)throw Error('Bounded local Opire configuration required');
 const reviewed=checkedJSON(bindings),active=ctx=>{if(!isEnabled())throw Error('Opire local OFF');if(ctx?.signal?.aborted)throw Error('Opire local cancelled');ctx?.assertActive?.();};
 return {provider:'opire-local-preparation',origin:'https://opire.dev',testOnly:true,
  status:()=>({prepared:true,liveConnected:false,liveAuthority:false,testOnly:true}),
  async inspect(expected,ctx){active(ctx);const matches=reviewed.filter(b=>fields.every(k=>b[k]===expected?.[k]));if(matches.length!==1)throw Error('Exact reviewed Opire order binding required');const b=matches[0];
   if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/[1-9]\d*$/.test(b.orderUrl)||!Number.isSafeInteger(b.amountMinor)||b.amountMinor<=0||!/^[A-Z]{3}$/.test(b.currency)||b.recipient!=='github:tricebr'||!['bountyId','claimId','providerAccount'].every(k=>bounded(b[k],200)))throw Error('Complete Opire order/account/claim binding required');
   if(typeof transport!=='function'||typeof decode!=='function')throw Error('Explicit fake transport and trusted decoder required');
   const raw=await transport(Object.freeze({operation:'read-contract',bountyId:b.bountyId,claimId:b.claimId,providerAccount:b.providerAccount}),ctx);active(ctx);const value=checkedJSON(await decode(raw,b));active(ctx);
   if(value.authenticated!==true||![...fields,'bountyId','claimId','providerAccount'].every(k=>value[k]===b[k])||!Number.isFinite(value.observedAt)||value.observedAt>now()||now()-value.observedAt>=60000||!Number.isFinite(value.expiresAt)||value.expiresAt<=now())throw Error('Independent exact current Opire fixture required');
   if(!['held','unfunded','unknown'].includes(value.fundingState)||!['pending','paid','failed','unknown'].includes(value.paymentState))throw Error('Unknown fixture state');
   return {provider:'opire-local-preparation',...b,claimReportedConfirmed:value.claimConfirmed===true,fundingReportedHeld:value.claimConfirmed===true&&value.fundingState==='held',paymentReportedPaid:value.paymentState==='paid',paymentConfirmed:false,liveAuthority:false,environment:'local-fixture',requires:['Verified real provider API schema and authenticated account','Exact active claim and funded monetary bounty','Independent actual payout receipt and beneficiary binding'],writesPerformed:0};
  }
 };
}
