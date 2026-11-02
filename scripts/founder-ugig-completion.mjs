import {createUgigSolSettlement} from './founder-ugig-sol-settlement.mjs';
import {createUgigPilotClient} from './founder-ugig-pilot-contract.mjs';
import {bounded,digest,orderKey} from './founder-restoration-integrity.mjs';
/** Invoice paid is not a bank/chain receipt. Independent reviewed net receipt
 * remains mandatory; it is bound to the authenticated invoice and beneficiary. */
export function createUgigCompletion({isEnabled,request,credential,evidence,recordEvidence,claimPayment,solanaRpc,solanaRequest,coinpayRequest,coinpayCredential,now=Date.now}){
 const client=createUgigPilotClient({isEnabled,request,credential,now});
 const solSettlement=createUgigSolSettlement({client,evidence,recordEvidence,claimPayment,solanaRpc,solanaRequest,coinpayRequest,coinpayCredential,now});
 async function identity(a,ctx){const s=await client.call('/api/auth/session',ctx);if(s.user?.id!==a.ownerId||s.profile?.id!==a.ownerId)throw Error('Own invoice account required');}
 async function settlement(order,ctx,{funding=false}={}){
  client.active(ctx);const p=evidence.pack(order),a=p.agreement,t=a.paymentAuthorization??a.funding,r=p.netReceipt;
  if(t?.settlement?.kind?.startsWith('ugig-sol-')){await identity(a,ctx);return solSettlement(order,ctx,{funding});}
  if(r?.reviewed!==true||r.independentlyVerified!==true||!['bank-statement','finalized-chain-receipt','provider-settlement'].includes(r.kind)||!bounded(r.evidenceRef,2000)||!bounded(r.receiptId)||!/^[a-f0-9]{64}$/.test(r.evidenceDigest??'')||r.scopeDigest!==a.scopeDigest||r.recipient!==t?.recipient||r.netAmountMinor!==t?.netAmountMinor||r.currency!==t?.currency||!Number.isFinite(Date.parse(r.receivedAt))||Date.parse(r.receivedAt)>now()||!bounded(r.invoiceId))throw Error('Independent exact net payment receipt required');
  await identity(a,ctx);const list=await client.call('/api/gigs/'+a.gigId+'/invoice',ctx);
  if(!Array.isArray(list.data)||list.data.length>100||list.hasMore||list.nextCursor)throw Error('Complete invoice evidence required');
  const matches=list.data.filter(i=>i.id===r.invoiceId);if(matches.length!==1)throw Error('Unique invoice required');const i=matches[0];
  if(i.gig_id!==a.gigId||i.application_id!==a.applicationId||i.worker_id!==a.ownerId||i.poster_id!==a.buyerId||i.status!=='paid'||t.currency!=='USD'||i.currency!==t.currency||!Number.isFinite(i.amount_usd)||Math.abs(i.amount_usd*100-t.amountMinor)>0.000001)throw Error('Exact paid own USD invoice required');
  if(p.netReceipt.invoiceDigest!==digest(i))throw Error('Invoice changed since independent settlement review');
  client.active(ctx);if(digest(evidence.pack(order))!==digest(p))throw Error('Payment evidence changed');
  const ref=await recordEvidence({kind:'ugig-net-payment',invoice:i,netReceipt:r,orderKey:orderKey(order)},ctx);client.active(ctx);
  if(!bounded(ref,2000))throw Error('Durable payment evidence required');
  if(digest(evidence.pack(order))!==digest(p))throw Error('Payment evidence changed during recording');
  return {...orderKey(order),sourceRevision:order.sourceRevision,deliveryDigest:order.deliveryDigest??null,confirmed:true,receiptKind:r.kind,amountMinor:r.netAmountMinor,currency:r.currency,recipient:r.recipient,evidenceRef:'ugig-receipt:'+digest([r.kind,r.receiptId]),recordedEvidenceRef:ref,observedAt:now(),expiresAt:now()+59000};
 }
 return {readPayment:settlement,
  async verifyFunding(order,ctx){await settlement(order,ctx,{funding:true});return true;},
  async readAcceptance(order,ctx){
   client.active(ctx);const p=evidence.pack(order),a=p.agreement,r=p.acceptance;
   if(r?.reviewed!==true||r.noContractChangeReviewed!==true||r.accepted!==true||!bounded(order.deliveryDigest)||r.deliveryDigest!==order.deliveryDigest||!bounded(r.messageId)||!/^[a-f0-9]{64}$/.test(r.contentDigest??''))throw Error('Reviewed exact buyer acceptance required');
   await identity(a,ctx);const messages=await client.messages(a.conversationId,ctx);
   const buyers=messages.filter(m=>m.sender_id===a.buyerId&&m.conversation_id===a.conversationId).sort((x,y)=>Date.parse(x.created_at)-Date.parse(y.created_at));
   const m=buyers.at(-1),observedAt=now();
   if(!m||buyers.some(m=>!bounded(m.id)||!Number.isFinite(Date.parse(m.created_at))||Date.parse(m.created_at)>observedAt)||new Set(buyers.map(m=>m.id)).size!==buyers.length||buyers.filter(x=>Date.parse(x.created_at)===Date.parse(m.created_at)).length!==1||m.id!==r.messageId||digest(m.content)!==r.contentDigest)throw Error('Latest buyer acceptance changed or missing');
   client.active(ctx);if(digest(evidence.pack(order))!==digest(p))throw Error('Acceptance revoked');
   const ref=await recordEvidence({kind:'ugig-buyer-acceptance',message:m,deliveryDigest:order.deliveryDigest},ctx);client.active(ctx);
   if(digest(evidence.pack(order))!==digest(p))throw Error('Acceptance revoked during recording');
   return {...orderKey(order),sourceRevision:order.sourceRevision,deliveryDigest:order.deliveryDigest,actorId:a.buyerId,verified:true,accepted:true,observedAt:now(),expiresAt:now()+59000,evidenceRef:ref};
  }
 };
}
