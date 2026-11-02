// Long-term adaptation (H) and cross-task optimization (I) as one set of pure decisions over existing evidence.
// Comparison stays in src/research, economics in founder-expert-acceptance. No store, worker, install or activation.
import {assessImprovement} from '../src/research/improvement.ts';
import {registerLearningExperiment} from '../src/research/experiments.ts';
import {economicsClaim} from './founder-expert-acceptance.mjs';
import {canonicalText,declaredSynthetic,normalizedRef,realRef,recordIssues} from './founder-operating-boundary.mjs';
import {listEvidence,readEvidence} from './founder-evidence-registry.mjs';
import {unboundedScope} from './founder-expert-register.mjs';
import {screenListing} from './order-sources/international.mjs';
import {bounded,digest} from './founder-restoration-integrity.mjs';
const minor=x=>Number.isSafeInteger(x)&&x>=0;
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const BINDING=['sourceDigest','modelDigest','runtimeDigest','configDigest','dataDigest'];
// The existing limits of a registered experiment; an outside observation cannot set more for itself.
const MAX_COST_MINOR=250,MAX_MINUTES=10;

/** A technology observation is only a bounded candidate: same source, version and capability collapse into one. */
export function registerObservation(candidates,o){
 const limitsOk=minor(o?.limits?.maxCostMinor)&&minor(o?.limits?.maxMinutes)&&o.limits.maxCostMinor<=MAX_COST_MINOR&&o.limits.maxMinutes<=MAX_MINUTES;
 if(!bounded(o?.source,500)||!bounded(o?.version)||!bounded(o?.capability)||!bounded(o?.kind)||!bounded(o?.evidenceRef,2000)||!Number.isFinite(Date.parse(o?.observedAt??''))||!limitsOk)throw Error('Observation needs source, version, capability, date, evidence and limits');
 const id=digest([o.source,o.version,o.capability,o.kind].map(canonicalText)),old=candidates.find(c=>c.id===id);
 if(old){const updated={...old,evidenceRefs:[...new Set([...old.evidenceRefs,o.evidenceRef])],lastObservedAt:Date.parse(o.observedAt)>Date.parse(old.lastObservedAt)?o.observedAt:old.lastObservedAt};return {created:false,candidate:updated,candidates:candidates.map(c=>c===old?updated:c)};}
 const candidate={id,source:o.source,version:o.version,capability:o.capability,kind:o.kind,firstObservedAt:o.observedAt,lastObservedAt:o.observedAt,evidenceRefs:[o.evidenceRef],limits:{maxCostMinor:o.limits.maxCostMinor,maxMinutes:o.limits.maxMinutes},status:'candidate',installed:false,activated:false};
 return {created:true,candidate,candidates:[...candidates,candidate]};
}

const caseKey=x=>canonicalText(x).replace(/[\s_-]+/g,'');
/** Whether a run passed is read from its registered record, never taken from the caller. Freshness is judged against named cases. */
export function transferCheck({trainingCases,transfer=[],regressions=[],evidence,experimentHash,after=0}={}){
 const reasons=[],trained=Array.isArray(trainingCases)?trainingCases.map(caseKey):[],hashes=[];
 if(!trained.length||trained.some(k=>!k))reasons.push('training-cases-missing');
 const judge=(item,name)=>{
  const record=readEvidence(evidence,item?.runHash,'run'),run=record?.body;
  if(!run||run.id!==item.id||(experimentHash!==undefined&&run.experimentHash!==experimentHash)||record.sequence<after){reasons.push(name+'-unproven:'+item?.id);return;}
  hashes.push(item.runHash);
  if(run.passed!==true)reasons.push(name+'-failed:'+item.id);
  // A later pass does not undo a recorded failure of the same run: the caller cannot pick the good one.
  if(listEvidence(evidence,'run').some(r=>caseKey(r.body.id)===caseKey(item.id)&&r.body.experimentHash===run.experimentHash&&r.body.passed!==true))reasons.push(name+'-failed:'+item.id);
 };
 if(!transfer.length)reasons.push('transfer-missing');
 for(const t of transfer){if(trained.includes(caseKey(t?.id)))reasons.push('transfer-not-fresh');judge(t,'transfer');}
 if(!regressions.length)reasons.push('regressions-missing');
 for(const r of regressions)judge(r,'regression');
 return {passed:reasons.length===0,reasons:[...new Set(reasons)],runHashes:hashes};
}
const validSpec=spec=>{try{registerLearningExperiment(spec,{registerExperiment(){}});return true;}catch{return false;}};
/** Contract and results come from the registry, the contract registered first: a later rewrite is another record and matches nothing here.
 * This holds only if whoever runs the experiment owns the writer. Acceptance is narrow and installs and activates nothing. */
