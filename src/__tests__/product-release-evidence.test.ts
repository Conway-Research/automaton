import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {StripeCheckout,checkoutActionScope,assertCheckoutRelease,PRODUCT_RELEASE_EVIDENCE,type CheckoutOffer} from '../commerce/stripe-checkout.js';
import {DigitalDelivery} from '../commerce/delivery.js';
import {registerProductQuality,assessProductQuality} from '../commerce/product-quality.js';
import {fixtureSecurityReview,fixturePublicationContext} from './fixtures/security-review.js';
import {revokeActionReview,evaluateActionGate} from '../security/action-gate.js';
import {setSalesPaused} from '../commerce/sales-control.js';
import {isProtectedFile} from '../self-mod/code.js';

let db:Database.Database,dir:string,delivery:DigitalDelivery,checkout:StripeCheckout;
const request=vi.fn();
const offer:CheckoutOffer={orderId:'order',productId:'guide',title:'Fixture guide',amountCents:1000,currency:'chf',successUrl:'https://example.invalid/success',cancelUrl:'https://example.invalid/cancel',publication:fixturePublicationContext};
beforeEach(()=>{
 request.mockReset();dir=fs.mkdtempSync(path.join(os.tmpdir(),'obolus-release-'));db=new Database(path.join(dir,'test.db'));
 checkout=new StripeCheckout(db,{mode:'live',secretKey:'sk_live_synthetic',webhookSecret:'whsec_synthetic_test_secret',allowLive:true,accountId:'acct_fixture'},request);
 setSalesPaused(db,false);
 registerProductQuality(db,{productId:'guide',format:'text',purpose:'Fixture only',audience:'Fixture',minBytes:1,maxBytes:1000,requiredText:['Install'],forbiddenText:[],requiredJsonKeys:[]});
 const content=Buffer.from('Install locally.');assessProductQuality(db,'guide','guide.txt',content);delivery=new DigitalDelivery(db);delivery.register('guide','guide.txt',content);
});
afterEach(()=>{vi.useRealTimers();db.close();fs.rmSync(dir,{recursive:true,force:true});});
const scope=()=>checkoutActionScope('acct_fixture',offer,db);
it('reuses only the exact storefront transaction placeholder while binding every other redirect parameter',()=>{
 const first={...offer,orderId:'one',successUrl:'https://example.invalid/purchase?order=one'};
 const second={...first,orderId:'two',successUrl:'https://example.invalid/purchase?order=two'};
 expect(checkoutActionScope('acct_fixture',first,db)).toEqual(checkoutActionScope('acct_fixture',second,db));
 expect(checkoutActionScope('acct_fixture',{...second,successUrl:second.successUrl+'&target=elsewhere'},db).contextDigest).not.toBe(checkoutActionScope('acct_fixture',first,db).contextDigest);
 expect(checkoutActionScope('acct_fixture',{...second,successUrl:first.successUrl},db).contextDigest).not.toBe(checkoutActionScope('acct_fixture',first,db).contextDigest);
});
it.each(PRODUCT_RELEASE_EVIDENCE)('cannot compensate missing evidence for %s with other approved domains',async missing=>{
 fixtureSecurityReview(db,scope(),Date.now(),PRODUCT_RELEASE_EVIDENCE.filter(v=>v!==missing));
 expect(evaluateActionGate(db,scope())).toEqual({state:'INSUFFICIENT_EVIDENCE',reason:'REQUIRED_EVIDENCE_ABSENT'});
 await expect(checkout.checkout(offer)).rejects.toThrow('REQUIRED_EVIDENCE_ABSENT');
 expect(request).not.toHaveBeenCalled();
 expect(db.prepare('SELECT reason FROM obolus_security_audit ORDER BY id DESC LIMIT 1').get()).toEqual({reason:'REQUIRED_EVIDENCE_ABSENT'});
 expect(db.prepare('SELECT COUNT(*) n FROM commerce_orders').get()).toEqual({n:0});
});
it('accepts complete current scoped evidence but rejects expiry and offer changes',()=>{
 const now=Date.now();fixtureSecurityReview(db,scope(),now,PRODUCT_RELEASE_EVIDENCE);
 expect(()=>assertCheckoutRelease(db,'acct_fixture',offer)).not.toThrow();
 expect(()=>assertCheckoutRelease(db,'acct_fixture',{...offer,title:'Guaranteed profit'})).toThrow('REVIEW_ABSENT');
 vi.useFakeTimers();vi.setSystemTime(now+600001);expect(()=>assertCheckoutRelease(db,'acct_fixture',offer)).toThrow('STALE_EVIDENCE');
});
it('preserves revocation after restart and never grants privileges through the quality plan',()=>{
 fixtureSecurityReview(db,scope(),Date.now(),PRODUCT_RELEASE_EVIDENCE);revokeActionReview(db,scope());
 db.close();db=new Database(path.join(dir,'test.db'));expect(()=>assertCheckoutRelease(db,'acct_fixture',offer)).toThrow('REVIEW_REVOKED');
 expect(isProtectedFile('src/commerce/quality-review.ts')).toBe(true);
 expect(Object.isFrozen(PRODUCT_RELEASE_EVIDENCE)).toBe(true);
});
it('rechecks existing download grants and keeps a denial audit when the release review is revoked',()=>{
 fixtureSecurityReview(db,scope(),Date.now(),PRODUCT_RELEASE_EVIDENCE);
 db.prepare("INSERT INTO commerce_orders(id,offer,digest,created_ms,status) VALUES(?,?,?,?,'paid')").run(offer.orderId,JSON.stringify(offer),'fixture',Date.now());
 db.prepare("INSERT INTO commerce_delivery_queue(order_id,status) VALUES(?,'pending')").run(offer.orderId);
 const grant=delivery.issue(offer.orderId);expect(delivery.download(grant.token).content.toString()).toBe('Install locally.');
 revokeActionReview(db,scope());expect(()=>delivery.download(grant.token)).toThrow('REVIEW_REVOKED');
 expect(db.prepare('SELECT attempts FROM commerce_downloads').get()).toEqual({attempts:1});
 expect(db.prepare('SELECT reason FROM obolus_security_audit ORDER BY id DESC LIMIT 1').get()).toEqual({reason:'REVIEW_REVOKED'});
 expect(()=>delivery.issue(offer.orderId)).toThrow('REVIEW_REVOKED');
});
