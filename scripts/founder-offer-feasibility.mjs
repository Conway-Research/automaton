import {createHash} from 'node:crypto';
import {canonical} from './founder-restoration-integrity.mjs';
// Pure local planning. Evidence references are review inputs, never permissions.
export const offerScopeDigest=(job,plan)=>'offer-scope-v2:'+createHash('sha256').update(canonical({job,plan})).digest('hex');
// A rounded candidate is accepted only when its reverse conversion exactly
// matches the supplied number. This does not round arbitrary fractional minutes.
export function hoursToMinutes(hours){
 if(!Number.isFinite(hours)||hours<=0)return null;
 const minutes=Math.round(hours*60);
 return Number.isSafeInteger(minutes)&&minutes>0&&minutes/60===hours?minutes:null;
}
const ref=x=>typeof x==='string'&&/^local:[a-zA-Z0-9_.:/-]{1,180}$/.test(x);
const id=x=>typeof x==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(x);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000;
const list=x=>Array.isArray(x)&&x.length>0&&x.length<=100&&x.every(text);
const minor=x=>Number.isSafeInteger(x)&&x>=0;
const currencies=new Set(['CHF','EUR','USD','GBP','CAD','AUD']); // two-decimal planning only; no FX or payment adapter assertion
// Read the canonical decimal representation, not a rounded binary product.
// Supported planning currencies have two decimal places; invalid inputs stay null.
export function budgetMinorUnits(value){
 if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return null;
 const match=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
 if(!match)return null;
 const units=BigInt(match[1])*100n+BigInt((match[2]??'').padEnd(2,'0'));
 return units>0n&&units<=BigInt(Number.MAX_SAFE_INTEGER)?Number(units):null;
}
export function requiresProfileOfferReview(job){
 return job?.profileReviewRequired===true||job?.amount>500||job?.hours>8||job?.days>7||!!job?.currency&&job.currency!=='USD';
}
export function assessProfileOffer({job,plan,evidence}={}){
 const base={status:'clarification-required',missing:[],sendAuthorized:false,workAuthorized:false,deliveryAuthorized:false,customerWorkStarted:false,evidenceVerified:false,requiredBeforeWork:['customer-approval','platform-contract','funding-proof','current-executor-and-specialist-validation'],requiredBeforeDelivery:['finished-package-customer-release','public-files-only']};
 if(!job||job.privacy!=='public')return {...base,status:'blocked',missing:['public-inputs-required']};
 if(job.aiAllowed===false)return {...base,status:'blocked',missing:['ai-prohibited']};
 const missing=[];
 if(!text(job.title)||!text(job.description))missing.push('scope');
 if(job.aiAllowed!==true)missing.push('ai-permission');
 if(!plan||!currencies.has(plan.currency)||job.currency!==plan.currency)return {...base,missing:[...missing,'supported-same-currency-plan']};
 const phases=plan.phases;
 if(!Array.isArray(phases)||phases.length===0||phases.length>100||new Set(phases.map(p=>p?.id)).size!==phases.length||phases.some(p=>!p||!id(p.id)||!id(p.profileId)||!list(p.deliverables)||!list(p.acceptance)||hoursToMinutes(p.hours)===null||!Number.isSafeInteger(p.days)||p.days<=0))return {...base,missing:[...missing,'complete-distinct-work-phases']};
 if(!minor(plan.hourlyRateMinor)||plan.hourlyRateMinor===0||!minor(plan.externalCostMinor)||!Number.isInteger(plan.feeBps)||plan.feeBps<0||plan.feeBps>=10000||!Number.isInteger(plan.contingencyBps)||plan.contingencyBps<0||plan.contingencyBps>10000)return {...base,missing:[...missing,'explicit-cost-fee-contingency-plan']};
 let scopeDigest;try{scopeDigest=offerScopeDigest(job,plan);}catch{return {...base,missing:['serializable-scope']};}
 if(evidence?.scopeDigest!==scopeDigest)missing.push('scope-bound-evidence');
 for(const k of ['customerInputsRef','rightsRef','aiPermissionRef'])if(!ref(evidence?.[k]))missing.push(k);
 const capabilities=Array.isArray(evidence?.capabilities)?evidence.capabilities:[];
 for(const profile of new Set(phases.map(p=>p.profileId))){const matches=capabilities.filter(c=>c?.profileId===profile);if(matches.length!==1)missing.push('capability:'+profile);else for(const k of ['executorRef','reviewerRef','deliveryRef'])if(!ref(matches[0][k]))missing.push(profile+':'+k);}
 const minutes=phases.reduce((n,p)=>n+BigInt(hoursToMinutes(p.hours)),0n),days=phases.reduce((n,p)=>n+BigInt(p.days),0n);
 const ceil=(n,d)=>(n+d-1n)/d;
 const cost=ceil(minutes*BigInt(plan.hourlyRateMinor),60n)+BigInt(plan.externalCostMinor);
 const quote=ceil(cost*BigInt(10000+plan.contingencyBps),BigInt(10000-plan.feeBps));
 if([minutes,days,cost,quote].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))return {...base,missing:[...missing,'calculation-overflow']};
 const budgetMinor=budgetMinorUnits(job.amount);
 if(budgetMinor===null)missing.push('customer-budget');
 else if(budgetMinor<Number(quote))missing.push('budget-below-calculated-minimum');
 return {...base,status:missing.length?'clarification-required':'draft-ready-for-review',scopeDigest,missing,profiles:[...new Set(phases.map(p=>p.profileId))],estimate:{currency:plan.currency,hours:Number(minutes)/60,days:Number(days),costMinor:Number(cost),minimumQuoteMinor:Number(quote),feeBps:plan.feeBps,contingencyBps:plan.contingencyBps,scheduleBasis:'sequential-phases-after-inputs-and-approval'},draft:missing.length?null:{currency:plan.currency,amountMinor:Number(quote),phases:phases.map(p=>({id:p.id,profileId:p.profileId,deliverables:[...p.deliverables],acceptance:[...p.acceptance],hours:p.hours,days:p.days})),binding:false}};
}
