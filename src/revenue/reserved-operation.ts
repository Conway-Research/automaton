import {securityTransaction} from '../security/action-gate.js';
import type {Database} from 'better-sqlite3';
import {reserveCapitalCommitment,settleCapitalCommitment} from './capital-budget.js';
import {ExperimentBudgetGovernor} from './budget-governor.js';
import {RevenueStore} from './store.js';
import {assertAdapterPermission} from './adapter-permissions.js';

export interface PricedOperation {id:string;adapter:string;purpose:string;maxCostUsdCents:number;experimentId:string}
/** Trusted adapter boundary. No shell, wallets or network are provided by this module.
 * Uncertain executions retain their reservation and are never retried automatically.
 */
export async function runReservedOperation(db:Database,input:PricedOperation,
  execute:(idempotencyKey:string)=>Promise<{actualCostUsdCents:number}>,
  recordCost:(actualCostUsdCents:number)=>void) {
  if(!input||!/^op_[A-Za-z0-9_-]{1,90}$/.test(input.id)||! /^[a-z][a-z0-9_-]{0,60}$/.test(input.adapter)||
    typeof input.experimentId!=='string'||!input.experimentId||input.experimentId.length>100||typeof input.purpose!=='string'||!input.purpose.trim()||input.purpose.length>1000||
    !Number.isSafeInteger(input.maxCostUsdCents)||input.maxCostUsdCents<0||input.maxCostUsdCents>100000000)throw new Error('Invalid priced operation');
  input={...input}; // The caller must not change identity or ceiling while a provider is awaited.
  const payload=JSON.stringify({adapter:input.adapter,purpose:input.purpose,maxCostUsdCents:input.maxCostUsdCents,experimentId:input.experimentId});
  const prior=securityTransaction(db,()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_reserved_operations(id TEXT PRIMARY KEY,payload TEXT NOT NULL,status TEXT NOT NULL,actual_cost INTEGER);`);
    const old=db.prepare('SELECT payload,status,actual_cost FROM obolus_reserved_operations WHERE id=?').get(input.id) as {payload:string;status:string;actual_cost:number|null}|undefined;
    if(old){
      if(old.payload!==payload)throw new Error('Conflicting operation ID');
      if(old.status!=='settled')throw new Error('Operation requires reconciliation; automatic retry forbidden');
      // null is the new-operation sentinel below, never a valid settled receipt.
      // Damaged persistent data must not turn a replay into another execution.
      if(typeof old.actual_cost!=='number'||!Number.isSafeInteger(old.actual_cost)||old.actual_cost<0||old.actual_cost>100000000)
        throw new Error('Invalid persisted operation cost; reconciliation required');
      return old.actual_cost;
    }
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_capital_policy' AND type='table'").get()||
      !db.prepare('SELECT 1 FROM aureus_capital_policy WHERE id=1').get())throw new Error('Capital policy required');
    const policy=db.prepare('SELECT halted FROM inference_budget_policy WHERE id=1').get() as {halted:number}|undefined;
    if(!policy||policy.halted!==0)throw new Error('Shared spending stopped or unconfigured');
    const experiment=new RevenueStore(db).getExperiment(input.experimentId);
    if(!experiment||experiment.status!=='running'||!experiment.startedAt||!Number.isFinite(experiment.maxDurationHours)||experiment.maxDurationHours!<=0||
      !experiment.successCriteria?.trim()||!experiment.failureCriteria?.trim()||!experiment.stopCondition?.trim())throw new Error('Running bounded experiment with criteria required');
    const governor=new ExperimentBudgetGovernor(db);
    const duration=governor.checkDuration(input.experimentId),budget=governor.checkTotalBudget(input.experimentId,input.maxCostUsdCents);
    if(!duration.allowed||!budget.allowed)throw new Error(duration.reason??budget.reason??'Experiment admission denied');
    assertAdapterPermission(db,input.adapter,input.experimentId,input.maxCostUsdCents);
    if(db.prepare('SELECT 1 FROM aureus_capital_commitments WHERE id=?').get(input.id))throw new Error('Existing commitment requires reconciliation');
    reserveCapitalCommitment(db,input.id,input.purpose,input.maxCostUsdCents);
    db.prepare("INSERT INTO obolus_reserved_operations VALUES(?,?,'pending',NULL)").run(input.id,payload);
    return null;
  }).immediate();
  if(prior!==null)return {duplicate:true,actualCostUsdCents:prior};
  // Once admitted, cancellation cannot prove that an external provider did not act.
  const receipt=await execute(input.id);
  if(!receipt||!Number.isSafeInteger(receipt.actualCostUsdCents)||receipt.actualCostUsdCents<0||receipt.actualCostUsdCents>100000000)throw new Error('Invalid cost receipt; reconciliation required');
  return settleReservedOperation(db,input.id,receipt.actualCostUsdCents,recordCost);
}

/** Trusted settlement boundary; external evidence must be verified by the adapter/operator. */
export function settleReservedOperation(db:Database,id:string,actualCostUsdCents:number,recordCost:(n:number)=>void) {
  if(!Number.isSafeInteger(actualCostUsdCents)||actualCostUsdCents<0||actualCostUsdCents>100000000)throw new Error('Invalid operation cost');
  return securityTransaction(db,()=>{
    const row=db.prepare('SELECT payload,status,actual_cost FROM obolus_reserved_operations WHERE id=?').get(id) as {payload:string;status:string;actual_cost:number|null}|undefined;
    if(!row)throw new Error('Unknown operation');
    if(row.status==='settled') {
      if(row.actual_cost!==actualCostUsdCents)throw new Error('Conflicting operation settlement');
      return {duplicate:true,actualCostUsdCents};
    }
    if(row.status!=='pending')throw new Error('Invalid operation state');
    // Both states are written atomically below. A pre-existing capital
    // settlement here is contradictory, not permission to skip cost recording.
    if(db.prepare('SELECT 1 FROM aureus_capital_settlements WHERE id=?').get(id))
      throw new Error('Pending operation has existing capital settlement; reconciliation required');
    const input=JSON.parse(row.payload) as PricedOperation;
    if(!input.experimentId)throw new Error('Legacy operation requires explicit attribution');
    settleCapitalCommitment(db,id,actualCostUsdCents,()=>{
      const total=()=> (db.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM economic_events WHERE experiment_id=? AND currency='USD' AND event_type IN ('cost','refund')").get(input.experimentId) as {n:number}).n;
      const before=total();recordCost(actualCostUsdCents);
      if(total()-before!==actualCostUsdCents)throw new Error('Cost must be attributed to the admitted experiment');
    });
    db.prepare("UPDATE obolus_reserved_operations SET status='settled',actual_cost=? WHERE id=?").run(actualCostUsdCents,id);
    if(actualCostUsdCents>input.maxCostUsdCents) {
      db.prepare('UPDATE inference_budget_policy SET halted=1,revision=revision+1 WHERE id=1').run();
      db.prepare("INSERT INTO inference_budget_audit(action,detail) VALUES('halt',?)").run(JSON.stringify({reason:'Priced operation exceeded reservation',operationId:id}));
    }
    return {duplicate:false,actualCostUsdCents};
  }).immediate();
}
