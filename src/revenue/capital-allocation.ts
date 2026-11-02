import type { Database } from "better-sqlite3";
import {assertNoPersonnelCostInputs} from './personnel-cost-policy.js';
import { RevenueStore,validationFingerprint } from "./store.js";
import { ExperimentBudgetGovernor } from "./budget-governor.js";
import { checkCapitalBudget } from "./capital-budget.js";
import { editionAdmission, type EditionPolicy } from "./edition-policy.js";
import {latestOpportunityProfile,calibrateValidationCost} from './opportunity-profile.js';
import {opportunityDemandEvidence} from './outcome.js';
import {revalidationAdmission} from './revalidation.js';
import {profitabilitySnapshot} from './profitability.js';
import {createHash} from 'node:crypto';
import {reconciledProfitEvidence} from './profit-reconciliation.js';
import {assertNoKnownSecrets} from '../observability/redaction.js';

export interface AllocationCandidate {
  experimentId: string;
  requestedCents: number;
  maximumLossCents: number;
  evidenceQuality: number;
  liquidityDays: number;
  opportunityCostCents: number;
}
export interface AllocationConstraints {
  budgetCents: number;
  lossCapacityCents: number;
  maxPerExperimentCents: number;
  minEvidenceQuality: number;
  maxLiquidityDays: number;
  maxPerDependencyCents?:number;
  maxPerRiskFactorLossCents?:number;
  maxSwitchingHours?:number;
}
const cents = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 100_000_000;

// Compare immutable declared test scope, not merely membership in an opportunity.
// Exact matching is deliberately not a claim of equivalent real-world workloads.
function costScope(scope:{hypothesis:string;success:string|null;failure:string|null;stop:string|null;timeHours:number|null}):string|null {
  if(![scope.hypothesis,scope.success,scope.failure,scope.stop].every(v=>typeof v==='string'&&v.trim().length>0)||
    scope.timeHours===null||!Number.isFinite(scope.timeHours)||scope.timeHours<=0)return null;
  return createHash('sha256').update(JSON.stringify([scope.hypothesis,scope.success,scope.failure,scope.stop,scope.timeHours])).digest('hex');
}

/** Decision support shares real admission components. It grants no execution
 * authority and creates no parallel spending ledger. Actual adapters must still
 * reserve atomically, since this snapshot can become stale after return. */
