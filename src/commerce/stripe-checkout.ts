import {securityTransaction} from '../security/action-gate.js';
import {createHash,createHmac,timingSafeEqual} from "node:crypto";
import type {Database} from "better-sqlite3";
import {initializeSalesControl,salesPaused} from './sales-control.js';
import {assertProductQuality} from './product-quality.js';
import {assertActionGate,actionContextDigest} from '../security/action-gate.js';
import {PRODUCT_RELEASE_EVIDENCE} from './quality-review.js';
import {validatePublicationContext,type PublicationContext} from './claim-evidence.js';
export {PRODUCT_RELEASE_EVIDENCE} from './quality-review.js';
/** The trusted review must cover each applicable area and the exact advertised
 * offer. Ordinary generated plans cannot register reviews. No quality score
 * compensates for missing, stale, denied or unverifiable evidence. */
export function assertCheckoutRelease(db:Database,accountId:string,offer:CheckoutOffer){
 assertActionGate(db,checkoutActionScope(accountId,offer,db),Date.now(),PRODUCT_RELEASE_EVIDENCE);
}

/** Reviews bind the exact deliverable and immutable requirements, not just its
 * catalogue ID. A technically valid replacement still needs its own review. */
export function checkoutActionScope(accountId:string,offer:CheckoutOffer,db:Database){
 const qualityDecision=assertProductQuality(db,offer.productId);
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='obolus_product_quality_contracts'").get())throw Error('Exact reviewed product and requirements required');
 const asset=db.prepare('SELECT filename,content FROM commerce_assets WHERE product_id=?').get(offer.productId) as {filename:string;content:Buffer}|undefined;
 const contract=db.prepare('SELECT payload,digest FROM obolus_product_quality_contracts WHERE product_id=?').get(offer.productId) as {payload:string;digest:string}|undefined;
 if(!asset||!contract||digest(contract.payload)!==contract.digest)throw Error('Exact reviewed product and requirements required');
 if(offer.publication)validatePublicationContext(offer.publication);
 const contentDigest=createHash('sha256').update(asset.content).digest('hex');
 const mode=(db.prepare('SELECT mode FROM commerce_stripe_config WHERE id=1').get() as {mode:string}|undefined)?.mode;
 if(!['test','live'].includes(mode??''))throw Error('Explicit checkout mode required');
 const success=new URL(offer.successUrl);
 // Only the storefront's exact per-order routing token is a transaction value,
 // not a different marketing claim. Every other URL byte remains review-bound.
 if(success.pathname==='/purchase'&&[...success.searchParams.keys()].length===1&&success.searchParams.get('order')===offer.orderId)
  success.searchParams.set('order','{orderId}');
 const contextDigest=actionContextDigest({mode,productId:offer.productId,title:offer.title,
  amountCents:offer.amountCents,currency:offer.currency,successUrl:success.toString(),cancelUrl:offer.cancelUrl,
  filename:asset.filename,contentDigest,requirementsDigest:contract.digest,qualityDecision,...(offer.publication?{publication:offer.publication}:{})});
 return {activity:'live-checkout',component:accountId,contextDigest,...(offer.publication?{claimTarget:{...offer.publication,productDigest:contentDigest,requirementsDigest:contract.digest,payloadDigest:contextDigest,
  assertions:[{statement:offer.title},{statement:`${offer.amountCents} ${offer.currency} minor units`,type:'price' as const}]}}:{})};
}

export interface CheckoutOffer {
  orderId:string; productId:string; title:string; amountCents:number; currency:"chf"|"eur"|"usd";
  successUrl:string; cancelUrl:string;
  publication?:PublicationContext;
}
export interface StripeConfig {secretKey:string; webhookSecret:string; mode:"test"|"live"; allowLive?:boolean; accountId:string}
type Order={id:string;offer:string;digest:string;created_ms:number;session_id:string|null;checkout_url:string|null;status:string};
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
const identifier=(s:unknown)=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
function redirect(value:string) {
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.hash) throw new Error("Checkout return URL must be HTTPS without credentials or fragment");
}

