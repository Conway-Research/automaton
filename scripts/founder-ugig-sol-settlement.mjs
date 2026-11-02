import {bounded,digest,orderKey} from './founder-restoration-integrity.mjs';
import {createSolanaReceiptReader,solBase58,solAmount} from './founder-ugig-sol.mjs';
import {createCoinpayEscrowReader} from './founder-ugig-coinpay-read.mjs';
const must=(ok,m)=>{if(!ok)throw Error('uGig SOL settlement: '+m);};
const minor=(value)=>{must((typeof value==='number'&&Number.isFinite(value)||typeof value==='string')&&/^\d+(?:\.\d{1,2})?$/.test(String(value)),'exact decimal USD amount');const [w,f='']=String(value).split('.'),n=BigInt(w)*100n+BigInt(f.padEnd(2,'0'));must(n<=BigInt(Number.MAX_SAFE_INTEGER),'amount overflow');return Number(n);};
export function validateUgigSolTerms(t){const s=t?.settlement;
 must(s&&['ugig-sol-escrow-v1','ugig-sol-invoice-v1'].includes(s.kind)&&s.network==='solana-mainnet'&&s.asset==='SOL'&&s.decimals===9&&t.currency==='USD'&&s.settlesCurrency===t.currency&&s.settlesAmountMinor===t.netAmountMinor&&Number.isSafeInteger(t.amountMinor)&&t.amountMinor>0&&Number.isSafeInteger(t.netAmountMinor)&&t.netAmountMinor>0&&t.netAmountMinor<=t.amountMinor,'explicit USD/SOL contract');
 must(solBase58(s.sourceAddress)&&solBase58(s.recipientAddress)&&s.sourceAddress!==s.recipientAddress&&s.recipientAddress===t.recipient&&solAmount(s.grossLamports)&&solAmount(s.netLamports)&&typeof s.feeLamports==='string'&&/^(0|[1-9]\d{0,15})$/.test(s.feeLamports)&&BigInt(s.netLamports)+BigInt(s.feeLamports)===BigInt(s.grossLamports),'exact addresses and integer lamport amounts');
 must(Number.isSafeInteger(s.platformFeeMinor)&&s.platformFeeMinor>=0&&Number.isSafeInteger(s.otherFeesMinor)&&s.otherFeesMinor>=0&&s.platformFeeMinor+s.otherFeesMinor+t.netAmountMinor===t.amountMinor&&s.conversion?.mode==='fixed-agreed-amount'&&bounded(s.conversion.evidenceRef,2000)&&Number.isFinite(s.conversion.agreedAt),'reviewed conversion and fee allocation');
 if(s.kind==='ugig-sol-escrow-v1')must(bounded(s.escrowId)&&bounded(s.coinpayEscrowId)&&solBase58(s.depositorAddress)&&s.depositorAddress!==s.sourceAddress&&s.depositorAddress!==s.recipientAddress,'escrow identities');else must(bounded(s.invoiceId),'invoice identity');return s;
}
const atomic=v=>{must((typeof v==='number'&&Number.isFinite(v)||typeof v==='string')&&/^\d+(?:\.\d{1,9})?$/.test(String(v)),'exact decimal SOL amount');const [w,f='']=String(v).split('.');return BigInt(w)*1000000000n+BigInt(f.padEnd(9,'0'));};
export function createUgigSolSettlement({client,evidence,recordEvidence,claimPayment,solanaRpc,solanaRequest,coinpayRequest,coinpayCredential,now=Date.now}){
 const isEnabled=()=>{try{client.active({});return true;}catch{return false;}},sol=createSolanaReceiptReader({isEnabled,rpc:solanaRpc,request:solanaRequest,now}),providerRead=createCoinpayEscrowReader({isEnabled,request:coinpayRequest,credential:coinpayCredential});
 return async function read(order,ctx,{funding=false}={}){
  client.active(ctx);const p=evidence.pack(order),a=p.agreement,t=a.paymentAuthorization??a.funding,s=validateUgigSolTerms(t),escrow=s.kind==='ugig-sol-escrow-v1';
  must(s.conversion.agreedAt<=now()&&digest(orderKey(a))===digest(orderKey(order))&&a.sourceRevision===order.sourceRevision&&a.scopeDigest===order.scopeDigest&&a.rootTaskId===order.rootTaskId,'exact order agreement');must(typeof claimPayment==='function','durable receipt allocation required');
  const id=escrow?s.escrowId:s.invoiceId,route='/api/gigs/'+a.gigId+(escrow?'/escrow':'/invoice');
  const record=async()=>{client.active(ctx);const list=await client.call(route,ctx);must(Array.isArray(list.data)&&list.data.length<=100&&!list.hasMore&&!list.nextCursor,'complete platform evidence');const rows=list.data.filter(x=>x.id===id);must(rows.length===1,'unique platform record');const r=rows[0];must(r.gig_id===a.gigId&&r.application_id===a.applicationId&&r.worker_id===a.ownerId&&r.poster_id===a.buyerId&&minor(r.amount_usd)===t.amountMinor,'exact own order and gross price');return r;};
  const r=await record();let chain,provider;
  if(escrow){const review=p.escrowReview;
   must(r.coinpay_escrow_id===s.coinpayEscrowId&&r.currency==='sol'&&minor(r.platform_fee_usd)===s.platformFeeMinor&&r.metadata?.payment_address===s.sourceAddress&&['funded','released'].includes(r.status),'funded or released matching SOL escrow');
   must(review?.reviewed===true&&review.independentlyVerified===true&&review.conditionsReviewed===true&&review.agreementDigest===digest(a)&&review.escrowId===r.id&&review.coinpayEscrowId===r.coinpay_escrow_id&&review.depositAddress===s.sourceAddress&&review.beneficiaryAddress===s.recipientAddress&&bounded(review.evidenceRef,2000)&&Number.isFinite(review.expiresAt)&&review.expiresAt>now(),'independent beneficiary and custody-conditions review required');
   provider=await providerRead(s.coinpayEscrowId,ctx);
   must(provider.id===s.coinpayEscrowId&&provider.chain==='SOL'&&provider.escrow_address===s.sourceAddress&&provider.depositor_address===s.depositorAddress&&provider.beneficiary_address===s.recipientAddress&&minor(provider.amount_usd)===t.amountMinor&&atomic(provider.amount)===BigInt(s.grossLamports)&&atomic(provider.deposited_amount)>=BigInt(s.grossLamports)&&!provider.refunded_at&&!provider.disputed_at,'current provider custody and beneficiary');
   must(provider.metadata?.platform==='ugig.net'&&provider.metadata.gig_id===a.gigId&&provider.metadata.application_id===a.applicationId&&provider.metadata.worker_id===a.ownerId&&provider.metadata.poster_id===a.buyerId,'provider order attribution');
   must(atomic(provider.fee_amount)+atomic(provider.marketplace_fee_amount)<=BigInt(s.feeLamports),'provider fees exceed agreement');
   if(r.status==='funded'){
    must(provider.status==='funded'&&Date.parse(provider.expires_at)>now()&&provider.deposit_tx_hash===review.depositSignature,'provider funded commitment');
    must(funding,'escrow held is not income');const expiry=Date.parse(r.metadata.expires_at),fundedAt=Date.parse(r.funded_at);must(Number.isFinite(expiry)&&expiry>now()&&Number.isFinite(fundedAt)&&fundedAt<=now(),'unexpired funded escrow');
    chain=await sol.read({signature:review.depositSignature,sender:s.depositorAddress,recipient:s.sourceAddress,lamports:s.grossLamports,notBefore:s.conversion.agreedAt},ctx);
    must(BigInt(await sol.balance(s.sourceAddress,chain.slot,ctx))>=BigInt(s.grossLamports),'escrow balance no longer covers commitment');
   }else must(provider.status==='settled'&&Number.isFinite(Date.parse(provider.settled_at))&&Date.parse(provider.settled_at)<=now()&&Number.isFinite(Date.parse(r.released_at))&&Date.parse(r.released_at)<=now(),'provider settled release required');
  }else must(r.status==='paid'&&r.currency==='USD','paid USD invoice required');
  const held=escrow&&r.status==='funded';
  if(!held){const ref=p.solReference;must(ref?.reviewed===true&&ref.agreementDigest===digest(a)&&ref.recordId===id,'exact reviewed payout reference');if(!escrow)must(r.metadata?.merchant_tx_hash===ref.signature&&r.metadata?.payment_currency==='sol','invoice forwarding transaction required');
   if(escrow)must(provider.settlement_tx_hash===ref.signature,'provider payout transaction');
   chain=await sol.read({signature:ref.signature,sender:s.sourceAddress,recipient:s.recipientAddress,lamports:s.netLamports,notBefore:s.conversion.agreedAt},ctx);
  }
  client.active(ctx);must(digest(await record())===digest(r)&&digest(evidence.pack(order))===digest(p)&&(!escrow||digest(await providerRead(s.coinpayEscrowId,ctx))===digest(provider)),'payment evidence changed during verification');
  const allocation={...orderKey(order),rootTaskId:order.rootTaskId,sourceRevision:order.sourceRevision,scopeDigest:a.scopeDigest};
  client.active(ctx);if(escrow){claimPayment({escrow:s.coinpayEscrowId},allocation);claimPayment({escrowAddress:s.sourceAddress},allocation);}claimPayment({transaction:chain.evidenceRef},allocation);
  const evidenceRef=await recordEvidence({kind:held?'ugig-sol-escrow-funded':'ugig-sol-received',order:allocation,record:r,chain,settlement:s,...(escrow?{custodyReview:p.escrowReview,provider}:{})},ctx);client.active(ctx);must(bounded(evidenceRef,2000),'durable evidence required');
  must(digest(evidence.pack(order))===digest(p),'payment evidence changed during recording');
  if(held)return {funded:true,confirmed:false,kind:'escrow-lock',recordedEvidenceRef:evidenceRef};
  return {...orderKey(order),sourceRevision:order.sourceRevision,deliveryDigest:order.deliveryDigest??null,confirmed:true,amountMinor:t.netAmountMinor,currency:t.currency,recipient:t.recipient,evidenceRef:chain.evidenceRef,recordedEvidenceRef:evidenceRef,settlement:{asset:'SOL',network:s.network,amountAtomic:chain.lamports,decimals:9,signature:chain.signature,recipientAddress:s.recipientAddress,contractNetMinor:t.netAmountMinor,contractCurrency:t.currency,conversion:s.conversion},observedAt:now(),expiresAt:now()+59000};
 };
}
