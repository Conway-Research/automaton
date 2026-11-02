import type {Database} from 'better-sqlite3';
import {profitabilitySnapshot} from './profitability.js';
import {reconciledProfitEvidence} from './profit-reconciliation.js';
import {latestOpportunityProfile} from './opportunity-profile.js';

/** Reuse the registered Truth confidence intervals instead of a second trial
 * engine. Read-only, fixed bounded candidate set; never changes a strategy or
 * releases capital. Runtime statistical family spending covers selection among
 * registered policies, conditional on the assumptions behind those bounds. */
export function compareProfitabilityAlternatives(db:Database,championId:string,challengers:{opportunityId:string;switchingCostCents:number}[]){
  const id=(s:unknown):s is string=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
  if(!id(championId)||!Array.isArray(challengers)||!challengers.length||challengers.length>10||
    new Set(challengers.map(c=>c.opportunityId)).size!==challengers.length||challengers.some(c=>!c||!id(c.opportunityId)||c.opportunityId===championId||
      !Number.isSafeInteger(c.switchingCostCents)||c.switchingCostCents<0||c.switchingCostCents>100000000))throw new Error('Invalid bounded strategy comparison');
  return db.transaction(()=>{
    const champion=profitabilitySnapshot(db,championId),profile=latestOpportunityProfile(db,championId);
    const evidence=reconciledProfitEvidence(db,championId).filter(e=>e.reconciled&&e.mode===champion.accountingMode);
    const eligible=(s:ReturnType<typeof profitabilitySnapshot>)=>['PAPER_VALIDATED','VALIDATED_PROFITABLE','REPEATABLE','SCALABLE'].includes(s.state);
    const dimensions=['capitalRequiredCents','timeToValidationHours','timeToRevenueHours','maximumLossCents','liquidityDays'] as const;
    const candidates=challengers.map(c=>{
      const state=profitabilitySnapshot(db,c.opportunityId),otherProfile=latestOpportunityProfile(db,c.opportunityId);
      const observed=reconciledProfitEvidence(db,c.opportunityId).filter(e=>e.reconciled&&e.mode===state.accountingMode);
      const reasons:string[]=[];
      if(!eligible(champion)||!eligible(state))reasons.push('current_validated_evidence_required');
      if(!champion.accountingMode||champion.accountingMode!==state.accountingMode)reasons.push('noncomparable_accounting_modes');
      if(!profile||!otherProfile||dimensions.some(k=>profile[k]!==otherProfile[k]))reasons.push('noncomparable_declared_resource_horizon');
      const bases=new Set([...evidence,...observed].map(e=>e.comparisonBasis));
      if(bases.size!==1)reasons.push('noncomparable_sample_basis');
      const keys=new Set(evidence.map(e=>e.sampleUnitId));
      if(observed.some(e=>keys.has(e.sampleUnitId)))reasons.push('shared_sample_units');
      const lower=state.calibration?.lowerNetCents??null,upper=champion.calibration?.upperNetCents??null;
      const conservativeAdvantage=lower===null||upper===null?null:lower-upper-c.switchingCostCents;
      if(conservativeAdvantage===null||conservativeAdvantage<=0)reasons.push('insufficient_net_advantage_after_switching');
      return {...c,state:state.state,mode:state.accountingMode,conservativeAdvantageCents:conservativeAdvantage,reasons,
        recommendation:reasons.length?'retain_champion':state.accountingMode==='paper'?'candidate_for_further_validation':'candidate_for_controlled_reallocation'};
    }).sort((a,b)=>Number(!b.reasons.length)-Number(!a.reasons.length)||(b.conservativeAdvantageCents??-Infinity)-(a.conservativeAdvantageCents??-Infinity)||a.opportunityId.localeCompare(b.opportunityId));
    return {championId,championState:champion.state,candidates,executionAuthorized:false,
      recommendedCandidate:candidates.find(c=>c.recommendation==='candidate_for_controlled_reallocation')?.opportunityId??null,
      limitation:'Conditional confidence comparison of registered comparable samples, not causal superiority or guaranteed future returns. Full switching cost is charged against one comparable sample conservatively. Unknown resource comparability, shared samples, stale/invalid evidence and paper/live mixing prohibit replacement. Existing capital, risk, permissions and fresh execution admission remain mandatory.'};
  })();
}