export function decideCandidate({evidence,experimentHash,resultsHash,binding,capability,regressions,transfer}={}){
 const experiment=readEvidence(evidence,experimentHash,'experiment'),recorded=readEvidence(evidence,resultsHash,'results');
 const rejected=reason=>({status:'rejected',reasons:[reason],assessment:null,metric:null,scope:null,capability:null,universal:false,binding:null,evidenceIds:[],evidenceRefs:[],profitProven:false,installed:false,activated:false});
 if(!experiment)return rejected('experiment-not-registered');
 if(!recorded||recorded.body.experimentHash!==experimentHash||recorded.sequence<experiment.sequence)return rejected('results-not-registered');
 // One experiment has one result. Repeating until something passes is a new experiment, not a better result.
 if(listEvidence(evidence,'results').filter(r=>r.body.experimentHash===experimentHash).length!==1)return rejected('results-not-unique');
 const {spec,workload,trainingCases,capability:registeredCapability,binding:registeredBinding}=experiment.body,{baseline,candidate,replication}=recorded.body;
 if(!validSpec(spec))return rejected('experiment-invalid');
 const a=assessImprovement(spec,baseline,candidate,replication,workload),reasons=[...a.reasons];
 if(a.status!=='verified'&&!reasons.length)reasons.push('assessment-'+a.status);
 if(!Array.isArray(trainingCases)||!trainingCases.length)reasons.push('training-cases-missing');
 const transferred=transferCheck({trainingCases:[...(Array.isArray(trainingCases)?trainingCases:[]),...spec.cases.map(c=>c.id)],transfer,regressions,evidence,experimentHash,after:experiment.sequence});
 reasons.push(...transferred.reasons);
 // A failed run on record for this experiment stands even when the caller leaves it out.
 for(const r of listEvidence(evidence,'run'))if(r.body.experimentHash===experimentHash&&r.body.passed!==true)reasons.push('run-failed-on-record:'+r.body.id);
 const runs=[...baseline,...candidate,...replication],spent=runs.reduce((n,r)=>n+(r.costMinor??0)+(r.reworkCostMinor??0),0),took=runs.reduce((n,r)=>n+(r.durationMs??0),0);
 if(spent>spec.maxCostRappen||took>spec.maxDurationMs)reasons.push('experiment-budget-exceeded');
 if(!BINDING.every(k=>hash(binding?.[k])))reasons.push('binding-incomplete');
 else if(new Set(BINDING.map(k=>binding[k])).size===1)reasons.push('binding-not-distinct');
 if(binding?.candidateDigest!==spec.candidateDigest)reasons.push('binding-not-this-candidate');
 if(!BINDING.every(k=>binding?.[k]===registeredBinding?.[k]))reasons.push('binding-not-this-experiment');
 if(!bounded(capability))reasons.push('capability-missing');else if(unboundedScope(capability))reasons.push('capability-not-bounded');
 if(capabilityKey(capability)!==capabilityKey(registeredCapability))reasons.push('capability-not-this-experiment');
 const accepted=a.status==='verified'&&reasons.length===0;
 const upstream=accepted?[...new Set([experimentHash,resultsHash,...transferred.runHashes,...a.resultIds,...(spec.evidenceIds??[]),...(workload?.evidenceIds??[]),...runs.flatMap(r=>r.evidenceIds??[]),...runs.map(r=>r.executionRef)])]:[];
 return {status:accepted?'accepted':'rejected',reasons,assessment:a.status,metric:a.metric,scope:accepted?capability:null,capability:accepted?capability:null,universal:false,binding:accepted?{...binding}:null,evidenceIds:accepted?a.resultIds:[],evidenceRefs:upstream,profitProven:false,installed:false,activated:false};
}