/** Bounded manual verification following Stripe's documented HMAC-SHA256 scheme. */
export function verifyStripeEvent(raw:Buffer,header:string,secret:string,now=Date.now()): Record<string,any> {
  if(!Number.isSafeInteger(now)||now<0)throw new Error("Invalid webhook verification clock");
  if(!raw.length||raw.length>262144||typeof header!=="string"||header.length>4096||!secret.startsWith("whsec_")||secret.length<16) throw new Error("Invalid webhook input");
  const parts=header.split(",").map(x=>x.trim().split("="));
  const times=parts.filter(x=>x[0]==="t");
  if(times.length!==1||!/^\d{1,12}$/.test(times[0][1])||Math.abs(now/1000-Number(times[0][1]))>300) throw new Error("Invalid webhook timestamp");
  const expected=createHmac("sha256",secret).update(times[0][1]+".").update(raw).digest();
  const valid=parts.some(([kind,value])=>kind==="v1"&&/^[a-f0-9]{64}$/.test(value)&&timingSafeEqual(expected,Buffer.from(value,"hex")));
  if(!valid) throw new Error("Invalid webhook signature");
  const event=JSON.parse(raw.toString("utf8"));
  if(!event||!identifier(event.id)||typeof event.type!=="string"||typeof event.livemode!=="boolean"||!event.data?.object) throw new Error("Invalid webhook event");
  return event;
}

