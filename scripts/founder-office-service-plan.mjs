import {assessProfileOffer,budgetMinorUnits,hoursToMinutes} from './founder-offer-feasibility.mjs';
import {createHash} from 'node:crypto';
// Mapping metadata is excluded to avoid self-referential hashes. All material
// inputs, including evidence locators, are bound independently of key order.
export function officeEvidenceScopeDigest(document){
 const {scopeDigest:ignored,...evidence}=document.assessmentInput?.evidence??{};
 const value={version:1,schema:document.schema,profile:document.profile,binding:document.binding,job:document.assessmentInput?.job,plan:document.assessmentInput?.plan,evidence,commercialTerms:document.commercialTerms,profileInputs:document.profileInputs,gates:document.gates};
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return 'office-evidence-scope-v1:'+createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function calendarDeadline(value){
 if(typeof value!=='string')return false;
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
 if(!m)return false;
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number),offsetHour=Number(m[8]??0),offsetMinute=Number(m[9]??0);
 const leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>0&&month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<24&&minute<60&&second<60&&offsetHour<=14&&offsetMinute<60&&(offsetHour!==14||offsetMinute===0);
}
// The ISO offset defines the instant; the named zone controls its display.
// This derived receipt is not customer confirmation and never rewrites terms.
export function officeDeadlineReceipt(deadline,timezone){
 const base={schema:'office-deadline-receipt-v1',status:'incomplete',originalDeadline:typeof deadline==='string'?deadline:null,timezone:typeof timezone==='string'?timezone:null,interpretation:'absolute-instant-with-display-zone',utc:null,localDateTime:null,offset:null,customerConfirmed:false};
 if(!calendarDeadline(deadline)||typeof timezone!=='string'||!timezone.trim()||timezone.length>2000)return base;
 try{
  const date=new Date(deadline);
  const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',fractionalSecondDigits:3,hourCycle:'h23',timeZoneName:'longOffset',era:'short'});
  const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
  // Avoid silently mislabelling dates outside the supported four-digit AD range.
  if(parts.era!=='AD'||Number(parts.year)>9999)return base;
  const offset=parts.timeZoneName==='GMT'?'+00:00':parts.timeZoneName.replace(/^GMT/,'');
  if(!/^[+-]\d{2}:\d{2}(?::\d{2})?$/.test(offset))return base;
  return {...base,status:'normalized',utc:date.toISOString(),localDateTime:`${parts.year.padStart(4,'0')}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`,offset};
 }catch{return base;}
}
// Explicit calendar only: no default workweek, start date or daily capacity.
// Capacity may be placed anywhere within each window only when this model is
// explicitly selected. Overlapping windows are rejected rather than double counted.
export function officeCapacityReceipt({phases,deadline,timezone,schedule}={}){
 const base={schema:'office-capacity-receipt-v1',status:'undetermined',requiredMinutes:null,availableMinutes:null,shortfallMinutes:null,missing:[],workAuthorized:false,customerConfirmed:false,basis:'declared-flexible-calendar-effort-only',limitations:['prerequisite-and-availability-claims-not-independently-verified','phase-day-lead-times-and-external-dependencies-not-scheduled']};
 const fail=reason=>({...base,missing:[reason]});
 const endReceipt=officeDeadlineReceipt(deadline,timezone);
 if(endReceipt.status!=='normalized')return fail('valid-deadline-and-timezone');
 if(!schedule||schedule.calendarComplete!==true||schedule.prerequisitesReady!==true||schedule.capacityModel!=='flexible-within-window'||typeof schedule.availabilityRef!=='string'||!/^local:[a-zA-Z0-9_.:/-]{1,180}$/.test(schedule.availabilityRef)||schedule.availabilityRef.includes('..'))return fail('explicit-calendar-capacity-and-prerequisites');
 const startReceipt=officeDeadlineReceipt(schedule.start,timezone);
 if(startReceipt.status!=='normalized')return fail('explicit-valid-start');
 const start=Date.parse(startReceipt.utc),end=Date.parse(endReceipt.utc);
 if(start>=end)return fail('start-before-deadline');
 if(!Array.isArray(phases)||!phases.length||phases.length>100||phases.some(p=>hoursToMinutes(p?.hours)===null))return fail('explicit-phase-effort');
 const required=phases.reduce((sum,p)=>sum+BigInt(hoursToMinutes(p.hours)),0n);
 if(required>BigInt(Number.MAX_SAFE_INTEGER))return fail('effort-overflow');
 if(!Array.isArray(schedule.windows)||schedule.windows.length>1000)return fail('explicit-bounded-calendar-windows');
 const windows=[];
 for(const w of schedule.windows){
  if(!w||!calendarDeadline(w.start)||!calendarDeadline(w.end)||!Number.isSafeInteger(w.capacityMinutes)||w.capacityMinutes<0)return fail('valid-window-and-capacity');
  const a=Date.parse(w.start),b=Date.parse(w.end);
  if(!Number.isFinite(a)||!Number.isFinite(b)||a>=b||w.capacityMinutes>Math.floor((b-a)/60000))return fail('capacity-within-window-duration');
  windows.push({start:a,end:b,capacityMinutes:w.capacityMinutes});
 }
 windows.sort((a,b)=>a.start-b.start);
 if(windows.some((w,i)=>i>0&&w.start<windows[i-1].end))return fail('non-overlapping-calendar-windows');
 let available=0n;
 for(const w of windows){const overlap=Math.max(0,Math.floor((Math.min(end,w.end)-Math.max(start,w.start))/60000));available+=BigInt(Math.min(overlap,w.capacityMinutes));}
 if(available>BigInt(Number.MAX_SAFE_INTEGER))return fail('capacity-overflow');
 return {...base,status:available>=required?'capacity-sufficient':'capacity-insufficient',requiredMinutes:Number(required),availableMinutes:Number(available),shortfallMinutes:Number(required>available?required-available:0n),startReceipt,deadlineReceipt:endReceipt,calendarWindowCount:windows.length};
}
// Explicit fixed order, one shared resource, preemptible work. No search for
// alternative orders and no implicit interpretation of legacy phase.days.
export function officePhaseReceipt({phases,deadline,timezone,schedule,phaseSchedule}={}){
 const base={schema:'office-phase-receipt-v1',status:'undetermined',phases:[],finishedUtc:null,missing:[],workAuthorized:false,customerConfirmed:false,basis:'declared-sequential-preemptible-plan',limitations:['declared-inputs-not-independent-authority','no-alternative-order-or-parallel-resource-search','legacy-days-not-interpreted-use-explicit-elapsed-minutes']};
 const fail=reason=>({...base,missing:[reason]});
 const capacity=officeCapacityReceipt({phases,deadline,timezone,schedule});
 if(capacity.status==='undetermined')return fail('complete-capacity-inputs');
 if(!phaseSchedule||phaseSchedule.model!=='sequential-preemptible-elapsed-minutes')return fail('explicit-phase-model');
 const {order,timing}=phaseSchedule,ids=phases.map(p=>p.id);
 if(ids.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(id))||new Set(ids).size!==ids.length||!Array.isArray(order)||order.length!==ids.length||new Set(order).size!==ids.length||order.some(id=>!ids.includes(id))||!Array.isArray(timing)||timing.length!==ids.length)return fail('exact-phase-order-and-timing');
 const nonnegative=n=>Number.isSafeInteger(n)&&n>=0&&n<=Math.floor(Number.MAX_SAFE_INTEGER/60000);
 const rows=new Map();
 for(const t of timing){
  if(!t||!ids.includes(t.phaseId)||rows.has(t.phaseId)||!nonnegative(t.minElapsedMinutes)||!calendarDeadline(t.notBefore)||!Array.isArray(t.after)||t.after.length>ids.length)return fail('explicit-valid-phase-timing');
  const deps=new Set();
  for(const dep of t.after){if(!dep||!nonnegative(dep.lagMinutes)||!ids.includes(dep.phaseId)||deps.has(dep.phaseId)||order.indexOf(dep.phaseId)>=order.indexOf(t.phaseId))return fail('acyclic-dependencies-consistent-with-order');deps.add(dep.phaseId);}
  rows.set(t.phaseId,t);
 }
 const start=Date.parse(capacity.startReceipt.utc),end=Date.parse(capacity.deadlineReceipt.utc);
 const windows=schedule.windows.map((w,windowIndex)=>({windowIndex,start:Date.parse(w.start),end:Date.parse(w.end),remaining:w.capacityMinutes})).sort((a,b)=>a.start-b.start);
 const completed=new Map(),results=[];let cursor=start;
 const noFit=reason=>({...base,status:'does-not-fit-declared-plan',phases:results,missing:[reason]});
 for(const id of order){
  const t=rows.get(id),p=phases.find(p=>p.id===id),segments=[];let ready=Math.max(cursor,Date.parse(t.notBefore)),remaining=hoursToMinutes(p.hours),first=null,workEnd=null;
  for(const dep of t.after){const release=completed.get(dep.phaseId)+dep.lagMinutes*60000;if(!Number.isSafeInteger(release)||Math.abs(release)>8640000000000000)return fail('timing-overflow');ready=Math.max(ready,release);}
  for(const w of windows){
   const at=Math.max(ready,w.start),until=Math.min(end,w.end),minutes=Math.min(remaining,w.remaining,Math.max(0,Math.floor((until-at)/60000)));
   if(minutes<=0)continue;
   if(first===null)first=at;workEnd=at+minutes*60000;ready=workEnd;remaining-=minutes;w.remaining-=minutes;
   segments.push({windowIndex:w.windowIndex,startedUtc:new Date(at).toISOString(),finishedUtc:new Date(workEnd).toISOString(),minutes});
   if(remaining===0)break;
  }
  if(remaining!==0)return noFit('phase-capacity-before-deadline:'+id);
  const earliestFinish=first+t.minElapsedMinutes*60000;
  if(!Number.isSafeInteger(earliestFinish)||Math.abs(earliestFinish)>8640000000000000)return fail('timing-overflow');
  const finished=Math.max(workEnd,earliestFinish);
  results.push({phaseId:id,startedUtc:new Date(first).toISOString(),workFinishedUtc:new Date(workEnd).toISOString(),finishedUtc:new Date(finished).toISOString(),effortMinutes:hoursToMinutes(p.hours),minElapsedMinutes:t.minElapsedMinutes,segments});
  if(finished>end)return noFit('phase-minimum-duration-before-deadline:'+id);
  completed.set(id,finished);cursor=finished;
 }
 return {...base,status:'fits-declared-plan',phases:results,finishedUtc:new Date(cursor).toISOString()};
}
const profileFields={
 'document-cleanup':['sourceDocumentRef','targetStructureRef','protectedSectionsRef','duplicateRulesRef','exportFormatAgreementRef'],
 'xlsx-automation':['referenceWorkbooksRef','transformRulesRef','expectedOutputsRef','targetRuntimeRef','volumeLimitsRef'],
 'support-templates':['supportCasesRef','companyPoliciesRef','toneExampleRef','placeholderRulesRef','escalationRulesRef'],
 'research-report':['researchQuestionRef','requiredFieldsRef','sourcePolicyRef','freshnessPolicyRef','referenceResultRef']
};
const targets=['binding','assessmentInput.job.privacy','assessmentInput.evidence.customerInputsRef','assessmentInput.evidence.rightsRef','assessmentInput.evidence.aiPermissionRef','commercialTerms','assessmentInput.plan','assessmentInput.evidence.scopeDigest','assessmentInput.evidence.capabilities[0].executorRef','assessmentInput.evidence.capabilities[0].reviewerRef','assessmentInput.evidence.capabilities[0].deliveryRef','gates.platformAward','gates.reviewedContract','gates.funding','gates.specialistResult','gates.finishedPackageRelease'];
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=2000;
const ref=v=>typeof v==='string'&&/^local:[a-zA-Z0-9_.:/-]{1,180}$/.test(v)&&!v.includes('..');
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const terms={customerScopeRef:ref,deadline:calendarDeadline,timezone:v=>{try{if(!text(v))return false;new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}},correctionRounds:integer,acceptanceWindow:text,agreedPriceMinor:v=>integer(v)&&v>0,agreedCurrency:v=>['CHF','EUR','USD','GBP','CAD','AUD'].includes(v),paymentTermsRef:ref};
// Compare only explicit, valid amounts in the same currency. Customer budget
// remains a separate major-unit input, never a substitute for agreed terms.
function inspectCommercial(input,commercialTerms,assessment){
 const agreedPriceMinor=terms.agreedPriceMinor(commercialTerms?.agreedPriceMinor)?commercialTerms.agreedPriceMinor:null;
 const agreedCurrency=terms.agreedCurrency(commercialTerms?.agreedCurrency)?commercialTerms.agreedCurrency:null;
 const calculationCurrency=terms.agreedCurrency(input.plan.currency)?input.plan.currency:null;
 const minimumQuoteMinor=assessment.estimate?.minimumQuoteMinor??null;
 const missing=[];
 const mismatch=calculationCurrency!==null&&agreedCurrency!==null&&calculationCurrency!==agreedCurrency;
 if(mismatch)missing.push('commercial.currency-mismatch');
 if(minimumQuoteMinor===null)missing.push('commercial.calculation-required');
 const comparable=!mismatch&&calculationCurrency!==null&&agreedCurrency!==null&&agreedPriceMinor!==null&&minimumQuoteMinor!==null;
 const below=comparable&&agreedPriceMinor<minimumQuoteMinor;
 if(below)missing.push('commercial.agreed-price-below-calculated-minimum');
 const amount=input.job?.amount;
 return {status:mismatch||below?'blocked':comparable?'consistent':'incomplete',calculationCurrency,minimumQuoteMinor,agreedCurrency,agreedPriceMinor,
  customerBudget:{amount:budgetMinorUnits(amount)!==null?amount:null,currency:terms.agreedCurrency(input.job?.currency)?input.job.currency:null},missing};
}
const profiles=new Set(['document-cleanup','xlsx-automation','support-templates','research-report']);
const required=['identity','public-inputs','inputs','rights','ai','scope','cost','scope-binding','executor','reviewer','delivery','award','contract','funding','specialist-result','release'];
// Local preparation only. Mapping assertions are not independently verified authority.
export function inspectOfficeServicePlan(document, expected){
 const missing=[];
 const result={status:'blocked',sendAuthorized:false,workAuthorized:false,deliveryAuthorized:false,evidenceVerified:false,missing,assessment:null};
 if(!document||document.schema!=='office-plan-template-v1'||!profiles.has(document.profile))return {...result,missing:['supported-office-plan']};
 const b=document.binding;
 if(!expected||!b||['gig','applicationId','conversationId'].some(k=>typeof expected[k]!=='string'||!expected[k]||b[k]!==expected[k])||document.profile!==expected.profile)return {...result,missing:['exact-candidate-binding']};
 const input=document.assessmentInput;
 if(!input||!Array.isArray(input.plan?.phases)||!input.plan.phases.length||input.plan.phases.some(p=>p?.profileId!==document.profile))return {...result,missing:['exact-profile-phases']};
 // Office plans bind one profile. Validate the singleton before either the
 // calculator's profile lookup or the mapping's positional lookup can run.
 const capabilities=input.evidence?.capabilities;
 if(!Array.isArray(capabilities)||capabilities.length!==1||capabilities[0]?.profileId!==document.profile)return {...result,missing:['exact-profile-capability']};
 result.assessment=assessProfileOffer(input);
 missing.push(...result.assessment.missing);
 for(const [k,v] of Object.entries(input.job??{}))if(v===null)missing.push('job.'+k);
 for(const k of ['currency','hourlyRateMinor','feeBps','contingencyBps','externalCostMinor'])if(input.plan[k]==null)missing.push('plan.'+k);
 for(const p of input.plan.phases){if(p.hours==null)missing.push('phase.'+p.id+'.hours');if(p.days==null)missing.push('phase.'+p.id+'.days');if(p.customerConfirmed!==true)missing.push('phase.'+p.id+'.customer-confirmation');}
 for(const [k,valid] of Object.entries(terms))if(!valid(document.commercialTerms?.[k]))missing.push('terms.'+k);
 result.deadlineReceipt=officeDeadlineReceipt(document.commercialTerms?.deadline,document.commercialTerms?.timezone);
 result.capacityReceipt=officeCapacityReceipt({phases:input.plan.phases,deadline:document.commercialTerms?.deadline,timezone:document.commercialTerms?.timezone,schedule:input.plan.capacitySchedule});
 result.phaseReceipt=officePhaseReceipt({phases:input.plan.phases,deadline:document.commercialTerms?.deadline,timezone:document.commercialTerms?.timezone,schedule:input.plan.capacitySchedule,phaseSchedule:input.plan.phaseSchedule});
 result.commercialCheck=inspectCommercial(input,document.commercialTerms,result.assessment);
 missing.push(...result.commercialCheck.missing);
 for(const k of profileFields[document.profile])if(!ref(document.profileInputs?.[k]))missing.push('profile-input.'+k);
 const mapping=Array.isArray(document.evidenceMapping)?document.evidenceMapping:[];
 const scope=officeEvidenceScopeDigest(document);
 result.evidenceScopeDigest=scope;
 const expectedMappings=[...required.map((id,i)=>[id,targets[i]]),...profileFields[document.profile].map(k=>['profile-'+k,'profileInputs.'+k])];
 for(const [id,target] of expectedMappings){
  const rows=mapping.filter(m=>m?.id===id);
  const targetValue=target.replace(/\[0\]/g,'.0').split('.').reduce((v,k)=>v?.[k],document);
  if(rows.length!==1||!ref(rows[0].ref)||rows[0].target!==target||rows[0].scopeDigest!==scope||(target.endsWith('Ref')&&rows[0].ref!==targetValue))missing.push('evidence.'+id);
 }
 for(const m of mapping)if(!expectedMappings.some(([id])=>id===m?.id))missing.push('evidence.unknown-mapping');
 // Even a fully populated document needs the existing independent authority path.
 missing.push('independent-contract-funding-and-specialist-validation','finished-package-customer-release');
 result.missing=[...new Set(missing)];
 result.status=result.assessment.status==='blocked'||result.commercialCheck.status==='blocked'?'blocked':'review-required';
 return result;
}

