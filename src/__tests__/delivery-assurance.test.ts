import {describe,it,expect} from 'vitest';
import Database from 'better-sqlite3';
import {DELIVERY_CHECKS,deliveryDecision,deliveryLearningChecks,type DeliveryEvidence} from '../security/delivery-assurance.js';
import {deliveryReviewLessons,GATE_DOMAINS,registerActionReview,evaluateActionGate,assertActionGate,containSecurityIncident} from '../security/action-gate.js';
import {isProtectedFile} from '../self-mod/code.js';
const h='a'.repeat(64), now=1000;
function evidence():DeliveryEvidence {
 const subject={sourceDigest:h,targetDigest:h,requirementsDigest:h,testInventoryDigest:h,dependencyDigest:h,artifactDigest:h};
 return {subject,implementer:'worker',reviewer:'trusted-reviewer',runner:'isolated-runner',frozenAt:1,implementationStartedAt:2,checkedAt:900,expiresAt:2000,
  requirements:[{id:'criterion',checkIds:['integration'],resolved:true}],
  checks:DELIVERY_CHECKS.map(kind=>({id:kind,kind,passed:true,subject:{...subject},evidenceDigest:h,startedAt:3,finishedAt:800})),
  inventory:{expected:['case-1'],executed:['case-1'],skipped:[],previous:['case-1'],retired:[]},
  isolation:{approvedRunnerDigest:h,hostFallback:false,network:'none',cleanBuild:true},
  heldout:{curator:'independent-curator',suiteDigest:h,exposedBeforeImplementation:false},
  mutation:{required:['stdout'],detected:['stdout']},defects:[]};
}
describe('trusted delivery assurance',()=>{
 it('accepts complete synthetic evidence only for the exact current subject',()=>{
  const e=evidence();expect(deliveryDecision(e,e.subject,now)).toBeNull();
  for(const key of Object.keys(e.subject) as (keyof typeof e.subject)[])expect(deliveryDecision(e,{...e.subject,[key]:'b'.repeat(64)},now)).toBe('DELIVERY_SCOPE_CHANGED');
 });
 it.each(DELIVERY_CHECKS)('cannot omit %s despite other passing checks',kind=>{
  const e=evidence();e.checks=e.checks.filter(c=>c.kind!==kind);expect(deliveryDecision(e,e.subject,now)).toBe('DELIVERY_CHECK_MISSING');
 });
 const attacks: [string,(e:DeliveryEvidence)=>void][]=[
  ['self review',e=>{e.reviewer=e.implementer;}],['late criteria',e=>{e.frozenAt=4;}],
  ['expired',e=>{e.expiresAt=999;}],['future',e=>{e.checkedAt=1001;}],
  ['failed test',e=>{e.checks[0].passed=false;}],['stale check',e=>{e.checks[0].subject.sourceDigest='b'.repeat(64);}],
  ['contradictory requirement',e=>{e.requirements[0].resolved=false;}],['unknown check',e=>{e.requirements[0].checkIds=['fake'];}],
  ['unexpected skip',e=>{e.inventory.skipped=['case-1'];}],['lost test',e=>{e.inventory.previous.push('lost');}],
  ['duplicate execution',e=>{e.inventory.executed.push('case-1');}],['no executed tests',e=>{e.inventory.executed=[];}],
  ['surviving mutation',e=>{e.mutation.detected=[];}],['exposed holdout',e=>{Object.assign(e.heldout,{exposedBeforeImplementation:true});}],
  ['host fallback',e=>{Object.assign(e.isolation,{hostFallback:true});}],['network',e=>{Object.assign(e.isolation,{network:'host'});}],
  ['malformed clock',e=>{e.checkedAt=NaN;}],['malformed inventory',e=>{Object.assign(e,{inventory:null});}],
 ];
 it.each(attacks)('fails closed: %s',(_name,attack)=>{const e=evidence();attack(e);expect(deliveryDecision(e,e.subject,now)).not.toBeNull();});
 it('turns defect categories into mandatory regression checks without employee costs',()=>{
  const e=evidence();e.defects=[{category:'test_discovery',regressionCheckIds:['tests'],rootCauseDigest:h,correctionDigest:h,reworkMinutes:5,directCashCostCents:0}];
  expect(deliveryLearningChecks(['test_discovery'])).toEqual(['tests','mutation']);
  expect(deliveryDecision(e,e.subject,now)).toBe('DELIVERY_LESSON_UNVERIFIED');
  e.defects[0].regressionCheckIds.push('mutation');expect(deliveryDecision(e,e.subject,now)).toBeNull();
 });
 it('integrates into the existing gate, logs rejection and preserves emergency stop',()=>{
  const db=new Database(':memory:');const e=evidence();
  const scope={activity:'reviewed-delivery',component:'fixture',contextDigest:h,deliverySubject:e.subject};
  try {
   const review={...scope,reviewedBy:'trusted-reviewer',classification:'PUBLIC' as const,
    evidence:GATE_DOMAINS.map(domain=>({domain,requirement:domain,jurisdiction:'CH',source:'https://example.invalid/synthetic',sourceDigest:h,observedAt:1,expiresAt:3000,decision:'APPROVED' as const,reason:'Synthetic only'}))};
   registerActionReview(db,review,now);
   expect(()=>assertActionGate(db,scope,now)).toThrow('DELIVERY_EVIDENCE_ABSENT');
   expect(db.prepare('SELECT reason FROM obolus_security_audit').get()).toEqual({reason:'DELIVERY_EVIDENCE_ABSENT'});
   e.defects=[{category:'protocol',regressionCheckIds:['integration','mutation'],rootCauseDigest:h,correctionDigest:h,reworkMinutes:1,directCashCostCents:0}];
   registerActionReview(db,{...review,deliveryEvidence:e},now+1);
   expect(deliveryReviewLessons(db,now+1)).toHaveLength(2);
   expect(deliveryReviewLessons(db,2001)).toEqual([]);
   expect(evaluateActionGate(db,scope,now+1).state).toBe('APPROVED');
   expect(evaluateActionGate(db,{...scope,deliverySubject:{...e.subject,artifactDigest:'b'.repeat(64)}},now+1).state).not.toBe('APPROVED');
   containSecurityIncident(db);expect(deliveryReviewLessons(db,now+1)).toEqual([]);expect(evaluateActionGate(db,scope,now+1).reason).toBe('SECURITY_INCIDENT');
  } finally {db.close();}
 });
 it('code delivery cannot obtain approval by omitting its evidence and protects root code',()=>{
  const db=new Database(':memory:');try {expect(evaluateActionGate(db,{activity:'code-delivery',component:'fixture',contextDigest:h},now).state).not.toBe('APPROVED');}finally{db.close();}
  for(const ext of ['ts','js','d.ts'])expect(isProtectedFile(`src/security/delivery-assurance.${ext}`)).toBe(true);
 });
});
