import {beforeEach,afterEach,it,expect,vi} from "vitest";
import {fixtureSecurityReview,fixturePublicationContext} from './fixtures/security-review.js';
import {checkoutActionScope,PRODUCT_RELEASE_EVIDENCE} from '../commerce/stripe-checkout.js';
import {createHmac,createHash} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import http from "node:http";
import {startStripeWebhook} from "../commerce/webhook-server.js";
import {openCommerce} from "../commerce/workspace.js";
import {DigitalDelivery} from "../commerce/delivery.js";
import {registerProductQuality,assessProductQuality,revokeProductQuality} from '../commerce/product-quality.js';
import {attributeCommerceObservation,syncCommerceHolds} from '../commerce/attribution.js';
import {createDatabase} from '../state/database.js';
import {RevenueStore} from '../revenue/store.js';
import {startCommerceHoldSync} from '../commerce/hold-sync.js';
import {StripeCheckout,verifyStripeEvent,type CheckoutOffer} from "../commerce/stripe-checkout.js";
import {isProtectedFile} from "../self-mod/code.js";
import {setSalesPaused} from '../commerce/sales-control.js';
let dir:string,a:Database.Database,b:Database.Database;
const config={mode:"test" as const,secretKey:"sk_test_synthetic",webhookSecret:"whsec_synthetic_test_secret",accountId:"acct_fixture"};
const offer:CheckoutOffer={orderId:"order1",productId:"product1",title:"Synthetic download",amountCents:1000,currency:"chf",successUrl:"https://example.com/success",cancelUrl:"https://example.com/cancel",publication:fixturePublicationContext};
const session=()=>({id:"cs_test_fixture",livemode:false,client_reference_id:"order1",amount_total:1000,currency:"chf",url:"https://checkout.stripe.com/c/pay/fixture",
  metadata:{aureus_order_id:"order1"},payment_intent:"pi_fixture",mode:"payment",status:"complete",payment_status:"paid"});
const mock=()=>vi.fn(async()=>new Response(JSON.stringify(session()),{status:200}));
/** Prepare explicit local review fixtures for payment transport tests. Production
 * checkout applies the same release gate in test and live modes. Live attack
 * cases below keep their own explicit setup and are never auto-approved here. */