export function planCapitalAllocation(db: Database, candidates: AllocationCandidate[], limits: AllocationConstraints, policy: EditionPolicy) {
  assertNoPersonnelCostInputs(candidates);
  assertNoPersonnelCostInputs(limits);
  if (!limits || ![limits.budgetCents,limits.lossCapacityCents,limits.maxPerExperimentCents].every(cents) ||
      !Number.isFinite(limits.minEvidenceQuality) || limits.minEvidenceQuality < 0 || limits.minEvidenceQuality > 1 ||
      !Number.isFinite(limits.maxLiquidityDays) || limits.maxLiquidityDays < 0 || candidates.length > 100 ||
      limits.maxPerDependencyCents!==undefined&&!cents(limits.maxPerDependencyCents)||
      limits.maxPerRiskFactorLossCents!==undefined&&!cents(limits.maxPerRiskFactorLossCents)||
      limits.maxSwitchingHours!==undefined&&(!Number.isFinite(limits.maxSwitchingHours)||limits.maxSwitchingHours<0)||
      new Set(candidates.map(candidate => candidate.experimentId)).size !== candidates.length) throw new Error("Invalid allocation constraints");
  return db.transaction(() => {
    const store = new RevenueStore(db), governor = new ExperimentBudgetGovernor(db);
    let used = 0, risk = 0;
    const permission = editionAdmission(policy,"experiments");
    const evidenceCache=new Map<string,ReturnType<typeof opportunityDemandEvidence>>();
    // Snapshot-local reuse only. Execution admission below remains uncached;
    // nothing survives this read transaction or substitutes for reservations.
    const truthCache=new Map<string,ReturnType<typeof profitabilitySnapshot>>();
    const profileCache=new Map<string,ReturnType<typeof latestOpportunityProfile>>();
    const historyCache=new Map<string,{forecastCostCents:number;actualCostCents:number;resolved:boolean;scope:string|null}[]>();
    const evaluated = candidates.map(candidate => {
      if (!candidate || ![candidate.requestedCents,candidate.maximumLossCents,candidate.opportunityCostCents].every(cents) ||
          !Number.isFinite(candidate.evidenceQuality) || candidate.evidenceQuality < 0 || candidate.evidenceQuality > 1 ||
          !Number.isFinite(candidate.liquidityDays) || candidate.liquidityDays < 0) throw new Error("Invalid allocation candidate");
      const experiment = store.getExperiment(candidate.experimentId);
      const reasons: string[] = [];
      let score = Number.MIN_SAFE_INTEGER;
      let evidenceState:ReturnType<typeof opportunityDemandEvidence>['state']='unvalidated';
      let profitability:ReturnType<typeof profitabilitySnapshot>|null=null;
      let expectedNetCents:number|null=null,horizonHours:number|null=null;
      let effectiveProbability:number|null=null;
      let costCalibration:(ReturnType<typeof calibrateValidationCost>&{baseCents:number;shortfallCents:number;historyRows:number;resolvedRows:number;excludedScopeRows:number;scopeDigest:string|null;comparisonBasis:string})|null=null;
      let timeCorrectionHours=0;
      let dependencyIds:string[]|null=null,riskFactorIds:string[]|null=null,switchingHours:number|null=null;
      if (!permission.allowed) reasons.push(permission.reason);
      if (!experiment || !["planned","running"].includes(experiment.status)) reasons.push("experiment_unavailable");
      else {
        if(!truthCache.has(experiment.opportunityId))truthCache.set(experiment.opportunityId,profitabilitySnapshot(db,experiment.opportunityId));
        profitability=truthCache.get(experiment.opportunityId)!;
        if(!evidenceCache.has(experiment.opportunityId))evidenceCache.set(experiment.opportunityId,opportunityDemandEvidence(db,experiment.opportunityId));
        const evidence=evidenceCache.get(experiment.opportunityId)!;
        evidenceState=evidence.state;
        if(evidence.blocked&&!revalidationAdmission(db,experiment.id,candidate.requestedCents)?.allowed)reasons.push('demand_evidence_requires_revalidation');
        score = store.getExperimentPriorityScore(experiment);
        if(!profileCache.has(experiment.opportunityId))profileCache.set(experiment.opportunityId,latestOpportunityProfile(db,experiment.opportunityId));
        const profile=profileCache.get(experiment.opportunityId)!;
        dependencyIds=profile?.dependencyIds??null;riskFactorIds=profile?.riskFactorIds??null;switchingHours=profile?.switchingHours??null;
        if(profile){
          if(profile.maximumLossCents>candidate.maximumLossCents || profile.validationCostCents>candidate.requestedCents) reasons.push("profile_underfunded_or_risk_understated");
          if(profile.evidenceQuality<limits.minEvidenceQuality || profile.liquidityDays>limits.maxLiquidityDays) reasons.push("profile_evidence_or_liquidity_limit");
        }
        if(!historyCache.has(experiment.opportunityId)){
        const previous=db.prepare("SELECT id FROM revenue_experiments WHERE opportunity_id=? AND status IN ('completed','failed','stopped') ORDER BY updated_at DESC LIMIT 100")
          .all(experiment.opportunityId) as {id:string}[];
        const verifiedCosts=new Map(reconciledProfitEvidence(db,experiment.opportunityId).filter(e=>e.mode==='live'&&e.reconciled).map(e=>[e.experimentId,e.costCents]));
        historyCache.set(experiment.opportunityId,previous.map(row=>{
          const result=store.getForecastVsActual(row.id);
          const baseline=store.getExperimentBaseline(row.id);
          return {scope:baseline?costScope(baseline):null,forecastCostCents:result?.forecastCostCents??0,actualCostCents:Math.max(result?.actualCostCents??0,verifiedCosts.get(row.id)??0),
            resolved:!!result&&result.forecastBasis==='start-snapshot'&&!db.prepare("SELECT 1 FROM inference_reservations WHERE experiment_id=? AND status='pending'").get(row.id)&&!store.hasUnresolvedOperation(row.id)};
        }));
        }
        const scopeDigest=costScope(store.getExperimentBaseline(experiment.id)??{hypothesis:experiment.hypothesis,
          success:experiment.successCriteria,failure:experiment.failureCriteria,stop:experiment.stopCondition,timeHours:experiment.forecastTimeToRevenueHours});
        const allHistory=historyCache.get(experiment.opportunityId)!;
        const history=allHistory.filter(row=>scopeDigest!==null&&row.scope===scopeDigest);
        const calibrated=calibrateValidationCost(profile?.validationCostCents??experiment.forecastCostCents,history);
        // Expose the actual decision inputs so the agent can investigate a
        // blocked forecast without guessing a new budget or treating it as approval.
        costCalibration={...calibrated,baseCents:profile?.validationCostCents??experiment.forecastCostCents,
          shortfallCents:Math.max(0,calibrated.calibratedCents-candidate.requestedCents),
          historyRows:history.length,resolvedRows:history.filter(row=>row.resolved).length,
          excludedScopeRows:allHistory.length-history.length,scopeDigest,
          comparisonBasis:'Exact declared hypothesis, criteria, stop and revenue horizon from start snapshots. Not proof of identical delivery effort, channel, prices or workload. No matching history means no learned correction, not verified zero cost.'};
        if(candidate.requestedCents<calibrated.calibratedCents)reasons.push("calibrated_cost_exceeds_request");
        if (!governor.checkDuration(experiment.id).allowed || !governor.checkTotalBudget(experiment.id,candidate.requestedCents).allowed) reasons.push("experiment_limit");
        if (!experiment.successCriteria || !experiment.failureCriteria || !experiment.stopCondition || !experiment.maxDurationHours) reasons.push("missing_validation_criteria");
        const probability = experiment.forecastProbabilitySuccess;
        const p = probability === null ? 0 : probability > 1 ? probability / 100 : probability;
        // Downward-only correction from explicitly matching, reconciled LIVE
        // target definitions. Paper wins and model claims cannot raise p.
        const calibration=profitability.accountingMode==='live'?profitability.calibration:null;
        effectiveProbability=calibration&&calibration.samples>=3&&calibration.probabilityBias!==null?
          Math.min(p,Math.max(0,p-calibration.probabilityBias)):p;
        const expectedNet = experiment.forecastRevenueCents * effectiveProbability - Math.max(experiment.forecastCostCents,calibrated.calibratedCents,candidate.requestedCents) - candidate.opportunityCostCents;
        expectedNetCents=expectedNet;horizonHours=experiment.forecastTimeToRevenueHours;
        const timing=profitability.accountingMode==='live'?profitability.economicForecastCalibration:null;
        if(horizonHours!==null&&timing&&timing.timeSamples>=3&&timing.meanTimeToRevenueErrorHours!==null&&timing.meanTimeToRevenueErrorHours>0){
          timeCorrectionHours=timing.meanTimeToRevenueErrorHours;
          horizonHours+=timeCorrectionHours;
          if(score!==Number.MIN_SAFE_INTEGER)score*=Math.max(0,experiment.forecastTimeToRevenueHours!)/horizonHours;
        }
        const originalNet=experiment.forecastRevenueCents*p-experiment.forecastCostCents;
        if(score!==Number.MIN_SAFE_INTEGER&&originalNet>0&&expectedNet>0)score*=Math.min(1,expectedNet/originalNet);
        if (!Number.isFinite(expectedNet) || expectedNet <= 0 || score === Number.MIN_SAFE_INTEGER) reasons.push("nonpositive_or_invalid_value");
      }
      if (candidate.evidenceQuality < limits.minEvidenceQuality) reasons.push("insufficient_evidence");
      if (candidate.liquidityDays > limits.maxLiquidityDays) reasons.push("illiquid");
      if (candidate.requestedCents > limits.maxPerExperimentCents) reasons.push("concentration_limit");
      if(limits.maxPerDependencyCents!==undefined&&dependencyIds===null)reasons.push('dependency_scope_unknown');
      if(limits.maxPerRiskFactorLossCents!==undefined&&riskFactorIds===null)reasons.push('risk_factor_scope_unknown');
      if(limits.maxSwitchingHours!==undefined&&(switchingHours===null||switchingHours>limits.maxSwitchingHours))reasons.push('dependency_switching_limit');
      const truthRank=profitability&&['SCALABLE','REPEATABLE','VALIDATED_PROFITABLE'].includes(profitability.state)?3:
        profitability?.state==='PAPER_VALIDATED'?2:evidenceState==='demand_observed'?1:0;
      return { ...candidate,dependencyIds,riskFactorIds,switchingHours,validationIdentity:experiment?validationFingerprint(experiment):null,opportunityId:experiment?.opportunityId??null,evidenceState,profitability,expectedNetCents,horizonHours,timeCorrectionHours,effectiveProbability,costCalibration,truthRank,
        marginalForecast:{netPerCapitalCent:expectedNetCents!==null&&candidate.requestedCents>0?expectedNetCents/candidate.requestedCents:null,
          netPerHour:expectedNetCents!==null&&horizonHours!==null&&horizonHours>0?expectedNetCents/horizonHours:null,
          netPerMaximumLossCent:expectedNetCents!==null&&candidate.maximumLossCents>0?expectedNetCents/candidate.maximumLossCents:null},
        score,reasons,eligibleBeforePortfolio:reasons.length===0,selected:false };
    // Within the same evidence tier, absolute conservative net value precedes
    // ratio-oriented priority. A tiny high-ROI task must not consume capacity
    // ahead of substantially greater net value solely because of its ratio.
    // This remains a bounded greedy proposal, not a global optimality claim.
    }).sort((a,b) => b.truthRank-a.truthRank || (b.expectedNetCents??-Infinity)-(a.expectedNetCents??-Infinity) || b.score - a.score || a.experimentId.localeCompare(b.experimentId));
    const hasPolicy = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='aureus_capital_policy'").get();
    const selectedValidations=new Set<string>();
    const dependencyCapital=new Map<string,number>(),factorLoss=new Map<string,number>();
    for (const candidate of evaluated) {
      if(candidate.validationIdentity&&selectedValidations.has(candidate.validationIdentity))candidate.reasons.push('duplicate_equivalent_validation');
      if(limits.maxPerDependencyCents!==undefined&&candidate.dependencyIds?.some(id=>(dependencyCapital.get(id)??0)+candidate.requestedCents>limits.maxPerDependencyCents!))candidate.reasons.push('shared_dependency_concentration');
      if(limits.maxPerRiskFactorLossCents!==undefined&&candidate.riskFactorIds?.some(id=>(factorLoss.get(id)??0)+candidate.maximumLossCents>limits.maxPerRiskFactorLossCents!))candidate.reasons.push('shared_risk_factor_limit');
      if (used + candidate.requestedCents > limits.budgetCents) candidate.reasons.push("budget_limit");
      if (risk + candidate.maximumLossCents > limits.lossCapacityCents) candidate.reasons.push("risk_limit");
      if (!hasPolicy || !checkCapitalBudget(db,used + candidate.requestedCents).allowed) candidate.reasons.push("shared_capital_limit");
      if (!candidate.reasons.length) {
        candidate.selected = true; used += candidate.requestedCents; risk += candidate.maximumLossCents;
        if(candidate.validationIdentity)selectedValidations.add(candidate.validationIdentity);
        for(const id of candidate.dependencyIds??[])dependencyCapital.set(id,(dependencyCapital.get(id)??0)+candidate.requestedCents);
        for(const id of candidate.riskFactorIds??[])factorLoss.set(id,(factorLoss.get(id)??0)+candidate.maximumLossCents);
      }
    }
    const alternatives=evaluated.filter(c=>c.selected).map(chosen=>({experimentId:chosen.experimentId,
      comparableAlternatives:evaluated.filter(other=>!other.selected&&other.eligibleBeforePortfolio&&other.horizonHours!==null&&other.horizonHours===chosen.horizonHours&&
        other.requestedCents===chosen.requestedCents&&other.maximumLossCents===chosen.maximumLossCents&&other.liquidityDays===chosen.liquidityDays)
        .map(other=>({experimentId:other.experimentId,forecastNetDifferenceCents:other.expectedNetCents!-chosen.expectedNetCents!,observedCounterfactual:null})),
      basis:'Comparable supplied resource/time assumptions only; forecast differential is not realized opportunity cost.'}));
    return { decision: used > 0 ? "bounded_validation_proposal" : "preserve_capital",candidates:evaluated,alternatives,
      proposedConcentration:{dependencies:[...dependencyCapital].map(([id,cents])=>({id,cents})),riskFactors:[...factorLoss].map(([id,maximumLossCents])=>({id,maximumLossCents})),
        basis:'Declared common factors within this proposal, not measured correlation or a complete existing-exposure model. Execution still requires persisted hard admission.'},
      proposedCents:used,maximumLossCents:risk,executionAuthorized:false,
      limitation:"Forecast-based proposal, not permission or reservation. Operation-specific atomic capital, budget and risk admission remains mandatory." };
  })();
}

