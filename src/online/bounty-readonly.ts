import https from 'node:https';
import dns from 'node:dns';
import type {ClientRequest} from 'node:http';
import {publicIPv4Address} from './fixed-public-fetch.js';
import {registerLogSecrets} from '../observability/redaction.js';
import {assertModelPrivacy} from '../security/privacy-egress.js';

/** Operator-only reader. Not registered as an autonomous tool or source approval. */
export type BountyRead = {kind:'list';limit:number}|{kind:'detail';id:string};
export function bountyReadUrl(task:BountyRead):URL {
 if(!task||typeof task!=='object')throw Error('Invalid Bounty read');
 const keys=Object.keys(task).sort().join(',');
 if(task.kind==='list'&&keys==='kind,limit'&&Number.isInteger(task.limit)&&task.limit>=1&&task.limit<=10)
  return new URL(`https://api.trybounty.ai/v1/agent/bounties?limit=${task.limit}`);
 if(task.kind==='detail'&&keys==='id,kind'&&typeof task.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(task.id))
  return new URL(`https://api.trybounty.ai/v1/agent/bounties/${task.id}`);
 throw Error('Only bounded Bounty list/detail reads are permitted');
}

/** One GET, no pagination/retry/redirect, no attachments or private conversation. */
export async function readBounty(task:BountyRead,key:string,signal:AbortSignal):Promise<unknown> {
 signal.throwIfAborted();const url=bountyReadUrl(task);
 if(typeof key!=='string'||!/^ak_[A-Za-z0-9_-]{16,500}$/.test(key))throw Error('Invalid Bounty credential');
 registerLogSecrets([key]);
 return new Promise((resolve,reject)=>{
  let request:ClientRequest|undefined,settled=false;
  const finish=(ok:boolean,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(ok)resolve(value);else reject(Error('Bounty read failed; no automatic retry'));};
  const abort=()=>{request?.destroy();finish(false);};
  const timer=setTimeout(abort,15000);
  try{
   request=https.request(url,{method:'GET',agent:false,rejectUnauthorized:true,family:4,
    headers:{authorization:`Bearer ${key}`,accept:'application/json','accept-encoding':'identity'},
    lookup:(host,options,callback)=>{
     if(host!==url.hostname){callback(Error('Host rejected'),'',4);return;}
     dns.lookup(host,{all:true,family:4},(error,addresses)=>{
      if(settled||signal.aborted||error||!addresses?.length||addresses.some(a=>a.family!==4||!publicIPv4Address(a.address))){callback(Error('Public DNS required'),'',4);return;}
      if(options.all)callback(null,[addresses[0]]);else callback(null,addresses[0].address,4);
     });
    }},response=>{
     const length=Number(response.headers['content-length']??0);
     if(response.statusCode!==200||response.headers['retry-after']!==undefined||
       response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'||
       !/^application\/json(?:\s*;|$)/i.test(String(response.headers['content-type']))||!Number.isFinite(length)||length<0||length>1000000){response.destroy();abort();return;}
     let bytes=0;const chunks:Buffer[]=[];
     response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>1000000){response.destroy();abort();}else chunks.push(chunk);});
     response.on('error',abort);response.on('aborted',abort);
     response.on('end',()=>{try{finish(true,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(false);}});
    });
   request.on('error',abort);signal.addEventListener('abort',abort,{once:true});
   if(signal.aborted)abort();else request.end();
  }catch{abort();}
 });
}

function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Bounty response');
 return value as Record<string,unknown>;
}
/** Minimized metadata only; provider text remains untrusted and execution stays HOLD. */
export function bountyMetadata(value:unknown,observedAt:number){
 const row=object(value);
 if(typeof row._id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(row._id)||
  !Number.isSafeInteger(row.version)||Number(row.version)<1||
  typeof row.title!=='string'||!row.title.trim()||row.title.length>1000||
  typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency)||
  !Number.isSafeInteger(row.payout_cents)||Number(row.payout_cents)<0||
  !Number.isSafeInteger(observedAt)||observedAt<=0)throw Error('Incomplete Bounty economics');
 const result={id:row._id,version:Number(row.version),title:row.title,currency:row.currency,
  expectedPayoutMinor:Number(row.payout_cents),observedAt,providerOpen:row.status==='open',
  trusted:false as const,execution:'HOLD' as const,revenueStatus:'EXPECTED_NOT_RECEIVED' as const};
 // Validate every exported field: identifiers are untrusted provider input too.
 assertModelPrivacy(result);
 return result;
}
export function bountyPage(value:unknown,limit:number,observedAt:number){
 bountyReadUrl({kind:'list',limit});const page=object(value);
 if(!Array.isArray(page.bounties)||page.bounties.length>limit||typeof page.is_done!=='boolean'||typeof page.next_cursor!=='string')throw Error('Invalid Bounty page');
 const rows=page.bounties.map(row=>bountyMetadata(row,observedAt));
 if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('Duplicate Bounty metadata requires review');
 return {rows,moreAvailable:!page.is_done};
}
