/** Pure acceptance decisions for the expert work: order of families, release, repair and economic claims.
 * No worker, store, ledger or permission. Candidate comparison and hypothesis stopping stay in src/research;
 * this module uses assessBusinessOutcome and adds only learning costs, simulated results and the register binding. */
import {assessBusinessOutcome} from '../src/research/improvement.ts';
import {effectiveEntry,unboundedScope} from './founder-expert-register.mjs';
import {canonicalText,declaredSynthetic,normalizedRef,receiptStatus,realRef,recordIssues} from './founder-operating-boundary.mjs';
export const EXPERT_FAMILIES=Object.freeze(['daten','schnittstellen','reparaturen','e-commerce','dokumente','interne-werkzeuge','ki-integration']);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const minor=x=>Number.isSafeInteger(x)&&x>=0;
const BINDING=['sourceDigest','modelDigest','runtimeDigest'];
const verifiable=current=>BINDING.every(k=>hash(current?.[k]));
export function nextExpertFamily({technicalAcceptance,pilotPrerequisites,families={},requested}={}){
 const blockers=[];
 if(technicalAcceptance!==true)blockers.push('technical-acceptance-open');
 if(pilotPrerequisites!==true)blockers.push('pilot-prerequisites-open');
 if(blockers.length)return {next:null,admitted:false,blockers};
 const next=EXPERT_FAMILIES.find(f=>!(Object.prototype.hasOwnProperty.call(families,f)&&families[f]==='geprüft-bestanden'))??null;
 if(requested!==undefined&&requested!==next)return {next,admitted:false,blockers:['out-of-order']};
 return {next,admitted:next!==null,blockers:[]};
}

