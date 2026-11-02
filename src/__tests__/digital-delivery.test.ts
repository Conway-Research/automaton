import {beforeEach,afterEach,it,expect} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {StripeCheckout,checkoutActionScope,PRODUCT_RELEASE_EVIDENCE,type CheckoutOffer} from "../commerce/stripe-checkout.js";
import {registerProductQuality,assessProductQuality} from '../commerce/product-quality.js';
import {fixtureSecurityReview,fixturePublicationContext} from './fixtures/security-review.js';
import {DigitalDelivery} from "../commerce/delivery.js";
let dir:string,a:Database.Database,b:Database.Database,delivery:DigitalDelivery;
beforeEach(()=>{
  dir=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-delivery-"));a=new Database(path.join(dir,"test.db"));b=new Database(path.join(dir,"test.db"));
  new StripeCheckout(a,{mode:"test",secretKey:"sk_test_fixture",webhookSecret:"whsec_synthetic_test",accountId:"acct_fixture"});
  delivery=new DigitalDelivery(a);delivery.register("product","product.txt",Buffer.from("synthetic product"));
  registerProductQuality(a,{productId:'product',format:'text',purpose:'Synthetic fixture',audience:'test',minBytes:1,maxBytes:1000,requiredText:['synthetic'],forbiddenText:[],requiredJsonKeys:[]});
  assessProductQuality(a,'product','product.txt',Buffer.from('synthetic product'));
  const offer:CheckoutOffer={orderId:'order',productId:'product',title:'Fixture',amountCents:100,currency:'chf',successUrl:'https://example.invalid/success',cancelUrl:'https://example.invalid/cancel',publication:fixturePublicationContext};
  fixtureSecurityReview(a,checkoutActionScope('acct_fixture',offer,a),Date.now(),PRODUCT_RELEASE_EVIDENCE);
  a.prepare("INSERT INTO commerce_orders(id,offer,digest,created_ms,status) VALUES('order',?,'fixture',0,'paid')").run(JSON.stringify(offer));
  a.prepare("INSERT INTO commerce_delivery_queue(order_id) VALUES('order')").run();
});
afterEach(()=>{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});});
it("denies unpaid orders and unknown tokens",()=>{
  a.prepare("UPDATE commerce_orders SET status='checkout'").run();expect(()=>delivery.issue("order")).toThrow("unavailable");
  expect(()=>delivery.download("a".repeat(64))).toThrow("unavailable");
});
it('does not acknowledge a corrupt prior product as successful idempotent registration',()=>{
 a.prepare('UPDATE commerce_assets SET content=? WHERE product_id=?').run(Buffer.from('corrupt'),'product');
 expect(()=>delivery.register('product','product.txt',Buffer.from('synthetic product'))).toThrow('integrity');
 expect((a.prepare('SELECT content FROM commerce_assets WHERE product_id=?').get('product') as {content:Buffer}).content.toString()).toBe('corrupt');
 expect(a.prepare('SELECT COUNT(*) n FROM commerce_downloads').get()).toEqual({n:0});
});
it("stores only a token hash, survives restart and serves immutable bytes",()=>{
  const grant=delivery.issue("order");
  expect((a.prepare("SELECT token_hash FROM commerce_downloads").get() as {token_hash:string}).token_hash).not.toBe(grant.token);
  a.close();a=new Database(path.join(dir,"test.db"));delivery=new DigitalDelivery(a);
  expect(delivery.download(grant.token).content.toString()).toBe("synthetic product");
  expect(()=>delivery.register("product","product.txt",Buffer.from("changed"))).toThrow("immutable");
});
it("limits attempts across connections and does not resurrect revoked delivery",()=>{
  const other=new DigitalDelivery(b),grant=delivery.issue("order");
  for(let i=0;i<10;i++) (i%2?other:delivery).download(grant.token);
  expect(()=>other.download(grant.token)).toThrow("unavailable");
  const replacement=delivery.issue("order");expect(()=>other.download(grant.token)).toThrow();
  other.revoke("order");expect(()=>delivery.download(replacement.token)).toThrow();expect(()=>delivery.issue("order")).toThrow();
});
it("rejects expiry, corrupt content and path/header injection",()=>{
  const grant=delivery.issue("order");a.prepare("UPDATE commerce_downloads SET expires_ms=0").run();expect(()=>delivery.download(grant.token)).toThrow();
  const next=delivery.issue("order");a.prepare("UPDATE commerce_assets SET content=?").run(Buffer.from("tamper"));expect(()=>delivery.download(next.token)).toThrow();
  expect(()=>delivery.register("other","../wallet.json",Buffer.from("x"))).toThrow();
  expect(()=>delivery.register("other","file\r\nHeader.txt",Buffer.from("x"))).toThrow();
});
it("rolls back issuance if audit persistence fails",()=>{
  a.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON commerce_delivery_audit BEGIN SELECT RAISE(ABORT,'fixture'); END");
  expect(()=>delivery.issue("order")).toThrow("fixture");expect(a.prepare("SELECT COUNT(*) n FROM commerce_downloads").get()).toEqual({n:0});
  expect(a.prepare("SELECT status FROM commerce_delivery_queue").get()).toEqual({status:"pending"});
});
