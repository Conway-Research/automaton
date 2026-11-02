/** Read-only evidence source for the confirmed-funded gate. It combines one exact
 * own Synmerco escrow with a contract sheet Patrice reviewed. It never writes to
 * Synmerco, never signs, and is not connected until a reviewed composition does so. */
import fs from 'node:fs';import path from 'node:path';
import {bounded,checkedJSON,digest,orderKey} from './founder-restoration-integrity.mjs';
export const SYNMERCO_ORIGIN='https://synmerco-escrow.onrender.com';
// Only observed name for money still held before delivery; anything else stays closed.
const HELD_STATES=new Set(['funded']);
const MAX_AGE=60000,READ_TIMEOUT=15000,SHEETS='artifacts/founder-autonomy-20261013/synmerco-contracts';
const fail=reason=>{throw Error('Synmerco evidence: '+reason);};
const cents=value=>{if(!Number.isSafeInteger(value)||value<=0)fail('exact positive escrow amount required');return value;};
// Exact: 10, 10.0 and 10.00 equal 1000 cents; anything finer than a cent never matches.
const grossMatches=(decimal,value)=>{const [whole,fraction='']=String(decimal).split('.');return /^\d+$/.test(whole)&&/^\d{0,2}$/.test(fraction)&&BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))===BigInt(value);};
// The platform shows cents; the agreed net keeps its original precision (9.675 shows as 9.68).
function netMatchesDisplay(netDecimal,displayCents){const [whole,fraction='']=String(netDecimal).split('.');if(!/^\d+$/.test(whole)||!/^\d{0,18}$/.test(fraction))return false;const exact=BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2)),rest=fraction.slice(2);return exact+(rest&&rest[0]>='5'?1n:0n)===BigInt(displayCents);}
export function createSynmercoFundedSource({base,isEnabled,credential,ownDid,request=fetch,now=Date.now}){
 if(!base||typeof isEnabled!=='function'||typeof credential!=='function'||!bounded(ownDid)||typeof request!=='function')fail('trusted composition required');
 const root=path.resolve(base);
 const active=ctx=>{if(isEnabled()!==true)fail('OFF');if(ctx?.signal?.aborted)fail('cancelled');ctx?.assertActive?.();};
 function readSheet(expected){
  const relative=path.join(SHEETS,digest(orderKey(expected))+'.json');let current=root;
  try{for(const part of relative.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error();}const stat=fs.statSync(current);if(!stat.isFile()||stat.size>64000)throw Error();}catch{fail('reviewed contract sheet unavailable or unsafe');}
  const sheet=checkedJSON(JSON.parse(fs.readFileSync(current,'utf8').replace(/^﻿/,'')),64000);
  if(sheet.schema!=='numaron-synmerco-reviewed-v1'||sheet.approved!==true||sheet.reviewedBy!=='patrice'||!Number.isInteger(sheet.reviewMinutes)||sheet.reviewMinutes<0||!Number.isFinite(sheet.expiresAt)||sheet.expiresAt<=now())fail('current contract sheet reviewed by Patrice required');
  if(digest(orderKey(sheet))!==digest(orderKey(expected))||sheet.rootTaskId!==expected.rootTaskId||sheet.sourceRevision!==expected.sourceRevision||sheet.scopeDigest!==expected.scopeDigest||sheet.buyerId!==expected.buyerId||digest(sheet.customerWork)!==digest(expected.customerWork))fail('contract sheet differs from the reviewed order');
  return sheet;
 }
 async function readOwnEscrow(escrowId,ctx){
  const key=credential();if(!key)fail('access required');active(ctx);
  let response,body;
  try{response=await request(SYNMERCO_ORIGIN+'/v1/escrows?did='+encodeURIComponent(ownDid),{method:'GET',redirect:'error',headers:{Authorization:'Bearer '+key},signal:ctx?.signal?AbortSignal.any([ctx.signal,AbortSignal.timeout(READ_TIMEOUT)]):AbortSignal.timeout(READ_TIMEOUT)});if(!response.ok)throw Error();body=await response.json();}catch{active(ctx);fail('escrow read failed');}
  active(ctx);const rows=Array.isArray(body?.data?.escrows)?body.data.escrows:Array.isArray(body?.escrows)?body.escrows:null;if(!rows)fail('unexpected escrow response');
  const matches=rows.filter(e=>e?.escrowId===escrowId);if(matches.length!==1)fail('unique own escrow required');return matches[0];
 }
 return {provider:'synmerco-own-escrow',origin:SYNMERCO_ORIGIN,authenticated:true,
  async read(expected,ctx={}){
   active(ctx);const sheet=readSheet(expected),work=expected.customerWork,escrowId=expected.externalId;
   if(expected.ownerId!==ownDid||work.recipient!==ownDid)fail('own seller identity required');
   const e=await readOwnEscrow(escrowId,ctx);
   if(e.sellerDid!==ownDid||e.buyerDid!==sheet.buyerId)fail('escrow parties differ from the contract sheet');
   if(!HELD_STATES.has(e.state))fail('escrow does not hold funds');
   const gross=cents(e.amountCents),net=cents(e.netToSellerCents);
   // The saved listing shows no deadline; if one is ever present it must still be open, and the sheet's own deadline always applies.
   for(const field of ['expiresAt','deadline','deadlineAt','refundAt'])if(e[field]!=null&&!(Date.parse(e[field])>now()))fail('escrow deadline passed or unreadable');
   if(!grossMatches(work.grossDecimal,gross)||!netMatchesDisplay(work.netDecimal,net))fail('escrow amount differs from the agreed amount');
   const at=now(),bindingDigest=digest(expected),part={bindingDigest,sourceRef:SYNMERCO_ORIGIN+'/v1/escrows/'+encodeURIComponent(escrowId)};
   return {schema:'confirmed-funded-customer-work-v1',environment:'production',bindingDigest,observedAt:at,expiresAt:at+MAX_AGE,
    assignment:{...part,platformOrderId:escrowId,status:'assigned',buyerId:e.buyerDid,contractorId:e.sellerDid},
    compensation:{...part,...work},
    funding:{...part,fundingId:'synmerco:'+escrowId,kind:'funded-escrow',status:'held',amountDecimal:work.grossDecimal,currency:work.currency,recipient:e.sellerDid}};
  }
 };
}
