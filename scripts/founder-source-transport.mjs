import https from 'node:https';import dns from 'node:dns/promises';import net from 'node:net';import {Readable} from 'node:stream';
export function isPublicAddress(ip){
 const family=net.isIP(ip);if(family===4){const [a,b,c]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===0&&c===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(family===6){const x=ip.toLowerCase();return /^[23][0-9a-f]{3}:/.test(x)&&!x.startsWith('2001:db8:')&&!x.startsWith('2001:0:')&&!x.startsWith('2002:')&&!x.includes('::ffff:');}return false;
}
function pinnedRequest(url,options){return new Promise((resolve,reject)=>{const req=https.request(url,{agent:false,method:options.method,headers:options.headers,signal:options.signal,lookup:(_host,opts,cb)=>opts?.all?cb(null,[{address:options.pinnedAddress,family:options.family}]):cb(null,options.pinnedAddress,options.family)},res=>resolve(new Response(Readable.toWeb(res),{status:res.statusCode,headers:res.headers})));req.on('error',()=>reject(Error('Source connection failed')));if(options.body)req.write(options.body);req.end();});}
export function createSourceTransport({policy,request=pinnedRequest,resolve=host=>dns.lookup(host,{all:true}),isEnabled=()=>false,claimQuota=()=>{}}){
 const origin=new URL(policy.origin);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash||origin.port)throw Error('Reviewed HTTPS source origin required');
 const active=ctx=>{if(!isEnabled())throw Error('Source transport OFF');ctx.assertActive();};
 async function send(relative,method,body,ctx){
  active(ctx);if(typeof relative!=='string'||!relative.startsWith('/')||relative.startsWith('//')||/[\\\u0000-\u0020]|%2f|%5c/i.test(relative))throw Error('Invalid source path');
  const u=new URL(relative,origin);if(u.origin!==origin.origin||u.username||u.password||u.hash||!Array.isArray(policy.readPaths)||!policy.readPaths.some(p=>u.pathname===p||p.endsWith('/')&&u.pathname.startsWith(p))||[...u.searchParams.keys()].some(k=>!(policy.queryKeys??[]).includes(k)))throw Error('Source path outside reviewed policy');
  if(method!=='GET'&&(!policy.actions?.[method]?.includes(u.pathname)||ctx.grant?.sourceId!==policy.id))throw Error('Mutation outside reviewed source grant');
  const addresses=await resolve(origin.hostname);active(ctx);if(!Array.isArray(addresses)||!addresses.length||addresses.some(x=>!isPublicAddress(x.address)||net.isIP(x.address)!==x.family))throw Error('Source DNS not public');
  claimQuota(policy.id);active(ctx);const pin=addresses[0];
  const response=await request(u.href,{method,headers:{Accept:'application/json','Content-Type':'application/json'},signal:ctx.signal?AbortSignal.any([ctx.signal,AbortSignal.timeout(Math.min(policy.timeoutMs??15000,30000))]):AbortSignal.timeout(15000),pinnedAddress:pin.address,family:pin.family,...(body===undefined?{}:{body:JSON.stringify(body)})});active(ctx);
  if(response.status<200||response.status>=300)throw Error('Source HTTP '+response.status);
  if(!response.body)throw Error('Missing source body');const reader=response.body.getReader(),parts=[];let size=0;try{for(;;){active(ctx);const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>Math.min(policy.maxBytes??600000,2000000))throw Error('Source body limit');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});}active(ctx);return JSON.parse(Buffer.concat(parts).toString('utf8'));
 }
 return {read:(relative,ctx)=>send(relative,'GET',undefined,ctx),mutate:(action,relative,body,ctx)=>{if(!['POST','PATCH','DELETE'].includes(action))throw Error('Unsupported mutation');return send(relative,action,body,ctx);}};
}