/** Immutable proposal history, not a second profit/capital ledger and not proof
 * that the proposed allocation was executed. Explicit optional recording only. */
export function recordAllocationComparison(db:Database,id:string,candidates:AllocationCandidate[],limits:AllocationConstraints,policy:EditionPolicy){
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw new Error('Invalid comparison ID');
  const input=JSON.stringify({candidates,limits,policy});assertNoKnownSecrets({id,input});
  if(input.length>1000000)throw new Error('Comparison size exceeds review capacity');
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  return db.transaction(()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_allocation_comparisons(id TEXT PRIMARY KEY,input_digest TEXT NOT NULL,payload TEXT NOT NULL,payload_digest TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS allocation_comparison_no_update BEFORE UPDATE ON obolus_allocation_comparisons BEGIN SELECT RAISE(ABORT,'Allocation comparison immutable'); END;
      CREATE TRIGGER IF NOT EXISTS allocation_comparison_no_delete BEFORE DELETE ON obolus_allocation_comparisons BEGIN SELECT RAISE(ABORT,'Allocation comparison immutable'); END;`);
    const old=db.prepare('SELECT * FROM obolus_allocation_comparisons WHERE id=?').get(id) as {input_digest:string;payload:string;payload_digest:string}|undefined;
    if(old){if(old.input_digest!==hash(input)||old.payload_digest!==hash(old.payload))throw new Error('Conflicting or corrupt allocation comparison');return JSON.parse(old.payload) as ReturnType<typeof planCapitalAllocation>;}
    const report=planCapitalAllocation(db,candidates,limits,policy),payload=JSON.stringify(report);
    if(payload.length>1000000)throw new Error('Comparison output exceeds review capacity');
    db.prepare('INSERT INTO obolus_allocation_comparisons VALUES(?,?,?,?)').run(id,hash(input),payload,hash(payload));
    return report;
  }).immediate();
}

/** Shadow monitoring only: missing outcomes remain null; no hypothetical profit
 * is fabricated and this function has no execution/network adapter. */
export function observeAllocationComparison(db:Database,id:string){
  const row=db.prepare('SELECT payload,payload_digest FROM obolus_allocation_comparisons WHERE id=?').get(id) as {payload:string;payload_digest:string}|undefined;
  if(!row||createHash('sha256').update(row.payload).digest('hex')!==row.payload_digest)throw new Error('Missing or corrupt comparison');
  const report=JSON.parse(row.payload) as ReturnType<typeof planCapitalAllocation>;
  return db.transaction(()=>({id,executionAuthorized:false,observations:report.candidates.map(candidate=>{
    const current=new RevenueStore(db).getExperiment(candidate.experimentId);
    if(current&&candidate.opportunityId!==current.opportunityId)throw new Error('Comparison attribution changed');
    const evidence=candidate.opportunityId?reconciledProfitEvidence(db,candidate.opportunityId).find(e=>e.experimentId===candidate.experimentId&&e.reconciled):undefined;
    return {experimentId:candidate.experimentId,proposedSelected:candidate.selected,expectedNetCents:candidate.expectedNetCents,
      observedOutcome:evidence?{mode:evidence.mode,netProfitCents:evidence.netProfitCents,closedAt:evidence.closedAt}:null,
      estimatedCounterfactual:null,
      limitation:'Observed attributed outcome if available, not a causal estimate of choosing a rejected option. Snapshot selection is a proposal, not execution.'};
  })}))();
}
