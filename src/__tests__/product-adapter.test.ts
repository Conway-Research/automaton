import {fixtureGrantAdapterPermission as grantAdapterPermission,fixtureSecurityReview,fixturePublicationContext} from './fixtures/security-review.js';
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';
import {createHmac} from 'node:crypto';
import {createDatabase} from '../state/database.js';
import {StripeCheckout,checkoutActionScope,PRODUCT_RELEASE_EVIDENCE,type CheckoutOffer} from '../commerce/stripe-checkout.js';
import {registerProductQuality,assessProductQuality} from '../commerce/product-quality.js';
import {registerExperimentProduct,reconcileLocalProduct} from '../commerce/product-adapter.js';
import {initializeCapitalBudget} from '../revenue/capital-budget.js';
import {registerBudgetPolicy} from '../inference/budget-policy.js';
import {DigitalDelivery} from '../commerce/delivery.js';
import {attributeCommerceObservation,currentCommerceObservation} from '../commerce/attribution.js';

it('registers immutable experiment products locally, persists duplicates and holds uncertain failures',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-product-'));
 const ledger=createDatabase(path.join(dir,'ledger.db')),second=createDatabase(path.join(dir,'ledger.db'));
 let commerce=new Database(path.join(dir,'commerce.db'));
 try{
  new StripeCheckout(commerce,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'});
  ledger.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('o','fixture','active'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis,max_budget_cents,max_duration_hours,success_criteria,failure_criteria,stop_condition,started_at) VALUES('e','o','running','test',100,1,'success','failure','stop',datetime('now'))");
  initializeCapitalBudget(ledger.raw,{capitalChfCents:100,reserveChfCents:0,chfPerUsdNumerator:1,chfPerUsdDenominator:1,quoteExpiresAt:Date.now()+60000});
  registerBudgetPolicy(ledger.raw,{daily_cents:100,hourly_cents:100,session_cents:100,call_cents:100,halted:0,revision:1});
  const input={operationId:'op_product',experimentId:'e',productId:'fixture',filename:'fixture.txt',content:Buffer.from('local test product')};
  await expect(registerExperimentProduct(ledger.raw,commerce,input)).rejects.toThrow('permission');
  expect(commerce.prepare("SELECT 1 FROM sqlite_master WHERE name='commerce_assets'").get()).toBeUndefined();
  grantAdapterPermission(ledger.raw,{adapter:'local-product',experimentId:'e',maxCostUsdCents:0,expiresAt:Date.now()+60000,reviewedBy:'fixture operator'});
  const first=registerExperimentProduct(ledger.raw,commerce,input);
  await expect(registerExperimentProduct(second.raw,commerce,input)).rejects.toThrow('reconciliation');
  expect(await first).toMatchObject({duplicate:false,actualCostUsdCents:0,publication:'not performed'});
  commerce.close();commerce=new Database(path.join(dir,'commerce.db'));
  expect(await registerExperimentProduct(second.raw,commerce,input)).toMatchObject({duplicate:true});
  expect(()=>commerce.prepare("UPDATE obolus_product_experiments SET experiment_id='wrong'").run()).toThrow('immutable');
  await expect(registerExperimentProduct(second.raw,commerce,{...input,operationId:'op_rebind'})).rejects.toThrow('Conflicting product experiment');
  await expect(registerExperimentProduct(ledger.raw,commerce,{...input,content:Buffer.from('changed')})).rejects.toThrow('Conflicting');
  expect(commerce.prepare('SELECT COUNT(*) n FROM commerce_assets').get()).toEqual({n:1});
  expect(commerce.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
  expect(ledger.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
  ledger.raw.exec("CREATE TRIGGER fail_product_settlement BEFORE INSERT ON aureus_capital_settlements BEGIN SELECT RAISE(ABORT,'fixture settlement failure'); END");
  const pending={...input,operationId:'op_pending',productId:'pending'};
  await expect(registerExperimentProduct(ledger.raw,commerce,pending)).rejects.toThrow('fixture settlement failure');
  expect(commerce.prepare("SELECT product_id FROM commerce_assets WHERE product_id='pending'").get()).toBeDefined();
  ledger.raw.exec('DROP TRIGGER fail_product_settlement');
  await expect(registerExperimentProduct(second.raw,commerce,pending)).rejects.toThrow('reconciliation');
  expect(ledger.raw.prepare("SELECT status FROM obolus_reserved_operations WHERE id='op_pending'").get()).toEqual({status:'pending'});
  commerce.prepare("UPDATE commerce_assets SET content=? WHERE product_id='pending'").run(Buffer.from('corrupted fixture'));
  expect(()=>reconcileLocalProduct(second.raw,commerce,'op_pending')).toThrow('evidence mismatch');
  expect(ledger.raw.prepare("SELECT status FROM obolus_reserved_operations WHERE id='op_pending'").get()).toEqual({status:'pending'});
  commerce.prepare("UPDATE commerce_assets SET content=? WHERE product_id='pending'").run(input.content);
  expect(reconcileLocalProduct(second.raw,commerce,'op_pending')).toMatchObject({duplicate:false,reexecuted:false,actualCostUsdCents:0});
  expect(reconcileLocalProduct(ledger.raw,commerce,'op_pending')).toMatchObject({duplicate:true,reexecuted:false});
  expect(await registerExperimentProduct(second.raw,commerce,pending)).toMatchObject({duplicate:true});
  expect(ledger.raw.prepare('SELECT COUNT(*) n FROM obolus_local_product_reconciliations').get()).toEqual({n:1});
  expect(()=>ledger.raw.exec('DELETE FROM obolus_local_product_reconciliations')).toThrow('Immutable');
  commerce.prepare("INSERT INTO commerce_orders(id,offer,digest,created_ms,status) VALUES('old',?,'fixture',0,'paid')").run(JSON.stringify({productId:'ordered'}));
  await expect(registerExperimentProduct(ledger.raw,commerce,{...input,operationId:'op_ordered',productId:'ordered'})).rejects.toThrow('referenced');
  expect(commerce.prepare("SELECT 1 FROM commerce_assets WHERE product_id='ordered'").get()).toBeUndefined();
  // Full local fulfilment path after guarded registration; provider is exclusively mocked.
  const providerSession={id:'cs_test_product',livemode:false,client_reference_id:'sale',amount_total:1000,currency:'chf',
    url:'https://checkout.stripe.com/c/pay/fixture',metadata:{aureus_order_id:'sale'},payment_intent:'pi_product',
    mode:'payment',status:'complete',payment_status:'paid'};
  const checkout=new StripeCheckout(commerce,{mode:'test',secretKey:'sk_test_fixture',webhookSecret:'whsec_synthetic_test',accountId:'acct_fixture'},
    async()=>new Response(JSON.stringify(providerSession)));
  registerProductQuality(commerce,{productId:input.productId,format:'text',purpose:'Synthetic checkout fixture',audience:'fixture',minBytes:1,maxBytes:1000,requiredText:['local test product'],forbiddenText:[],requiredJsonKeys:[]});
  assessProductQuality(commerce,input.productId,input.filename,input.content);
  const offer:CheckoutOffer={orderId:'sale',productId:input.productId,title:'Fixture',amountCents:1000,currency:'chf',successUrl:'https://example.com/success',cancelUrl:'https://example.com/cancel',publication:fixturePublicationContext};
  fixtureSecurityReview(commerce,checkoutActionScope('acct_fixture',offer,commerce),Date.now(),PRODUCT_RELEASE_EVIDENCE);
  await checkout.checkout(offer);
  const delivery=new DigitalDelivery(commerce);
  expect(()=>delivery.issue('sale')).toThrow('unavailable');
  const raw=Buffer.from(JSON.stringify({id:'evt_product',type:'checkout.session.completed',livemode:false,data:{object:providerSession}}));
  const timestamp=Math.floor(Date.now()/1000);
  const signature=createHmac('sha256','whsec_synthetic_test').update(timestamp+'.').update(raw).digest('hex');
  checkout.webhook(raw,`t=${timestamp},v1=${signature}`);
  const access=delivery.issue('sale');
  expect(delivery.download(access.token).content).toEqual(input.content);
  // Explicit stored synthetic provider observation; never represents a bank payout.
  const observedAt=Date.now();
  const report={orderId:'sale',mode:'test',observedAt,currency:'chf',grossCents:1000,providerFeeCents:59,providerNetCents:941,balanceTransactionId:'txn_product'};
  commerce.prepare('INSERT INTO commerce_balance_checks(order_id,transaction_id,report,observed_ms) VALUES(?,?,?,?)').run('sale','txn_product',JSON.stringify(report),observedAt);
  expect(()=>attributeCommerceObservation(commerce,ledger.raw,'sale','wrong',true)).toThrow('attribution mismatch');
  ledger.raw.prepare("UPDATE obolus_reserved_operations SET status='pending' WHERE id=?").run(input.operationId);
  expect(()=>attributeCommerceObservation(commerce,ledger.raw,'sale','e',true)).toThrow('reconciliation');
  ledger.raw.prepare("UPDATE obolus_reserved_operations SET status='settled' WHERE id=?").run(input.operationId);
  expect(attributeCommerceObservation(commerce,ledger.raw,'sale','e',true)).toEqual({duplicate:false,capitalCreditedCents:0});
  expect(attributeCommerceObservation(commerce,second.raw,'sale','e',true).duplicate).toBe(true);
  const original=ledger.raw.prepare('SELECT id,report,observed_ms FROM obolus_commerce_observations').get() as {id:string;report:string;observed_ms:number};
  const refreshedAt=observedAt+7200000,clock=vi.spyOn(Date,'now').mockReturnValue(refreshedAt);
  try{
    const refreshed={...report,observedAt:refreshedAt};
    commerce.prepare('INSERT INTO commerce_balance_checks(order_id,transaction_id,report,observed_ms) VALUES(?,?,?,?)').run('sale','txn_product',JSON.stringify(refreshed),refreshedAt);
    expect(attributeCommerceObservation(commerce,second.raw,'sale','e',true)).toEqual({duplicate:true,capitalCreditedCents:0});
    expect(currentCommerceObservation(ledger.raw,original).observed_ms).toBe(refreshedAt);
    expect(ledger.raw.prepare('SELECT COUNT(*) n FROM obolus_commerce_observations').get()).toEqual({n:1});
    expect(ledger.raw.prepare('SELECT report FROM obolus_commerce_observations').get()).toEqual({report:original.report});
    expect(()=>ledger.raw.exec('DELETE FROM obolus_commerce_refreshes')).toThrow('immutable');
    commerce.prepare('INSERT INTO commerce_balance_checks(order_id,transaction_id,report,observed_ms) VALUES(?,?,?,?)').run('sale','txn_product',JSON.stringify({...refreshed,providerAvailable:true}),refreshedAt);
    expect(()=>attributeCommerceObservation(commerce,second.raw,'sale','e',true)).toThrow('Conflicting provider refresh');
  }finally{clock.mockRestore();}
  expect(ledger.raw.prepare('SELECT COUNT(*) n FROM economic_events').get()).toEqual({n:0});
 }finally{commerce.close();second.close();ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
});
