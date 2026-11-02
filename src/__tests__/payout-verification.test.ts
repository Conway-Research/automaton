import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDatabase} from '../state/database.js';
import {initializeCapitalBudget,checkCapitalBudget} from '../revenue/capital-budget.js';
import {reconcileProviderCheckedPayout} from '../commerce/payout-verification.js';
let dir:string,file:string,a:ReturnType<typeof createDatabase>,b:ReturnType<typeof createDatabase>;
const input=()=>({providerAccount:'acct_fixture',payoutId:'po_fixture',mode:'live' as const,cash:{accountRef:'fixture-bank',transactionRef:'fixture-transfer',kind:'receipt' as const,cashChfCents:100,retainedChfCents:20,evidenceSha256:'a'.repeat(64),reviewedBy:'synthetic operator'}});
const observation=()=>({providerAccount:'acct_fixture',payoutId:'po_fixture',mode:'live' as const,amountCents:100,currency:'chf',providerStatus:'paid',expectedArrivalSeconds:0,observedAt:Date.now(),capitalCreditedCents:0,limitation:'fixture only'});
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-payout-check-'));file=path.join(dir,'db');a=createDatabase(file);b=createDatabase(file);
 initializeCapitalBudget(a.raw,{capitalChfCents:100,reserveChfCents:100,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});});
afterEach(()=>{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});});
it('checks provider evidence before atomically crediting reviewed cash once across connections and restart',async()=>{
 const provider={observePayout:vi.fn(async()=>observation())};
 expect(await reconcileProviderCheckedPayout(a.raw,provider,input())).toMatchObject({duplicate:false,providerChecked:true,bankAuthenticated:false});
 a.close();a=createDatabase(file);
 expect(await reconcileProviderCheckedPayout(b.raw,provider,input())).toMatchObject({duplicate:true});
 expect(checkCapitalBudget(a.raw,80).allowed).toBe(true);expect(checkCapitalBudget(a.raw,81).allowed).toBe(false);
 expect(a.raw.prepare('SELECT COUNT(*) n FROM obolus_payout_provider_checks').get()).toEqual({n:1});
 expect(()=>a.raw.exec('DELETE FROM obolus_payout_provider_checks')).toThrow('immutable');
});
it.each([{providerStatus:'pending'},{mode:'test' as const},{currency:'usd'},{amountCents:101},{providerAccount:'acct_other'},{observedAt:1}])('does not credit inconsistent provider evidence %j',async invalid=>{
 await expect(reconcileProviderCheckedPayout(a.raw,{observePayout:async()=>({...observation(),...invalid})},input())).rejects.toThrow('must match');
 expect(checkCapitalBudget(b.raw,1).allowed).toBe(false);
 expect(a.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_reconciled_cash'").get()).toBeUndefined();
});
it('preserves the reviewed receipt against mutation while awaiting the provider',async()=>{
 const reviewed=input();
 await reconcileProviderCheckedPayout(a.raw,{observePayout:async()=>{reviewed.cash.cashChfCents=9999;return observation();}},reviewed);
 expect(checkCapitalBudget(b.raw,81).allowed).toBe(false);
});
it('blocks already credited capital durably when fresh matching provider evidence becomes adverse',async()=>{
 const good={observePayout:async()=>observation()};
 await reconcileProviderCheckedPayout(a.raw,good,input());
 await expect(reconcileProviderCheckedPayout(b.raw,{observePayout:async()=>({...observation(),providerStatus:'failed'})},input())).rejects.toThrow('must match');
 expect(checkCapitalBudget(a.raw,0)).toMatchObject({allowed:false,reason:'Payout capital hold requires independent destination reconciliation'});
 a.close();a=createDatabase(file);
 await expect(reconcileProviderCheckedPayout(a.raw,good,input())).rejects.toThrow('capital hold');
 expect(()=>a.raw.exec('DELETE FROM obolus_payout_capital_holds')).toThrow('reconciliation');
 expect(a.raw.prepare('SELECT COUNT(*) n FROM aureus_reconciled_cash').get()).toEqual({n:1});
});
it('does not let caller amount changes or unrelated stale observations fabricate an adverse capital hold',async()=>{
 await reconcileProviderCheckedPayout(a.raw,{observePayout:async()=>observation()},input());
 const altered=input();altered.cash.cashChfCents=999;
 await expect(reconcileProviderCheckedPayout(b.raw,{observePayout:async()=>observation()},altered)).rejects.toThrow('must match');
 await expect(reconcileProviderCheckedPayout(b.raw,{observePayout:async()=>({...observation(),providerStatus:'failed',observedAt:1})},input())).rejects.toThrow('must match');
 expect(checkCapitalBudget(a.raw,80).allowed).toBe(true);
});
it('blocks a delayed paid response when another connection observes adverse state before the first credit',async()=>{
 const oldPaid=observation();
 let resolve!:(value:ReturnType<typeof observation>)=>void;
 const pending=new Promise<ReturnType<typeof observation>>(done=>{resolve=done;});
 const delayed=reconcileProviderCheckedPayout(a.raw,{observePayout:()=>pending},input());
 await expect(reconcileProviderCheckedPayout(b.raw,{observePayout:async()=>({...observation(),providerStatus:'failed'})},input())).rejects.toThrow('must match');
 resolve(oldPaid);
 await expect(delayed).rejects.toThrow('capital hold');
 expect(a.raw.prepare("SELECT 1 FROM sqlite_master WHERE name='aureus_reconciled_cash'").get()).toBeUndefined();
 b.close();b=createDatabase(file);
 expect(checkCapitalBudget(b.raw,0)).toMatchObject({allowed:false,reason:expect.stringContaining('capital hold')});
 await expect(reconcileProviderCheckedPayout(b.raw,{observePayout:async()=>observation()},input())).rejects.toThrow('capital hold');
});
