// Pure projection over existing order, communication and finance journals: no store, no second CRM, no sending.
// Every result grants nothing; send, work and submit stay with the existing gates.
import {digest,bounded} from './founder-restoration-integrity.mjs';
import {canonicalText,declaredSynthetic,identityText,normalizedRef,realRef,receiptStatus,recordIssues,simulatedRef,strictTime} from './founder-operating-boundary.mjs';
const minor=x=>Number.isSafeInteger(x)&&x>=0;
// Journal rows may hold any value; comparing them must never decide by crashing.
const same=x=>digest(JSON.parse(JSON.stringify(x,(k,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v)??null));
const refused=record=>{
 const issues=recordIssues(record);
 if(issues.includes('personnel-cost-forbidden'))throw Error('Personnel costs are not part of this calculation');
 if(issues.includes('human-time-must-be-minutes'))throw Error('Human involvement is recorded in minutes only');
};

const COSTS=['feesMinor','costUpperMinor','acquisitionMinor','reworkReserveMinor'];
/** Ranks admissible candidates by conservative contribution per scarce capacity minute. No success probability. */
export function rankCandidates(candidates,{currency,capacityMinutes,now=Date.now()}={}){
 refused(candidates);
 const seen=new Set(),rows=[],rejected=[];
 if(!/^[A-Z]{3}$/.test(currency??''))return {ranked:[],rejected:candidates.map(c=>({id:c?.id??null,reason:'currency-mismatch'}))};
 for(const c of candidates){
  const reject=reason=>rejected.push({id:c?.id??null,reason});
  if(seen.has(c?.id)){reject('duplicate');continue;}seen.add(c?.id);
  if(c?.admissible!==true){reject('not-admissible');continue;}
  if(!minor(c.listPriceMinor)){reject('price-unknown');continue;}
  if(c.currency!==currency){reject('currency-mismatch');continue;}
  if(!COSTS.every(k=>minor(c[k]))){reject('cost-unknown');continue;}
  if(!minor(c.computeMinutes)||c.computeMinutes===0||!minor(capacityMinutes)){reject('capacity-unknown');continue;}
  if(c.computeMinutes>capacityMinutes){reject('no-capacity');continue;}
  if(c.deadlineAt!==undefined&&!(strictTime(c.deadlineAt)>now)){reject('deadline-not-reachable');continue;}
  const contributionMinor=c.listPriceMinor-COSTS.reduce((n,k)=>n+c[k],0);
  if(contributionMinor<=0){reject('no-positive-contribution');continue;}
  rows.push({id:c.id,contributionMinor,minutes:c.computeMinutes,currency});
 }
 rows.sort((a,b)=>Number(BigInt(b.contributionMinor)*BigInt(a.minutes)-BigInt(a.contributionMinor)*BigInt(b.minutes))||String(a.id).localeCompare(String(b.id)));
 let used=0;for(const r of rows){used+=r.minutes;r.withinCapacity=used<=capacityMinutes;if(!r.withinCapacity)used-=r.minutes;}
 return {ranked:rows,rejected};
}

/** Claims need their own evidence; a synthetic reference can only ever read as an example. */
export function draftOffer({candidateId,offerVersion,scope,claims=[],evidence={}}={}){
 const blocked=[],statements=[];
 if(!bounded(candidateId))blocked.push('candidate-missing');
 if(!bounded(offerVersion))blocked.push('offer-version-missing');
 if(!scope||typeof scope!=='object')blocked.push('scope-missing');
 for(const claim of claims){
  if(claim.kind==='capability'){const ref=evidence.capabilities?.[claim.id];if(realRef(ref))statements.push({kind:'capability',id:claim.id,evidenceRef:ref});else blocked.push('capability:'+claim.id);continue;}
  if(claim.kind==='reference'){
   const r=(evidence.references??[]).find(x=>x.id===claim.id);
   if(!r||!bounded(r.evidenceRef,2000))blocked.push('reference:'+claim.id);
   else if(r.origin==='synthetic')statements.push({kind:'example',id:r.id,label:'Synthetisches Beispiel',evidenceRef:r.evidenceRef});
   else if(r.origin==='customer'&&!declaredSynthetic(r.synthetic)&&realRef(r.evidenceRef)&&realRef(r.publicationAllowedRef))statements.push({kind:'customer-reference',id:r.id,evidenceRef:r.evidenceRef});
   else blocked.push('reference-permission:'+claim.id);
   continue;
  }
  blocked.push(claim.kind+':'+claim.id);
 }
 return {status:blocked.length?'blocked':'draft',candidateId,offerVersion,scopeDigest:digest(scope??null),statements,blocked,sendAuthorized:false,workAuthorized:false};
}

export function clarificationStep({required,answers={},asked=[]}={}){
 if(!Array.isArray(required))return {state:'requirements-unknown',missing:[],questions:[],messages:0,workAllowed:false,modelSpendAllowed:false,sendAuthorized:false};
 const missing=required.filter(q=>!bounded(answers[q.id]?.evidenceRef,2000)),questions=missing.filter(q=>!asked.includes(q.id));
 const ready=missing.length===0;
 return {state:ready?'ready':'waiting-customer',missing:missing.map(q=>q.id),questions,messages:questions.length?1:0,workAllowed:ready,modelSpendAllowed:ready,sendAuthorized:false};
}

const SENT=['sent','followup-sent','send-uncertain'],STOPS={'contact-block':'contact-blocked',objection:'objected',rejection:'rejected',closed:'closed','no-need':'no-need'};
const timeOf=e=>strictTime(e.at);
/** The same person stays the same across spelling, case, invisible characters and alias chains. */
const identity=(ref,aliases={})=>{
 const table=new Map(Object.entries(aliases).map(([k,v])=>[canonicalText(k),canonicalText(v)])),path=[];let key=canonicalText(ref);
 while(table.has(key)&&!path.includes(key)){path.push(key);key=table.get(key);}
 // A cycle names one person from several sides: everyone in it resolves to the same member.
 if(path.includes(key))key=[...path.slice(path.indexOf(key))].sort()[0];
 return key;
};
/** Duplicate ids collapse; the same id with different content is a conflict and is kept visible, never overwritten. */
export function projectFunnel(events,{aliases={},receiptPolicy}={}){
 const byId=new Map(),conflicts=new Set(),conflicting=[];
 for(const raw of events){
  if(!raw||typeof raw!=='object'){conflicts.add('invalid-event');continue;}
  const e={...raw,customerRef:identity(raw.customerRef,aliases)},old=byId.get(e.id);
  if(old){if(same(old)!==same(e)){conflicts.add(e.id);conflicting.push(e);}continue;}
  byId.set(e.id,e);
 }
 const list=[...byId.values()].sort((a,b)=>(timeOf(a)??0)-(timeOf(b)??0)),cases=new Map();
 for(const e of list){
  const key=JSON.stringify([e.customerRef,e.rootTaskId]),c=cases.get(key)??{customerRef:e.customerRef,rootTaskId:e.rootTaskId,sourceId:e.sourceId,family:e.family,events:[],sent:0};
  c.events.push(e);if(e.type==='sent')c.sent++;cases.set(key,c);
 }
 return {events:list,cases:[...cases.values()],conflicts:[...conflicts],conflicting,aliases,receiptPolicy};
}
const caseOf=(p,customerRef,rootTaskId)=>{const ref=identity(customerRef,p.aliases);return p.cases.find(c=>c.customerRef===ref&&c.rootTaskId===rootTaskId)??{customerRef:ref,rootTaskId,events:[]};};
/** Eligible means no recorded stop applies; it is not a send right. Wait and count come from policy, never a default. */
export function contactEligibility(p,{customerRef,rootTaskId,kind,policy,now=Date.now()}={}){
 const c=caseOf(p,customerRef,rootTaskId),ref=c.customerRef,reasons=[],customerEvents=p.events.filter(e=>e.customerRef===ref),disputed=(p.conflicting??[]).filter(e=>e.customerRef===ref),has=t=>c.events.some(e=>e.type===t);
 if(kind!=='application'&&kind!=='followup')reasons.push('contact-kind-unknown');
 if(!ref)reasons.push('customer-unknown');
 if(disputed.length)reasons.push('event-conflict');
 const kindOf=e=>canonicalText(e.type).replace(/[\s_]+/g,'-');
 for(const [type,reason] of Object.entries(STOPS))if([...customerEvents,...disputed].some(e=>kindOf(e)===type))reasons.push(reason);
 // A stop nobody can attribute could be this customer's; an unreadable row could be one too.
 if(p.events.some(e=>!e.customerRef&&(kindOf(e) in STOPS||kindOf(e)==='complaint'))||(p.conflicts??[]).includes('invalid-event'))reasons.push('stop-unattributed');
 // Only a dated, real, documented resolution after a dated complaint closes it.
 let openComplaints=customerEvents.filter(e=>kindOf(e)==='complaint'&&timeOf(e)===null).length;
 for(const e of customerEvents){if(timeOf(e)===null)continue;if(kindOf(e)==='complaint')openComplaints++;else if(kindOf(e)==='complaint-resolved'&&openComplaints>0&&!declaredSynthetic(e.synthetic)&&realRef(e.evidenceRef)&&customerEvents.filter(x=>kindOf(x)==='complaint'&&timeOf(x)===null).length===0)openComplaints--;}
 if(openComplaints>0||disputed.some(e=>kindOf(e)==='complaint'))reasons.push('complaint-open');
 if(customerEvents.some(e=>e.type==='send-uncertain'))reasons.push('reconcile-send-first');
 if(!minor(policy?.maxFollowUps)||!minor(policy?.minWaitMs))reasons.push('contact-policy-missing');
 else{
  const last=Math.max(...customerEvents.filter(e=>SENT.includes(e.type)).map(e=>timeOf(e)??now),-Infinity);
  if(Number.isFinite(last)&&now-last<policy.minWaitMs)reasons.push('customer-contacted-recently');
  if(kind==='followup'&&customerEvents.filter(e=>e.type==='followup-sent').length>=policy.maxFollowUps)reasons.push('followup-limit');
 }
 if(kind==='application'&&has('sent'))reasons.push('already-sent');
 return {eligible:reasons.length===0,reasons:[...new Set(reasons)],sendAuthorized:false};
}
const CURRENCY=/^[A-Z]{3}$/;
const recordedPayment=e=>e.type==='paid'&&minor(e.amountMinor)&&e.amountMinor>0&&CURRENCY.test(e.currency??'')&&bounded(e.receiptRef,2000)&&(e.status===undefined||e.status==='settled');
const confirmedBy=policy=>e=>recordedPayment(e)&&receiptStatus(e.receiptRef,policy)==='accepted'&&!declaredSynthetic(e.synthetic);
const refKey=x=>normalizedRef(x)??identityText(x);
/** What is left of real payments in one case after refunds and chargebacks; unknown reversal amounts leave nothing proven. */
const netPaid=(events,counts)=>{
 let net=0;const seen=new Set();
 for(const e of events){
  if(counts(e)&&!seen.has(refKey(e.receiptRef))){seen.add(refKey(e.receiptRef));net+=e.amountMinor;}
  if(e.type==='refund'||e.type==='chargeback'){if(!minor(e.amountMinor))return 0;net-=e.amountMinor;}
 }
 return net;
};
/** One draft per concrete need. A draft is no order and no revenue, and repeat costs must be checked again. */
export function followUpDraft(p,{customerRef,rootTaskId,need,prior,policy,now=Date.now()}={}){
 const c=caseOf(p,customerRef,rootTaskId),reasons=[],confirmed=confirmedBy(p.receiptPolicy);
 // A reversal of the same receipt counts wherever it was recorded for this customer.
 const paidHere=c.events.filter(confirmed),receiptKeys=new Set(paidHere.map(e=>refKey(e.receiptRef))),elsewhere=p.events.filter(e=>e.customerRef===c.customerRef&&!c.events.includes(e)&&['refund','chargeback'].includes(e.type)&&receiptKeys.has(refKey(e.paymentRef)));
 if(!c.events.some(e=>e.type==='accepted'))reasons.push('acceptance-pending');
 if(!paidHere.length)reasons.push('payment-pending');
 else if(netPaid([...c.events,...elsewhere],confirmed)<=0)reasons.push('payment-reversed');
 if(!bounded(need?.kind)||!bounded(need?.evidenceRef,2000))reasons.push('need-undocumented');
 if(!minor(prior?.costMinor)||!bounded(prior?.currency,3))reasons.push('prior-cost-unknown');
 reasons.push(...contactEligibility(p,{customerRef,rootTaskId,kind:'followup',policy,now}).reasons);
 if(reasons.length)return {status:'blocked',reasons:[...new Set(reasons)],order:null,revenueMinor:null,sendAuthorized:false};
 const id=digest([c.customerRef,rootTaskId,need.kind]);
 if(c.events.some(e=>e.type==='followup-draft'&&e.draftId===id))return {status:'exists',id,reasons:[],order:null,revenueMinor:null,sendAuthorized:false};
 return {status:'draft',id,customerRef:c.customerRef,rootTaskId,need,priorCostMinor:prior.costMinor,currency:prior.currency,costReviewRequired:true,autoOrder:false,order:null,revenueMinor:null,sendAuthorized:false,reasons:[]};
}

const bound=(e,scopeDigest)=>e?.scopeDigest===scopeDigest&&realRef(e?.evidenceRef);
export function scopeChange({agreed,requested,contract,funding}={}){
 if(!bounded(agreed?.scopeDigest)||!bounded(requested?.scopeDigest))return {status:'scope-unknown',workAllowed:false,oldPriceApplies:false,submitAuthorized:false};
 if(agreed.scopeDigest===requested.scopeDigest)return {status:'unchanged',workAllowed:true,submitAuthorized:false};
 if(!minor(requested?.costUpperMinor)||!minor(requested?.priceMinor)||!minor(agreed?.costUpperMinor))return {status:'cost-unknown',workAllowed:false,oldPriceApplies:false,submitAuthorized:false};
 const profitable=requested.priceMinor>requested.costUpperMinor,covered=profitable&&bound(contract,requested.scopeDigest)&&bound(funding,requested.scopeDigest);
 return {status:!profitable?'price-below-cost':covered?'addendum-covered':'addendum-required',workAllowed:covered,oldPriceApplies:false,additionalCostUpperMinor:requested.costUpperMinor-agreed.costUpperMinor,priceMinor:requested.priceMinor,submitAuthorized:false};
}
export function reworkReserve({reserveMinor,actualMinor}={}){
 if(!minor(reserveMinor)||!minor(actualMinor))return {status:'unknown',workAllowed:false,overrunMinor:null};
 const over=actualMinor>reserveMinor;
 return {status:over?'overrun':'within-reserve',workAllowed:!over,overrunMinor:over?actualMinor-reserveMinor:0};
}

const addMoney=(money,currency,field,value)=>{if(!minor(value)||!CURRENCY.test(currency??''))return false;const m=money[currency]??={receivedMinor:0,refundedMinor:0,feesMinor:0,reworkMinor:0};m[field]+=value;return true;};
const rate=(numerator,denominator)=>({numerator,denominator});
/** Real and synthetic outcomes never mix. Currencies stay apart; there is no total across them. */
export function funnelReport(p,{from,to}={}){
 refused(p.events);
 const start=from?Date.parse(from):-Infinity,end=to?Date.parse(to):Infinity,groups=new Map(),undated=p.events.filter(e=>timeOf(e)===null).map(e=>e.id),receipts=new Set(),reversals=new Set();
 const inWindow=e=>{const t=timeOf(e);return t!==null&&t>=start&&t<end;};
 for(const c of p.cases){
  for(const synthetic of [false,true]){
   // Inside the synthetic group a simulated payment counts as simulated; it never crosses into the real group.
   const events=c.events.filter(e=>declaredSynthetic(e.synthetic)===synthetic&&inWindow(e)),paymentCounts=synthetic?recordedPayment:confirmedBy(p.receiptPolicy);if(!events.length)continue;
   const key=c.sourceId+'|'+c.family+(synthetic?'|synthetic':''),g=groups.get(key)??{key,synthetic,window:{from:from??null,to:to??null},counts:{qualified:0,sent:0,responded:0,awarded:0,delivered:0,accepted:0,paid:0,followups:0,unanswered:0,lost:0,unpaid:0,refunded:0,chargebacks:0,complaints:0,abandoned:0},money:{},duplicateReceipts:[],openPoints:[]};
   const has=t=>events.some(e=>e.type===t),count=(field,t)=>{if(has(t))g.counts[field]++;};
   count('qualified','qualified');count('sent','sent');count('responded','response');count('awarded','awarded');count('delivered','delivered');count('accepted','accepted');count('followups','followup-order');count('lost','lost');count('refunded','refund');count('chargebacks','chargeback');count('complaints','complaint');count('abandoned','abandoned');
   let paid=false;
   for(const e of events){
    if(e.feeMinor!==undefined&&!addMoney(g.money,e.currency,'feesMinor',e.feeMinor))g.openPoints.push('fee-unknown:'+e.id);
    if(e.reworkMinor!==undefined&&!addMoney(g.money,e.currency,'reworkMinor',e.reworkMinor))g.openPoints.push('rework-unknown:'+e.id);
    if(!bounded(e.evidenceRef,2000)&&!bounded(e.receiptRef,2000))g.openPoints.push('evidence-missing:'+e.id);
    if(e.type==='refund'||e.type==='chargeback'){
     const key=refKey(e.receiptRef);
     if(!bounded(e.receiptRef,2000)||reversals.has(key)){g.openPoints.push('reversal-unproven:'+e.id);continue;}
     reversals.add(key);
     if(!addMoney(g.money,e.currency,'refundedMinor',e.amountMinor))g.openPoints.push('reversal-unknown:'+e.id);
    }
    if(paymentCounts(e)&&[...receipts].some(r=>r!==refKey(e.receiptRef)&&r.toLowerCase()===refKey(e.receiptRef).toLowerCase()))g.openPoints.push('receipt-case-variant:'+e.id);
    if(paymentCounts(e)){const key=refKey(e.receiptRef);if(receipts.has(key)){if(!g.duplicateReceipts.includes(e.receiptRef))g.duplicateReceipts.push(e.receiptRef);continue;}receipts.add(key);paid=true;addMoney(g.money,e.currency,'receivedMinor',e.amountMinor);}
   }
   if(paid&&netPaid(events,paymentCounts)<=0)paid=false;
   if(paid)g.counts.paid++;
   if(has('accepted')&&!paid)g.counts.unpaid++;
   if(has('sent')&&!has('response')&&!has('awarded')&&!has('lost'))g.counts.unanswered++;
   groups.set(key,g);
  }
 }
 return {groups:[...groups.values()].map(g=>({...g,rates:{awardedOfSent:rate(g.counts.awarded,g.counts.sent),paidOfSent:rate(g.counts.paid,g.counts.sent),paidOfAccepted:rate(g.counts.paid,g.counts.accepted)}})),conflicts:p.conflicts,undated};
}
/** Only own real outcomes count, and the sample limit comes from policy. Even then it is an uncertain estimate. */
export function salesProjection(report,{requiredPaidOrders,minSample}={}){
 const real=report.groups.filter(g=>!g.synthetic),sent=real.reduce((n,g)=>n+g.counts.sent,0),paid=real.reduce((n,g)=>n+g.counts.paid,0),reasons=[];
 if(!minor(minSample)||minSample===0)reasons.push('sample-policy-missing');
 if(!real.length||sent===0)reasons.push('no-real-outcomes');
 else if(minor(minSample)&&sent<minSample)reasons.push('sample-too-small');
 if(real.length&&sent>0&&paid===0)reasons.push('no-paid-outcomes');
 if(!minor(requiredPaidOrders))reasons.push('target-missing');
 if(real.some(g=>g.openPoints.length||g.duplicateReceipts.length)||report.conflicts?.length||report.undated?.length)reasons.push('report-open');
 const base={sampleSize:sent,paid,syntheticExcluded:report.groups.some(g=>g.synthetic),permissionToScale:false,contactRightsGranted:false};
 if(reasons.length)return {...base,status:'no-projection',reasons,neededOffers:null};
 return {...base,status:'uncertain-estimate',reasons:[],neededOffers:Math.ceil(requiredPaidOrders*sent/paid)};
}

/** Arithmetic only: `reachable` stays unknown until real throughput exists, and no limit moves because of a target. */
export function requiredOrders({targetMinor,overheadMinor,contributionMinor,maxOrders}={}){
 const base={budgetChange:null,parallelismChange:null,riskChange:null,reachable:null};
 if(![targetMinor,overheadMinor,maxOrders].every(minor)||!minor(contributionMinor)||contributionMinor===0)return {...base,status:'incomplete',orders:null};
 const total=BigInt(targetMinor)+BigInt(overheadMinor),orders=(total+BigInt(contributionMinor)-1n)/BigInt(contributionMinor);
 if(total>BigInt(Number.MAX_SAFE_INTEGER)||orders>BigInt(Number.MAX_SAFE_INTEGER))return {...base,status:'overflow',orders:null};
 return {...base,status:Number(orders)>maxOrders?'capacity-insufficient':'computed',orders:Number(orders)};
}

const ZURICH=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const zurichParts=ms=>Object.fromEntries(ZURICH.formatToParts(new Date(ms)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
const zurichMidnight=(year,month)=>{
 const guess=Date.UTC(year,month-1,1),p=zurichParts(guess),offset=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-guess;
 return guess-offset;
};
export function zurichMonthBounds(month){
 const m=typeof month==='string'?month.match(/^(\d{4})-(0[1-9]|1[0-2])$/):null;if(!m)throw Error('Exact month YYYY-MM required');
 const year=Number(m[1]),mo=Number(m[2]);
 return {from:new Date(zurichMidnight(year,mo)).toISOString(),to:new Date(zurichMidnight(mo===12?year+1:year,mo===12?1:mo+1)).toISOString()};
}
export function zurichMonthOf(instant){
 const t=Date.parse(instant);if(!Number.isFinite(t))return null;
 const p=zurichParts(t);return p.year+'-'+String(p.month).padStart(2,'0');
}

const OUTCOME={receipt:'receiptsMinor',refund:'refundsMinor',chargeback:'refundsMinor',fee:'feesMinor',fulfillment:'fulfillmentMinor',rework:'reworkMinor',acquisition:'acquisitionMinor',overhead:'overheadMinor',learning:'learningMinor'};
const REVERSALS=new Set(['refund','chargeback']);
// Only these fields can carry money. Anything else stays open instead of being guessed at.
const ENTRY_FIELDS=new Set(['id','kind','status','amountMinor','currency','at','evidenceRef','receiptRef','synthetic','note']);
const COVERED=['fee','fulfillment','rework','acquisition','overhead','learning'],NOT_PROFIT=new Set(['withdrawal','deposit','prepaid-transfer']);
/** Real income minus settled costs for one Zurich month. Anything open keeps the month incomplete; a new result archives the old one. */
export function closeMonth({month,now=Date.now(),entries=[],coverage,calculationVersion,previous,receiptPolicy}={}){
 refused(entries);
 const {from,to}=zurichMonthBounds(month),start=Date.parse(from),end=Date.parse(to),openPoints=[],excluded=[],byId=new Map(),receipts=new Map();
 const within=t=>t!==null&&t>=start&&t<end;
 // A refund belongs to the month of its receipt, whenever it arrives. Without a link the month it affects stays open.
 // The earliest settled receipt decides, whatever order the ledger comes in.
 const paymentAt=new Map(),paymentAmount=new Map(),paymentId=new Map(),reversedOf=new Map();
 for(const e of [...entries].filter(x=>x&&x.kind==='receipt'&&x.status==='settled'&&minor(x.amountMinor)&&x.amountMinor>0&&bounded(x.evidenceRef,2000)&&timeOf(x)!==null).sort((a,b)=>timeOf(a)-timeOf(b))){const k=refKey(e.evidenceRef);if(!paymentAt.has(k)){paymentAt.set(k,timeOf(e));paymentAmount.set(k,e.amountMinor);paymentId.set(k,e.id);}}
 const linked=e=>REVERSALS.has(e.kind)&&bounded(e.receiptRef,2000)&&paymentAt.has(refKey(e.receiptRef));
 const effective=e=>linked(e)?paymentAt.get(refKey(e.receiptRef)):timeOf(e);
 // A receipt row or reversal naming a paid receipt, also in another spelling, may change what that payment is worth, so its month stays open.
 // A plain failed attempt moved no money, and a cost may name the payment it belongs to.
 const paidByCase=new Map([...paymentAt.keys()].map(k=>[k.toLowerCase(),k]));
 const reversalLike=e=>REVERSALS.has(e.kind)||e.kind==='receipt'&&(/revers|charge|refund|disput/i.test(String(e.status))||Number(e.amountMinor)<0);
 for(const e of entries){
  if(!e||typeof e!=='object')continue;
  const attempt=e.kind==='receipt'&&/^(failed|declined|cancelled|canceled|pending)$/i.test(String(e.status));
  const refs=e.kind==='receipt'?[e.evidenceRef,e.receiptRef]:REVERSALS.has(e.kind)?[e.receiptRef]:[];
  for(const ref of refs){
   if(!bounded(ref,2000)||attempt)continue;
   const k=refKey(ref),paid=paidByCase.get(k.toLowerCase());if(!paid)continue;
   const sameRow=e.kind==='receipt'&&paymentId.get(paid)===e.id,variant=paid!==k;
   if((variant||(!sameRow&&e.kind==='receipt'))&&within(paymentAt.get(paid)))openPoints.push('payment-disputed:'+e.id);
   if(variant&&e.kind==='receipt'&&within(timeOf(e)))openPoints.push('receipt-case-variant:'+e.id);
  }
 }
 const totals={receiptsMinor:0,refundsMinor:0,feesMinor:0,fulfillmentMinor:0,reworkMinor:0,acquisitionMinor:0,overheadMinor:0,learningMinor:0};
 // Entries without an id cannot be told apart; they stay open, and two identical ones never collapse into one.
 const versions=new Map();
 for(const [i,e] of entries.entries()){
  if(!e||typeof e!=='object'||!bounded(e.id)){openPoints.push('entry-id-missing:'+i);continue;}
  const list=versions.get(e.id)??[];list.push(e);versions.set(e.id,list);
 }
 for(const [id,list] of versions){
  if(list.some(e=>timeOf(e)===null)){openPoints.push('date-missing:'+id);if(list.some(reversalLike))openPoints.push('refund-unlinked:'+id);continue;}
  const here=list.filter(e=>within(effective(e)));
  if(list.some(e=>same(e)!==same(list[0]))&&here.length)openPoints.push('conflict:'+id);
  if(here.length)byId.set(id,here[0]);
  else if(list.some(e=>REVERSALS.has(e.kind)&&within(timeOf(e))))excluded.push(id);
 }
 for(const e of byId.values()){
  // An unlinked reversal might belong to any earlier month, however incomplete it is itself. So might a receipt row that reports one.
  if(reversalLike(e)&&!(linked(e)||e.kind==='receipt'&&paymentAt.has(refKey(e.evidenceRef))))openPoints.push('refund-unlinked:'+e.id);
  if(NOT_PROFIT.has(e.kind)){excluded.push(e.id);continue;}
  const unknownField=Object.keys(e).find(k=>!ENTRY_FIELDS.has(k));if(unknownField){openPoints.push('field-unknown:'+e.id+':'+unknownField);continue;}
  const field=Object.prototype.hasOwnProperty.call(OUTCOME,e.kind)?OUTCOME[e.kind]:null;if(!field){openPoints.push('unknown-kind:'+e.id);continue;}
  if(!minor(e.amountMinor)){openPoints.push('cost-unknown:'+e.id);continue;}
  if(declaredSynthetic(e.synthetic)||simulatedRef(e.evidenceRef)){openPoints.push('simulated:'+e.id);continue;}
  if(e.status!=='settled'){openPoints.push('not-settled:'+e.id);continue;}
  if(e.currency!=='CHF'){openPoints.push('fx-missing:'+e.id);continue;}
  if(e.kind==='receipt'){
   if(receiptStatus(e.evidenceRef,receiptPolicy)!=='accepted'){openPoints.push('receipt-evidence:'+e.id);continue;}
   const key=refKey(e.evidenceRef);
   if(receipts.has(key)){openPoints.push('duplicate-receipt:'+e.evidenceRef);continue;}
   receipts.set(key,e.evidenceRef);
  }
  if(linked(e)){
   const key=refKey(e.receiptRef),total=(reversedOf.get(key)??0)+e.amountMinor;reversedOf.set(key,total);
   if(total>paymentAmount.get(key))openPoints.push('refund-exceeds-receipt:'+e.id);
   if(timeOf(e)<paymentAt.get(key))openPoints.push('refund-before-receipt:'+e.id);
  }
  totals[field]+=e.amountMinor;
 }
 // A true flag proves nothing about a whole cost type; only a reference to its complete ledger does.
 const missingCoverage=COVERED.filter(k=>!realRef(coverage?.[k]?.evidenceRef));for(const k of missingCoverage)openPoints.push('coverage:'+k);
 if(!bounded(calculationVersion))openPoints.push('calculation-version');
 const {learningMinor,...amounts}=totals,ended=now>=end,complete=ended&&openPoints.length===0;
 const rows=[...byId.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 const outcome={...amounts,currency:'CHF',receiptEvidence:[...receipts.values()],costsComplete:complete,capacityVerified:false};
 const synthetic=rows.some(e=>declaredSynthetic(e.synthetic)||simulatedRef(e.evidenceRef)),body={month,outcome,learningMinor:missingCoverage.includes('learning')?null:learningMinor,synthetic,openPoints,excluded,entriesDigest:same(rows),coverageDigest:same(COVERED.map(k=>coverage?.[k]?.evidenceRef??null)),calculationVersion:calculationVersion??null},result=digest(body);
 const changed=previous&&previous.digest!==result,archived=changed?[...previous.archived,{digest:previous.digest,revision:previous.revision,outcome:previous.outcome}]:previous?previous.archived:[];
 return {...body,from,to,status:ended?(complete?'complete':'incomplete'):'provisional',complete,digest:result,revision:previous?previous.revision+(changed?1:0):1,archived,budgetChange:null,permissionToScale:false};
}

const FREE_LICENSES=new Set(['own','MIT','Apache-2.0','BSD-2-Clause','BSD-3-Clause','ISC']);
/** Reuse never carries proof over: bindings must still hold and new inputs must pass fresh checks. */
export function reuseCheck({component,current,checks=[]}={}){
 const reasons=[];
 if(!FREE_LICENSES.has(component?.license))reasons.push('license-not-suitable');
 if(component?.containsCustomerData!==false)reasons.push('customer-data');
 if(component?.confidential!==false)reasons.push('confidential');
 if(component?.containsCredentials!==false)reasons.push('credentials');
 for(const k of ['sourceDigest','runtimeDigest','verifierDigest'])if(!bounded(current?.[k])||current[k]!==component?.[k])reasons.push('integrity-changed:'+k);
 if(!bounded(current?.schemaDigest)||current.schemaDigest!==component?.schemaDigest)reasons.push('schema-changed');
 const list=checks.filter(c=>c&&typeof c==='object'),fresh=list.filter(c=>c.oldTest===false);if(!fresh.length)reasons.push('fresh-check-missing');
 for(const c of list)if(c.passed!==true)reasons.push('check-failed:'+c.id);
 return {allowed:reasons.length===0,reasons,proofTransferred:false};
}
export function offerFamilyCheck({familyId,scopeDigest,runs=[]}={}){
 const inScope=runs.filter(r=>r.scopeDigest===scopeDigest),recalculate=runs.filter(r=>r.scopeDigest!==scopeDigest).map(r=>r.inputId),reasons=[];
 if(!bounded(scopeDigest))reasons.push('scope-missing');
 if(new Set(inScope.filter(r=>r.unknownBefore===true&&bounded(r.inputId)).map(r=>r.inputId)).size<2)reasons.push('two-unknown-inputs-required');
 if(new Set(inScope.map(r=>r.workPath)).size>1)reasons.push('one-work-path-required');
 if(inScope.some(r=>!bounded(r.workPath)))reasons.push('work-path-missing');
 for(const r of inScope)if(r.passed!==true)reasons.push('run-failed:'+r.inputId);
 return {familyId,ready:reasons.length===0,reasons,recalculate,oldPriceApplies:false,salesAuthorized:false};
}

export function guardedAction({isEnabled,run}={}){
 if(typeof isEnabled!=='function'||typeof run!=='function')throw Error('isEnabled and run required');
 const on=()=>{if(isEnabled()!==true)throw Error('Action blocked while OFF');};
 return async(...args)=>{on();const result=await run(...args);on();return result;};
}
/** The stored approval removes routine questions inside its scope. Power, access and newer human orders stay real blockers. */
export function routineDecision({kind,scope,power,external=true,missingAccess=[],counterOrder}={}){
 if(!bounded(scope?.source,500)||!Array.isArray(scope?.kinds)||!scope.kinds.includes(kind))return {proceed:false,askHuman:true,blockers:['outside-approved-scope']};
 const blockers=[];
 if(power?.enabled!==true&&power?.enabled!==false)blockers.push('power-unknown');
 if(external&&power?.enabled===false)blockers.push('power-off');
 for(const access of missingAccess)blockers.push('access-missing:'+access);
 // A newer human order counts whatever its form; only its text in the blocker depends on being short enough to show.
 if(counterOrder!==undefined&&counterOrder!==null&&counterOrder!=='')blockers.push('human-order:'+(bounded(counterOrder)?counterOrder:'see-source'));
 return {proceed:blockers.length===0,askHuman:false,blockers};
}
