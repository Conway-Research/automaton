// This exact-order gate is deliberately not a LaborX transport. Evidence must
// come from reviewed authenticated composition, never from a task/model payload.
export const SAHIL_ORDER=Object.freeze({platform:'laborx',externalId:'105216',buyerId:'355073',ownerId:'474954',rootTaskId:'laborx-105216-sahil'});
const keys=Object.keys(SAHIL_ORDER);
const text=x=>typeof x==='string'&&x.length>0&&x.length<=2000;
const requireValue=(v,m)=>{if(!v)throw Error('Sahil: '+m);};
export function createSahilOrderGate({isEnabled,readAgreement,paymentAuthority,now=Date.now}={}){
 requireValue(typeof isEnabled==='function','power guard required');
 const active=ctx=>{requireValue(isEnabled()===true,'OFF');requireValue(!ctx?.signal?.aborted,'cancelled');ctx?.assertActive?.();};
 return {
  async reconcilePayment(order,ctx){
   active(ctx);requireValue(keys.every(k=>order?.[k]===SAHIL_ORDER[k]),'exact order identity required');
   if(typeof paymentAuthority?.reconcile!=='function')return {confirmed:false,blocker:'Independent payment reconciliation unavailable'};
   const result=await paymentAuthority.reconcile(order,ctx);active(ctx);
   return result?.confirmed===true?{confirmed:true}:{confirmed:false,blocker:result?.blocker??'No independently verified receipt'};
  },
  status(){return {order:SAHIL_ORDER,paymentModes:['platform-escrow','postpaid-limited'],maxExposureRappen:100,agreementReaderConfigured:typeof readAgreement==='function',liveReady:false,blockers:['Provider-permitted authenticated LaborX lifecycle transport not live verified','Pinned browser renderer and independent visual acceptance not live verified'],paymentPromiseIsPayment:false};},
  async assess(order,ctx){
   active(ctx);requireValue(keys.every(k=>order?.[k]===SAHIL_ORDER[k]),'exact order identity required');
   requireValue(typeof readAgreement==='function','authenticated agreement reader unavailable');
   const a=await readAgreement(Object.freeze({...SAHIL_ORDER}),ctx);active(ctx);
   const at=now();requireValue(a&&keys.every(k=>a[k]===SAHIL_ORDER[k])&&a.authenticated===true&&a.actorId===SAHIL_ORDER.buyerId,'authenticated buyer evidence required');
   requireValue(Number.isFinite(a.observedAt)&&a.observedAt<=at&&at-a.observedAt<60000&&Number.isFinite(a.expiresAt)&&a.expiresAt>at&&a.expiresAt<=at+60000&&text(a.evidenceRef),'fresh evidence required');
   requireValue(a.assignmentConfirmed===true&&a.aiAllowed===true&&a.inputsReady===true&&a.assetRightsConfirmed===true&&text(a.scopeDigest)&&a.scopeDigest===order.scopeDigest&&Array.isArray(a.acceptanceCriteria)&&a.acceptanceCriteria.length>0&&a.acceptanceCriteria.every(text),'agreed scope, inputs and acceptance required');
   const delivery=Date.parse(a.deliveryAt),due=Date.parse(a.paymentDueAt);
   requireValue(a.feasible===true&&a.customerDeadlineAgreed===true&&Number.isFinite(delivery)&&delivery>at&&delivery<=Date.parse('2026-10-31T22:59:59.999Z'),'feasible agreed October31 deadline required');
   requireValue(a.amountMinor===38000&&a.currency==='USD'&&Number.isSafeInteger(a.netAmountMinor)&&a.netAmountMinor>0&&a.netAmountMinor<=a.amountMinor&&a.feesKnown===true&&a.paymentPromise===true&&text(a.paymentMethod)&&text(a.recipient)&&a.recipientRole==='personal-payout'&&a.recipientVerified===true&&a.recipientAcknowledged===true&&text(a.network)&&text(a.token)&&Number.isFinite(due)&&due>=delivery&&due-delivery<=30*86400000&&text(a.paymentTermsDigest)&&a.paymentTermsDigest===order.paymentTermsDigest,'exact payment commitment and verified recipient required');
   // Retain the existing shared authority and global exposure slot. A buyer's
   // promise, or this case-specific human permission, cannot mint a receipt.
   requireValue(['platform-escrow','postpaid-limited'].includes(a.paymentMode),'explicit payment mode required');
   if(order.profileId==='static-website'){
    const terms=order.paymentAuthorization??order.funding;
    requireValue(terms&&['amountMinor','netAmountMinor','currency','recipient'].every(k=>terms[k]===a[k])&&a.paymentMode===(terms.paymentMode??'platform-escrow')&&JSON.stringify(order.acceptanceCriteria)===JSON.stringify(a.acceptanceCriteria),'payment and acceptance must match buyer agreement');
   }
   requireValue(paymentAuthority?.allows?.({...order,agreement:a})===true,'existing CHF1/payment authority required');
   active(ctx);return {ready:true,paymentConfirmed:false,paymentMode:a.paymentMode,scopeDigest:a.scopeDigest,paymentTermsDigest:a.paymentTermsDigest,evidenceRef:a.evidenceRef};
  }
 };
}
