import type {Database} from 'better-sqlite3';
import {actionContextDigest,assertActionGate,securityTransaction,type ActionScope} from '../security/action-gate.js';
import {IsolatedJobLedger,isolatedJobScope,type IsolatedTextFile} from '../security/isolated-job-ledger.js';
import {assertReviewedRuntime,runReviewedTextCheck,type ReviewedRuntimeBinding} from '../security/reviewed-runtime-binding.js';
import {runReservedOperation} from '../revenue/reserved-operation.js';
import {assertAdapterPermission} from '../revenue/adapter-permissions.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {checkCapitalBudget} from '../revenue/capital-budget.js';
import {assessProductQuality,inspectProductQuality,inspectProductLanguage} from './product-quality.js';

export const BOUNDED_PRODUCT_ADAPTER='bounded-product-check';
export interface BoundedProductCheck {id:string;productId:string;experimentId:string;file:IsolatedTextFile}
export function boundedProductScope(input:BoundedProductCheck):ActionScope {
  if(!input||Object.keys(input).sort().join(',')!=='experimentId,file,id,productId'||
    typeof input.productId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.productId)||
    typeof input.experimentId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.experimentId))throw Error('Invalid bounded product request');
  const scope=isolatedJobScope(input.id,[input.file]);
  if(!/\.(txt|json)$/.test(input.file.name))throw Error('Only text or JSON drafts supported');
  return {activity:'bounded-product-check',component:BOUNDED_PRODUCT_ADAPTER,dataClass:'INTERNAL',
    contextDigest:actionContextDigest({input,isolated:scope.contextDigest,version:1})};
}
/** Deterministic draft acceptance receipt; no edits, publishing or generated code.
 * Existing experiment, capital policy, adapter permission and quality contract
 * are required. Zero means no external bill, NOT zero electricity/operator cost. */
export async function runBoundedProductCheck(db:Database,binding:ReviewedRuntimeBinding,input:BoundedProductCheck){
  const scope=boundedProductScope(input),bound=Object.freeze({...input,file:Object.freeze({...input.file})});
  const check=()=>{
    assertReviewedRuntime(binding);
    assertActionGate(db,scope,Date.now(),['bounded-draft-workflow']);
    assertAdapterPermission(db,BOUNDED_PRODUCT_ADAPTER,bound.experimentId,0);
    const policy=db.prepare('SELECT halted FROM inference_budget_policy WHERE id=1').get() as {halted:number}|undefined;
    if(policy?.halted!==0)throw Error('Spending stopped');
    const governor=new ExperimentBudgetGovernor(db);
    if(!governor.checkDuration(bound.experimentId).allowed||!governor.checkTotalBudget(bound.experimentId,0).allowed||!checkCapitalBudget(db,0).allowed)
      throw Error('Current experiment, research or capital admission blocked');
    const assessment=inspectProductQuality(db,bound.productId,bound.file.name,Buffer.from(bound.file.text));
    if(!assessment.passed)throw Error('Draft technical quality blocked');
    const language=inspectProductLanguage(db,bound.productId,bound.file.name,Buffer.from(bound.file.text));
    if(language.status!=='not_required_by_contract'&&!language.passed)throw Error('Draft language quality blocked');
    return assessment;
  };
  class GatedLedger extends IsolatedJobLedger {
    override assertDispatch(id:string,token:string,files:readonly IsolatedTextFile[]){check();super.assertDispatch(id,token,files);}
    override assertActive(id:string,token:string,files:readonly IsolatedTextFile[]){check();super.assertActive(id,token,files);}
    override complete(id:string,token:string,output:readonly IsolatedTextFile[],exitCode:number){
      securityTransaction(db,()=>{check();super.complete(id,token,output,exitCode);}).immediate();
    }
  }
  const first=check(),ledger=new GatedLedger(db);
  const operation={id:'op_'+bound.id,adapter:BOUNDED_PRODUCT_ADAPTER,experimentId:bound.experimentId,maxCostUsdCents:0,
    purpose:actionContextDigest({scope,assessment:first.assessmentId})};
  const cost=await runReservedOperation(db,operation,async()=>{
    check();
    if(await runReviewedTextCheck(binding,ledger,bound.id,[bound.file])!=='completed')throw Error('Draft runtime requires reconciliation');
    // Accept only a current identical contract and assessment, not a prior pass.
    const final=check();if(final.assessmentId!==first.assessmentId)throw Error('Draft quality changed');
    return {actualCostUsdCents:0};
  },()=>{check();});
  return securityTransaction(db,()=>{
    const final=check();if(final.assessmentId!==first.assessmentId||ledger.get(bound.id)?.state!=='completed')throw Error('Draft acceptance unavailable');
    assessProductQuality(db,bound.productId,bound.file.name,Buffer.from(bound.file.text));
    return {kind:'bounded-draft-technical-check' as const,assessment:final,duplicate:cost.duplicate,
      externalCostUsdCents:0,localOperatingCost:'unmeasured' as const,liveReady:false,productionAccepted:false,
      limitation:'Fixed fixture and deterministic technical quality only; language, rights, factual accuracy, demand and production release are not established.'};
  }).immediate();
}
