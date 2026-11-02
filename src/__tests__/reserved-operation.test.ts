import {fixtureGrantAdapterPermission as grantAdapterPermission} from './fixtures/security-review.js';
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {runReservedOperation} from '../revenue/reserved-operation.js';
import {reconcileOperation} from '../revenue/operation-reconciliation.js';
import {revokeAdapterPermission} from '../revenue/adapter-permissions.js';
function seed(db:any) {
 db.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('e','o','running','test',100,1,'success','failure','stop',datetime('now'))");
 grantAdapterPermission(db,{adapter:'mock',experimentId:'e',maxCostUsdCents:100,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'});
}
it('enforces scoped adapter grants across connections, revocation and reopening without effects',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-permission-')),file=path.join(dir,'db');
 const a=createDatabase(file),b=createDatabase(file);
 try{
  seed(a.raw);
  initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(a.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  const input={id:'op_grant',adapter:'unapproved',experimentId:'e',purpose:'fixture',maxCostUsdCents:10};
  const execute=vi.fn(async()=>({actualCostUsdCents:0}));
  await expect(runReservedOperation(b.raw,input,execute,()=>{})).rejects.toThrow('permission');
  const grant={adapter:input.adapter,experimentId:'e',maxCostUsdCents:9,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'};
  grantAdapterPermission(a.raw,grant);
  await expect(runReservedOperation(b.raw,input,execute,()=>{})).rejects.toThrow('permission');
  grantAdapterPermission(a.raw,{...grant,maxCostUsdCents:10});
  revokeAdapterPermission(b.raw,input.adapter,'e');
  const reopened=createDatabase(file);
  try{await expect(runReservedOperation(reopened.raw,input,execute,()=>{})).rejects.toThrow('permission');}finally{reopened.close();}
  grantAdapterPermission(a.raw,{...grant,maxCostUsdCents:10});
  a.raw.prepare('UPDATE obolus_adapter_permissions SET expires_ms=0 WHERE adapter=?').run(input.adapter);
  await expect(runReservedOperation(b.raw,input,execute,()=>{})).rejects.toThrow('permission');
  expect(execute).not.toHaveBeenCalled();
  expect(a.raw.prepare('SELECT COUNT(*) n FROM aureus_capital_commitments').get()).toEqual({n:0});
  expect(()=>grantAdapterPermission(a.raw,{...grant,expiresAt:Date.now()+2*86400000})).toThrow('duration');
  grantAdapterPermission(a.raw,{...grant,maxCostUsdCents:10});
  expect(await runReservedOperation(b.raw,input,execute,()=>{})).toMatchObject({duplicate:false,actualCostUsdCents:0});
  revokeAdapterPermission(a.raw,input.adapter,'e');
  expect(await runReservedOperation(a.raw,input,execute,()=>{})).toMatchObject({duplicate:true});
  expect(execute).toHaveBeenCalledTimes(1);
 }finally{b.close();a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
it('settles actual costs once and halts future admission when an adapter overruns',async()=>{
 const db=createDatabase(':memory:');
 try{
  seed(db.raw);
  initializeCapitalBudget(db.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(db.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  const input={id:'op_paid',adapter:'mock',experimentId:'e',purpose:'fixture',maxCostUsdCents:10};
  const execute=vi.fn(async()=>({actualCostUsdCents:15}));
  const record=vi.fn((n:number)=>{db.raw.prepare("INSERT INTO economic_events(id,event_type,amount_cents,experiment_id) VALUES('fixture','cost',?,'e')").run(n);});
  db.raw.exec("UPDATE revenue_experiments SET status='planned' WHERE id='e'");
  await expect(runReservedOperation(db.raw,input,execute,record)).rejects.toThrow('Running bounded');
  db.raw.exec("UPDATE revenue_experiments SET status='running',started_at=datetime('now','-2 hours') WHERE id='e'");
  await expect(runReservedOperation(db.raw,input,execute,record)).rejects.toThrow('duration exceeded');
  expect(execute).not.toHaveBeenCalled();
  db.raw.exec("UPDATE revenue_experiments SET started_at=datetime('now') WHERE id='e'");
  expect(await runReservedOperation(db.raw,input,execute,record)).toEqual({duplicate:false,actualCostUsdCents:15});
  expect(await runReservedOperation(db.raw,input,execute,record)).toEqual({duplicate:true,actualCostUsdCents:15});
  expect(execute).toHaveBeenCalledTimes(1);expect(record).toHaveBeenCalledTimes(1);
  expect(db.raw.prepare('SELECT halted FROM inference_budget_policy').get()).toEqual({halted:1});
  await expect(runReservedOperation(db.raw,{...input,id:'op_after'},execute,record)).rejects.toThrow('stopped');
 }finally{db.close();}
});
it('reserves before a mock effect, prevents parallel duplicate execution and keeps failed settlement pending',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-operation-')),file=path.join(dir,'db');const a=createDatabase(file),b=createDatabase(file);
 try{
  seed(a.raw);
  initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(a.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  const input={id:'op_fixture',adapter:'mock',experimentId:'e',purpose:'synthetic service',maxCostUsdCents:80};
  let finish!:(v:{actualCostUsdCents:number})=>void;
  const mock=vi.fn(()=>new Promise<{actualCostUsdCents:number}>(r=>{finish=r;}));
  const pending=runReservedOperation(a.raw,input,mock,()=>{throw Error('ledger failure');});
  await expect(runReservedOperation(b.raw,input,mock,()=>{})).rejects.toThrow('reconciliation');
  await expect(runReservedOperation(b.raw,{...input,id:'op_second'},mock,()=>{})).rejects.toThrow('budget exceeded');
  expect(new ExperimentBudgetGovernor(b.raw).checkTotalBudget('e',21).allowed).toBe(false);
  expect(mock).toHaveBeenCalledTimes(1);finish({actualCostUsdCents:50});
  await expect(pending).rejects.toThrow('ledger failure');
  expect(b.raw.prepare('SELECT status FROM obolus_reserved_operations').get()).toEqual({status:'pending'});
  expect(b.raw.prepare('SELECT COUNT(*) n FROM aureus_capital_settlements').get()).toEqual({n:0});
  const reopened=createDatabase(file);try{await expect(runReservedOperation(reopened.raw,input,mock,()=>{})).rejects.toThrow('reconciliation');}finally{reopened.close();}
  const receipt={operationId:input.id,accountRef:'fixture-account',transactionRef:'receipt-1',actualCostUsdCents:50,evidenceSha256:'a'.repeat(64),reviewedBy:'fixture-operator'};
  expect(reconcileOperation(b.raw,receipt)).toEqual({duplicate:false});
  expect(reconcileOperation(a.raw,receipt)).toEqual({duplicate:true});
  expect(()=>reconcileOperation(a.raw,{...receipt,actualCostUsdCents:0})).toThrow('Conflicting');
  expect(await runReservedOperation(a.raw,input,mock,()=>{throw Error('must not record twice');})).toEqual({duplicate:true,actualCostUsdCents:50});
  expect(mock).toHaveBeenCalledTimes(1);
  const another={...input,id:'op_timeout',maxCostUsdCents:40};
  await expect(runReservedOperation(a.raw,another,async()=>{throw Error('provider timeout');},()=>{})).rejects.toThrow('timeout');
  expect(()=>reconcileOperation(b.raw,{...receipt,operationId:another.id})).toThrow();
  expect(a.raw.prepare('SELECT status FROM obolus_reserved_operations WHERE id=?').get(another.id)).toEqual({status:'pending'});
  expect(reconcileOperation(b.raw,{...receipt,operationId:another.id,transactionRef:'verified-no-charge',actualCostUsdCents:0})).toEqual({duplicate:false});
  expect(a.raw.prepare("SELECT SUM(amount_cents) n FROM economic_events WHERE event_type='cost'").get()).toEqual({n:50});
 }finally{b.close();a.close();fs.rmSync(dir,{recursive:true,force:true});}
});
