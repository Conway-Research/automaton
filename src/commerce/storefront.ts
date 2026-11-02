import http from "node:http";
import {createHash,randomBytes} from "node:crypto";
import type {AddressInfo} from "node:net";
import type {Database} from "better-sqlite3";
import type {StripeCheckout} from "./stripe-checkout.js";
import {DigitalDelivery} from "./delivery.js";
import {initializeSalesControl,salesPaused} from './sales-control.js';
import {assertProductQuality} from './product-quality.js';
import {assertActionGate,actionContextDigest} from '../security/action-gate.js';
import {validatePublicationContext,type PublicationContext} from './claim-evidence.js';

export interface StorefrontCatalog {
  seller:string; contact:string; terms:string;
  publication?:PublicationContext;
  products:{id:string;title:string;description:string;amountCents:number;currency:"chf"|"eur"|"usd"}[];
}
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const text=(value:unknown,max:number)=>typeof value==="string"&&value.trim().length>0&&value.length<=max;

/** Exact visible catalogue, origin, asset bytes and requirements are reviewed
 * together. A checkout review never implicitly approves a landing page. */
export function storefrontActionScope(db:Database,catalog:StorefrontCatalog,publicOrigin:string){
  if(!catalog.publication)throw Error('Storefront publication context required');
  validatePublicationContext(catalog.publication);
  const assets=catalog.products.map(p=>{
    const qualityDecision=assertProductQuality(db,p.id);
    const a=db.prepare('SELECT content FROM commerce_assets WHERE product_id=?').get(p.id) as {content:Buffer}|undefined;
    const c=db.prepare('SELECT payload,digest FROM obolus_product_quality_contracts WHERE product_id=?').get(p.id) as {payload:string;digest:string}|undefined;
    if(!a||!c||hash(c.payload)!==c.digest)throw Error('Reviewed storefront product and requirements required');
    return {id:p.id,productDigest:createHash('sha256').update(a.content).digest('hex'),requirementsDigest:c.digest,qualityDecision};
  });
  const mode=(db.prepare('SELECT mode FROM commerce_stripe_config WHERE id=1').get() as {mode:string}|undefined)?.mode;
  const contextDigest=actionContextDigest({mode,catalog,publicOrigin,assets});
  return {activity:'product-publication',component:'storefront',contextDigest,claimTarget:{...catalog.publication,
    productDigest:actionContextDigest(assets.map(a=>[a.id,a.productDigest])),requirementsDigest:actionContextDigest(assets.map(a=>[a.id,a.requirementsDigest])),payloadDigest:contextDigest,
    assertions:[...new Map(catalog.products.flatMap(p=>[{statement:p.title},{statement:p.description},{statement:`${p.amountCents} ${p.currency} minor units`,type:'price' as const}]).map(a=>[a.statement,a])).values()]}};
}

