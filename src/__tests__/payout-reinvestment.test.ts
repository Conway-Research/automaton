import {fixtureGrantAdapterPermission as grantAdapterPermission} from './fixtures/security-review.js';
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget,checkCapitalBudget} from '../revenue/capital-budget.js';
import {recordReconciledPayout} from '../revenue/payout-reconciliation.js';
import {recordReconciledCash} from '../revenue/capital-receipts.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {runReservedOperation} from '../revenue/reserved-operation.js';

it('reinvests only received cash after retention and conservative FX with concurrent admission, restart and later debit',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-reinvest-')),file=path.join(dir,'db');
 const a=createDatabase(file);let b=createDatabase(file);
 try{
  a.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('e','o','running','test',100,1,'success','failure','stop',datetime('now'))");
  initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:100,chfPerUsdNumerator:3,chfPerUsdDenominator:2,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(a.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  grantAdapterPermission(a.raw,{adapter:'mock',experimentId:'e',maxCostUsdCents:100,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'});
  const input={id:'op_reinvest',adapter:'mock',experimentId:'e',purpose:'synthetic reinvestment',maxCostUsdCents:53};
  let finish!:(receipt:{actualCostUsdCents:number})=>void;
  const provider=vi.fn(()=>new Promise<{actualCostUsdCents:number}>(resolve=>{finish=resolve;}));
  const record=(n:number)=>{a.raw.prepare("INSERT INTO economic_events(id,event_type,amount_cents,experiment_id,currency) VALUES('cost','cost',?,'e','USD')").run(n);};
  await expect(runReservedOperation(a.raw,input,provider,record)).rejects.toThrow('capital exhausted');
  expect(provider).not.toHaveBeenCalled();
  const cash={accountRef:'fixture-bank',transactionRef:'fixture-transfer',kind:'receipt' as const,cashChfCents:100,retainedChfCents:20,evidenceSha256:'a'.repeat(64),reviewedBy:'synthetic fixture only'};
  const payout={providerAccount:'fixture-provider',payoutId:'fixture-payout',mode:'live' as const,cash};
  recordReconciledPayout(a.raw,payout);
  expect(checkCapitalBudget(b.raw,53).allowed).toBe(true);
  expect(checkCapitalBudget(b.raw,54).allowed).toBe(false);
  const pending=runReservedOperation(a.raw,input,provider,record);
  b.close();b=createDatabase(file);
  expect(recordReconciledPayout(b.raw,payout)).toEqual({duplicate:true});
  await expect(runReservedOperation(b.raw,{...input,id:'op_parallel',maxCostUsdCents:1},provider,()=>{})).rejects.toThrow('capital exhausted');
  expect(provider).toHaveBeenCalledTimes(1);
  finish({actualCostUsdCents:50});await pending;
  expect(checkCapitalBudget(b.raw,0).remainingChfCents).toBe(5);
  expect(checkCapitalBudget(b.raw,3).allowed).toBe(true);
  expect(checkCapitalBudget(b.raw,4).allowed).toBe(false);
  recordReconciledCash(b.raw,{...cash,transactionRef:'fixture-debit',kind:'debit',cashChfCents:6,retainedChfCents:0});
  await expect(runReservedOperation(b.raw,{...input,id:'op_after_debit',maxCostUsdCents:0},provider,()=>{})).rejects.toThrow('capital exhausted');
  expect(provider).toHaveBeenCalledTimes(1);
 }finally{b.close();a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