async function reviewedCheckout(checkout:StripeCheckout,input:CheckoutOffer){
 if((a.prepare('SELECT mode FROM commerce_stripe_config WHERE id=1').get() as {mode:string}).mode==='test'){
  const delivery=new DigitalDelivery(a);
  const asset=a.prepare('SELECT filename,content FROM commerce_assets WHERE product_id=?').get(input.productId) as {filename:string;content:Buffer}|undefined;
  const bytes=asset?.content??Buffer.from('fixture'),filename=asset?.filename??'fixture.txt';
  if(!a.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_product_quality_contracts'").get()||!a.prepare('SELECT 1 FROM obolus_product_quality_contracts WHERE product_id=?').get(input.productId)){
   registerProductQuality(a,{productId:input.productId,format:'text',purpose:'Synthetic checkout test',audience:'fixture',minBytes:1,maxBytes:262144,requiredText:[bytes.toString().slice(0,100)],forbiddenText:[],requiredJsonKeys:[]});
  }
  assessProductQuality(a,input.productId,filename,bytes);if(!asset)delivery.register(input.productId,filename,bytes);
  fixtureSecurityReview(a,checkoutActionScope(config.accountId,input,a),Date.now(),PRODUCT_RELEASE_EVIDENCE);
 }
 return checkout.checkout(input);
}
function qualityFixture(){
 const content=Buffer.from('Reviewed fixture download');
 registerProductQuality(a,{productId:offer.productId,format:'text',purpose:'Fixture',audience:'Test',minBytes:1,maxBytes:100,requiredText:['Reviewed'],forbiddenText:[],requiredJsonKeys:[]});
 assessProductQuality(a,offer.productId,'fixture.txt',content);new DigitalDelivery(a).register(offer.productId,'fixture.txt',content);
 fixtureSecurityReview(a,checkoutActionScope(config.accountId,offer,a),Date.now(),PRODUCT_RELEASE_EVIDENCE);
}
it('blocks unreviewed live products before provider calls and rechecks revocation after account verification',async()=>{
 let release!:(response:Response)=>void;const request=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},request);setSalesPaused(a,false);
 await expect(reviewedCheckout(checkout,offer)).rejects.toThrow('Quality-reviewed');expect(request).not.toHaveBeenCalled();
 qualityFixture();const pending=reviewedCheckout(checkout,offer);
 const assessment=assessProductQuality(b,offer.productId,'fixture.txt',Buffer.from('Reviewed fixture download'));
 revokeProductQuality(b,offer.productId,assessment.contentDigest,'Failed independent review');
 release(new Response(JSON.stringify({object:'account',id:'acct_fixture',charges_enabled:true,payouts_enabled:true})));
 await expect(pending).rejects.toThrow('quality gate');expect(request).toHaveBeenCalledTimes(1);
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
});
it('rejects reuse of an offer review after a technically passing product replacement',async()=>{
 const request=vi.fn();
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},request);
 setSalesPaused(a,false);qualityFixture();
 const original=checkoutActionScope(config.accountId,offer,a);
 const content=Buffer.from('Reviewed changed fixture download');
 assessProductQuality(a,offer.productId,'fixture.txt',content);
 expect(()=>new DigitalDelivery(a).register(offer.productId,'fixture.txt',content)).toThrow('immutable');
 // Simulate an inconsistent restore or out-of-band database writer. The normal
 // catalogue already forbids replacements; the independent review binding must
 // fail closed too, even when fresh technical checks pass for the new bytes.
 a.prepare('UPDATE commerce_assets SET content=?,sha256=? WHERE product_id=?').run(content,createHash('sha256').update(content).digest('hex'),offer.productId);
 expect(checkoutActionScope(config.accountId,offer,a).contextDigest).not.toBe(original.contextDigest);
 await expect(reviewedCheckout(checkout,offer)).rejects.toThrow();
 expect(request).not.toHaveBeenCalled();
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
});
it.each(['pending','in_transit','paid','failed','canceled'])('observes payout status %s without capital credit or personal data disclosure',async status=>{
 const request=vi.fn(async(url:unknown)=>new Response(JSON.stringify(String(url).endsWith('/account')?
  {object:'account',id:config.accountId,charges_enabled:true,payouts_enabled:true}:
  {object:'payout',id:'po_fixture',livemode:false,amount:1000,currency:'chf',status,arrival_date:1800000000,destination:'private-bank-details',description:'private-description'})));
 const checkout=new StripeCheckout(a,config,request),before=a.prepare('SELECT total_changes() n').get();
 const result=await checkout.observePayout('po_fixture');
 expect(result).toMatchObject({providerStatus:status,capitalCreditedCents:0,mode:'test',currency:'chf',amountCents:1000});
 expect(JSON.stringify(result)).not.toContain('private');
 expect(a.prepare('SELECT total_changes() n').get()).toEqual(before);
 expect(request).toHaveBeenCalledTimes(2);
 for(const call of request.mock.calls){const options=(call as unknown as [string,RequestInit])[1];expect(options.method).toBe('GET');expect(options.redirect).toBe('error');}
});
it('rejects payout mode mismatch and validates identifiers before contacting Stripe',async()=>{
 const request=vi.fn(async(url:unknown)=>new Response(JSON.stringify(String(url).endsWith('/account')?{object:'account',id:config.accountId}:
  {object:'payout',id:'po_fixture',livemode:true,amount:1000,currency:'chf',status:'paid',arrival_date:1800000000})));
 const checkout=new StripeCheckout(a,config,request);
 await expect(checkout.observePayout('../account')).rejects.toThrow('identifier');expect(request).not.toHaveBeenCalled();
 await expect(checkout.observePayout('po_fixture')).rejects.toThrow('mismatch');
});
it('blocks direct live checkout by default and observes a pause from another connection during account verification',async()=>{
 let release!:(response:Response)=>void;
 const request=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},request);
 await expect(reviewedCheckout(checkout,offer)).rejects.toThrow('Sales paused');
 expect(request).not.toHaveBeenCalled();
 qualityFixture();
 setSalesPaused(a,false);
 const pending=reviewedCheckout(checkout,offer);
 setSalesPaused(b,true);
 release(new Response(JSON.stringify({object:'account',id:'acct_fixture',charges_enabled:true,payouts_enabled:true})));
 await expect(pending).rejects.toThrow('Sales paused');
 expect(request).toHaveBeenCalledTimes(1);
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
});
it('retains validated offer values while asynchronous account verification is pending',async()=>{
 let release!:(response:Response)=>void;
 const request=vi.fn(async(input:unknown)=>String(input).endsWith('/account')?
   new Promise<Response>(resolve=>{release=resolve;}):new Response(JSON.stringify({...session(),livemode:true,id:'cs_live_fixture'})));
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},request);
 qualityFixture();
 setSalesPaused(a,false);
 const mutable={...offer};const pending=reviewedCheckout(checkout,mutable);
 mutable.amountCents=1;mutable.successUrl='http://invalid.example';mutable.productId='changed';
 release(new Response(JSON.stringify({object:'account',id:'acct_fixture',charges_enabled:true,payouts_enabled:true})));
 await expect(pending).resolves.toMatchObject({orderId:offer.orderId});
 const row=a.prepare('SELECT offer FROM commerce_orders').get() as {offer:string};
 expect(JSON.parse(row.offer)).toEqual(offer);
});
it.each([{id:'acct_wrong',charges_enabled:true,payouts_enabled:true},{id:'acct_fixture',charges_enabled:false,payouts_enabled:true},{id:'acct_fixture',charges_enabled:true,payouts_enabled:false}])('blocks live checkout before writes when account readiness fails %j',async fields=>{
 const request=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({object:'account',...fields})));
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},request);
 qualityFixture();
 setSalesPaused(a,false);
 await expect(reviewedCheckout(checkout,offer)).rejects.toThrow();
 expect(request).toHaveBeenCalledTimes(1);
 expect(request.mock.calls[0][0]).toBe('https://api.stripe.com/v1/account');
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
});
it('verifies key ownership before live creation and reports no sensitive account details',async()=>{
 const request=vi.fn(async(input:unknown)=>new Response(JSON.stringify(String(input).endsWith('/account')?
   {object:'account',id:'acct_fixture',charges_enabled:true,payouts_enabled:true,email:'private@example.invalid',external_accounts:{data:['private']}}:
   {...session(),livemode:true,id:'cs_live_fixture'})));
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},request);
 qualityFixture();
 setSalesPaused(a,false);
 const report=await checkout.checkAccount();expect(report.readyForLiveCheckout).toBe(true);expect(JSON.stringify(report)).not.toContain('private');
 await reviewedCheckout(checkout,offer);
 expect(request.mock.calls.map(c=>c[0])).toEqual(['https://api.stripe.com/v1/account','https://api.stripe.com/v1/account','https://api.stripe.com/v1/checkout/sessions']);
});
it('sanitizes account verification errors and never creates checkout on failure',async()=>{
 const checkout=new StripeCheckout(a,{...config,mode:'live',secretKey:'sk_live_synthetic',allowLive:true},async()=>{throw Error('secret provider details');});
 qualityFixture();
 setSalesPaused(a,false);
 await expect(reviewedCheckout(checkout,offer)).rejects.toThrow('verification unavailable');
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
});
const balance=()=>({id:"pi_fixture",status:"succeeded",livemode:false,amount:1000,amount_received:1000,currency:"chf",
  latest_charge:{id:"ch_fixture",payment_intent:"pi_fixture",livemode:false,amount:1000,amount_captured:1000,currency:"chf",paid:true,captured:true,refunded:false,amount_refunded:0,disputed:false,
    balance_transaction:{id:"txn_fixture",source:"ch_fixture",type:"charge",currency:"chf",amount:1000,fee:59,net:941,status:"available",available_on:1}}});
