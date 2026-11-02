/** Construction-time commercial evidence authority. No credentials, network
 * implementation, production power changes, new ledger or automatic spending. */
import {checkedJSON,digest,orderKey,bounded} from './founder-restoration-integrity.mjs';
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=reason=>{throw Error('Confirmed funded work: '+reason);};
const MAX_AGE=60000;
const CURRENCY=/^(?:[A-Z]{3}|USDC)$/;
function decimal(value){
 if(typeof value!=='string'||value.length>40||!/^(0|[1-9]\d{0,20})(?:\.\d{1,18})?$/.test(value))fail('exact nonnegative decimal string required');
 const [whole,fraction='']=value.split('.');return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0'));
}
function expectedFor(order,now){
 const identity=orderKey(order),work=checkedJSON(order.customerWork??{},4000);
 if(!bounded(order.rootTaskId)||!bounded(order.sourceRevision)||!hash(order.scopeDigest)||!bounded(order.buyerId)||order.buyerId===identity.ownerId)fail('complete own order and buyer binding required');
 if(!bounded(work.milestoneId)||!['inputsDigest','acceptanceDigest','correctionScopeDigest'].every(k=>hash(work[k]))||!Number.isFinite(Date.parse(work.deadlineUtc))||Date.parse(work.deadlineUtc)<=now||!CURRENCY.test(work.currency??'')||!bounded(work.recipient)||!bounded(work.paymentTrigger))fail('reviewed inputs, deadline, acceptance and complete payment terms required');
 const gross=decimal(work.grossDecimal),net=decimal(work.netDecimal),deductions=decimal(work.deductionsDecimal);
 if(gross<=0n||net<=0n||net+deductions!==gross)fail('exact agreed gross, deductions and net required');
 return {...identity,rootTaskId:order.rootTaskId,sourceRevision:order.sourceRevision,scopeDigest:order.scopeDigest,buyerId:order.buyerId,customerWork:work};
}
export function createConfirmedFundedAuthority({source=null,isEnabled=()=>false,now=Date.now,allowSyntheticForTests=false,ownRecipients={},allowEquivalentProtection=null,claimFunding=null}={}){
 const synthetic=source?.testOnly===true;
 if(typeof allowSyntheticForTests!=='boolean'||synthetic&&allowSyntheticForTests!==true)fail('synthetic evidence requires explicit Boolean isolated test composition');
 if(typeof isEnabled!=='function'||typeof now!=='function'||allowEquivalentProtection!==null&&typeof allowEquivalentProtection!=='function')fail('trusted construction callbacks required');
 let origin=null,reader=null,claims=claimFunding;const memoryClaims=new Map();
 // One funding source covers one order and milestone. Production uses the durable store claim.
 const claim=(fundingId,order,milestoneId)=>{const owner=digest(orderKey(order));if(claims)return claims({fundingId,orderKey:owner,milestoneId});if(!synthetic)fail('durable funding claim required');const bound=memoryClaims.get(fundingId);if(bound&&(bound.owner!==owner||bound.milestoneId!==milestoneId))fail('funding already covers another order or milestone');memoryClaims.set(fundingId,{owner,milestoneId});};
 if(source){
  const u=new URL(source.origin);
  if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||typeof source.read!=='function'||!synthetic&&source.authenticated!==true)fail('authenticated fixed-origin reader required');
  origin=u.origin;reader=source.read.bind(source);
 }
 // Only the trusted composition's ownership registry supplies these identities;
 // an order, a model, or jointly altered funding/compensation cannot add one.
 const recipients=new Map();
 for(const [owner,values] of Object.entries(checkedJSON(ownRecipients,8000))){if(!bounded(owner)||!Array.isArray(values)||!values.length||values.some(v=>!bounded(v)))fail('trusted own-recipient registry required');recipients.set(owner,new Set(values));}
 const proofs=new Map(),generations=new Map();
 const keyFor=o=>digest(orderKey(o));
 const active=ctx=>{if(!isEnabled())fail('OFF');if(ctx?.signal?.aborted)fail('cancelled');(ctx?.assertFundingRefreshActive??ctx?.assertActive)?.();};
 const sourceRef=x=>{let u;try{u=new URL(x);}catch{fail('concrete official source reference required');}if(u.origin!==origin||u.username||u.password||u.search||u.hash||u.pathname==='/')fail('official source reference mismatch');return u.href;};
 return {
  attachFundingClaims(fn){if(typeof fn!=='function')fail('trusted funding claim required');claims=fn;},
  needsRefresh(order,maxAge=MAX_AGE){try{const p=proofs.get(keyFor(order));return !p||now()-p.observedAt>=maxAge;}catch{return true;}},
  status:()=>({configured:!!reader,synthetic,productionEvidenceConnected:!!reader&&!synthetic,scope:'Commercial evidence only; source, power, budget and delivery guards still apply'}),
  allows(order){
   if(!isEnabled()||!reader)return false;
   try{const time=now(),p=proofs.get(keyFor(order));return !!p&&p.expectedDigest===digest(expectedFor(order,time))&&p.observedAt<=time&&time-p.observedAt<MAX_AGE&&p.expiresAt>time;}catch{return false;}
  },
  async refresh(order,ctx={}){
   // A failed, revoked, interrupted or incomplete refresh removes the earlier
   // evidence; while the read runs that evidence stays valid up to its maximum age.
   let key,epoch;try{key=keyFor(order);epoch=(generations.get(key)??0)+1;generations.set(key,epoch);}catch{fail('valid order key required');}
   try{
   active(ctx);if(!reader)fail('no authenticated evidence reader');
   const expected=expectedFor(order,now()),expectedDigest=digest(expected);
   if(recipients.get(expected.ownerId)?.has(expected.customerWork.recipient)!==true)fail('verified own recipient mapping required');
   let raw;try{raw=await reader(structuredClone(expected),{...ctx,assertActive:ctx.assertFundingRefreshActive??ctx.assertActive});}catch{active(ctx);fail('authenticated order evidence read failed');}
   active(ctx);
   if(generations.get(key)!==epoch)fail('superseded by a newer order evidence read');
   const value=checkedJSON(raw,64000);
   const time=now();
   if(!Number.isSafeInteger(time)||value.schema!=='confirmed-funded-customer-work-v1'||value.environment!==(synthetic?'synthetic':'production')||value.bindingDigest!==expectedDigest||!Number.isSafeInteger(value.observedAt)||!Number.isSafeInteger(value.expiresAt)||value.observedAt>time||time-value.observedAt>=MAX_AGE||value.expiresAt<=time)fail('fresh exact same-order evidence required');
   const {assignment,compensation,funding}=value;
   for(const part of [assignment,compensation,funding]){if(part?.bindingDigest!==expectedDigest)fail('assignment compensation funding binding mismatch');sourceRef(part.sourceRef);}
   if(assignment.status!=='assigned'||assignment.buyerId!==order.buyerId||assignment.contractorId!==order.ownerId||assignment.platformOrderId!==order.externalId)fail('own confirmed assignment required');
   for(const field of Object.keys(expected.customerWork))if(compensation[field]!==expected.customerWork[field])fail('agreed compensation or work context mismatch');
   if(funding.currency!==compensation.currency||funding.recipient!==compensation.recipient)fail('funding currency or beneficiary mismatch');
   if(!bounded(funding.fundingId))fail('concrete funding identity required');
   const covered=decimal(funding.amountDecimal),gross=decimal(compensation.grossDecimal),net=decimal(compensation.netDecimal);
   let funded=funding.kind==='funded-escrow'&&funding.status==='held'&&covered>=gross||funding.kind==='verified-advance'&&funding.status==='received'&&covered>=net;
   if(!funded&&funding.kind==='equivalent-protection'&&funding.status==='protected'&&covered>=gross&&hash(funding.protectionDigest))funded=allowEquivalentProtection?.(structuredClone(funding),structuredClone(expected))===true;
   if(!funded)fail('concrete own funded milestone or verified advance required');
   active(ctx);
   // Re-evaluate the caller's current object as well: a reader must not grant a
   // scope changed by an asynchronous callback during this operation.
   if(digest(expectedFor(order,now()))!==expectedDigest)fail('reviewed scope changed during evidence read');
   const receipt={schema:'confirmed-funded-customer-work-receipt-v1',expectedDigest,observedAt:value.observedAt,expiresAt:Math.min(value.expiresAt,value.observedAt+MAX_AGE),assignment:structuredClone(assignment),compensation:structuredClone(compensation),funding:structuredClone(funding),synthetic,realWorkAuthorized:false};
   if(generations.get(key)!==epoch)fail('superseded by a newer order evidence read');
   claim(funding.fundingId,order,expected.customerWork.milestoneId);
   proofs.set(key,structuredClone(receipt));ctx.assertActive?.();active(ctx);return Object.freeze(receipt);
   }catch(error){if(generations.get(key)===epoch)proofs.delete(key);throw error;}
  }
 };
}
