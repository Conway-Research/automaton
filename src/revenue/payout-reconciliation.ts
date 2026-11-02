import type {Database} from 'better-sqlite3';
import {recordReconciledCash,reconciledCashDelta,type ReconciledCashEntry} from './capital-receipts.js';
import {createHash} from 'node:crypto';
import {assertNoKnownSecrets} from '../observability/redaction.js';

/** Trusted operator boundary: only independently verified, received live payouts.
 * Provider status/checkout events alone are insufficient. This function does not authenticate evidence.
 */
export function recordReconciledPayout(db:Database,input:{
  providerAccount:string;payoutId:string;mode:'live';cash:ReconciledCashEntry;
}) {
  // oxlint-disable-next-line no-control-regex -- Intentionally reject or sanitize control characters at the security boundary.
  const ref=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=200&&v===v.trim()&&!/[\u0000-\u001f\u007f]/.test(v);
  if(!input||input.mode!=='live'||!ref(input.providerAccount)||!ref(input.payoutId)||input.cash?.kind!=='receipt')
    throw new Error('Verified live payout receipt required');
  const {cash}=input;
  assertNoKnownSecrets({providerAccount:input.providerAccount,payoutId:input.payoutId,cash});
  const payload=JSON.stringify({providerAccount:input.providerAccount,payoutId:input.payoutId,mode:input.mode,
    cash:{accountRef:cash.accountRef,transactionRef:cash.transactionRef,kind:cash.kind,cashChfCents:cash.cashChfCents,
      retainedChfCents:cash.retainedChfCents,evidenceSha256:cash.evidenceSha256,reviewedBy:cash.reviewedBy}});
  return db.transaction(()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_reconciled_payouts(
      provider_account TEXT NOT NULL,payout_id TEXT NOT NULL,account_ref TEXT NOT NULL,transaction_ref TEXT NOT NULL,payload TEXT NOT NULL,
      PRIMARY KEY(provider_account,payout_id),UNIQUE(account_ref,transaction_ref));
      CREATE TRIGGER IF NOT EXISTS obolus_payout_no_update BEFORE UPDATE ON obolus_reconciled_payouts BEGIN SELECT RAISE(ABORT,'Payout reconciliation immutable'); END;
      CREATE TRIGGER IF NOT EXISTS obolus_payout_no_delete BEFORE DELETE ON obolus_reconciled_payouts BEGIN SELECT RAISE(ABORT,'Payout reconciliation immutable'); END;`);
    const old=db.prepare('SELECT payload,account_ref,transaction_ref FROM obolus_reconciled_payouts WHERE provider_account=? AND payout_id=?').get(input.providerAccount,input.payoutId) as {payload:string;account_ref:string;transaction_ref:string}|undefined;
    if(old){
      if(old.payload!==payload)throw new Error('Conflicting payout reconciliation');
      if(old.account_ref!==cash.accountRef||old.transaction_ref!==cash.transactionRef)
        throw new Error('Inconsistent payout cash linkage; reconciliation required');
      const cashId=createHash('sha256').update(JSON.stringify([cash.accountRef,cash.transactionRef])).digest('hex');
      const receipt=db.prepare('SELECT payload FROM aureus_reconciled_cash WHERE id=?').get(cashId) as {payload:string}|undefined;
      if(!receipt||receipt.payload!==JSON.stringify(JSON.parse(payload).cash))
        throw new Error('Missing or conflicting payout cash receipt; reconciliation required');
      reconciledCashDelta(db);
      return {duplicate:true};
    }
    db.prepare('INSERT INTO obolus_reconciled_payouts VALUES(?,?,?,?,?)').run(input.providerAccount,input.payoutId,cash.accountRef,cash.transactionRef,payload);
    // Do not silently reclassify receipts that were already credited by another route.
    if(recordReconciledCash(db,cash).duplicate)throw new Error('Cash receipt already credited; explicit reconciliation required');
    return {duplicate:false};
  }).immediate();
}
