import http from "node:http";
import type {AddressInfo} from "node:net";
import type {StripeCheckout} from "./stripe-checkout.js";
import type {DigitalDelivery} from "./delivery.js";

/** Loopback listener intended for a configured HTTPS reverse proxy or Stripe test forwarding. */
export async function startStripeWebhook(checkout:StripeCheckout,port=0,delivery?:DigitalDelivery) {
  if(!Number.isInteger(port)||port<0||port>65535) throw new Error("Invalid webhook port");
  const server=http.createServer(async(req,res)=>{
    const reply=(status:number,body:string)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(body);};
    if(delivery&&req.method==="GET"&&req.url==="/download") {
      try {
        const auth=req.headers.authorization;
        if(typeof auth!=="string"||!auth.startsWith("Bearer ")) throw new Error("Missing token");
        const asset=delivery.download(auth.slice(7));
        res.writeHead(200,{"Content-Type":"application/octet-stream","Content-Disposition":`attachment; filename="${asset.filename}"`,
          "Content-Length":asset.content.length,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});res.end(asset.content);
      }catch {reply(404,'{"error":"download_unavailable"}');}return;
    }
    if(req.method!=="POST"||req.url!=="/stripe/webhook") {reply(404,'{"error":"not_found"}');return;}
    const signature=req.headers["stripe-signature"];
    if(typeof signature!=="string"||!req.headers["content-type"]?.startsWith("application/json")) {reply(400,'{"error":"invalid_input"}');return;}
    try {
      const chunks:Buffer[]=[];let length=0;
      for await(const chunk of req){length+=Buffer.byteLength(chunk);if(length>262144){reply(413,'{"error":"too_large"}');return;}chunks.push(Buffer.from(chunk));}
      checkout.webhook(Buffer.concat(chunks),signature);
      reply(200,'{"received":true}');
    } catch {reply(400,'{"error":"not_accepted_retry_or_reconcile"}');}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=40;
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",resolve);});
  return {url:`http://127.0.0.1:${(server.address() as AddressInfo).port}/stripe/webhook`,close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
