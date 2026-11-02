import type {Database} from 'better-sqlite3';
import {assertNoPersonnelCostInputs} from './personnel-cost-policy.js';
import {createHash} from 'node:crypto';
import {assessOptimizationTrial} from './optimization-trials.js';
import {optimizationWorkload} from './optimization-workload.js';
import {optimizationOverhead} from './optimization-overhead.js';
export interface OptimizationPaybackInput {
 trialId:string;forecastExecutions:number;additionalOneTimeCostCents:number;
 additionalPerExecutionCostCents:number;savingsRetentionPercent:number;
 minimumNetSavingsCents:number;maximumPaybackExecutions:number;
 workload?:{lookbackDays:number;horizonDays:number};
}
/** Read-only conservative scenario, not permission to deploy or a profit forecast. */
export function assessOptimizationPayback(db:Database,input:OptimizationPaybackInput){
 assertNoPersonnelCostInputs(input);
 if(!input||typeof input.trialId!=='string'||!/^[a-f0-9]{64}$/.test(input.trialId)||
  ![input.forecastExecutions,input.maximumPaybackExecutions].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=1000000)||
  ![input.additionalOneTimeCostCents,input.additionalPerExecutionCostCents,input.minimumNetSavingsCents].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000)||
  !Number.isSafeInteger(input.savingsRetentionPercent)||input.savingsRetentionPercent<1||input.savingsRetentionPercent>100)
  throw Error('Explicit bounded cost and workload assumptions required');
 const assumptions:OptimizationPaybackInput={trialId:input.trialId,forecastExecutions:input.forecastExecutions,additionalOneTimeCostCents:input.additionalOneTimeCostCents,
  additionalPerExecutionCostCents:input.additionalPerExecutionCostCents,savingsRetentionPercent:input.savingsRetentionPercent,
  minimumNetSavingsCents:input.minimumNetSavingsCents,maximumPaybackExecutions:input.maximumPaybackExecutions,
  ...(input.workload?{workload:{lookbackDays:input.workload.lookbackDays,horizonDays:input.workload.horizonDays}}:{})};
 return db.transaction(()=>{
  const replication=assessOptimizationTrial(db,input.trialId);
  const parent=replication.parentTrialId?assessOptimizationTrial(db,replication.parentTrialId):null;
  const blockers:string[]=[];
  const overhead=optimizationOverhead(db,parent?[parent.trialId,replication.trialId]:[replication.trialId]);
  if(input.additionalOneTimeCostCents<overhead.recordedCostCents)blockers.push('declared_cost_below_recorded_overhead');
  const workload=assumptions.workload?optimizationWorkload(db,input.trialId,assumptions.workload.lookbackDays,assumptions.workload.horizonDays):null;
  if(!workload)blockers.push('workload_evidence_required');
  else{blockers.push(...workload.blockers);if(input.forecastExecutions>workload.supportedExecutions)blockers.push('forecast_exceeds_observed_workload');}
  if(replication.phase!=='replication'||!parent)blockers.push('held_out_replication_required');
  const reports=parent?[parent,replication]:[replication];
  for(const [index,report] of reports.entries()){
   if(!report.recipesBound||report.qualityBasis!=='registered-output-digest-v1')blockers.push(`trial_${index}_unbound`);
   if(!report.collection.allDirectlyCollected)blockers.push(`trial_${index}_not_directly_collected`);
   if(report.comparison?.decision!=='candidate_for_replication')blockers.push(`trial_${index}_incomplete_or_failed`);
  }
  let projection:null|{measuredTrialCostCents:number;totalInvestmentCents:number;minimumObservedSavingsPerExecutionCents:number;
   projectedNetSavingsPerExecutionCents:number;projectedTotalNetSavingsCents:number;paybackExecutions:number|null}=null;
  if(parent?.comparison&&replication.comparison){
   const a=parent.comparison,b=replication.comparison;
   const measured=BigInt(a.baselineCostCents)+BigInt(a.candidateCostCents)+BigInt(b.baselineCostCents)+BigInt(b.candidateCostCents);
   const total=measured+BigInt(Math.max(input.additionalOneTimeCostCents,overhead.recordedCostCents));
   const minimum=Math.min(a.minimumPairedSavingsCents,b.minimumPairedSavingsCents);
   const per=BigInt(Math.max(0,minimum))*BigInt(input.savingsRetentionPercent)/100n-BigInt(input.additionalPerExecutionCostCents);
   const net=per*BigInt(input.forecastExecutions)-total;
   const payback=per>0n?(total+per-1n)/per:null;
   for(const n of [measured,total,per,net,...(payback===null?[]:[payback])])if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Unsafe payback totals');
   projection={measuredTrialCostCents:Number(measured),totalInvestmentCents:Number(total),minimumObservedSavingsPerExecutionCents:minimum,
    projectedNetSavingsPerExecutionCents:Number(per),projectedTotalNetSavingsCents:Number(net),paybackExecutions:payback===null?null:Number(payback)};
   if(minimum<=0||per<=0n)blockers.push('no_conservative_unit_savings');
   if(net<=0n||net<BigInt(input.minimumNetSavingsCents))blockers.push('insufficient_projected_net_savings');
   if(payback===null||payback>BigInt(input.maximumPaybackExecutions)||payback>BigInt(input.forecastExecutions))blockers.push('payback_horizon_exceeded');
  }
  const evidence={assumptions,parent,replication,projection,workload,overhead};
  return {scenarioId:createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),assumptions,currency:'USD',projection,workload,overhead,blockers,
   decision:blockers.length?'do_not_introduce':'scenario_supports_controlled_trial',adoptionAuthorized:false,profitabilityProven:false,
   limitation:'Local inference accounting plus explicitly supplied assumptions. Workload is bounded by historical local activity, not authenticated production demand or a guarantee of future work. Additional costs must include evaluation, engineering, failed prior trials, deployment, monitoring and external services without double counting. Their completeness remains unverified. Minimum observed savings are not a statistical guarantee. No automatic deployment, budget change, or claim of realized profit.'};
 })();
}