/** Payment confirmation is not settled net cash. This adapter never credits the capital budget. */
export class StripeCheckout {
  /** Provider-side observation only. Even a paid payout is not proof of receipt at the destination bank. */
  async observePayout(payoutId:string){
    if(typeof payoutId!=='string'||!/^po_[A-Za-z0-9]{1,100}$/.test(payoutId))throw new Error('Invalid payout identifier');
    await this.checkAccount();
    let payout:any;
    try{
      const response=await this.request(`https://api.stripe.com/v1/payouts/${payoutId}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${this.config.secretKey}`}});
      if(!response.ok||!response.body)throw new Error('unavailable');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>262144)throw new Error('oversized');chunks.push(part.value);}}finally{await reader.cancel();}
      payout=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }catch{throw new Error('Stripe payout observation unavailable');}
    if(payout?.object!=='payout'||payout.id!==payoutId||payout.livemode!==(this.config.mode==='live')||
      !Number.isSafeInteger(payout.amount)||payout.amount<=0||payout.amount>100000000||!['chf','eur','usd'].includes(payout.currency)||
      !['pending','in_transit','paid','failed','canceled'].includes(payout.status)||!Number.isSafeInteger(payout.arrival_date)||payout.arrival_date<0)
      throw new Error('Stripe payout observation mismatch');
    return {payoutId,providerAccount:this.config.accountId,mode:this.config.mode,amountCents:payout.amount as number,currency:payout.currency as string,
      providerStatus:payout.status as string,expectedArrivalSeconds:payout.arrival_date as number,observedAt:Date.now(),capitalCreditedCents:0,
      limitation:'Provider observation only. Independently verify destination cash receipt and retained liabilities before crediting capital; paid status is insufficient.'};
  }
  /** Fresh check of the account owning this key. Never return personal account details. */
  async checkAccount() {
    let account:any;
    try {
      const response=await this.request('https://api.stripe.com/v1/account',{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${this.config.secretKey}`}});
      if(!response.ok||!response.body)throw new Error('unavailable');
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
      try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>262144)throw new Error('oversized');chunks.push(item.value);}}
      finally {await reader.cancel();}
      account=JSON.parse(Buffer.concat(chunks).toString());
    }catch{throw new Error('Stripe account verification unavailable; live checkout blocked');}
    if(account?.object!=='account'||account.id!==this.config.accountId)throw new Error('Stripe key/account mismatch; live checkout blocked');
    const chargesEnabled=account.charges_enabled===true,payoutsEnabled=account.payouts_enabled===true;
    return {mode:this.config.mode,accountMatches:true,chargesEnabled,payoutsEnabled,
      readyForLiveCheckout:this.config.mode==='live'&&chargesEnabled&&payoutsEnabled,observedAt:Date.now(),
      limitation:'Account capability check only; no proof of payout receipt, profit, complete product readiness or autonomous spending permission.'};
  }
  constructor(private db:Database,private config:StripeConfig,private request:typeof fetch=fetch) {
    this.config=Object.freeze({...config});
    if(!["test","live"].includes(config.mode)||!config.secretKey.startsWith(`sk_${config.mode}_`)||!config.webhookSecret.startsWith("whsec_")||config.webhookSecret.length<16||
      !/^acct_[A-Za-z0-9]+$/.test(config.accountId)||config.mode==="live"&&!config.allowLive) throw new Error("Stripe configuration incomplete or live activation missing");
    securityTransaction(db,()=>{
      db.exec(`CREATE TABLE IF NOT EXISTS commerce_stripe_config(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL,account_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS commerce_orders(id TEXT PRIMARY KEY,offer TEXT NOT NULL,digest TEXT NOT NULL,created_ms INTEGER NOT NULL,
          session_id TEXT UNIQUE,checkout_url TEXT,status TEXT NOT NULL DEFAULT 'prepared');
        CREATE TABLE IF NOT EXISTS commerce_payment_events(id TEXT PRIMARY KEY,digest TEXT NOT NULL,order_id TEXT NOT NULL,session_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS commerce_delivery_queue(order_id TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending');
        CREATE TABLE IF NOT EXISTS commerce_payment_bindings(order_id TEXT PRIMARY KEY,payment_intent TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS commerce_payment_holds(event_id TEXT PRIMARY KEY,digest TEXT NOT NULL,payment_intent TEXT NOT NULL,currency TEXT NOT NULL,amount_cents INTEGER NOT NULL,kind TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS commerce_balance_checks(id INTEGER PRIMARY KEY,order_id TEXT NOT NULL,transaction_id TEXT NOT NULL,report TEXT NOT NULL,observed_ms INTEGER NOT NULL);`);
      const old=db.prepare("SELECT mode,account_id FROM commerce_stripe_config WHERE id=1").get() as {mode:string;account_id:string}|undefined;
      if(old&&(old.mode!==config.mode||old.account_id!==config.accountId)) throw new Error("Cannot mix Stripe accounts or test/live modes in one database");
      db.prepare("INSERT OR IGNORE INTO commerce_stripe_config VALUES(1,?,?)").run(config.mode,config.accountId);
      initializeSalesControl(db);
    }).immediate();
  }
  async checkout(input:CheckoutOffer):Promise<{orderId:string;sessionId:string;url:string}> {
    if(!identifier(input.orderId)||!identifier(input.productId)||typeof input.title!=="string"||!input.title.trim()||input.title.length>200||
      !Number.isSafeInteger(input.amountCents)||input.amountCents<100||input.amountCents>100_000_000||!["chf","eur","usd"].includes(input.currency)) throw new Error("Invalid checkout offer");
    redirect(input.successUrl);redirect(input.cancelUrl);
    const offer:CheckoutOffer={orderId:input.orderId,productId:input.productId,title:input.title,amountCents:input.amountCents,currency:input.currency,successUrl:input.successUrl,cancelUrl:input.cancelUrl,...(input.publication?{publication:structuredClone(input.publication)}:{})};
    if(salesPaused(this.db))throw new Error('Sales paused');
    assertProductQuality(this.db,offer.productId);
    assertCheckoutRelease(this.db,this.config.accountId,offer);
    if(this.config.mode==='live'&&!(await this.checkAccount()).readyForLiveCheckout)throw new Error('Stripe charges and payouts must both be enabled before live checkout');
    const json=JSON.stringify(offer),hash=digest(json);
    const row=securityTransaction(this.db,()=>{
      if(salesPaused(this.db))throw new Error('Sales paused');
      assertProductQuality(this.db,offer.productId);
      assertCheckoutRelease(this.db,this.config.accountId,offer);
      const old=this.db.prepare("SELECT * FROM commerce_orders WHERE id=?").get(offer.orderId) as Order|undefined;
      if(old) {if(old.digest!==hash) throw new Error("Conflicting order ID");return old;}
      this.db.prepare("INSERT INTO commerce_orders(id,offer,digest,created_ms) VALUES(?,?,?,?)").run(offer.orderId,json,hash,Date.now());
      return this.db.prepare("SELECT * FROM commerce_orders WHERE id=?").get(offer.orderId) as Order;
    }).immediate();
    if(row.session_id&&row.checkout_url) return {orderId:row.id,sessionId:row.session_id,url:row.checkout_url};
    // Stripe can prune idempotency keys after 24h. Never blindly recreate an uncertain old checkout.
    if(Date.now()-row.created_ms>23*3600000) throw new Error("Uncertain checkout requires provider reconciliation");
    const body=new URLSearchParams({mode:"payment",success_url:offer.successUrl,cancel_url:offer.cancelUrl,client_reference_id:offer.orderId,
      "metadata[aureus_order_id]":offer.orderId,"line_items[0][price_data][currency]":offer.currency,
      "line_items[0][price_data][unit_amount]":String(offer.amountCents),"line_items[0][price_data][product_data][name]":offer.title,"line_items[0][quantity]":"1"});
    let session:any;
    try {
      const response=await this.request("https://api.stripe.com/v1/checkout/sessions",{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${this.config.secretKey}`,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":`aureus-${this.config.accountId}-${offer.orderId}`},body});
      if(!response.ok) throw new Error("provider rejected");
      if(!response.body) throw new Error("empty response");
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
      try {while(true){const part=await reader.read();if(part.done) break;length+=part.value.length;
        if(length>262144) throw new Error("oversized response");chunks.push(part.value);}}
      finally {await reader.cancel();}
      session=JSON.parse(Buffer.concat(chunks).toString());
    } catch {throw new Error("Stripe checkout not confirmed; retry the same order ID within the reconciliation window");}
    if(!session||typeof session.id!=="string"||!/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(session.id)||session.livemode!==(this.config.mode==="live")||
      session.client_reference_id!==offer.orderId||session.amount_total!==offer.amountCents||session.currency!==offer.currency) throw new Error("Stripe checkout response mismatch");
    const url=new URL(session.url);
    if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com"||url.username||url.password||url.port) throw new Error("Invalid Stripe checkout URL");
    securityTransaction(this.db,()=>{
      const existing=this.db.prepare("SELECT session_id FROM commerce_orders WHERE id=?").get(offer.orderId) as {session_id:string|null};
      if(existing.session_id&&existing.session_id!==session.id) throw new Error("Conflicting provider session");
      this.db.prepare("UPDATE commerce_orders SET session_id=?,checkout_url=?,status=CASE WHEN status='prepared' THEN 'checkout' ELSE status END WHERE id=?").run(session.id,session.url,offer.orderId);
    }).immediate();
    return {orderId:offer.orderId,sessionId:session.id,url:session.url};
  }
  /** Read-only provider request. Stripe balance availability is not proof of bank payout or spendable profit. */
  async reconcile(orderId:string) {
    if(!identifier(orderId))throw new Error("Invalid order ID");
    const read=()=>this.db.prepare("SELECT o.offer,o.status,b.payment_intent FROM commerce_orders o JOIN commerce_payment_bindings b ON b.order_id=o.id WHERE o.id=?").get(orderId) as {offer:string;status:string;payment_intent:string}|undefined;
    const order=read();
    if(!order||order.status!=="paid")throw new Error("Confirmed unheld payment required");
    const offer=JSON.parse(order.offer) as CheckoutOffer;
    let pi:any;
    try {
      const response=await this.request(`https://api.stripe.com/v1/payment_intents/${encodeURIComponent(order.payment_intent)}?expand%5B%5D=latest_charge.balance_transaction`,
        {method:"GET",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${this.config.secretKey}`}});
      if(!response.ok||!response.body)throw new Error("Provider response unavailable");
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
      try {while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>262144)throw new Error("Oversized response");chunks.push(part.value);}}
      finally {await reader.cancel();}
      pi=JSON.parse(Buffer.concat(chunks).toString());
    }catch{throw new Error("Provider reconciliation unavailable; no funds credited");}
    const charge=pi?.latest_charge,tx=charge?.balance_transaction;
    const money=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0&&n<=100000000;
    if(pi?.id!==order.payment_intent||pi.status!=="succeeded"||pi.livemode!==(this.config.mode==="live")||pi.amount!==offer.amountCents||pi.amount_received!==offer.amountCents||pi.currency!==offer.currency||
      !charge||typeof charge.id!=="string"||!/^ch_[A-Za-z0-9]+$/.test(charge.id)||charge.payment_intent!==pi.id||charge.livemode!==pi.livemode||
      charge.amount!==offer.amountCents||charge.amount_captured!==offer.amountCents||charge.currency!==offer.currency||charge.paid!==true||charge.captured!==true||
      charge.refunded!==false||charge.amount_refunded!==0||charge.disputed!==false||
      !tx||typeof tx.id!=="string"||!/^txn_[A-Za-z0-9]+$/.test(tx.id)||tx.source!==charge.id||!["charge","payment"].includes(tx.type)||tx.currency!==offer.currency||
      tx.amount!==offer.amountCents||![tx.amount,tx.fee,tx.net].every(money)||tx.net!==tx.amount-tx.fee||!["available","pending"].includes(tx.status)||
      !Number.isSafeInteger(tx.available_on)||tx.available_on<0) throw new Error("Provider balance does not match an unrefunded order; explicit reconciliation required");
    return securityTransaction(this.db,()=>{
      const current=read();
      if(current?.status!=="paid"||current.payment_intent!==order.payment_intent||this.db.prepare("SELECT 1 FROM commerce_payment_holds WHERE payment_intent=?").get(order.payment_intent))throw new Error("Payment changed during reconciliation");
      const observedAt=Date.now();
      const report={orderId,mode:this.config.mode,currency:offer.currency,grossCents:tx.amount as number,providerFeeCents:tx.fee as number,
        providerNetCents:tx.net as number,providerAvailable:tx.status==="available"&&tx.available_on*1000<=observedAt,
        balanceTransactionId:tx.id as string,observedAt,capitalCreditedCents:0,
        limitations:"Point-in-time provider balance observation, not bank payout or net business profit. Taxes, operating costs, refunds, disputes, other account liabilities and liquidity reserves remain to be reconciled."};
      this.db.prepare("INSERT INTO commerce_balance_checks(order_id,transaction_id,report,observed_ms) VALUES(?,?,?,?)").run(orderId,tx.id,JSON.stringify(report),observedAt);
      return report;
    }).immediate();
  }
  webhook(raw:Buffer,signature:string) {
    const event=verifyStripeEvent(raw,signature,this.config.webhookSecret);
    if(event.livemode!==(this.config.mode==="live")||event.account!==undefined&&event.account!==this.config.accountId) throw new Error("Stripe event account/mode mismatch");
    if(["refund.created","refund.updated","charge.refunded","charge.dispute.created","charge.dispute.updated","charge.dispute.closed"].includes(event.type)) {
      const object=event.data.object,pi=typeof object.payment_intent==="string"?object.payment_intent:object.payment_intent?.id;
      const amount=event.type==="charge.refunded"?object.amount_refunded:object.amount;
      if(typeof pi!=="string"||!/^pi_[A-Za-z0-9]+$/.test(pi)||!Number.isSafeInteger(amount)||amount<=0||amount>100000000||!["chf","eur","usd"].includes(object.currency)) throw new Error("Invalid payment reversal");
      return securityTransaction(this.db,()=>{
        const hash=digest(raw.toString("utf8")),old=this.db.prepare("SELECT digest FROM commerce_payment_holds WHERE event_id=?").get(event.id) as {digest:string}|undefined;
        if(old){if(old.digest!==hash)throw new Error("Conflicting reversal replay");return {duplicate:true};}
        const row=this.db.prepare("SELECT o.id,o.offer FROM commerce_orders o JOIN commerce_payment_bindings b ON b.order_id=o.id WHERE b.payment_intent=?").get(pi) as {id:string;offer:string}|undefined;
        if(row){const offer=JSON.parse(row.offer);if(offer.currency!==object.currency||amount>offer.amountCents)throw new Error("Reversal does not match order");}
        this.db.prepare("INSERT INTO commerce_payment_holds VALUES(?,?,?,?,?,?)").run(event.id,hash,pi,object.currency,amount,event.type);
        if(row){this.db.prepare("UPDATE commerce_orders SET status='payment_hold' WHERE id=?").run(row.id);this.db.prepare("UPDATE commerce_delivery_queue SET status='revoked' WHERE order_id=?").run(row.id);}
        return {held:true,unmatched:!row};
      }).immediate();
    }
    if(!["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)) return {ignored:true};
    const session=event.data.object;
    if(session.payment_status!=="paid") return {ignored:true};
    return securityTransaction(this.db,()=>{
      const row=this.db.prepare("SELECT * FROM commerce_orders WHERE session_id=?").get(session.id) as Order|undefined;
      if(!row) throw new Error("Unknown checkout session; retry after reconciliation");
      const offer=JSON.parse(row.offer) as CheckoutOffer;
      const pi=typeof session.payment_intent==="string"?session.payment_intent:session.payment_intent?.id;
      if(typeof pi!=="string"||!/^pi_[A-Za-z0-9]+$/.test(pi))throw new Error("Missing payment intent binding");
      if(session.mode!=="payment"||session.status!=="complete"||session.livemode!==(this.config.mode==="live")||session.amount_total!==offer.amountCents||
        session.currency!==offer.currency||session.client_reference_id!==row.id||session.metadata?.aureus_order_id!==row.id) throw new Error("Payment does not match immutable order");
      const hash=digest(raw.toString("utf8"));
      const old=this.db.prepare("SELECT digest FROM commerce_payment_events WHERE id=?").get(event.id) as {digest:string}|undefined;
      if(old && old.digest!==hash) throw new Error("Conflicting event replay");
      const binding=this.db.prepare("SELECT payment_intent FROM commerce_payment_bindings WHERE order_id=?").get(row.id) as {payment_intent:string}|undefined;
      if(binding&&binding.payment_intent!==pi)throw new Error("Conflicting payment intent");
      this.db.prepare("INSERT OR IGNORE INTO commerce_payment_bindings VALUES(?,?)").run(row.id,pi);
      const actual=this.db.prepare("SELECT payment_intent FROM commerce_payment_bindings WHERE order_id=?").get(row.id) as {payment_intent:string}|undefined;
      if(actual?.payment_intent!==pi)throw new Error("Payment intent already belongs to another order");
      const held=!!this.db.prepare("SELECT 1 FROM commerce_payment_holds WHERE payment_intent=? LIMIT 1").get(pi)||row.status==="payment_hold";
      if(!old)this.db.prepare("INSERT INTO commerce_payment_events VALUES(?,?,?,?)").run(event.id,hash,row.id,session.id);
      this.db.prepare("UPDATE commerce_orders SET status=? WHERE id=?").run(held?"payment_hold":"paid",row.id);
      this.db.prepare("INSERT OR IGNORE INTO commerce_delivery_queue(order_id) VALUES(?)").run(row.id);
      if(held)this.db.prepare("UPDATE commerce_delivery_queue SET status='revoked' WHERE order_id=?").run(row.id);
      return {duplicate:!!old||row.status==="paid",orderId:row.id};
    }).immediate();
  }
}