/** Pricing is a narrower comparison than competing businesses: hold product,
 * channel, exposure count and observation duration constant. Reuse reconciled
 * cohorts and the same statistical family; do not invent a causal price effect
 * or a second profit ledger. Deployment still requires a controlled replication. */
export function comparePricingAlternatives(db:Database,championId:string,challengers:{opportunityId:string;switchingCostCents:number}[]){
  return db.transaction(()=>{
    const comparison=compareProfitabilityAlternatives(db,championId,challengers);
    const cohort=(id:string)=>{
      const truth=profitabilitySnapshot(db,id);
      const rows=reconciledProfitEvidence(db,id).filter(e=>e.reconciled&&e.mode===truth.accountingMode);
      const business=rows.map(e=>e.business);
      const reasons:string[]=[];
      if(!business.length||business.some(b=>!b||b.exposures===null||b.exposures<=0||b.windowHours<=0||b.deliveryCostCents===null||b.supportCostCents===null||b.renewalEligible===null))reasons.push('incomplete_pricing_cohort');
      const first=business[0];
      if(business.some(b=>!b?.attribution))reasons.push('missing_product_segment_lineage');
      const lineage=(b:typeof first)=>b?.attribution?JSON.stringify({...b.attribution,experimentId:null,activated:null,reused:null,refundedOrders:null,supportCases:null,evidenceDigest:null}):null;
      if(business.some(b=>lineage(b)!==lineage(first)))reasons.push('noncomparable_segment_variant_or_quality');
      const dimensions=['productId','channelId','priceCents','exposures','windowHours'] as const;
      if(first&&business.some(b=>!b||dimensions.some(k=>b[k]!==first[k])))reasons.push('uncontrolled_within_arm_variation');
      if(new Set(business.filter(b=>b!==null).map(b=>b.cohortId)).size!==business.length)reasons.push('repeated_customer_cohort');
      return {rows,business,first,reasons};
    };
    const baseline=cohort(championId);
    const candidates=comparison.candidates.map(candidate=>{
      const other=cohort(candidate.opportunityId),reasons=[...candidate.reasons,...baseline.reasons,...other.reasons];
      const a=baseline.first,b=other.first;
      if(!a||!b||['productId','channelId','exposures','windowHours'].some(k=>a[k as keyof typeof a]!==b[k as keyof typeof b]))reasons.push('noncomparable_pricing_arms');
      if(a&&b&&a.priceCents===b.priceCents)reasons.push('no_price_variant');
      if(a?.attribution&&b?.attribution&&['productDigest','requirementsDigest','audience','language','region','channel','variant','hypothesisId','messageDigest','quality'].some(k=>a.attribution![k as keyof typeof a.attribution]!==b.attribution![k as keyof typeof b.attribution]))reasons.push('noncomparable_product_segment_or_message');
      const cohorts=new Set(baseline.business.filter(v=>v!==null).map(v=>v.cohortId));
      if(other.business.some(v=>v&&cohorts.has(v.cohortId)))reasons.push('shared_customer_cohorts');
      return {...candidate,reasons:[...new Set(reasons)],championPriceCents:a?.priceCents??null,candidatePriceCents:b?.priceCents??null,
        observations:other.business.slice(-20),observationsTruncated:other.business.length>20,causalPriceEffect:null,
        recommendation:reasons.length?'retain_current_price':'candidate_for_controlled_price_replication'};
    });
    return {championId,candidates,executionAuthorized:false,priceChangeAuthorized:false,
      limitation:'Observed reconciled cohorts with matching declared exposure, duration, product and channel. Random assignment, population comparability and long-term retention are not authenticated by these aggregates; no causal elasticity, lifetime value or automatic price change is inferred. Use existing bounded experiments for replication and recheck costs/refunds/support/retention and all capital gates.'};
  })();
}