/** Only releases that depend on the change lose validity; the others stay untouched. */
export function invalidateReleases(releases,{current={},revoked=[]}={}){
 return releases.map(r=>{
  const now=Object.prototype.hasOwnProperty.call(current,r.capability)?current[r.capability]:null,reasons=[];
  if(!now||!BINDING.every(k=>hash(now[k])))reasons.push('binding-unverifiable');
  else for(const k of [...BINDING,...(r.binding?.candidateDigest!==undefined?['candidateDigest']:[])])if(now[k]!==r.binding?.[k])reasons.push(k+'-changed');
  const evidence=[...new Set([...(r.evidenceRefs??[]),...(r.evidenceIds??[])])];
  if(!evidence.length)reasons.push('evidence-unbound');
  const gone=revoked.map(canonicalText);
  for(const e of evidence)if(gone.includes(canonicalText(e)))reasons.push('evidence-revoked:'+e);
  return {id:r.id,capability:r.capability,valid:reasons.length===0,reasons};
 });
}

const KEPT=['journal','payments','receipts'];
export function migrationCheck({before,after}={}){
 const lost=[];
 for(const k of KEPT){
  if(!Array.isArray(before?.[k])||!Array.isArray(after?.[k])){lost.push('unproven-'+k);continue;}
  // Counted, not just looked up: two payments with one id must stay two.
  const left=[...after[k]];
  for(const id of before[k]){const at=left.indexOf(id);if(at<0)lost.push('lost-'+k+':'+id);else left.splice(at,1);}
 }
 return {passed:lost.length===0,lost};
}
const chainComplete=chain=>chain.every((c,i)=>realRef(c.receiptRef)&&Array.isArray(c.evidenceRefs)&&c.evidenceRefs.length>0&&c.evidenceRefs.every(realRef)&&BINDING.every(k=>hash(c.binding?.[k]))&&(i===0?c.supersedes===null:c.supersedes===chain[i-1].version));
/** A plan, not an action: it names the proven state and keeps history, payments and receipts. */
export function rollbackPlan({chain=[],failed,target,before,after}={}){
 const reasons=[],t=chain.find(c=>c.version===target);
 if(!chain.some(c=>c.version===failed))reasons.push('failed-unknown');
 if(!t)reasons.push('target-unknown');else if(t.status!=='stable')reasons.push('target-not-stable');
 if(failed===target)reasons.push('target-is-the-failed-version');
 if(t&&chain.some(c=>c!==t&&c.version===target))reasons.push('target-ambiguous');
 if(!chainComplete(chain))reasons.push('receipt-chain-incomplete');
 const m=migrationCheck({before,after});reasons.push(...m.lost);
 return {status:reasons.length?'blocked':'ready',reasons,targetVersion:t&&!reasons.length?target:null,history:chain,journalsPreserved:m.passed,deletesHistory:false};
}

const JOURNAL_TYPES=new Set(['reserved','dispatched','confirmed-not-executed','result']);
/** A dispatched request without an outcome stays unresolved. Only stated evidence of non-execution reopens it. */
export function reconcileExperiments(journal=[],{evidence}={}){
 const requests=new Map();
 for(const e of journal){if(!e||typeof e!=='object')throw Error('Unreadable journal entry');const id=canonicalText(e.requestId),list=requests.get(id)??[];list.push(e);requests.set(id,list);}
 return [...requests.entries()].map(([requestId,events])=>{
  const results=events.filter(e=>e.type==='result'),digests=new Set(results.map(e=>e.digest));
  const decide=(decision,restartAllowed)=>({requestId,decision,restartAllowed});
  if(!requestId)return decide('unresolved',false);
  if(digests.size>1)return decide('conflict',false);
  if(results.some(e=>!bounded(e.digest)))return decide('unresolved',false);
  if(digests.size===1)return decide('reuse-result',false);
  // Anything the journal cannot name might have cost money. The journal order decides; a later dispatch reopens the doubt.
  if(events.some(e=>!JOURNAL_TYPES.has(e.type)))return decide('unresolved',false);
  // Each dispatch needs its own registered proof of non-execution for this request. The same proof twice is one proof.
  let open=0;const used=new Set();
  for(const e of events){
   if(e.type==='dispatched')open++;
   else if(e.type==='confirmed-not-executed'&&open>0&&!used.has(e.evidenceRef)&&canonicalText(readEvidence(evidence,e.evidenceRef,'non-execution')?.body?.requestId)===requestId){used.add(e.evidenceRef);open--;}
  }
  return open?decide('unresolved',false):decide('may-start',true);
 });
}

