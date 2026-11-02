import {it,expect} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {createHmac} from "node:crypto";
import Database from "better-sqlite3";
import {StripeCheckout,checkoutActionScope} from "../commerce/stripe-checkout.js";
import {DigitalDelivery} from "../commerce/delivery.js";
import {startStorefront,storefrontActionScope,type StorefrontCatalog} from "../commerce/storefront.js";
import {fixturePublicationContext,fixtureSecurityReview} from './fixtures/security-review.js';
import {PRODUCT_RELEASE_EVIDENCE} from '../commerce/quality-review.js';
import {registerProductQuality,assessProductQuality} from '../commerce/product-quality.js';
import {revokeActionReview} from '../security/action-gate.js';
import {setSalesPaused} from '../commerce/sales-control.js';
const config={mode:"test" as const,secretKey:"sk_test_fixture",webhookSecret:"whsec_synthetic_fixture",accountId:"acct_fixture"};
it("runs purchase, signed webhook and browser-bound delivery without trusting prices or order IDs from buyers",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"aureus-shop-")),db=new Database(path.join(dir,"shop.db"));
  let session:any,calls=0;
  const provider:typeof fetch=async(_url,init)=>{
    calls++;const data=init!.body as URLSearchParams,order=data.get("client_reference_id");
    session={id:"cs_test_fixture",payment_intent:"pi_fixture",livemode:false,client_reference_id:order,metadata:{aureus_order_id:order},mode:"payment",status:"complete",payment_status:"paid",
      amount_total:Number(data.get("line_items[0][price_data][unit_amount]")),currency:data.get("line_items[0][price_data][currency]"),url:"https://checkout.stripe.com/c/pay/fixture"};
    return new Response(JSON.stringify(session));
  };
  const productBytes=fs.readFileSync(new URL("../../products/angebotscheck-v1.md",import.meta.url));
  const checkout=new StripeCheckout(db,config,provider),delivery=new DigitalDelivery(db);delivery.register("product","angebotscheck-v1.md",productBytes);
  registerProductQuality(db,{productId:'product',format:'text',purpose:'Synthetic fixture',audience:'test',minBytes:1,maxBytes:100000,requiredText:[productBytes.toString('utf8').slice(0,40)],forbiddenText:[],requiredJsonKeys:[]});
  assessProductQuality(db,'product','angebotscheck-v1.md',productBytes);
  const catalog:StorefrontCatalog={seller:"Fixture seller",contact:"fixture@example.com",terms:"Synthetic terms",publication:fixturePublicationContext,products:[{id:"product",title:"<script>alert(1)</script>",description:"Fixture",amountCents:1000,currency:"chf"}]};
  fixtureSecurityReview(db,storefrontActionScope(db,catalog,'https://shop.example'),Date.now(),PRODUCT_RELEASE_EVIDENCE);
  fixtureSecurityReview(db,checkoutActionScope(config.accountId,{orderId:'example',productId:'product',title:catalog.products[0].title,amountCents:1000,currency:'chf',
    successUrl:'https://shop.example/purchase?order=example',cancelUrl:'https://shop.example/',publication:fixturePublicationContext},db),Date.now(),PRODUCT_RELEASE_EVIDENCE);
  const options:{publicOrigin?:string}={publicOrigin:'https://shop.example'};
  const shop=await startStorefront(db,checkout,catalog,options);
  const request=(route:string,method="GET",cookie="",body="",headers:Record<string,string>={})=>new Promise<{status:number;body:string;headers:http.IncomingHttpHeaders}>((resolve,reject)=>{
    const req=http.request(shop.localUrl+route,{method,headers:{Host:"shop.example",Cookie:cookie,Origin:"https://shop.example","Content-Type":"application/x-www-form-urlencoded",...headers}},res=>{
      const chunks:Buffer[]=[];res.on("data",c=>chunks.push(Buffer.from(c)));res.on("end",()=>resolve({status:res.statusCode!,body:Buffer.concat(chunks).toString(),headers:res.headers}));
    });req.on("error",reject);req.end(body);
  });
  try {
    expect((await request("/","GET","","",{Host:"attacker.example"})).status).toBe(403);
    const home=await request("/"),cookie=home.headers["set-cookie"]![0].split(";")[0],csrf=home.body.match(/name="csrf" value="([a-f0-9]+)"/)![1];
    expect(home.body).toContain("&lt;script&gt;");expect(home.headers["set-cookie"]![0]).toContain("HttpOnly");expect(home.headers["set-cookie"]![0]).toContain("Secure");
    expect((await request("/buy","POST",cookie,"product=product&csrf=wrong")).status).toBe(403);
    expect((await request("/buy","POST",cookie,`product=product&csrf=${csrf}`,{Origin:"https://attacker.example"})).status).toBe(403);
    setSalesPaused(db,true);
    expect((await request('/buy','POST',cookie,`product=product&csrf=${csrf}`)).status).toBe(503);expect(calls).toBe(0);
    setSalesPaused(db,false);
    const buy=await request("/buy","POST",cookie,`product=product&csrf=${csrf}&amountCents=1`);
    expect(buy.status).toBe(303);expect(session.amount_total).toBe(1000);expect(calls).toBe(1);
    const order=session.client_reference_id;
    setSalesPaused(db,true);
    expect((await request("/download","POST",cookie,`order=${order}&csrf=${csrf}`)).status).toBe(409);
    const raw=JSON.stringify({id:"evt_paid",type:"checkout.session.completed",livemode:false,data:{object:session}}),t=Math.floor(Date.now()/1000);
    const sig=`t=${t},v1=${createHmac("sha256",config.webhookSecret).update(`${t}.${raw}`).digest("hex")}`;
    expect((await request("/stripe/webhook","POST","",raw,{"Content-Type":"application/json","Stripe-Signature":sig})).status).toBe(200);
    expect((await request(`/purchase?order=${order}`,"GET",cookie)).body).toContain("Zahlung bestätigt");
    const second=await request("/"),other=second.headers["set-cookie"]![0].split(";")[0];
    expect((await request(`/purchase?order=${order}`,"GET",other)).status).toBe(404);
    const download=await request("/download","POST",cookie,`order=${order}&csrf=${csrf}`);
    expect(download.status).toBe(200);expect(download.body).toBe(productBytes.toString("utf8"));
    expect(download.headers["content-disposition"]).toContain("angebotscheck-v1.md");
    expect(download.headers["content-disposition"]).toContain("attachment");
    for(let i=0;i<9;i++)expect((await request("/download","POST",cookie,`order=${order}&csrf=${csrf}`)).status).toBe(200);
    expect((await request("/download","POST",cookie,`order=${order}&csrf=${csrf}`)).status).toBe(409);
    options.publicOrigin=undefined; // Caller mutation must not remove the publication boundary.
    revokeActionReview(db,storefrontActionScope(db,catalog,'https://shop.example'));
    expect((await request('/','GET',cookie)).status).toBe(409);
    expect((await request(`/purchase?order=${order}`,'GET',cookie)).status).toBe(409);
    expect((await request('/stripe/webhook','POST','',raw,{'Content-Type':'application/json','Stripe-Signature':sig})).status).toBe(200);
  }finally{await shop.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
