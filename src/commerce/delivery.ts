import {createHash,randomBytes} from "node:crypto";
import type {Database} from "better-sqlite3";
import {assertProductQuality} from './product-quality.js';
import {assertCheckoutRelease,type CheckoutOffer} from './stripe-checkout.js';
import {securityTransaction} from '../security/action-gate.js';

const hash=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
const validId=(id:string)=>typeof id==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
/** Immutable, bounded product blobs: the public download path never reads a filesystem path. */
export class DigitalDelivery {
  constructor(private db:Database) {
    if(!db.prepare("SELECT 1 FROM commerce_stripe_config WHERE id=1").get()) throw new Error("Commerce workspace required");
    db.exec(`CREATE TABLE IF NOT EXISTS commerce_assets(product_id TEXT PRIMARY KEY,filename TEXT NOT NULL,sha256 TEXT NOT NULL,content BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS commerce_downloads(order_id TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,expires_ms INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS commerce_delivery_audit(id INTEGER PRIMARY KEY,order_id TEXT NOT NULL,action TEXT NOT NULL,created_ms INTEGER NOT NULL);`);
  }
  register(productId:string,filename:string,content:Buffer) {
    if(!validId(productId)||typeof filename!=="string"||! /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(filename)||filename.includes("..")||
      !Buffer.isBuffer(content)||content.length<1||content.length>10*1024*1024) throw new Error("Invalid digital product");
    const sha256=hash(content);
    this.db.transaction(()=>{
      const old=this.db.prepare("SELECT filename,sha256,content FROM commerce_assets WHERE product_id=?").get(productId) as {filename:string;sha256:string;content:Buffer}|undefined;
      if(old&&(old.filename!==filename||old.sha256!==sha256))throw new Error("Product version is immutable; use a new product ID");
      if(old&&(!Buffer.isBuffer(old.content)||hash(old.content)!==old.sha256))throw new Error("Stored product integrity failure; explicit reconciliation required");
      assertProductQuality(this.db,productId,{filename,content});
      if(old)return;
      const size=(this.db.prepare("SELECT COALESCE(SUM(length(content)),0) n FROM commerce_assets").get() as {n:number}).n;
      if(size+content.length>100*1024*1024) throw new Error("Digital catalogue capacity reached");
      this.db.prepare("INSERT INTO commerce_assets VALUES(?,?,?,?)").run(productId,filename,sha256,content);
    }).immediate();
    return {productId,sha256,bytes:content.length};
  }
  private paid(orderId:string) {
    if(this.db.prepare("SELECT 1 FROM commerce_payment_holds h LEFT JOIN commerce_payment_bindings b ON b.payment_intent=h.payment_intent WHERE b.order_id IS NULL LIMIT 1").get()) throw new Error("Unmatched payment reversal requires reconciliation");
    const order=this.db.prepare(`SELECT o.offer FROM commerce_orders o JOIN commerce_delivery_queue q ON q.order_id=o.id
      WHERE o.id=? AND o.status='paid' AND q.status IN ('pending','available')`).get(orderId) as {offer:string}|undefined;
    if(!order) throw new Error("Download unavailable");
    return JSON.parse(order.offer).productId as string;
  }
  /** Operator/checkout integration only. Never expose this minting function as an unauthenticated endpoint. */
  private assertRelease(orderId:string){
    const config=this.db.prepare('SELECT * FROM commerce_stripe_config WHERE id=1').get() as {mode:string;account_id?:string}|undefined;
    if(!config||!['test','live'].includes(config.mode)||!config.account_id)throw Error('Known commerce mode and account required');
    const row=this.db.prepare('SELECT offer FROM commerce_orders WHERE id=?').get(orderId) as {offer:string}|undefined;
    if(!row)throw Error('Bound release offer required');
    assertCheckoutRelease(this.db,config.account_id,JSON.parse(row.offer) as CheckoutOffer);
  }
  issue(orderId:string,ttlSeconds=86400) {
    if(!validId(orderId)||!Number.isInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>7*86400) throw new Error("Invalid download grant");
    return securityTransaction(this.db,()=>{
      const productId=this.paid(orderId);
      assertProductQuality(this.db,productId);
      this.assertRelease(orderId);
      if(!this.db.prepare("SELECT 1 FROM commerce_assets WHERE product_id=?").get(productId)) throw new Error("Product content not registered");
      const token=randomBytes(32).toString("hex"),expiresAt=Date.now()+ttlSeconds*1000;
      this.db.prepare(`INSERT INTO commerce_downloads(order_id,token_hash,expires_ms) VALUES(?,?,?)
        ON CONFLICT(order_id) DO UPDATE SET token_hash=excluded.token_hash,expires_ms=excluded.expires_ms,attempts=0`).run(orderId,hash(token),expiresAt);
      this.db.prepare("UPDATE commerce_delivery_queue SET status='available' WHERE order_id=?").run(orderId);
      this.db.prepare("INSERT INTO commerce_delivery_audit(order_id,action,created_ms) VALUES(?,'issue',?)").run(orderId,Date.now());
      return {token,expiresAt};
    }).immediate();
  }
  download(token:string) {
    if(typeof token!=="string"||!/^[a-f0-9]{64}$/.test(token)) throw new Error("Download unavailable");
    return this.readGrant(hash(token));
  }
  /** Trusted server only: caller must authenticate and bind the buyer to this order. */
  downloadPurchased(orderId:string) {
    return securityTransaction(this.db,()=>{
      this.paid(orderId);
      let grant=this.db.prepare("SELECT token_hash FROM commerce_downloads WHERE order_id=?").get(orderId) as {token_hash:string}|undefined;
      if(!grant) {this.issue(orderId);grant=this.db.prepare("SELECT token_hash FROM commerce_downloads WHERE order_id=?").get(orderId) as {token_hash:string};}
      return this.readGrant(grant.token_hash);
    }).immediate();
  }
  private readGrant(tokenHash:string) {
    return securityTransaction(this.db,()=>{
      const grant=this.db.prepare("SELECT order_id,expires_ms,attempts FROM commerce_downloads WHERE token_hash=?").get(tokenHash) as {order_id:string;expires_ms:number;attempts:number}|undefined;
      if(!grant||grant.expires_ms<=Date.now()||grant.attempts>=10) throw new Error("Download unavailable");
      const productId=this.paid(grant.order_id);
      const asset=this.db.prepare("SELECT filename,sha256,content FROM commerce_assets WHERE product_id=?").get(productId) as {filename:string;sha256:string;content:Buffer}|undefined;
      if(!asset||hash(asset.content)!==asset.sha256) throw new Error("Download unavailable");
      assertProductQuality(this.db,productId,asset);
      this.assertRelease(grant.order_id);
      this.db.prepare("UPDATE commerce_downloads SET attempts=attempts+1 WHERE order_id=?").run(grant.order_id);
      this.db.prepare("INSERT INTO commerce_delivery_audit(order_id,action,created_ms) VALUES(?,'download_attempt',?)").run(grant.order_id,Date.now());
      return {filename:asset.filename,content:asset.content};
    }).immediate();
  }
  revoke(orderId:string) {
    this.db.transaction(()=>{
      this.db.prepare("DELETE FROM commerce_downloads WHERE order_id=?").run(orderId);
      this.db.prepare("UPDATE commerce_delivery_queue SET status='revoked' WHERE order_id=?").run(orderId);
      this.db.prepare("INSERT INTO commerce_delivery_audit(order_id,action,created_ms) VALUES(?,'revoke',?)").run(orderId,Date.now());
    }).immediate();
  }
}