const methodKey=m=>canonicalText(m).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#<>=]+$/gu,'');
const capabilityKey=c=>canonicalText(c).replace(/[\s_-]+/g,' ');
const FINISHED=new Set(['failed','verified','rejected','aborted']);
/** New registered evidence or a different method reopens the question; repeating the same attempt does not.
 * Rewording is not detectable, so attempts on one body of evidence have a limit from policy. One capability runs once at a time. */
export function hypothesisGate(history=[],{capability,method,evidenceFingerprint}={},{knownFingerprints,maxAttempts}={}){
 if(!bounded(evidenceFingerprint))return {allowed:false,reason:'evidence-fingerprint-required'};
 if(!bounded(capability)||!methodKey(method))return {allowed:false,reason:'hypothesis-incomplete'};
 if(!Array.isArray(knownFingerprints)||!Number.isSafeInteger(maxAttempts)||maxAttempts<1)return {allowed:false,reason:'hypothesis-policy-missing'};
 const fingerprint=canonicalText(evidenceFingerprint),forCapability=history.filter(h=>capabilityKey(h?.capability)===capabilityKey(capability));
 // Only a named end counts as ended; anything else might still be running.
 if(forCapability.some(h=>!FINISHED.has(h.outcome)))return {allowed:false,reason:'already-running'};
 if(!knownFingerprints.map(canonicalText).includes(fingerprint))return {allowed:false,reason:'evidence-not-registered'};
 const sameEvidence=forCapability.filter(h=>canonicalText(h.evidenceFingerprint)===fingerprint),same=sameEvidence.filter(h=>methodKey(h.method)===methodKey(method));
 if(same.some(h=>h.outcome==='verified'))return {allowed:false,reason:'already-verified'};
 if(same.length)return {allowed:false,reason:'same-hypothesis-no-new-evidence'};
 if(sameEvidence.length>=maxAttempts)return {allowed:false,reason:'attempt-limit'};
 return {allowed:true,reason:null};
}

export function profitClaim({outcome,learningMinor,synthetic=false,sampleSize,minSample,reportCurrency,ledger,receiptPolicy,period}={}){
 const claim=economicsClaim({outcome,learningMinor,synthetic,receiptPolicy}),missing=[...claim.missing],receipts=new Set((Array.isArray(outcome?.receiptEvidence)?outcome.receiptEvidence:[]).map(normalizedRef));
 if(!minor(minSample)||minSample===0)missing.push('sample-policy-missing');
 else if(!minor(sampleSize)||sampleSize<minSample)missing.push('sample-too-small');
 if(minor(sampleSize)&&sampleSize>receipts.size)missing.push('sample-unproven');
 // The ledger must be one worked out here, complete, and its learning costs must be the ones in this claim.
 if(!issuedLedgers.has(ledger)||ledger.complete!==true)missing.push('ledger-incomplete');
 else{
  if(Object.keys(ledger.totals).some(c=>c!==reportCurrency))missing.push('ledger-other-currency');
  if((ledger.learningTotals[reportCurrency]??0)!==learningMinor)missing.push('ledger-mismatch');
  // Costs in the ledger beyond learning must be in the overhead this claim subtracts; otherwise they vanish from the result.
  if(((ledger.totals[reportCurrency]??0)-(ledger.learningTotals[reportCurrency]??0))>(minor(outcome?.overheadMinor)?outcome.overheadMinor:-1))missing.push('ledger-mismatch');
  if(!ledger.entries.length)missing.push('ledger-empty');
  if(!bounded(period)||ledger.period!==period)missing.push('ledger-other-period');
 }
 if(!bounded(reportCurrency,3)||outcome?.currency!==reportCurrency)missing.push('currency-changed');
 const safe=claim.status==='confirmed'&&missing.length===0;
 return {...claim,status:safe?'confirmed':claim.status==='simulated'?'simulated':'unknown',missing,netProfitMinor:safe?claim.netProfitMinor:null,safe,permissionToScale:false};
}