/** Single-owner product storefront. Browser identity is an opaque HttpOnly capability, never an order ID. */
export async function startStorefront(db:Database,checkout:StripeCheckout,input:StorefrontCatalog,inputOptions:{port?:number;publicOrigin?:string}={}) {
  const options=Object.freeze({...inputOptions});
  const catalog=structuredClone(input);
  if(!text(catalog.seller,200)||!text(catalog.contact,300)||!text(catalog.terms,4000)||!Array.isArray(catalog.products)||!catalog.products.length||catalog.products.length>50||
    new Set(catalog.products.map(p=>p.id)).size!==catalog.products.length||catalog.products.some(p=>! /^[A-Za-z0-9_-]{1,100}$/.test(p.id)||!text(p.title,200)||!text(p.description,2000)||
      !Number.isSafeInteger(p.amountCents)||p.amountCents<100||p.amountCents>100000000||!["chf","eur","usd"].includes(p.currency))) throw new Error("Invalid storefront catalogue");
  const mode=(db.prepare("SELECT mode FROM commerce_stripe_config WHERE id=1").get() as {mode:string}).mode;
  if(options.publicOrigin) {const u=new URL(options.publicOrigin);if(u.origin!==options.publicOrigin||u.protocol!=="https:"||u.username||u.password) throw new Error("Public storefront origin must be an HTTPS origin");}
  if(mode==="live"&&!options.publicOrigin) throw new Error("Live storefront requires configured HTTPS origin");
  const delivery=new DigitalDelivery(db);
  initializeSalesControl(db);
  for(const p of catalog.products) if(!db.prepare("SELECT 1 FROM commerce_assets WHERE product_id=?").get(p.id)) throw new Error("Register all product assets before selling");
  const assertPublication=()=>{
    // Public test-mode pages can also make misleading assertions. Only a strictly
    // loopback preview without a public origin is exempt from external release.
    if(options.publicOrigin||mode==='live')assertActionGate(db,storefrontActionScope(db,catalog,options.publicOrigin!));
  };
  assertPublication();
  db.exec(`CREATE TABLE IF NOT EXISTS commerce_buyers(token_hash TEXT PRIMARY KEY,created_ms INTEGER NOT NULL,expires_ms INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS commerce_buyer_orders(order_id TEXT PRIMARY KEY,buyer_hash TEXT NOT NULL,product_id TEXT NOT NULL,created_ms INTEGER NOT NULL,UNIQUE(buyer_hash,product_id));`);
  let origin=options.publicOrigin??"";
  const server=http.createServer(async(req,res)=>{
    const send=(status:number,body:string|Buffer,type="text/html; charset=utf-8")=>{res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
      "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://checkout.stripe.com; frame-ancestors 'none'; base-uri 'none'"});res.end(body);};
    try {
      if(req.headers.host!==new URL(origin).host) {send(403,"Host rejected");return;}
      const url=new URL(req.url??"/",origin);
      if(req.method==="POST"&&url.pathname==="/stripe/webhook") {
        const signature=req.headers["stripe-signature"];
        if(typeof signature!=="string"||!req.headers["content-type"]?.startsWith("application/json")) {send(400,"Invalid webhook");return;}
        const chunks:Buffer[]=[];let size=0;
        for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>262144){send(413,"Too large");return;}chunks.push(Buffer.from(chunk));}
        checkout.webhook(Buffer.concat(chunks),signature);send(200,'{"received":true}',"application/json");return;
      }
      // Authenticated accounting notifications remain available after revocation;
      // catalogue, purchase pages and downloads cannot expose unreviewed content.
      assertPublication();
      const cookies=(req.headers.cookie??"").split(";").map(c=>c.trim()).filter(c=>c.startsWith("aureus_buyer="));
      let token=cookies.length===1?cookies[0].slice(13):"";
      let buyer=/^[a-f0-9]{64}$/.test(token)?hash(token):"";
      if(!buyer||!db.prepare("SELECT 1 FROM commerce_buyers WHERE token_hash=? AND expires_ms>?").get(buyer,Date.now())) {
        if(req.method!=="GET"||url.pathname!=="/"){send(403,"Open the shop in the browser used for purchase.");return;}
        db.transaction(()=>{
          const count=(db.prepare("SELECT COUNT(*) n FROM commerce_buyers WHERE created_ms>?").get(Date.now()-3600000) as {n:number}).n;
          if(count>=100) throw new Error("Storefront capacity reached");
          db.prepare("DELETE FROM commerce_buyers WHERE expires_ms<?").run(Date.now());
          token=randomBytes(32).toString("hex");buyer=hash(token);
          db.prepare("INSERT INTO commerce_buyers VALUES(?,?,?)").run(buyer,Date.now(),Date.now()+7*86400000);
        }).immediate();
        res.setHeader("Set-Cookie",`aureus_buyer=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${options.publicOrigin?"; Secure":""}`);
      }
      const csrf=hash(`csrf:${token}`);
      const page=(title:string,body:string)=>`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:17px system-ui;background:#101824;color:#eaf1fa;max-width:850px;margin:40px auto;padding:20px}article{background:#1c293b;padding:24px;margin:18px 0;border-radius:12px}button{background:#edc76e;border:0;padding:12px 20px;border-radius:6px;cursor:pointer}a{color:#edc76e}p{white-space:pre-wrap}small{color:#aebcd0}</style><main><h1>${escape(title)}</h1>${mode==="test"?"<p><strong>Testshop – keine echten Käufe.</strong></p>":""}${body}<hr><p>${escape(catalog.seller)} · ${escape(catalog.contact)}</p><small>${escape(catalog.terms)}</small></main></html>`;
      if(req.method==="GET"&&url.pathname==="/") {
        send(200,page("Digitale Produkte",catalog.products.map(p=>`<article><h2>${escape(p.title)}</h2><p>${escape(p.description)}</p><p>${(p.amountCents/100).toFixed(2)} ${p.currency.toUpperCase()}</p><form method="post" action="/buy"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="product" value="${p.id}"><button>Zur Bezahlung</button></form></article>`).join("")));return;
      }
      const order=url.searchParams.get("order");
      if(req.method==="GET"&&url.pathname==="/purchase") {
        const row=db.prepare("SELECT o.status FROM commerce_orders o JOIN commerce_buyer_orders b ON b.order_id=o.id WHERE o.id=? AND b.buyer_hash=?").get(order,buyer) as {status:string}|undefined;
        if(!row){send(404,"Order unavailable");return;}
        send(200,page("Dein Kauf",row.status==="paid"?`<p>Zahlung bestätigt. Dein Download ist verfügbar.</p><form method="post" action="/download"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="order" value="${escape(order!)}"><button>Produkt herunterladen</button></form>`:"<p>Die Zahlungsbestätigung steht noch aus. Bitte lade diese Seite später erneut.</p>"));return;
      }
      if(req.method!=="POST"||!["/buy","/download"].includes(url.pathname)){send(404,"Not found");return;}
      if(req.headers.origin!==origin||!req.headers["content-type"]?.startsWith("application/x-www-form-urlencoded")){send(403,"Request rejected");return;}
      const chunks:Buffer[]=[];let size=0;
      for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>4096){send(413,"Too large");return;}chunks.push(Buffer.from(chunk));}
      const form=new URLSearchParams(Buffer.concat(chunks).toString());
      if(form.getAll("csrf").length!==1||form.get("csrf")!==csrf){send(403,"Request rejected");return;}
      if(url.pathname==="/download") {
        const id=form.get("order");if(!db.prepare("SELECT 1 FROM commerce_buyer_orders WHERE order_id=? AND buyer_hash=?").get(id,buyer)){send(404,"Download unavailable");return;}
        const asset=delivery.downloadPurchased(id!);
        res.setHeader("Content-Disposition",`attachment; filename="${asset.filename}"`);send(200,asset.content,"application/octet-stream");return;
      }
      if(salesPaused(db)){send(503,"Neue Bestellungen sind vorübergehend pausiert. Bereits bezahlte Downloads bleiben verfügbar.");return;}
      const product=catalog.products.find(p=>p.id===form.get("product"));if(!product){send(404,"Product unavailable");return;}
      const id=db.transaction(()=>{
        const old=db.prepare("SELECT order_id FROM commerce_buyer_orders WHERE buyer_hash=? AND product_id=?").get(buyer,product.id) as {order_id:string}|undefined;
        if(old)return old.order_id;
        if((db.prepare("SELECT COUNT(*) n FROM commerce_buyer_orders WHERE created_ms>?").get(Date.now()-3600000) as {n:number}).n>=100) throw new Error("Checkout capacity reached");
        const id=randomBytes(20).toString("hex");db.prepare("INSERT INTO commerce_buyer_orders VALUES(?,?,?,?)").run(id,buyer,product.id,Date.now());return id;
      }).immediate();
      const state=db.prepare("SELECT status FROM commerce_orders WHERE id=?").get(id) as {status:string}|undefined;
      if(state?.status==="paid"){res.writeHead(303,{Location:`/purchase?order=${id}`,"Cache-Control":"no-store"});res.end();return;}
      // Stripe requires HTTPS return URLs, including test-mode hosted checkout.
      if(!options.publicOrigin){send(409,"Configure an HTTPS public origin before testing hosted checkout.");return;}
      const result=await checkout.checkout({orderId:id,productId:product.id,title:product.title,amountCents:product.amountCents,currency:product.currency,
        successUrl:`${origin}/purchase?order=${id}`,cancelUrl:origin+"/",...(catalog.publication?{publication:catalog.publication}:{})});
      res.writeHead(303,{Location:result.url,"Cache-Control":"no-store"});res.end();
    }catch {send(409,"Unable to complete this request. Retry from the same browser or contact the seller.");}
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  const port=options.port??0;if(!Number.isInteger(port)||port<0||port>65535)throw new Error("Invalid storefront port");
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});
  const localUrl=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;if(!origin)origin=localUrl;
  return {localUrl,publicOrigin:origin,close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