it('attributes reconciled provider amounts once across connections without crediting capital or economic revenue',async()=>{
 const file=path.join(dir,'agent.db'),target=createDatabase(file),other=createDatabase(file);
 try {
  target.raw.exec("INSERT INTO revenue_opportunities(id,name,status) VALUES('op','Fixture','validating'); INSERT INTO revenue_experiments(id,opportunity_id,status,hypothesis) VALUES('exp','op','running','fixture'),('other','op','running','other');");
  const request=vi.fn(async(input:unknown)=>new Response(JSON.stringify(String(input).includes('payment_intents')?balance():session())));
  const checkout=new StripeCheckout(a,config,request);await reviewedCheckout(checkout,offer);const paid=signed();checkout.webhook(paid.raw,paid.signature);
  expect(()=>attributeCommerceObservation(a,target.raw,'order1','exp',true)).toThrow('Fresh');
  await checkout.reconcile('order1');
  expect(()=>attributeCommerceObservation(a,target.raw,'order1','exp')).toThrow('test');
  expect(attributeCommerceObservation(a,target.raw,'order1','exp',true)).toEqual({duplicate:false,capitalCreditedCents:0});
  expect(attributeCommerceObservation(b,other.raw,'order1','exp',true).duplicate).toBe(true);
  expect(()=>attributeCommerceObservation(a,target.raw,'order1','other',true)).toThrow('Conflicting');
  const review=new RevenueStore(other.raw).getExperimentReview('exp')!;
  expect(review.providerObservations[0]).toMatchObject({verification:'synthetic-provider-observation',observation:{grossCents:1000,providerFeeCents:59,providerNetCents:941,currency:'chf'}});
  expect(review.accounting?.actualRevenueCents).toBe(0);
  expect(syncCommerceHolds(a,target.raw)).toEqual({checked:1,held:0});
  const refund=signed({payment_intent:'pi_fixture',amount:100,currency:'chf'},'evt_attr_refund',undefined,'refund.created');checkout.webhook(refund.raw,refund.signature);
  expect(()=>attributeCommerceObservation(a,target.raw,'order1','exp',true)).toThrow('Unheld');
  target.raw.exec("CREATE TRIGGER reject_hold BEFORE INSERT ON obolus_commerce_holds BEGIN SELECT RAISE(ABORT,'fixture'); END");
  expect(()=>syncCommerceHolds(a,target.raw)).toThrow('fixture');
  expect(new RevenueStore(other.raw).getExperimentReview('exp')!.providerObservations[0].hold).toBeNull();
  target.raw.exec('DROP TRIGGER reject_hold');
  expect(syncCommerceHolds(b,other.raw)).toEqual({checked:1,held:1});
  expect(syncCommerceHolds(a,target.raw)).toEqual({checked:1,held:1});
  expect(new RevenueStore(other.raw).getExperimentReview('exp')!.blockers).toContain('provider_payment_hold');
  a.prepare("UPDATE commerce_orders SET status='paid'").run();a.prepare('DELETE FROM commerce_payment_holds').run();
  expect(syncCommerceHolds(a,target.raw)).toEqual({checked:1,held:1});
  const sync=startCommerceHoldSync(a,file,100);
  try {expect(sync.status()).toMatchObject({healthy:true,held:1});}finally{sync.close();sync.close();}
 }finally{target.close();other.close();}
});
it('automatically retries locked targets and recovers persisted holds after restart',async()=>{
 const file=path.join(dir,'sync-agent.db'),target=createDatabase(file);
 new StripeCheckout(a,config,mock());
 target.raw.exec("CREATE TABLE obolus_commerce_observations(id TEXT PRIMARY KEY,account_id TEXT,mode TEXT,order_id TEXT); INSERT INTO obolus_commerce_observations VALUES('obs','acct_fixture','test','missing');");
 vi.useFakeTimers();
 const sync=startCommerceHoldSync(a,file,100);
 try {
  expect(sync.status()).toMatchObject({healthy:true,held:1});
  target.raw.exec('BEGIN IMMEDIATE');
  await vi.advanceTimersByTimeAsync(100);expect(sync.status().healthy).toBe(false);
  target.raw.exec('ROLLBACK');
  await vi.advanceTimersByTimeAsync(100);expect(sync.status()).toMatchObject({healthy:true,held:1});
  sync.close();expect(vi.getTimerCount()).toBe(0);
  const restart=startCommerceHoldSync(a,file,100);expect(restart.status().held).toBe(1);restart.close();
 }finally{if(target.raw.inTransaction)target.raw.exec('ROLLBACK');sync.close();vi.useRealTimers();target.close();}
});
function signed(object:unknown=session(),id="evt_fixture",at=Math.floor(Date.now()/1000),type="checkout.session.completed") {
  const raw=Buffer.from(JSON.stringify({id,type,livemode:false,data:{object}}));
  const signature=`t=${at},v1=${createHmac("sha256",config.webhookSecret).update(`${at}.`).update(raw).digest("hex")}`;
  return {raw,signature};
}
beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-checkout-"));a=new Database(path.join(dir,"test.db"));b=new Database(path.join(dir,"test.db"));});
afterEach(()=>{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});});
it("creates a provider checkout with stable idempotency and no stored keys",async()=>{
  const fetch=mock(),store=new StripeCheckout(a,config,fetch);
  await reviewedCheckout(store,offer);await reviewedCheckout(store,offer);
  expect(fetch).toHaveBeenCalledTimes(1);
  const args=(fetch.mock.calls as unknown as [string,RequestInit][])[0];
  expect(args[0]).toBe("https://api.stripe.com/v1/checkout/sessions");
  expect((args[1].headers as Record<string,string>)["Idempotency-Key"]).toBe("aureus-acct_fixture-order1");
  expect(a.prepare("SELECT * FROM commerce_stripe_config").all()).toEqual([{id:1,mode:"test",account_id:"acct_fixture"}]);
  await expect(reviewedCheckout(store,{...offer,amountCents:2000})).rejects.toThrow("Conflicting");
});
it("persists verified payment and one delivery intent across connections and restart",async()=>{
  const first=new StripeCheckout(a,config,mock()),second=new StripeCheckout(b,config,mock());await reviewedCheckout(first,offer);
  const event=signed();expect(first.webhook(event.raw,event.signature)).toMatchObject({duplicate:false});
  expect(second.webhook(event.raw,event.signature)).toMatchObject({duplicate:true});
  const another=signed(session(),"evt_second");second.webhook(another.raw,another.signature);
  a.close();a=new Database(path.join(dir,"test.db"));new StripeCheckout(a,config,mock());
  expect(a.prepare("SELECT * FROM commerce_delivery_queue").all()).toEqual([{order_id:"order1",status:"pending"}]);
  expect(a.prepare("SELECT status FROM commerce_orders").get()).toEqual({status:"paid"});
});
it.each([NaN, Infinity, -1, 1.5])('rejects invalid verification clock %s even for a signed event',now=>{
  const e=signed();
  expect(()=>verifyStripeEvent(e.raw,e.signature,config.webhookSecret,now)).toThrow();
});
it("rejects forged, tampered and stale signatures",()=>{
  const e=signed();expect(()=>verifyStripeEvent(e.raw,e.signature+"00",config.webhookSecret)).toThrow("signature");
  expect(()=>verifyStripeEvent(Buffer.concat([e.raw,Buffer.from(" ")]),e.signature,config.webhookSecret)).toThrow("signature");
  const stale=signed(session(),"evt_old",Math.floor(Date.now()/1000)-301);
  expect(()=>verifyStripeEvent(stale.raw,stale.signature,config.webhookSecret)).toThrow("timestamp");
});
it.each([{currency:"usd"},{amount_total:1},{metadata:{aureus_order_id:"other"}},{livemode:true}])("rejects signed mismatched payments %j",async changes=>{
  const store=new StripeCheckout(a,config,mock());await reviewedCheckout(store,offer);const e=signed({...session(),...changes});
  expect(()=>store.webhook(e.raw,e.signature)).toThrow("match");
  expect(a.prepare("SELECT COUNT(*) n FROM commerce_delivery_queue").get()).toEqual({n:0});
});
it("ignores unpaid completion and rolls back payment if delivery persistence fails",async()=>{
  const store=new StripeCheckout(a,config,mock());await reviewedCheckout(store,offer);
  const unpaid=signed({...session(),payment_status:"unpaid"});expect(store.webhook(unpaid.raw,unpaid.signature)).toEqual({ignored:true});
  a.exec("CREATE TRIGGER fail_delivery BEFORE INSERT ON commerce_delivery_queue BEGIN SELECT RAISE(ABORT,'fixture'); END");
  const e=signed();expect(()=>store.webhook(e.raw,e.signature)).toThrow("fixture");
  expect(a.prepare("SELECT status FROM commerce_orders").get()).toEqual({status:"checkout"});
  expect(a.prepare("SELECT COUNT(*) n FROM commerce_payment_events").get()).toEqual({n:0});
});
it("keeps uncertain orders for reconciliation and never leaks provider errors",async()=>{
  const provider=vi.fn(async()=>{throw new Error(config.secretKey);});const store=new StripeCheckout(a,config,provider);
  await expect(reviewedCheckout(store,offer)).rejects.toThrow("not confirmed");
  a.prepare("UPDATE commerce_orders SET created_ms=?").run(Date.now()-24*3600000);
  await expect(reviewedCheckout(store,offer)).rejects.toThrow("reconciliation");expect(provider).toHaveBeenCalledTimes(1);
});
it("requires separate modes, explicit live activation and protected source/output",()=>{
  new StripeCheckout(a,config,mock());
  expect(()=>new StripeCheckout(a,{...config,mode:"live",secretKey:"sk_live_fixture"},mock())).toThrow("activation");
  expect(()=>new StripeCheckout(a,{...config,mode:"live",secretKey:"sk_live_fixture",allowLive:true},mock())).toThrow("mix");
  expect(isProtectedFile("C:/project/src/commerce/stripe-checkout.ts")).toBe(true);
  expect(isProtectedFile("C:/project/dist/commerce/stripe-checkout.js")).toBe(true);
});
it("reconciles provider fees and availability without crediting reinvestment capital",async()=>{
  const request=vi.fn(async(_url:any,init?:RequestInit)=>new Response(JSON.stringify(init?.method==="GET"?balance():session())));
  const store=new StripeCheckout(a,config,request);await reviewedCheckout(store,offer);const paid=signed();store.webhook(paid.raw,paid.signature);
  const report=await store.reconcile(offer.orderId);
  expect(report).toMatchObject({grossCents:1000,providerFeeCents:59,providerNetCents:941,providerAvailable:true,capitalCreditedCents:0});
  expect(request.mock.calls[1][0]).toContain("/v1/payment_intents/pi_fixture?");
  expect(a.prepare("SELECT COUNT(*) n FROM commerce_balance_checks").get()).toEqual({n:1});
  expect(JSON.stringify(a.prepare("SELECT * FROM commerce_balance_checks").all())).not.toContain(config.secretKey);
});
it.each(["pending","future","wrong-net","foreign-currency","refunded"])("handles balance condition %s without granting capital",async condition=>{
  const response=balance();
  if(condition==="pending")response.latest_charge.balance_transaction.status="pending";
  if(condition==="future")response.latest_charge.balance_transaction.available_on=Math.floor(Date.now()/1000)+86400;
  if(condition==="wrong-net")response.latest_charge.balance_transaction.net=999;
  if(condition==="foreign-currency")response.latest_charge.balance_transaction.currency="usd";
  if(condition==="refunded")response.latest_charge.amount_refunded=1;
  const store=new StripeCheckout(a,config,async(_url,init)=>new Response(JSON.stringify(init?.method==="GET"?response:session())));
  await reviewedCheckout(store,offer);const paid=signed();store.webhook(paid.raw,paid.signature);
  if(["pending","future"].includes(condition))expect(await store.reconcile(offer.orderId)).toMatchObject({providerAvailable:false,capitalCreditedCents:0});
  else {await expect(store.reconcile(offer.orderId)).rejects.toThrow("does not match");expect(a.prepare("SELECT COUNT(*) n FROM commerce_balance_checks").get()).toEqual({n:0});}
});
it("rejects a payment reversed by another connection during the provider lookup",async()=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const store=new StripeCheckout(a,config,async(_url,init)=>{if(init?.method==="GET"){await gate;return new Response(JSON.stringify(balance()));}return new Response(JSON.stringify(session()));});
  await reviewedCheckout(store,offer);const paid=signed();store.webhook(paid.raw,paid.signature);
  const pending=store.reconcile(offer.orderId);
  const refund=signed({payment_intent:"pi_fixture",amount:100,currency:"chf"},"evt_race",undefined,"refund.created");new StripeCheckout(b,config,mock()).webhook(refund.raw,refund.signature);
  release();await expect(pending).rejects.toThrow("changed during");
  expect(a.prepare("SELECT COUNT(*) n FROM commerce_balance_checks").get()).toEqual({n:0});
});
it.each(["refund.created","charge.dispute.created"])("revokes access for %s and does not restore it on late payment",async type=>{
  const store=new StripeCheckout(a,config,mock()),delivery=new DigitalDelivery(a);delivery.register(offer.productId,"fixture.txt",Buffer.from("fixture"));await reviewedCheckout(store,offer);
  const paid=signed();store.webhook(paid.raw,paid.signature);const grant=delivery.issue(offer.orderId);
  const reversal=signed({id:"re_fixture",payment_intent:"pi_fixture",amount:100,currency:"chf"},"evt_reversal",undefined,type);
  store.webhook(reversal.raw,reversal.signature);expect(store.webhook(reversal.raw,reversal.signature)).toEqual({duplicate:true});
  const late=signed(session(),"evt_late");store.webhook(late.raw,late.signature);
  expect(()=>delivery.download(grant.token)).toThrow();expect(()=>delivery.issue(offer.orderId)).toThrow();
  expect(a.prepare("SELECT status FROM commerce_orders").get()).toEqual({status:"payment_hold"});
});
it("persists a reversal arriving before checkout confirmation across restart",async()=>{
  let store=new StripeCheckout(a,config,mock());await reviewedCheckout(store,offer);
  const refund=signed({id:"re_fixture",payment_intent:"pi_fixture",amount:1000,currency:"chf"},"evt_early",undefined,"refund.updated");store.webhook(refund.raw,refund.signature);
  a.close();a=new Database(path.join(dir,"test.db"));store=new StripeCheckout(a,config,mock());
  const paid=signed();store.webhook(paid.raw,paid.signature);
  expect(a.prepare("SELECT status FROM commerce_orders").get()).toEqual({status:"payment_hold"});
  expect(a.prepare("SELECT status FROM commerce_delivery_queue").get()).toEqual({status:"revoked"});
});
it("reconstructs a missing historical payment binding on a valid duplicate event",async()=>{
  const store=new StripeCheckout(a,config,mock());await reviewedCheckout(store,offer);const paid=signed();store.webhook(paid.raw,paid.signature);
  a.prepare("DELETE FROM commerce_payment_bindings").run();
  const refund=signed({payment_intent:"pi_fixture",amount:100,currency:"chf"},"evt_unbound",undefined,"refund.updated");store.webhook(refund.raw,refund.signature);
  const delivery=new DigitalDelivery(a);delivery.register(offer.productId,"fixture.txt",Buffer.from("fixture"));
  expect(()=>delivery.issue(offer.orderId)).toThrow("Unmatched");
  expect(store.webhook(paid.raw,paid.signature)).toMatchObject({duplicate:true});
  expect(a.prepare("SELECT status FROM commerce_orders").get()).toEqual({status:"payment_hold"});
});
it("rejects mismatched reversals and rolls back a failed revocation",async()=>{
  const store=new StripeCheckout(a,config,mock());await reviewedCheckout(store,offer);const paid=signed();store.webhook(paid.raw,paid.signature);
  const wrong=signed({payment_intent:"pi_fixture",amount:100,currency:"usd"},"evt_wrong",undefined,"refund.created");expect(()=>store.webhook(wrong.raw,wrong.signature)).toThrow("match");
  a.exec("CREATE TRIGGER fail_revoke BEFORE UPDATE ON commerce_delivery_queue BEGIN SELECT RAISE(ABORT,'fixture'); END");
  const refund=signed({payment_intent:"pi_fixture",amount:100,currency:"chf"},"evt_refund",undefined,"refund.created");expect(()=>store.webhook(refund.raw,refund.signature)).toThrow("fixture");
  expect(a.prepare("SELECT COUNT(*) n FROM commerce_payment_holds").get()).toEqual({n:0});
  expect(a.prepare("SELECT status FROM commerce_orders").get()).toEqual({status:"paid"});
});
it("accepts the raw signed body at the actual HTTP boundary and rejects forged requests",async()=>{
  const store=new StripeCheckout(a,config,mock());await reviewedCheckout(store,offer);
  const server=await startStripeWebhook(store);
  const send=(signature:string,raw:Buffer)=>new Promise<number>((resolve,reject)=>{
    const req=http.request(server.url,{method:"POST",headers:{"Content-Type":"application/json","Stripe-Signature":signature}},res=>{res.resume();res.on("end",()=>resolve(res.statusCode!));});
    req.on("error",reject);req.end(raw);
  });
  try {const e=signed();expect(await send("t=0,v1=forged",e.raw)).toBe(400);expect(await send(e.signature,e.raw)).toBe(200);
    expect(await send(e.signature,e.raw)).toBe(200);
    expect(a.prepare("SELECT COUNT(*) n FROM commerce_delivery_queue").get()).toEqual({n:1});
  } finally {await server.close();}
});
it("refuses unrelated databases without modifying them and never overwrites an existing file",()=>{
  const file=path.join(dir,"test.db");a.exec("CREATE TABLE preserved(value TEXT); INSERT INTO preserved VALUES('keep')");
  expect(()=>openCommerce(file,config)).toThrow();expect(()=>openCommerce(file,config,true)).toThrow();
  expect(a.prepare("SELECT * FROM preserved").get()).toEqual({value:"keep"});
  const fresh=path.join(dir,"commerce.db"),workspace=openCommerce(fresh,config,true);workspace.db.close();
  const reopened=openCommerce(fresh,config);reopened.db.close();
});
it("uses the same idempotency key across concurrent database connections",async()=>{
  const fetch=mock(),first=new StripeCheckout(a,config,fetch),second=new StripeCheckout(b,config,fetch);
  const [one,two]=await Promise.all([reviewedCheckout(first,offer),reviewedCheckout(second,offer)]);
  expect(one).toEqual(two);
  const calls=fetch.mock.calls as unknown as [string,RequestInit][];
  expect(calls).toHaveLength(2);
  expect((calls[0][1].headers as Record<string,string>)["Idempotency-Key"]).toEqual((calls[1][1].headers as Record<string,string>)["Idempotency-Key"]);
  expect(a.prepare("SELECT COUNT(*) n FROM commerce_orders").get()).toEqual({n:1});
});
it("delivers only after signed payment and honors revocation over the real HTTP boundary",async()=>{
  const store=new StripeCheckout(a,config,mock()),delivery=new DigitalDelivery(a);
  delivery.register(offer.productId,"fixture.txt",Buffer.from("paid fixture"));await reviewedCheckout(store,offer);
  expect(()=>delivery.issue(offer.orderId)).toThrow();
  const server=await startStripeWebhook(store,0,delivery);
  const get=(token:string)=>new Promise<{status:number;body:string;type:string|undefined}>((resolve,reject)=>{
    const req=http.get(server.url.replace("/stripe/webhook","/download"),{headers:{Authorization:`Bearer ${token}`}},res=>{
      const chunks:Buffer[]=[];res.on("data",chunk=>chunks.push(Buffer.from(chunk)));res.on("end",()=>resolve({status:res.statusCode!,body:Buffer.concat(chunks).toString(),type:res.headers["content-type"]}));
    });req.on("error",reject);
  });
  try {
    const e=signed();store.webhook(e.raw,e.signature);
    const grant=delivery.issue(offer.orderId);
    expect(await get("wrong")).toMatchObject({status:404});
    expect(await get(grant.token)).toEqual({status:200,body:"paid fixture",type:"application/octet-stream"});
    delivery.revoke(offer.orderId);
    expect(await get(grant.token)).toMatchObject({status:404});
    const replay=signed(session(),"evt_later");store.webhook(replay.raw,replay.signature);
    expect(()=>delivery.issue(offer.orderId)).toThrow();
  }finally{await server.close();}
});
