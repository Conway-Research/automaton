import {fixtureGrantAdapterPermission as grantAdapterPermission} from './fixtures/security-review.js';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {SimpleFundingProtocol} from '../orchestration/simple-tracker.js';
import {initializeCapitalBudget,checkCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {revokeAdapterPermission} from '../revenue/adapter-permissions.js';
import {ExperimentBudgetGovernor} from '../revenue/budget-governor.js';
import {pendingOperationCost} from '../revenue/pending-operations.js';
import {RevenueStore} from '../revenue/store.js';
import type {ConwayClient,AutomatonIdentity,CreditTransferResult} from '../types.js';
import {reconcileChildFunding,type ReviewedChildFundingReceipt} from '../revenue/operation-reconciliation.js';
import {main} from '../v1/cli.js';
let dir:string,db:ReturnType<typeof createDatabase>,other:ReturnType<typeof createDatabase>;
const child='0x1111111111111111111111111111111111111111',input={operationId:'op_task',experimentId:'e'};
const receipt:CreditTransferResult={transferId:'remote_transfer',status:'completed',toAddress:child,amountCents:100};
const closure=():ReviewedChildFundingReceipt=>({operationId:input.operationId,accountRef:'fixture_parent',transactionRef:'final_settlement',fundingTransferRef:receipt.transferId,
 actualCostUsdCents:80,returnedLiquidUsdCents:20,additionalDebitUsdCents:0,remainingNoncashCreditCents:0,allLiabilitiesFinal:true,observedAt:Date.now(),evidenceSha256:'a'.repeat(64),reviewedBy:'fixture'});
beforeEach(()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-funding-'));db=createDatabase(path.join(dir,'db'));other=createDatabase(path.join(dir,'db'));
 initializeCapitalBudget(db.raw,{capitalChfCents:1000,reserveChfCents:200,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
 registerBudgetPolicy(db.raw,{daily_cents:1000,hourly_cents:1000,session_cents:1000,call_cents:1000,halted:0,revision:1});
 db.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('e','o','running','fixture',200,1,'success','failure','stop',datetime('now'))");
 db.raw.prepare("INSERT INTO children(id,name,address,sandbox_id,genesis_prompt,funded_amount_cents,status,created_at) VALUES('child','fixture',?,'sandbox','fixture',0,'running',datetime('now'))").run(child);
 grantAdapterPermission(db.raw,{adapter:'child-funding',experimentId:'e',maxCostUsdCents:200,expiresAt:Date.now()+60000,reviewedBy:'fixture'});
});
afterEach(()=>{vi.useRealTimers();db.close();other.close();fs.rmSync(dir,{recursive:true});});
const protocol=(connection:typeof db,transfer:ConwayClient['transferCredits'])=>new SimpleFundingProtocol({transferCredits:transfer} as ConwayClient,{address:'0xparent'} as AutomatonIdentity,connection);
it('reserves capital and experiment allowance before I/O, persists uncertainty and never retries the same funded task',async()=>{
 let complete!:(receipt:CreditTransferResult)=>void;
 const transfer=vi.fn(()=>new Promise<CreditTransferResult>(resolve=>{complete=resolve;}));
 const first=protocol(db,transfer).fundChild(child,100,input);
 expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(700);
 expect(pendingOperationCost(other.raw,'e')).toBe(100);
 expect(new ExperimentBudgetGovernor(other.raw).checkTotalBudget('e',101).allowed).toBe(false);
 expect(new RevenueStore(other.raw).hasUnresolvedOperation('e')).toBe(true);
 expect(await protocol(other,transfer).fundChild(child,100,input)).toEqual({success:false});
 expect(await protocol(other,transfer).fundChild(child,100,{...input,operationId:'op_retry'})).toEqual({success:false});
 complete(receipt);expect(await first).toEqual({success:true});
 const reopened=createDatabase(path.join(dir,'db'));
 try{expect(await protocol(reopened,transfer).fundChild(child,100,input)).toEqual({success:true});}finally{reopened.close();}
 expect(transfer).toHaveBeenCalledTimes(1);expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(700);
 expect(db.raw.prepare('SELECT funded_amount_cents n FROM children').get()).toEqual({n:100});
 expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
 expect(()=>db.raw.exec('DELETE FROM obolus_child_funding')).toThrow('immutable');
});
it.each(['unattributed','permission','budget','stopped','collision'] as const)('blocks %s funding before external I/O',async failure=>{
 const transfer=vi.fn(async()=>receipt);
 if(failure==='permission')revokeAdapterPermission(db.raw,'child-funding','e');
 if(failure==='budget')db.raw.exec('UPDATE revenue_experiments SET max_budget_cents=99');
 if(failure==='stopped')db.raw.exec('UPDATE inference_budget_policy SET halted=1');
 if(failure==='collision')db.raw.exec("INSERT INTO aureus_capital_commitments VALUES('op_task','Other operation',100)");
 expect(await protocol(db,transfer).fundChild(child,100,failure==='unattributed'?undefined:input)).toEqual({success:false});
 expect(transfer).not.toHaveBeenCalled();
});
it('retains the reservation after timeout and ignores a late success until independent reconciliation',async()=>{
 vi.useFakeTimers();let complete!:(receipt:CreditTransferResult)=>void;
 const transfer=vi.fn(()=>new Promise<CreditTransferResult>(resolve=>{complete=resolve;}));
 const pending=protocol(db,transfer).fundChild(child,100,input);
 await vi.advanceTimersByTimeAsync(15001);expect(await pending).toEqual({success:false});complete(receipt);await Promise.resolve();
 expect(await protocol(other,transfer).fundChild(child,100,input)).toEqual({success:false});
 expect(transfer).toHaveBeenCalledTimes(1);expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(700);
 expect(db.raw.prepare('SELECT funded_amount_cents n FROM children').get()).toEqual({n:0});
});
it('uses the actual reviewed CLI settlement path once and preserves funding retry identity across restart',async()=>{
 const transfer=vi.fn(async()=>receipt);await protocol(db,transfer).fundChild(child,100,input);
 const reviewed=closure(),file=path.join(dir,'receipt.json');fs.writeFileSync(file,JSON.stringify(reviewed));
 await main(['child-funding-reconcile','--database',path.join(dir,'db'),'--input',file,'--apply']);
 expect(checkCapitalBudget(other.raw,0).remainingChfCents).toBe(720);
 expect(pendingOperationCost(other.raw,'e')).toBe(0);expect(new RevenueStore(other.raw).hasUnresolvedOperation('e')).toBe(false);
 expect(db.raw.prepare("SELECT amount_cents,experiment_id FROM economic_events WHERE category='remote-child-consumption'").get()).toEqual({amount_cents:80,experiment_id:'e'});
 const reopened=createDatabase(path.join(dir,'db'));
 try{expect(reconcileChildFunding(reopened.raw,reviewed)).toEqual({duplicate:true});expect(await protocol(reopened,transfer).fundChild(child,100,input)).toEqual({success:true});}finally{reopened.close();}
 expect(transfer).toHaveBeenCalledTimes(1);expect(await protocol(db,transfer).getBalance(child)).toBe(0);
 db.raw.exec("UPDATE economic_events SET amount_cents=0 WHERE category='remote-child-consumption'");
 expect(()=>checkCapitalBudget(other.raw,0)).toThrow('accounting mismatch');
});
it.each(['noncash','incomplete','total','identity'] as const)('keeps capital reserved for an invalid %s closure',async failure=>{
 await protocol(db,async()=>receipt).fundChild(child,100,input);
 const r=closure();if(failure==='noncash')r.remainingNoncashCreditCents=20 as 0;
 if(failure==='incomplete')r.allLiabilitiesFinal=false as true;
 if(failure==='total')r.returnedLiquidUsdCents=10;if(failure==='identity')r.fundingTransferRef='different';
 expect(()=>reconcileChildFunding(other.raw,r)).toThrow();expect(checkCapitalBudget(db.raw,0).remainingChfCents).toBe(700);
 expect(db.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
});
it('books independently observed excess consumption and stops further spending rather than hiding it',async()=>{
 await protocol(db,async()=>receipt).fundChild(child,100,input);
 expect(reconcileChildFunding(other.raw,{...closure(),actualCostUsdCents:120,returnedLiquidUsdCents:0,additionalDebitUsdCents:20})).toMatchObject({spendingHalted:true});
 expect(checkCapitalBudget(db.raw,0).remainingChfCents).toBe(680);
 expect(db.raw.prepare('SELECT halted FROM inference_budget_policy').get()).toEqual({halted:1});
});
it('reconciles an uncertain transfer without resending and rejects reuse of its external identity for another allocation',async()=>{
 const uncertain=vi.fn(async()=>({...receipt,status:'submitted'}));
 expect(await protocol(db,uncertain).fundChild(child,100,input)).toEqual({success:false});
 reconcileChildFunding(other.raw,closure());
 expect(await protocol(db,uncertain).fundChild(child,100,input)).toEqual({success:true});expect(uncertain).toHaveBeenCalledTimes(1);
 const duplicate=vi.fn(async()=>receipt);
 expect(await protocol(other,duplicate).fundChild(child,100,{...input,operationId:'op_second'})).toEqual({success:false});
 expect(db.raw.prepare("SELECT status FROM obolus_child_funding WHERE id='op_second'").get()).toEqual({status:'pending'});
 expect(await protocol(db,duplicate).getBalance(child)).toBe(0);expect(checkCapitalBudget(db.raw,0).remainingChfCents).toBe(620);
});
