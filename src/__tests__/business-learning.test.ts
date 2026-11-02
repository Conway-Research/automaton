import {it,expect} from 'vitest';
import {businessLearningProjection} from '../revenue/business-learning.js';
import {canonicalBusinessCohort,businessPerformance,type BusinessCohort} from '../revenue/business-performance.js';
import type {reconciledProfitEvidence} from '../revenue/profit-reconciliation.js';
import {isProtectedFile} from '../self-mod/code.js';
import {claimDigest} from '../commerce/claim-evidence.js';

const cohort=():BusinessCohort=>({cohortId:'one',channelId:'search',productId:'p',priceCents:1000,exposures:100,leads:20,customers:10,newCustomers:10,orders:10,
 renewalEligible:5,renewed:4,subscriptionRevenueCents:0,deliveryCostCents:100,supportCostCents:100,
 attribution:{audience:'small-business',language:'de',region:'CH',channel:'search',variant:'v1',productDigest:'a'.repeat(64),requirementsDigest:'b'.repeat(64),qualityDecisionDigest:'c'.repeat(64),
 hypothesisId:'h',hypothesisDigest:claimDigest('h'),experimentId:'e',campaignId:'campaign',messageDigest:'d'.repeat(64),evidenceDigest:'e'.repeat(64),provenance:'ABGESTIMMT',quality:'passed',activated:8,reused:4,refundedOrders:1,supportCases:2,representativeSample:true,costsComplete:true}});
function row():ReturnType<typeof reconciledProfitEvidence>[number]{
 return {experimentId:'e',sourceId:'mock-authenticated-source',statementDigest:'a'.repeat(64),revision:0,mode:'live',revenueCents:10000,costCents:400,
 sampleUnitId:'one',comparisonBasis:'fixed',conditions:{},business:businessPerformance(cohort(),10000,400,100,0,1000),deployment:null,netProfitCents:9600,startedAt:0,closedAt:1000,observedAt:1000,
 baseline:{forecastRevenueCents:10000,forecastCostCents:500,probability:0.5,timeHours:1,hypothesis:'h',success:'demand',failure:'no demand',stop:'cost'},reconciled:true};
}
it('jointly exposes scoped quality, demand, conversion, activation, reuse, refunds, support and net contribution',()=>{
 const result=businessLearningProjection([row()]);expect(result.groups).toHaveLength(1);
 expect(result.groups[0]).toMatchObject({samples:1,meanNetContributionCents:9600,scalingAuthorized:false,revalidationRequired:true,reasons:['small_sample']});
 expect(result.groups[0].observations[0].metrics).toMatchObject({conversionRate:0.1,renewalRate:0.8,totalCostCents:400,attribution:{activated:8,reused:4,refundedOrders:1,supportCases:2,quality:'passed'}});
 expect(isProtectedFile('src/revenue/business-learning.ts')).toBe(true);
});
it.each(['PROGNOSE','SIMULATION','LOKALE_FIXTURE','EXTERN_BEOBACHTET','UNBEKANNT'] as const)('never promotes unconfirmed %s data to real learning',provenance=>{
 const r=row();r.business!.attribution!.provenance=provenance;r.reconciled=false;
 expect(businessLearningProjection([r])).toMatchObject({groups:[],excluded:[{reason:'not_reconciled_external_observation'}]});
});
it.each(['quality','cost','refund','selection','lifecycle','paper','legacy'] as const)('holds %s regressions instead of treating cheaper execution as improvement',failure=>{
 const r=row(),a=r.business!.attribution!;
 if(failure==='quality')a.quality='failed';if(failure==='cost')a.costsComplete=false;
 if(failure==='refund')a.refundedOrders=null;if(failure==='selection')a.representativeSample=false;
 if(failure==='lifecycle')a.reused=null;if(failure==='paper')r.mode='paper';if(failure==='legacy')delete r.business!.attribution;
 expect(businessLearningProjection([r]).groups).toEqual([]);
});
it.each(['audience','region','language','variant','productDigest','qualityDecisionDigest','messageDigest'] as const)('does not pool different %s',field=>{
 const a=row(),b=row();b.experimentId='second';b.business!.attribution!.experimentId='second';b.sampleUnitId='two';b.business!.cohortId='two';b.startedAt=2000;b.closedAt=3000;
 b.business!.attribution![field]=field.endsWith('Digest')?'f'.repeat(64):field==='region'?'DE':field==='language'?'en':'different';
 expect(businessLearningProjection([a,b]).groups).toHaveLength(2);
});
it('detects duplicate samples and overlapping cohorts without multiplying success',()=>{
 expect(businessLearningProjection([row(),row()]).groups[0]).toMatchObject({realLearningEligible:false,meanNetContributionCents:null,scalingAuthorized:false});
});
it('rejects wrong-channel and impossible reuse counts at the canonical input boundary',()=>{
 const c=cohort();c.attribution!.channel='other';expect(()=>canonicalBusinessCohort(c,10000,400,100)).toThrow('attribution');
 c.attribution!.channel='search';c.attribution!.reused=9;expect(()=>canonicalBusinessCohort(c,10000,400,100)).toThrow('attribution');
});
it('excludes an outcome relabeled as another experiment or start hypothesis',()=>{
 const r=row();r.business!.attribution!.experimentId='other';
 expect(businessLearningProjection([r]).excluded[0].reason).toBe('experiment_hypothesis_mismatch');
 r.business!.attribution!.experimentId=r.experimentId;r.business!.attribution!.hypothesisDigest=claimDigest('post-hoc hypothesis');
 expect(businessLearningProjection([r]).groups).toHaveLength(0);
});
