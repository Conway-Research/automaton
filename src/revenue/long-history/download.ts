import {lookup as dnsLookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request} from 'node:https';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {HISTORY_LIMITS,type SourceRecord} from './types.js';
type Address={address:string;family:number};
export class SourceRequestError extends Error {constructor(public code:'source_timeout'|'source_aborted'){super(code==='source_timeout'?'Source request timed out':'Source request aborted');}}
interface Options {signal?:AbortSignal;remainingBytes:number;fetchImpl?:(url:string,options:{signal:AbortSignal;redirect:'manual'})=>Promise<Response>;lookup?:(host:string)=>Promise<Address[]>;}
const publicAddress=(address:string)=>{
 if(isIP(address)===6)return /^[23][0-9a-f]{3}:/i.test(address)&&!/^2001:(?:db8|0):/i.test(address);
 if(isIP(address)!==4)return false;const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
};
// Resolve once and connect to that verified public IP, preserving TLS SNI/Host.
// This avoids a second DNS lookup that could rebind to a private address.
function pinnedGet(url:URL,address:Address,signal:AbortSignal):Promise<Response>{return new Promise((done,fail)=>{
 const r=request(url,{hostname:address.address,servername:url.hostname,headers:{Host:url.host},signal},res=>{
  const headers=new Headers();for(const [k,v] of Object.entries(res.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
  const status=res.statusCode??500;done(new Response([204,205,304].includes(status)?null:Readable.toWeb(res) as ReadableStream<Uint8Array>,{status,headers}));
 });r.once('error',fail);r.end();
});}
export async function fetchSource(source:SourceRecord,options:Options):Promise<{bytes:Uint8Array;url:string;sha256:string}>{
 if(source.licenseStatus!=='allowed'||!source.licenseEvidence?.trim())throw Error('Source must be allowed');
 if(!Number.isSafeInteger(options.remainingBytes)||options.remainingBytes<=0)throw Error('Archive size limit');
 const deadline=AbortSignal.timeout(HISTORY_LIMITS.requestMs),signal=AbortSignal.any([options.signal??new AbortController().signal,deadline]);
 const abortError=()=>new SourceRequestError(options.signal?.aborted?'source_aborted':'source_timeout');
 const check=()=>{if(signal.aborted)throw abortError();};
 const race=<T>(work:Promise<T>):Promise<T>=>new Promise((done,fail)=>{
  const stop=()=>fail(abortError());if(signal.aborted){stop();return;}
  signal.addEventListener('abort',stop,{once:true});work.then(done,fail).finally(()=>signal.removeEventListener('abort',stop));
 });
 const resolveHost=options.lookup??(host=>dnsLookup(host,{all:true,verbatim:true}));
 const limit=Math.min(options.remainingBytes,HISTORY_LIMITS.fileBytes);let current=source.urls[0];
 for(let redirect=0;redirect<=3;redirect++){
  check();const url=new URL(current);
  if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!source.allowedHosts.includes(url.hostname))throw Error('Source host not allowed');
  const addresses=await race(resolveHost(url.hostname));check();if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Nonpublic source address');
  const response=await race(options.fetchImpl?options.fetchImpl(url.href,{signal,redirect:'manual'}):pinnedGet(url,addresses[0],signal));check();
  if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();const location=response.headers.get('location');if(!location)throw Error('Missing redirect');current=new URL(location,url).href;continue;}
  if(!response.ok){await response.body?.cancel();throw Error('Source HTTP '+response.status);}
  const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){await response.body?.cancel();throw Error('Source size limit');}
  if(!response.body)throw Error('Empty source');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const part=await race(reader.read());check();if(part.done)break;size+=part.value.byteLength;if(size>limit)throw Error('Source size limit');chunks.push(part.value);}}
  catch(e){void reader.cancel().catch(()=>{});throw e;}
  if(!size)throw Error('Empty source');const bytes=Buffer.concat(chunks,size);return {bytes,url:url.href,sha256:createHash('sha256').update(bytes).digest('hex')};
 }throw Error('Source redirect limit');
}
