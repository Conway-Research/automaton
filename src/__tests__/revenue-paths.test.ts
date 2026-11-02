import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Database from 'better-sqlite3';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {REVENUE_PATHS,assessRevenuePath,prepareRevenuePathDraft,revenuePathRequirements,revenuePathScope,type RevenuePath,type RevenuePathAssessment} from '../revenue/revenue-paths.js';
import {GATE_DOMAINS,registerActionReview,containSecurityIncident} from '../security/action-gate.js';
import {ResearchStore} from '../revenue/research.js';
import {researchAdmissionBlock} from '../revenue/research-admission.js';
import {isProtectedFile} from '../self-mod/code.js';

const now=Date.now();
let dir:string,db:Database.Database;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'obolus-paths-'));db=new Database(join(dir,'test.db'));});
afterEach(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
function candidate(path:RevenuePath):RevenuePathAssessment{return {
 ...(path==='free-innovation-contest'?{contest:{status:'open' as const,deadlineAt:now+3600000,sourceType:'primary' as const}}:{}),
 ...(path==='public-tender'?{procurement:{kind:'open' as const,deadlineAt:now+3600000,sourceType:'primary' as const,boundedScope:'supported' as const,eligibility:'supported' as const,deliveryMode:'autonomous-compatible' as const,dataAccess:'public' as const,personalDataRequired:false}}:{}),
 path,region:'CH',sourceUrl:'https://example.org/fixture',retrievedAt:now,provenance:'public-indicator',
 demand:['Fixture purchase-intent indicator, not payment'],counterEvidence:['Fixture incumbent alternative'],prerequisites:['Bounded synthetic delivery'],deliveryEvidence:['Fixture quality report'],
 conditions:revenuePathRequirements(path).map(requirement=>({requirement,sourceUrl:'https://example.org/terms',digest:'a'.repeat(64),observedAt:now,expiresAt:now+86400000,state:'supported'})),
 forecast:{currency:'CHF',receiptsCents:10000,directCashCents:1000,feesCents:500,refundsCents:500,openCosts:[],probability:0.2,estimateSource:'Synthetic test assumption',uncertainty:'high'},
 entryFeeCents:0,effortMinutes:120,nextSafeCheck:'Compare locally stored synthetic conditions',blockers:[],activityClass:'research',
};}
function review(a:RevenuePathAssessment){registerActionReview(db,{...revenuePathScope(a),reviewedBy:'test-fixture',classification:'PUBLIC',evidence:revenuePathRequirements(a.path).map((requirement,i)=>({domain:GATE_DOMAINS[i%5],requirement,jurisdiction:'CH',source:'https://example.org/terms',sourceDigest:'a'.repeat(64),observedAt:now,expiresAt:now+86400000,decision:'APPROVED',reason:'Synthetic trusted-control test only'}))},now);}
describe.each(Object.keys(REVENUE_PATHS) as RevenuePath[])('%s local revenue profile',path=>{
 it('exposes break-even success and all-cash downside without booking forecast earnings',()=>{
  const a=candidate(path),r=assessRevenuePath(db,a,now);
  expect(r.cashSensitivity).toMatchObject({breakEvenProbability:0.2,expectedCashCents:0,assessment:'NONPOSITIVE_EXPECTATION',personnelCostsIncluded:false,realized:false});
  expect(r.realizedCashNetCents).toBeNull();expect(r.externalExecutionAllowed).toBe(false);
  a.forecast.openCosts=['Unresolved cash expense'];
  expect(assessRevenuePath(db,a,now).cashSensitivity).toMatchObject({breakEvenProbability:null,expectedCashCents:null,assessment:'UNKNOWN'});
 });
 it('requires each individual rights, delivery and policy requirement despite a trusted review',()=>{
  for(const requirement of revenuePathRequirements(path)){
   const a=candidate(path);a.conditions=a.conditions.filter(c=>c.requirement!==requirement);review(a);
   expect(assessRevenuePath(db,a,now).blockers).toContain(`UNREVIEWED:${requirement}`);
   const b=candidate(path);b.conditions.find(c=>c.requirement===requirement)!.state='contradictory';review(b);
   expect(prepareRevenuePathDraft(db,b,now).assessment.status).toBe('HOLD');
  }
 });
 it('produces only an unsent, version-bound working draft and retains HOLD',()=>{
  const a=candidate(path);const draft=prepareRevenuePathDraft(db,a,now);
  expect(draft.assessment.status).toBe('HOLD');expect(draft.sendAllowed).toBe(false);expect(draft.recipient).toBeNull();
  expect(draft.spendLimitCents).toBe(0);expect(draft.requirementChecklist.length).toBe(revenuePathRequirements(path).length);
  a.deliveryEvidence.push('Different supplied claim');expect(prepareRevenuePathDraft(db,a,now).contextDigest).not.toBe(draft.contextDigest);
 });
 it('requires trusted scoped review and permits only local preparation',()=>{const a=candidate(path);expect(assessRevenuePath(db,a,now).status).toBe('HOLD');review(a);const r=assessRevenuePath(db,a,now);expect(r.status).toBe('LOCAL_PREPARATION_ONLY');expect(r.forecastCashContributionCents).toBe(8000);expect(r.realizedCashNetCents).toBeNull();expect(r.externalExecutionAllowed).toBe(false);expect(r.maxAuthorizedSpendCents).toBe(0);});
 it('holds stale, contradictory, unknown and synthetic evidence',()=>{const a=candidate(path);review(a);expect(assessRevenuePath(db,a,now+86400001).status).toBe('HOLD');for(const state of ['unknown','contradictory'] as const){const b=structuredClone(a);b.conditions[0].state=state;expect(assessRevenuePath(db,b,now).status).toBe('HOLD');}a.provenance='synthetic';expect(assessRevenuePath(db,a,now).blockers).toContain('SYNTHETIC_NOT_DEMAND');});
 it('changed rights never inherit review; missing delivery and unknown costs hold',()=>{const a=candidate(path);review(a);a.conditions[0].digest='b'.repeat(64);expect(assessRevenuePath(db,a,now).status).toBe('HOLD');a.deliveryEvidence=[];a.forecast.openCosts=['Tax unknown'];expect(assessRevenuePath(db,a,now).forecastCashContributionCents).toBeNull();});
 it('persists once, rejects conflicting duplicates and keeps rank/plan held',()=>{const store=new ResearchStore(db),a=candidate(path);a.provenance='synthetic';const o={id:'fixture',title:'Fixture',sector:'software' as const,hypothesis:'Fixture only',forecast:{revenueCents:0,costCents:0,probability:0,days:1,validationBudgetCents:0},forecastState:'unknown' as const,revenuePath:a};expect(store.import({opportunities:[o],evidence:[]}).opportunities).toBe(1);expect(store.import({opportunities:[o],evidence:[]}).opportunities).toBe(0);expect(store.rank(now)[0].decision).toBe('hold');expect(store.plan(100000,now).plans).toEqual([]);const changed=structuredClone(o);changed.revenuePath.region='EU';expect(()=>store.import({opportunities:[changed],evidence:[]})).toThrow();});
});
it('contest deadlines remain enforceable even with unexpired generic reviews',()=>{
 const a=candidate('free-innovation-contest');review(a);
 expect(assessRevenuePath(db,a,now+3600000).blockers).toContain('CONTEST_DEADLINE_PASSED');
 delete a.contest;review(a);expect(assessRevenuePath(db,a,now).blockers).toContain('CONTEST_DETAILS_ABSENT');
 for(const patch of [{deadlineAt:null},{status:'closed'},{sourceType:'secondary'}]){
  const b=candidate('free-innovation-contest');Object.assign(b.contest!,patch);review(b);expect(assessRevenuePath(db,b,now).status).toBe('HOLD');
 }
 const b=candidate('free-innovation-contest');Object.assign(b.contest!,{deadlineAt:'later'});expect(()=>assessRevenuePath(db,b,now)).toThrow();
});
it('keeps rejection, commitment and payment claims separate after restart without cash booking',()=>{
 const store=new ResearchStore(db),a=candidate('company-pilot');
 store.import({opportunities:[{id:'learning',title:'Fixture',sector:'software',hypothesis:'Synthetic test setup',forecast:{revenueCents:10000,costCents:100,probability:0.5,days:1,validationBudgetCents:0},revenuePath:a}],
 evidence:(['rejection','commitment','payment_claim'] as const).map((kind,i)=>({id:`e${i}`,opportunityId:'learning',sourceUrl:`https://source${i}.example.org/fixture`,observedAt:new Date(now).toISOString(),kind,excerpt:`Fixture ${kind}`,provenance:'reported' as const,reviewedBy:null}))});
 expect(store.outcomeLearning('learning',now).excluded).toHaveLength(3);
 for(let i=0;i<3;i++)store.review(`e${i}`,'fixture','accept','Synthetic test fixture only');
 review(a);
 db.close();db=new Database(join(dir,'test.db'));const reopened=new ResearchStore(db),result=reopened.outcomeLearning('learning',now);
 expect(result.rejections).toEqual(['e0']);expect(result.commitments).toEqual(['e1']);expect(result.paymentClaims).toEqual(['e2']);
 expect(result.realizedRevenueCents).toBeNull();expect(result.executionAuthorized).toBe(false);
 expect(reopened.rank(now)[0].sourceIds).not.toContain('e0');
 expect(reopened.rank(now)[0].reason).toContain('Reviewed rejection');
 expect(reopened.plan(100000,now).plans).toEqual([]);
 expect(reopened.outcomeLearning('learning',now+91*86400000).excluded).toHaveLength(3);
 reopened.review('e0','fixture','reject','Evidence withdrawn');expect(reopened.outcomeLearning('learning',now).rejections).toEqual([]);
 expect(reopened.economicBrief('learning').revenuePathDraft?.sendAllowed).toBe(false);
});
it('excludes personnel, untyped payment claims, regulated offerings and PII',()=>{for(const addition of [{salaryCents:10},{realizedRevenueCents:500},{activityClass:'financial-advice'},{region:'person@example.org'}])expect(()=>assessRevenuePath(db,{...candidate('licensing'),...addition} as RevenuePathAssessment,now)).toThrow();});
it('no paid contest, negative economics, future evidence or incident bypass',()=>{const a=candidate('free-innovation-contest');a.entryFeeCents=100;review(a);expect(assessRevenuePath(db,a,now).blockers).toContain('FREE_ENTRY_NOT_ESTABLISHED');a.forecast.directCashCents=20000;expect(assessRevenuePath(db,a,now).blockers).toContain('NONPOSITIVE_FORECAST');a.retrievedAt=now+1;expect(assessRevenuePath(db,a,now).status).toBe('HOLD');containSecurityIncident(db);expect(assessRevenuePath(db,a,now).status).toBe('HOLD');});
it('scoped preparation review does not authorize external experiment execution',()=>{
 const store=new ResearchStore(db),a=candidate('referral');review(a);
 store.import({opportunities:[{id:'fixture',title:'Fixture',sector:'software',hypothesis:'Synthetic integration',forecast:{revenueCents:10000,costCents:100,probability:0.5,days:1,validationBudgetCents:100},revenuePath:a}],evidence:[]});
 const row=db.prepare('SELECT digest FROM research_opportunities WHERE id=?').get('fixture') as {digest:string};
 db.exec('CREATE TABLE obolus_research_experiments(research_id TEXT,experiment_id TEXT,snapshot TEXT)');
 db.prepare('INSERT INTO obolus_research_experiments VALUES(?,?,?)').run('fixture','experiment',JSON.stringify({sourceDigest:row.digest}));
 expect(researchAdmissionBlock(db,'experiment')).toContain('external execution requires separate authorization');
 expect(store.plan(0,now).allocatedCents).toBe(0);
 expect(()=>store.plan(-1,now)).toThrow();
});
it('protects revenue path gates from ordinary self-modification',()=>{
 expect(isProtectedFile('src/revenue/revenue-paths.ts')).toBe(true);
 expect(isProtectedFile('dist/revenue/revenue-paths.js')).toBe(true);
});

it.each([
 ['kind','award','NOTICE_NOT_OPEN'],['kind','closed','NOTICE_NOT_OPEN'],['kind','cancelled','NOTICE_NOT_OPEN'],['kind','unknown','NOTICE_STATUS_UNKNOWN'],
 ['deadlineAt',now,'DEADLINE_PASSED'],['deadlineAt',null,'DEADLINE_UNKNOWN'],['sourceType','secondary','PRIMARY_NOTICE_UNVERIFIED'],
 ['boundedScope','unmet','BOUNDED_SCOPE_UNMET'],['boundedScope','unknown','BOUNDED_SCOPE_UNKNOWN'],
 ['eligibility','unmet','ELIGIBILITY_UNMET'],['eligibility','unknown','ELIGIBILITY_UNKNOWN'],
 ['deliveryMode','human-required','HUMAN_DELIVERY_REQUIRED'],['deliveryMode','unknown','DELIVERY_MODE_UNKNOWN'],
 ['dataAccess','unauthorized','DATA_ACCESS_UNAUTHORIZED'],['dataAccess','authorized-restricted','DATA_ACCESS_SEPARATE_REVIEW_REQUIRED'],
 ['personalDataRequired',true,'PERSONAL_DATA_CLEARANCE_REQUIRED'],['personalDataRequired',null,'PERSONAL_DATA_CLEARANCE_REQUIRED'],
])('enforces procurement %s=%s even with reviewed positive economics',(field,value,blocker)=>{
 const a=candidate('public-tender');Object.assign(a.procurement!,{[field]:value});review(a);
 const r=assessRevenuePath(db,a,now);expect(r.status).toBe('HOLD');expect(r.blockers).toContain(blocker);expect(r.externalExecutionAllowed).toBe(false);
});
it('holds legacy tender profiles without guessing missing structured facts',()=>{
 const a=candidate('public-tender');delete a.procurement;review(a);
 expect(assessRevenuePath(db,a,now).blockers).toContain('PROCUREMENT_DETAILS_ABSENT');
});
it('revalidates a passing deadline at its exact boundary and invalidates changed facts',()=>{
 const a=candidate('public-tender');review(a);expect(assessRevenuePath(db,a,now).status).toBe('LOCAL_PREPARATION_ONLY');
 expect(assessRevenuePath(db,a,now+3600000).procurementDisposition).toBe('REJECT_CURRENT_CANDIDATE');
 a.procurement!.deadlineAt=now+7200000;expect(assessRevenuePath(db,a,now).status).toBe('HOLD');
});
it('rejects malformed and privilege-shaped procurement facts',()=>{
 for(const patch of [{deadlineAt:'tomorrow'},{deadlineAt:NaN},{kind:'approved'},{personalDataRequired:'false'},{bypass:true},{eligibility:undefined}]){
  const a=candidate('public-tender');Object.assign(a.procurement!,patch);expect(()=>assessRevenuePath(db,a,now)).toThrow();
 }
 const a=candidate('company-pilot');a.procurement=candidate('public-tender').procurement;expect(()=>assessRevenuePath(db,a,now)).toThrow();
});
it('persists procurement rejection across reopening and excludes it from funded plans',()=>{
 const a=candidate('public-tender');a.procurement!.kind='award';review(a);
 const store=new ResearchStore(db);store.import({opportunities:[{id:'awarded',title:'Synthetic awarded notice',sector:'software',hypothesis:'Synthetic only',forecast:{revenueCents:10000000,costCents:1,probability:1,days:1,validationBudgetCents:1},revenuePath:a}],evidence:[]});
 db.close();db=new Database(join(dir,'test.db'));const reopened=new ResearchStore(db);
 expect(reopened.rank(now)[0].decision).toBe('hold');expect(reopened.plan(100000,now).plans).toEqual([]);
});

function rewardedCandidate():RevenuePathAssessment{
 const a=candidate('research-qa-subcontract');
 a.sourceUrl='https://github.com/example/project/issues/1';
 a.rewardedTask={status:'open',deadlineAt:now+3600000,agentUse:'allowed',humanReviewAvailable:false,claim:'not-required',acceptance:'explicit',payout:'documented'};
 a.conditions=revenuePathRequirements(a.path,true).map(requirement=>({requirement,sourceUrl:'https://example.org/terms',digest:'a'.repeat(64),observedAt:now,expiresAt:now+86400000,state:'supported'}));
 a.forecast.probability=0.8;
 return a;
}
function taskReview(a:RevenuePathAssessment){registerActionReview(db,{...revenuePathScope(a),reviewedBy:'test-fixture',classification:'PUBLIC',evidence:revenuePathRequirements(a.path,true).map((requirement,i)=>({domain:GATE_DOMAINS[i%5],requirement,jurisdiction:'CH',source:'https://example.org/terms',sourceDigest:'a'.repeat(64),observedAt:now,expiresAt:now+86400000,decision:'APPROVED',reason:'Synthetic test only'}))},now);}
it('keeps PR delivery evidence separate from task eligibility and cash settlement',()=>{
 const a=rewardedCandidate();a.sourceUrl='https://github.com/example/project/pull/12';taskReview(a);
 expect(assessRevenuePath(db,a,now).status).toBe('LOCAL_PREPARATION_ONLY');
 a.rewardedTask!.status='closed';taskReview(a);
 const closed=assessRevenuePath(db,a,now);
 expect(closed.status).toBe('HOLD');expect(closed.blockers).toContain('TASK_NOT_VERIFIED_OPEN');
 expect(closed.realizedCashNetCents).toBeNull();expect(closed.externalExecutionAllowed).toBe(false);
 a.rewardedTask!.status='open';a.rewardedTask!.claim='required';a.rewardedTask!.payout='unknown';taskReview(a);
 expect(assessRevenuePath(db,a,now).blockers).toEqual(expect.arrayContaining(['TASK_CLAIM_UNCONFIRMED','TASK_PAYOUT_UNVERIFIED']));
});
it.each([
 'https://github.com/example/project/pull/12',
 'https://github.com/example/project/pull/12/',
 'https://api.trybounty.ai/v1/agent/bounties/synthetic_task',
 'https://app.opire.dev/issues/01SYNTHETICTASK',
 'https://algora.io/challenges/synthetic-challenge',
])('requires task-specific evidence for a known rewarded source %s',sourceUrl=>{
 const a=candidate('research-qa-subcontract');a.sourceUrl=sourceUrl;review(a);
 const r=assessRevenuePath(db,a,now);
 expect(r.status).toBe('HOLD');expect(r.blockers).toContain('REWARDED_TASK_DETAILS_ABSENT');
});
it.each(['https://app.opire.dev/issues/synthetic','https://api.trybounty.ai/v1/agent/bounties/synthetic','https://algora.io/challenges/synthetic'])('preserves fully evidenced local preparation for %s',sourceUrl=>{
 const a=rewardedCandidate();a.sourceUrl=sourceUrl;taskReview(a);
 const result=assessRevenuePath(db,a,now);
 expect(result.status).toBe('LOCAL_PREPARATION_ONLY');expect(result.externalExecutionAllowed).toBe(false);
 a.conditions=a.conditions.filter(c=>c.requirement!=='agent-use');taskReview(a);
 expect(assessRevenuePath(db,a,now).blockers).toContain('UNREVIEWED:agent-use');
});
it.each([
 ['status','closed','TASK_NOT_VERIFIED_OPEN'],['status','unknown','TASK_NOT_VERIFIED_OPEN'],
 ['deadlineAt',null,'TASK_DEADLINE_UNKNOWN'],['deadlineAt',now,'TASK_DEADLINE_PASSED'],
 ['agentUse','unknown','TASK_AGENT_USE_UNAPPROVED'],['agentUse','forbidden','TASK_AGENT_USE_UNAPPROVED'],
 ['agentUse','human-review-required','TASK_HUMAN_REVIEW_UNAVAILABLE'],
 ['claim','required','TASK_CLAIM_UNCONFIRMED'],['claim','unknown','TASK_CLAIM_UNCONFIRMED'],
 ['acceptance','ambiguous','TASK_ACCEPTANCE_UNCLEAR'],['payout','unknown','TASK_PAYOUT_UNVERIFIED'],
])('holds rewarded task %s=%s despite positive payout and scoped review',(field,value,blocker)=>{
 const a=rewardedCandidate();Object.assign(a.rewardedTask!,{[field]:value});taskReview(a);
 const result=assessRevenuePath(db,a,now);expect(result.blockers).toContain(blocker);expect(result.status).toBe('HOLD');expect(result.externalExecutionAllowed).toBe(false);
});
it('requires task evidence and rejects forged runtime types',()=>{
 const a=rewardedCandidate();delete a.rewardedTask;a.conditions=candidate(a.path).conditions;review(a);
 expect(assessRevenuePath(db,a,now).blockers).toContain('REWARDED_TASK_DETAILS_ABSENT');
 for(const patch of [{deadlineAt:NaN},{humanReviewAvailable:'true'},{agentUse:'approved'},{bypass:true}]){
  const b=rewardedCandidate();Object.assign(b.rewardedTask!,patch);expect(()=>assessRevenuePath(db,b,now)).toThrow();
 }
});
it('human-supported preparation never authorizes submission or payment',()=>{
 const a=rewardedCandidate();a.rewardedTask!.agentUse='human-review-required';a.rewardedTask!.humanReviewAvailable=true;taskReview(a);
 const r=assessRevenuePath(db,a,now);expect(r.status).toBe('LOCAL_PREPARATION_ONLY');expect(r.expectedTaskCashContributionCents).toBe(6000);expect(r.realizedCashNetCents).toBeNull();expect(r.maxAuthorizedSpendCents).toBe(0);
 expect(assessRevenuePath(db,a,now+3600000).blockers).toContain('TASK_DEADLINE_PASSED');
 a.rewardedTask!.claim='confirmed';expect(assessRevenuePath(db,a,now).status).toBe('HOLD');
});
it('positive headline payout cannot hide negative probability-weighted cash economics',()=>{
 const a=rewardedCandidate();a.forecast.probability=0.01;taskReview(a);const r=assessRevenuePath(db,a,now);
 expect(r.forecastCashContributionCents).toBe(8000);expect(r.expectedTaskCashContributionCents).toBe(-1900);expect(r.blockers).toContain('NONPOSITIVE_EXPECTED_TASK_CONTRIBUTION');
});
it('task-specific missing evidence and stored stale tasks stay out of plans after restart',()=>{
 const a=rewardedCandidate();a.conditions=a.conditions.filter(c=>c.requirement!=='agent-use');taskReview(a);
 expect(assessRevenuePath(db,a,now).blockers).toContain('UNREVIEWED:agent-use');
 new ResearchStore(db).import({opportunities:[{id:'task',title:'Synthetic task',sector:'software',hypothesis:'Synthetic only',forecast:{revenueCents:10000,costCents:1,probability:1,days:1,validationBudgetCents:1},revenuePath:a}],evidence:[]});
 db.close();db=new Database(join(dir,'test.db'));expect(new ResearchStore(db).plan(10000,now+3600000).plans).toEqual([]);
});