/** A release holds for the concrete scope only, and only against the binding that is current right now. */
export function expertRelease(entry,{current,usedCases,evidence,contractSHA}={}){
 const r=effectiveEntry(entry,{current,evidence,contractSHA}),issues=[...r.issues];
 if(entry?.state!=='geprüft-bestanden')issues.push('not-passed');
 if(!verifiable(current))issues.push('binding-not-verifiable');
 if(r.effective==='entwertet')issues.push('evidence-invalidated');
 if(!Array.isArray(usedCases))issues.push('used-cases-unknown');
 else{const used=usedCases.map(canonicalText);if((entry?.heldOutCases??[]).some(c=>used.includes(canonicalText(c))))issues.push('held-out-not-new');}
 return {released:issues.length===0,scope:issues.length?null:entry.competenceScope,universal:false,effective:r.effective,issues};
}
export function invalidateEvidence(entries,currentById={},evidence,contractSHA){
 return entries.map(e=>{
  const current=Object.prototype.hasOwnProperty.call(currentById,e.id)?currentById[e.id]:undefined,r=effectiveEntry(e,{current,evidence,contractSHA});
  return r.effective==='geprüft-bestanden'&&!verifiable(current)?{...r,effective:'entwertet',issues:[...r.issues,'binding-not-verifiable']}:r;
 });
}
const textValue=x=>typeof x==='string'&&canonicalText(x).length>0;
export function decideRepair({failureId,diagnosis,scope,runner,baseline,candidate}={}){
 const issues=[],cleanTests=t=>Object.fromEntries(Object.entries(t??{}).map(([k,v])=>[k,v&&typeof v==='object'?v:{status:'invalid'}])),before=cleanTests(baseline?.tests),after=cleanTests(candidate?.tests);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 if(!textValue(diagnosis?.rootCause)||!realRef(diagnosis?.evidenceRef))issues.push('diagnosis-missing');
 if(runner!=='independent-check')issues.push('not-independently-checked');
 if(!own(before,failureId)||before[failureId].status!=='fail')issues.push('original-failure-not-reproduced');
 if(!own(after,failureId)||after[failureId].status!=='pass')issues.push('original-failure-not-fixed');
 const changed=Array.isArray(scope?.changedPaths)?scope.changedPaths:[],allowed=Array.isArray(scope?.allowedPaths)?scope.allowedPaths:[];
 if(!Array.isArray(scope?.changedPaths)||!Array.isArray(scope?.allowedPaths))issues.push('scope-invalid');
 if(!changed.length)issues.push('no-change');
 for(const p of changed)if(typeof p!=='string'||!allowed.includes(p))issues.push('change-outside-scope:'+p);
 const regressionTests=Object.keys(before).filter(id=>id!==failureId&&before[id].status==='pass');
 if(!regressionTests.length)issues.push('regression-tests-missing');
 for(const id of Object.keys(after))if(!own(before,id)&&after[id].status!=='pass')issues.push('new-test-failing:'+id);
 const fixed=[],stillFailing=[];
 for(const id of Object.keys(before)){
  if(!own(after,id)){issues.push('test-removed:'+id);continue;}
  if(!hash(before[id].digest)||after[id].digest!==before[id].digest)issues.push('test-changed:'+id);
  if(before[id].status==='pass'&&after[id].status!=='pass')issues.push('regression:'+id);
  if(before[id].status!=='pass'&&after[id].status==='pass')fixed.push(id);
  if(before[id].status!=='pass'&&after[id].status!=='pass'&&id!==failureId)stillFailing.push(id);
 }
 return {decision:issues.length?'rejected':'accepted',issues,fixed,stillFailing};
}
const COMPARATORS=new Set(['=','<=','>=','<','>']);
/** F01: a requirement is measurable only as metric, comparator and number. Anything else is held as a justified question, never assumed. */
export function requirementContract({requirements,questions=[]}={}){
 const issues=[];if(!Array.isArray(requirements)||!requirements.length)return {ready:false,issues:['requirements-missing'],questions:[]};
 const list=Array.isArray(questions)?questions:[],asked=new Map(list.map(q=>[q?.requirementId,q])),isOpen=r=>r?.openPoint!==undefined&&r?.openPoint!==null,ids=new Set();
 for(const r of requirements){
  const id=textValue(r?.id)?r.id:'?',q=asked.get(r?.id);
  if(!textValue(r?.id))issues.push('requirement-id-missing');else if(ids.has(r.id))issues.push('requirement-id-duplicate:'+id);else ids.add(r.id);
  if(!textValue(r?.text))issues.push('requirement-text-missing:'+id);
  if(isOpen(r)){if(!(textValue(q?.question)&&textValue(q?.whyHumanNeeded)))issues.push('question-not-justified:'+id);continue;}
  const a=r?.acceptance;if(!/^[a-z][a-z0-9-]*$/.test(a?.metric??'')||!COMPARATORS.has(a?.comparator)||!Number.isFinite(a?.value))issues.push('acceptance-not-measurable:'+id);
  if(!Array.isArray(r?.scope?.excluded)||!r.scope.excluded.length||!r.scope.excluded.every(textValue))issues.push('scope-not-bounded:'+id);
  if(q)issues.push('question-without-need:'+id);
 }
 return {ready:issues.length===0&&!requirements.some(isOpen),issues,questions:requirements.filter(isOpen).map(r=>asked.get(r.id)).filter(Boolean)};
}
const COST_FIELDS=['refundsMinor','feesMinor','fulfillmentMinor','reworkMinor','acquisitionMinor','overheadMinor'];
/** Unknown stays null. Learning costs enter the result and stay visible, also when another cost is missing. */
const OUTCOME_FIELDS=new Set(['receiptsMinor',...COST_FIELDS,'currency','receiptEvidence','costsComplete','capacityVerified']);
export function economicsClaim({outcome,learningMinor,synthetic=false,receiptPolicy}={}){
 const learning=minor(learningMinor)?learningMinor:null,missing=[];
 for(const k of ['receiptsMinor',...COST_FIELDS])if(!minor(outcome?.[k]))missing.push(k);
 if(learning===null)missing.push('learningMinor');
 if(outcome?.costsComplete!==true)missing.push('costsComplete');
 // Array.from turns holes into undefined, so a gap in the list is a gap and not nothing.
 const refs=Array.isArray(outcome?.receiptEvidence)?Array.from(outcome.receiptEvidence):[];
 const states=refs.map(r=>receiptStatus(r,receiptPolicy)),simulated=declaredSynthetic(synthetic)||states.includes('simulated');
 if(!refs.length||states.includes('invalid'))missing.push('receiptEvidence');
 if(states.includes('not-accepted'))missing.push('receipt-type-not-accepted');
 if(recordIssues(outcome).length)missing.push('operating-boundary');
 if(Object.keys(outcome??{}).some(k=>!OUTCOME_FIELDS.has(k)))missing.push('outcome-field-unknown');
 const overhead=minor(outcome?.overheadMinor)&&learning!==null?outcome.overheadMinor+learning:null;
 const assessed=assessBusinessOutcome({...outcome,overheadMinor:overhead,receiptEvidence:refs});
 const net=missing.length?null:assessed.netProfitMinor;
 return {status:simulated?'simulated':net===null?'unknown':'confirmed',netProfitMinor:simulated?null:net,simulatedNetMinor:simulated?net:null,learningCostMinor:learning,currency:outcome?.currency??null,missing,permissionToScale:false};
}
const TARGETS=[100000,300000];
const nextMonth=m=>{const [y,n]=m.split('-').map(Number);return n===12?`${y+1}-01`:`${y}-${String(n+1).padStart(2,'0')}`;};
const MONTH_OF=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit'});
/** Month keys come from the caller's Europe/Zurich calendar. A receipt counts in one month only and only ended months count. Grants nothing. */
export function realProfitMilestones(months=[],{now=Date.now(),receiptPolicy}={}){
 const sorted=[...months].sort((a,b)=>String(a.month).localeCompare(String(b.month)));
 if(sorted.some(m=>!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month??''))||new Set(sorted.map(m=>m.month)).size!==sorted.length)throw Error('Invalid or duplicate month');
 // A reversal nobody could link can belong to any earlier month, so no month is proven until it is settled.
 if(sorted.some(m=>(Array.isArray(m.openPoints)?m.openPoints:[]).some(p=>/^(?:refund-unlinked|unknown-kind|entry-id-missing):/.test(String(p)))))return {stage:0,series:0,stage1Months:null,stage2Months:null,permissionToScale:false,blocker:'reversal-unlinked',scope:'Nur vollständig belegte reale Kalendermonate.'};
 const running=MONTH_OF.format(new Date(now)).slice(0,7),used=new Set();
 let stage=0,series=[],previous=null;const windows=[null,null];
 for(const m of sorted){
  if(stage===2)break;
  const claim=economicsClaim({outcome:m.outcome,learningMinor:m.learningMinor,synthetic:m.synthetic,receiptPolicy});
  // Case variants count as the same receipt here: a false stop can be looked at, a counted double cannot.
  const refs=Array.isArray(m.outcome?.receiptEvidence)?Array.from(m.outcome.receiptEvidence).map(r=>normalizedRef(r)?.toLowerCase()):[],reused=refs.some(r=>used.has(r))||new Set(refs).size!==refs.length;for(const r of refs)used.add(r);
  const qualifies=m.complete===true&&m.month<running&&!reused&&claim.status==='confirmed'&&claim.currency==='CHF'&&claim.netProfitMinor>=TARGETS[stage];
  const adjacent=previous!==null&&nextMonth(previous)===m.month;previous=m.month;
  if(!qualifies){series=[];continue;}
  if(!adjacent)series=[];
  series.push(m.month);
  if(series.length===3){windows[stage]=series;stage++;series=[];}
 }
 return {stage,series:series.length,stage1Months:windows[0],stage2Months:windows[1],permissionToScale:false,scope:'Nur vollständig belegte reale Kalendermonate.'};
}
export {operatingBoundaryIssues} from './founder-operating-boundary.mjs';
