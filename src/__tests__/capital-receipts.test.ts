import {beforeEach,afterEach,it,expect} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createDatabase} from "../state/database.js";
import {initializeCapitalBudget,checkCapitalBudget,reserveCapitalCommitment} from "../revenue/capital-budget.js";
import {recordReconciledCash,type ReconciledCashEntry} from "../revenue/capital-receipts.js";
import {createHash} from 'node:crypto';
import {isProtectedFile} from "../self-mod/code.js";
import {recordReconciledPayout} from '../revenue/payout-reconciliation.js';
let dir:string,a:ReturnType<typeof createDatabase>,b:ReturnType<typeof createDatabase>;
const entry:ReconciledCashEntry={accountRef:"synthetic-account",transactionRef:"synthetic-receipt",kind:"receipt",cashChfCents:1000,retainedChfCents:200,evidenceSha256:"a".repeat(64),reviewedBy:"test fixture; not real verification"};
it.each(['missing-cash','corrupt-delta','wrong-link'] as const)('refuses duplicate payout success after %s without repairing or crediting again',fault=>{
 const payout={providerAccount:'synthetic-provider',payoutId:'synthetic-payout',mode:'live' as const,cash:entry};
 recordReconciledPayout(a.raw,payout);
 // Privileged fixture corruption models damaged storage, not an agent permission.
 if(fault==='missing-cash')a.raw.exec('DROP TRIGGER reconciled_cash_no_delete; DELETE FROM aureus_reconciled_cash');
 if(fault==='corrupt-delta')a.raw.exec('DROP TRIGGER reconciled_cash_no_update; UPDATE aureus_reconciled_cash SET delta_chf_cents=999');
 if(fault==='wrong-link')a.raw.exec("DROP TRIGGER obolus_payout_no_update; UPDATE obolus_reconciled_payouts SET transaction_ref='other'");
 const before=a.raw.prepare('SELECT * FROM aureus_reconciled_cash').all();
 expect(()=>recordReconciledPayout(b.raw,payout)).toThrow();
 expect(a.raw.prepare('SELECT * FROM aureus_reconciled_cash').all()).toEqual(before);
});
it('does not report a duplicate cash receipt as valid while its ledger is inconsistent',()=>{
 recordReconciledCash(a.raw,entry);
 a.raw.exec('DROP TRIGGER reconciled_cash_no_update; UPDATE aureus_reconciled_cash SET delta_chf_cents=999');
 expect(()=>recordReconciledCash(b.raw,entry)).toThrow();
});
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-cash-"));const file=path.join(dir,"test.db");a=createDatabase(file);b=createDatabase(file);
  initializeCapitalBudget(a.raw,{capitalChfCents:5000,reserveChfCents:1000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});});
