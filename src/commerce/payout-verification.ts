import type {Database} from 'better-sqlite3';
import type {StripeCheckout} from './stripe-checkout.js';
import {recordReconciledPayout} from '../revenue/payout-reconciliation.js';

/** Provider check plus independently reviewed destination receipt. Not autonomous bank verification. */
export async function reconcileProviderCheckedPayout(db:Database,provider:Pick<StripeCheckout,'observePayout'>,input:Parameters<typeof recordReconciledPayout>[1]){
  if(!input||input.mode!=='live'||!/^po_[A-Za-z0-9]{1,100}$/.test(input.payoutId)||!/^acct_[A-Za-z0-9]+$/.test(input.providerAccount)||input.cash?.kind!=='receipt')
    throw new Error('Reviewed live payout and destination receipt required');
  // Freeze the reviewed payload before awaiting the provider, preventing concurrent caller mutation.
  const reviewed=JSON.parse(JSON.stringify(input)) as typeof input;
  const observation=await provider.observePayout(reviewed.payoutId),now=Date.now();
  const sameAccount=observation.payoutId===reviewed.payoutId&&observation.providerAccount===reviewed.providerAccount&&observation.mode==='live';
  const fresh=Number.isSafeInteger(observation.observedAt)&&observation.observedAt<=now&&now-observation.observedAt<=60000;
  // Keep adverse provider state even before first credit: an older concurrent paid response must not grant capital afterwards.
  // Amount contradictions use the credited receipt, never mutable caller input.
  if(sameAccount&&fresh){
    db.transaction(()=>{
      const prior=db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_reconciled_payouts'").get()
        ? db.prepare('SELECT payload FROM obolus_reconciled_payouts WHERE provider_account=? AND payout_id=?').get(reviewed.providerAccount,reviewed.payoutId) as {payload:string}|undefined : undefined;
      const credited=prior?JSON.parse(prior.payload) as typeof reviewed:undefined;
      if(observation.providerStatus==='paid'&&observation.currency==='chf'&&(!credited||observation.amountCents===credited.cash.cashChfCents))return;
      db.exec(`CREATE TABLE IF NOT EXISTS obolus_payout_capital_holds(provider_account TEXT NOT NULL,payout_id TEXT NOT NULL,observation TEXT NOT NULL,PRIMARY KEY(provider_account,payout_id));
        CREATE TRIGGER IF NOT EXISTS payout_capital_hold_update BEFORE UPDATE ON obolus_payout_capital_holds BEGIN SELECT RAISE(ABORT,'Payout capital hold immutable'); END;
        CREATE TRIGGER IF NOT EXISTS payout_capital_hold_delete BEFORE DELETE ON obolus_payout_capital_holds BEGIN SELECT RAISE(ABORT,'Payout capital hold requires reviewed reconciliation'); END;`);
      db.prepare('INSERT OR IGNORE INTO obolus_payout_capital_holds VALUES(?,?,?)').run(reviewed.providerAccount,reviewed.payoutId,JSON.stringify(observation));
    }).immediate();
  }
  if(observation.payoutId!==reviewed.payoutId||observation.providerAccount!==reviewed.providerAccount||observation.mode!=='live'||
    observation.providerStatus!=='paid'||observation.currency!=='chf'||observation.amountCents!==reviewed.cash.cashChfCents||
    !Number.isSafeInteger(observation.observedAt)||observation.observedAt>now||now-observation.observedAt>60000)
    throw new Error('Fresh paid CHF payout must match reviewed destination receipt exactly');
  return db.transaction(()=>{
    if(db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_payout_capital_holds'").get()&&
      db.prepare('SELECT 1 FROM obolus_payout_capital_holds WHERE provider_account=? AND payout_id=?').get(reviewed.providerAccount,reviewed.payoutId))
      throw new Error('Payout capital hold requires independent destination reconciliation');
    const result=recordReconciledPayout(db,reviewed);
    db.exec(`CREATE TABLE IF NOT EXISTS obolus_payout_provider_checks(provider_account TEXT NOT NULL,payout_id TEXT NOT NULL,observation TEXT NOT NULL,PRIMARY KEY(provider_account,payout_id));
      CREATE TRIGGER IF NOT EXISTS payout_provider_check_update BEFORE UPDATE ON obolus_payout_provider_checks BEGIN SELECT RAISE(ABORT,'Payout provider evidence immutable'); END;
      CREATE TRIGGER IF NOT EXISTS payout_provider_check_delete BEFORE DELETE ON obolus_payout_provider_checks BEGIN SELECT RAISE(ABORT,'Payout provider evidence immutable'); END;`);
    db.prepare('INSERT OR IGNORE INTO obolus_payout_provider_checks VALUES(?,?,?)').run(reviewed.providerAccount,reviewed.payoutId,JSON.stringify(observation));
    return {...result,providerChecked:true,destinationReceiptSource:'operator-review',bankAuthenticated:false};
  }).immediate();
}