const refused=record=>{
 const issues=recordIssues(record);
 if(issues.includes('personnel-cost-forbidden'))throw Error('Personnel costs are not part of this ledger');
 if(issues.includes('human-time-must-be-minutes'))throw Error('Human involvement is recorded in minutes only');
};
const LEDGER_KINDS=new Set(['learning','migration','experiment','tool','research']),LEARNING_KINDS=new Set(['learning','migration','experiment','research']),LEDGER_FIELDS=new Set(['id','kind','status','costMinor','currency','humanMinutes','note']);
const issuedLedgers=new WeakSet();
/** A projection over existing cost entries. Aborted work counts, unknown stays unknown, and currencies never merge. Only named kinds and fields carry money. */
export function adaptationLedger(entries=[],{period=null}={}){
 refused(entries);
 const byId=new Map(),conflicts=[],stable=x=>JSON.stringify(Object.keys(x).sort().map(k=>[k,x[k]]));
 // Without an id two identical bookings are two bookings; merging them would lose money.
 for(const [i,e] of entries.entries()){if(!e||typeof e!=='object'){byId.set(Symbol(i),{});continue;}if(!bounded(e.id)){byId.set(Symbol(i),e);continue;}const old=byId.get(e.id);if(old){if(stable(old)!==stable(e))conflicts.push(e.id);continue;}byId.set(e.id,e);}
 const rows=[...byId.values()],totals=Object.create(null),learningTotals=Object.create(null),unknownCosts=[];let humanMinutes=0,humanMinutesComplete=true,overflow=false;
 for(const e of rows){
  const known=minor(e.costMinor)&&/^[A-Z]{3}$/.test(e.currency??'')&&LEDGER_KINDS.has(e.kind)&&Object.keys(e).every(k=>LEDGER_FIELDS.has(k));
  if(known){totals[e.currency]=(totals[e.currency]??0)+e.costMinor;if(!Number.isSafeInteger(totals[e.currency]))overflow=true;if(LEARNING_KINDS.has(e.kind))learningTotals[e.currency]=(learningTotals[e.currency]??0)+e.costMinor;}else unknownCosts.push(e.id??null);
  if(!bounded(e.id)&&!unknownCosts.includes(null))unknownCosts.push(null);
  if(Number.isFinite(e.humanMinutes)&&e.humanMinutes>=0)humanMinutes+=e.humanMinutes;else humanMinutesComplete=false;
 }
 const ledger={period,entries:rows,totals,learningTotals,unknownCosts,conflicts,aborted:rows.filter(e=>e.status==='aborted').length,complete:unknownCosts.length===0&&conflicts.length===0&&!overflow,humanMinutes,humanMinutesComplete};
 issuedLedgers.add(ledger);
 Object.freeze(ledger);Object.freeze(ledger.totals);Object.freeze(ledger.learningTotals);
 return ledger;
}

const NOTE_FIELDS=new Set(['note']);
/** Outside text can only add a note. Every other field is refused, whatever it holds. */
export function applyProposal(candidate,proposal={}){
 const rejected=Object.keys(proposal).filter(k=>!NOTE_FIELDS.has(k)),note=typeof proposal.note==='string'?proposal.note:null;
 // The language of an outside note is unknown, so it is screened as such and cannot pass as clean.
 return {candidate:{...structuredClone(candidate),notes:note===null?[...(candidate.notes??[])]:[...(candidate.notes??[]),note]},rejected,flags:screenListing({text:note??''}).flags};
}

const ISOLATED_KINDS=new Set(['provider','model','install','communication','download','market','experiment','test']);
export function actionWhileOff({power,kind,isolated}={}){
 const fake=isolated?.tempState===true&&isolated?.fakeAdapters===true;
 if(power?.enabled!==true&&power?.enabled!==false)return {allowed:false,blockers:['power-unknown']};
 if(fake&&ISOLATED_KINDS.has(kind))return {allowed:true,blockers:[]};
 return {allowed:false,blockers:[power.enabled?'existing-gates-decide':'power-off']};
}

/** All activities use one queue. Registering an item starts nothing. */
export function improvementIntake(queue,{activity,trigger,evidenceRef}={}){
 if(!bounded(activity)||!bounded(trigger)||!bounded(evidenceRef,2000))throw Error('Activity, trigger and evidence required');
 const id=digest([canonicalText(activity),canonicalText(trigger)]);
 if(queue.some(e=>e.id===id))return {created:false,queue};
 return {created:true,queue:[...queue,{id,activity,trigger,evidenceRef,status:'registered',workerStarted:false}]};
}
/** Separates the technical benchmark from real money; the profit is worked out here from its evidence, never taken as a stated number. */
export function optimizationClaims({synthetic,decision,profit}={}){
 const claim=synthetic===false&&profit&&!declaredSynthetic(profit.synthetic)?profitClaim(profit):null;
 return {technicalBenchmark:decision?.status??null,realProfitMinor:claim?.safe===true?claim.netProfitMinor:null,expertFamilyPassed:false,productiveRelease:false,powerOn:false};
}