afterEach(()=>{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});});
it("adds only reconciled cash less retained liabilities without changing original capital",()=>{
  recordReconciledCash(a.raw,entry);
  expect(checkCapitalBudget(b.raw,4800).allowed).toBe(true);expect(checkCapitalBudget(b.raw,4801).allowed).toBe(false);
  const policy=JSON.parse((a.raw.prepare("SELECT policy FROM aureus_capital_policy").get() as {policy:string}).policy);expect(policy.capitalChfCents).toBe(5000);
});
it.each(['delta','identity','json'])('blocks inconsistent legacy cash %s without changing its evidence',mode=>{
  recordReconciledCash(a.raw,entry);
  const legacy={...entry,transactionRef:'legacy-invalid'},payload=mode==='json'?'{':JSON.stringify(legacy);
  const id=mode==='identity'?'invalid-id':createHash('sha256').update(JSON.stringify([legacy.accountRef,legacy.transactionRef])).digest('hex');
  a.raw.prepare('INSERT INTO aureus_reconciled_cash(id,payload,delta_chf_cents) VALUES(?,?,?)').run(id,payload,mode==='delta'?1000:800);
  expect(checkCapitalBudget(b.raw,0)).toEqual({allowed:false,reason:'Invalid reconciled cash ledger; reconciliation required'});
  expect(()=>recordReconciledCash(b.raw,{...entry,transactionRef:'new-receipt'})).toThrow();
  expect(a.raw.prepare('SELECT payload FROM aureus_reconciled_cash WHERE id=?').get(id)).toEqual({payload});
  expect(a.raw.prepare('SELECT COUNT(*) n FROM aureus_reconciled_cash').get()).toEqual({n:2});
});
it.each([-10,0.5])('rejects an invalid individual cost %s even when aggregate arithmetic would be valid',bad=>{
  a.raw.prepare("INSERT INTO economic_events(id,event_type,amount_cents,currency) VALUES('valid','cost',100,'USD'),('bad','cost',?,'USD'),('other','cost',?,'USD')").run(bad,bad===0.5?0.5:10);
  expect(checkCapitalBudget(b.raw,0)).toMatchObject({allowed:false,reason:'Invalid individual capital cost; reconciliation required'});
});
it.each(['{','null',JSON.stringify({capitalChfCents:5000,reserveChfCents:-1000,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:9999999999999})])('fails closed on malformed stored capital policy %s',policy=>{
  a.raw.prepare('UPDATE aureus_capital_policy SET policy=?').run(policy);
  expect(checkCapitalBudget(b.raw,0)).toEqual({allowed:false,reason:'Invalid stored capital policy'});
});
it('credits a received payout once and rejects reused provider or bank references atomically',()=>{
 const input={providerAccount:'fixture-provider',payoutId:'fixture-payout',mode:'live' as const,cash:entry};
 expect(recordReconciledPayout(a.raw,input)).toEqual({duplicate:false});
 expect(recordReconciledPayout(b.raw,input)).toEqual({duplicate:true});
 a.close();a=createDatabase(path.join(dir,'test.db'));
 expect(recordReconciledPayout(a.raw,input)).toEqual({duplicate:true});
 expect(()=>recordReconciledPayout(b.raw,{...input,cash:{...entry,transactionRef:'another-bank-reference'}})).toThrow('Conflicting');
 expect(()=>recordReconciledPayout(a.raw,{...input,payoutId:'another-payout'})).toThrow();
 expect(checkCapitalBudget(a.raw,4801).allowed).toBe(false);
 expect(a.raw.prepare('SELECT COUNT(*) n FROM obolus_reconciled_payouts').get()).toEqual({n:1});
 recordReconciledCash(a.raw,{...entry,transactionRef:'already-credited'});
 expect(()=>recordReconciledPayout(b.raw,{...input,payoutId:'second',cash:{...entry,transactionRef:'already-credited'}})).toThrow('already credited');
 expect(a.raw.prepare('SELECT COUNT(*) n FROM obolus_reconciled_payouts').get()).toEqual({n:1});
 expect(()=>recordReconciledPayout(a.raw,{...input,payoutId:'invalid',cash:{...entry,transactionRef:'invalid',evidenceSha256:''}})).toThrow();
 expect(a.raw.prepare('SELECT COUNT(*) n FROM obolus_reconciled_payouts').get()).toEqual({n:1});
 expect(()=>a.raw.exec('DELETE FROM obolus_reconciled_payouts')).toThrow('immutable');
});
it("does not credit twice across connections or restart and rejects changed external transactions",()=>{
  recordReconciledCash(a.raw,entry);expect(recordReconciledCash(b.raw,entry)).toEqual({duplicate:true});
  a.close();a=createDatabase(path.join(dir,"test.db"));expect(recordReconciledCash(a.raw,entry)).toEqual({duplicate:true});
  expect(()=>recordReconciledCash(a.raw,{...entry,cashChfCents:2000})).toThrow("Conflicting");
  expect(checkCapitalBudget(a.raw,4801).allowed).toBe(false);
});
it("counts later debits against open commitments and blocks further work",()=>{
  recordReconciledCash(a.raw,entry);reserveCapitalCommitment(b.raw,"reserved","synthetic validation",4700);
  recordReconciledCash(a.raw,{...entry,transactionRef:"synthetic-debit",kind:"debit",cashChfCents:500,retainedChfCents:0});
  expect(checkCapitalBudget(b.raw,0).allowed).toBe(false);
});
it("rolls back failed cash ledger writes",()=>{
  recordReconciledCash(a.raw,entry);
  a.raw.exec("CREATE TRIGGER fail_cash BEFORE INSERT ON aureus_reconciled_cash BEGIN SELECT RAISE(ABORT,'fixture'); END");
  expect(()=>recordReconciledCash(a.raw,{...entry,transactionRef:"new"})).toThrow("fixture");expect(checkCapitalBudget(b.raw,4801).allowed).toBe(false);
});
it("rejects missing evidence and protects the trusted reconciliation boundary",()=>{
  expect(()=>recordReconciledCash(a.raw,{...entry,evidenceSha256:""})).toThrow();
  expect(()=>recordReconciledCash(a.raw,{...entry,retainedChfCents:1001})).toThrow();
  expect(isProtectedFile("C:/project/src/revenue/capital-receipts.ts")).toBe(true);
  expect(isProtectedFile("C:/project/dist/revenue/capital-receipts.js")).toBe(true);
});
it('rejects padded and control-character references without altering capital',()=>{
 for(const value of [' synthetic-account','synthetic-account ','synthetic\naccount','synthetic\u0000account']) {
  expect(()=>recordReconciledCash(a.raw,{...entry,accountRef:value})).toThrow();
  expect(()=>recordReconciledCash(a.raw,{...entry,transactionRef:value})).toThrow();
 }
 expect(checkCapitalBudget(b.raw,4001).allowed).toBe(false);
});
it('preserves cash history and prevents legacy padded references from being credited twice',()=>{
 a.raw.exec("CREATE TABLE aureus_reconciled_cash(id TEXT PRIMARY KEY,payload TEXT NOT NULL,delta_chf_cents INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')))");
 a.raw.prepare('INSERT INTO aureus_reconciled_cash(id,payload,delta_chf_cents) VALUES(?,?,?)').run('legacy',JSON.stringify({...entry,accountRef:' synthetic-account '}),800);
 expect(()=>recordReconciledCash(b.raw,entry)).toThrow('Legacy cash reference');
 expect(()=>recordReconciledCash(a.raw,{...entry,transactionRef:'second'})).toThrow('Invalid reconciled cash ledger');
 expect(b.raw.prepare('SELECT id,delta_chf_cents FROM aureus_reconciled_cash').all()).toEqual([{id:'legacy',delta_chf_cents:800}]);
 expect(checkCapitalBudget(b.raw,0).allowed).toBe(false);
});
