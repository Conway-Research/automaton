import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHmac} from 'node:crypto';
import {githubCredential} from './founder-order-github.mjs';
import {readLocalCredential} from './founder-local-access.mjs';
import {createGoogleAccessManager} from './founder-google-access.mjs';
import {runGithubSearchBatch} from './numaron-github-partitions.mjs';
const ORIGINS=new Set(['https://api.github.com','https://dealwork.ai','https://synmerco-escrow.onrender.com','https://gmail.googleapis.com','https://arcbounty.app','https://bidpostloop.com','https://ugig.net']);
const error=(code)=>Object.assign(Error(code),{code});
export async function readJSON(url,headers,ctx,{request=fetch,now=Date.now,maxBytes=2000000}={}){
 const target=new URL(url);if(!ORIGINS.has(target.origin)||target.username||target.password)throw Error('Unapproved origin');
 ctx.assertActive();const r=await request(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.any([ctx.signal,AbortSignal.timeout(20000)])});ctx.assertActive();
 if(!r.ok){const e=error('http-'+r.status);const retry=r.headers.get('retry-after'),reset=Number(r.headers.get('x-ratelimit-reset'))*1000;e.rateLimited=r.status===429||r.status===403&&(retry!==null||r.headers.get('x-ratelimit-remaining')==='0');if(retry){const seconds=Number(retry);e.retryAt=Number.isFinite(seconds)?now()+seconds*1000:Date.parse(retry);}else if(e.rateLimited)e.retryAt=Math.max(now()+3600000,Number.isFinite(reset)?reset:0);throw e;}
 if(!r.body)throw error('invalid-response');const reader=r.body.getReader(),parts=[];let bytes=0;
 try{for(;;){const x=await reader.read();ctx.assertActive();if(x.done)break;bytes+=x.value.length;if(bytes>maxBytes)throw error('response-limit');parts.push(x.value);}}finally{await reader.cancel();}
 let data;try{data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw error('invalid-response');}
 if(target.origin==='https://api.github.com'){const remaining=r.headers.get('x-ratelimit-remaining'),reset=r.headers.get('x-ratelimit-reset');ctx.onResponse?.({remaining:remaining===null?null:Number(remaining),resetAt:reset===null?null:Number(reset)*1000});}return data;
}
export function readSynmercoCredential({file=path.join(os.homedir(),'.codex/secrets/numaron-synmerco-api-key.dpapi')}={}){
 try{const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>64000)return null;const value=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; $s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()); $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try{[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"],{input:fs.readFileSync(file,'utf8'),encoding:'utf8',windowsHide:true,timeout:5000,stdio:['pipe','pipe','ignore']});return value.length>=8&&!/[\r\n]/.test(value)?value:null;}catch{return null;}
}
export function readUgigCredential({file=path.join(os.homedir(),'.codex/secrets/numaron-ugig-api-key.dpapi')}={}){return readSynmercoCredential({file});}
export function createMonitorSources({config,githubKey=githubCredential,request=fetch,now=Date.now,localCredential=readLocalCredential,synmercoKey=readSynmercoCredential,ugigKey=readUgigCredential}={}){
 let keyAt=-Infinity,cachedKey;
 const sources=[],get=(url,headers,ctx)=>readJSON(url,headers,ctx,{request,now}),git=async(p,ctx)=>{ctx.assertActive();if(now()-keyAt>60000||now()<keyAt){cachedKey=githubKey();keyAt=now();}return get('https://api.github.com'+p,{'User-Agent':'numaron-local-monitor',Accept:'application/vnd.github+json',...(cachedKey?{Authorization:'Bearer '+cachedKey}:{})},ctx);};
 sources.push({id:'github-discovery',provider:'github',run:async(ctx,previous)=>{
  const q='is:issue is:open label:bounty -repo:relayhop/sn-monetization-runtime -repo:zhangjiayang6835-cyber/bounty-plaza -repo:Vikingr2023/awesome-agent-bounties';
  return runGithubSearchBatch({git,ctx,previous,query:q,now});
 }});
 for(const t of config.tracked??[]){if(!/^[\w.-]+\/[\w.-]+$/.test(t.repo)||!Number.isSafeInteger(t.n)||t.n<1)throw Error('Invalid tracked issue');
  sources.push({id:'github-'+t.repo.replace('/','-')+'-'+t.n,provider:'github',run:async(ctx,previous)=>{
   let cached;try{cached=JSON.parse(fs.readFileSync(previous.evidence,'utf8')).data;}catch{}
   const base='/repos/'+t.repo,n=t.n,reuse=cached?.project&&Number.isFinite(cached.projectCheckedAt)&&now()>=cached.projectCheckedAt&&now()-cached.projectCheckedAt<86400000;
   const data=reuse?cached.project:await git(base+(t.type==='pr'?'/pulls/':'/issues/')+n,ctx);
   const pages=async(endpoint)=>{const result=[];for(let page=1;page<=10;page++){const rows=await git(endpoint+'?per_page=100&page='+page,ctx);if(!Array.isArray(rows))throw error('invalid-response');result.push(...rows);if(rows.length<100)return result;}throw error('response-limit');};
   const comments=await pages(base+'/issues/'+n+'/comments');const reviews=t.type==='pr'?await pages(base+'/pulls/'+n+'/reviews'):[];const inline=t.type==='pr'?await pages(base+'/pulls/'+n+'/comments'):[];
   return {data:{project:{html_url:data.html_url,state:data.state,merged:data.merged===true,assignees:data.assignees},projectCheckedAt:reuse?cached.projectCheckedAt:now(),url:data.html_url,state:data.state,merged:data.merged===true,assignees:data.assignees?.map(a=>a.login),comments,commentsComplete:true,reviews,inline,compensationConfirmed:false,paymentConfirmed:false}};
  }});
 }
 for(const [id,endpoint] of [['dealwork-bids','/api/v1/bids/mine'],['dealwork-contracts','/api/v1/contracts?role=worker']])sources.push({id,run:async ctx=>{
  ctx.assertActive();const a=await localCredential('dealwork');ctx.assertActive();if(!a?.available||a.agentAccountId!=='dd23a701-dc59-4dab-9287-6669a95c4da2')throw error('access-required');
  const stamp=Math.floor(now()/1000).toString(),sig=createHmac('sha256',a.hmacSecret).update(a.agentAccountId+stamp).digest('hex');
  return {data:await get('https://dealwork.ai'+endpoint,{'X-Agent-ID':a.agentAccountId,'X-Timestamp':stamp,'X-Signature':sig,Authorization:'Bearer '+a.apiKey},ctx)};
 }});
 const did=encodeURIComponent('did:pkh:eip155:8453:0x6Cc15B882a463423ea7A400Ce6512c30b1A76615');
 for(const [id,endpoint] of [['synmerco-bids',`/v1/agents/${did}/bids`],['synmerco-escrows',`/v1/escrows?did=${did}`],['synmerco-inbox','/v1/agents/inbox'],['synmerco-intents','/v1/intents?status=open']])sources.push({id,run:async ctx=>{ctx.assertActive();const key=synmercoKey();if(!key)throw error('access-required');return {data:await get('https://synmerco-escrow.onrender.com'+endpoint,{Authorization:'Bearer '+key},ctx)};}});
 sources.push({id:'gmail-orders',run:async ctx=>{
  const access=createGoogleAccessManager({read:()=>localCredential('google-access'),readClient:()=>localCredential('google-client'),write:value=>localCredential('google-save',{value}),now,isActive:()=>{try{ctx.assertActive();return true;}catch{return false;}},request:async(url,options)=>{
   // Only maintenance of the same existing OAuth grant may POST. All order data uses GET.
   ctx.assertActive();if(url!=='https://oauth2.googleapis.com/token'||options.method!=='POST'||new URLSearchParams(options.body).get('grant_type')!=='refresh_token')throw error('access-required');
   const response=await request(url,{...options,signal:AbortSignal.any([ctx.signal,options.signal,AbortSignal.timeout(20000)])});ctx.assertActive();return response;
  }});
  ctx.assertActive();const a=await access.refresh();ctx.assertActive();
  if(!a?.available||a.scope?.account!=='numaronia@gmail.com'||!/^Label_[\w-]+$/.test(a.scope?.labelId??'')||!a.credential)throw error('access-required');
  return {data:await get('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds='+encodeURIComponent(a.scope.labelId)+'&maxResults=100&includeSpamTrash=false',{Authorization:'Bearer '+a.credential},ctx)};
 }});
 sources.push({id:'ugig',provider:'ugig',run:async(ctx,previous)=>{
  ctx.assertActive();const key=ugigKey();if(typeof key!=='string'||!key||/[\r\n]/.test(key))throw error('access-required');
  const headers={'X-API-Key':key},own=p=>get('https://ugig.net'+p,headers,ctx);
  const session=await own('/api/auth/session');
  if(session?.profile?.username!=='Obolus'||typeof session.user?.id!=='string'||!session.user.id||session.profile.id!==session.user.id)throw error('access-required');
  const list=(value,field)=>{const rows=value?.[field];if(!Array.isArray(rows)||value.has_more===true||value.hasMore===true||value.pagination?.hasMore===true||value.pagination?.has_more===true||value.next_cursor||value.nextCursor||Number.isFinite(value.pagination?.total)&&value.pagination.total>rows.length||Number.isFinite(value.total)&&value.total>rows.length)throw error('invalid-response');return rows;};
  const applications=list(await own('/api/applications/my'),'applications');
  const conversations=list(await own('/api/conversations'),'data');
  const page=previous?.cursor??1;if(!Number.isSafeInteger(page)||page<1)throw error('invalid-response');
  const listings=await get('https://ugig.net/api/gigs?listing_type=hiring&sort=newest&limit=50&page='+page,{'User-Agent':'numaron-local-monitor'},ctx);
  if(!Array.isArray(listings.gigs)||!listings.pagination||listings.pagination.page!==page||listings.pagination.limit!==50||!Number.isSafeInteger(listings.pagination.total)||listings.pagination.total<0)throw error('invalid-response');
  const totalPages=Math.ceil(listings.pagination.total/50),next=page>=totalPages?1:page+1;
  if(listings.pagination.total>0&&listings.gigs.length===0&&page<=totalPages)throw error('invalid-response');
  return {data:{account:{id:session.user.id,username:session.profile.username},applications,conversations,applicationsComplete:true,conversationsComplete:true,listings:{page,total:listings.pagination.total,totalPages,items:listings.gigs},assignmentConfirmed:false,paymentConfirmed:false},cursor:next};
 }});
 sources.push({id:'guru',run:async()=>{throw error('access-required');}});
 for(const [id,url] of [['arcbounty','https://arcbounty.app/api/v1/bounties?status=open'],['bidpostloop','https://bidpostloop.com/api/public/tasks?status=open']])sources.push({id,run:async ctx=>({data:await get(url,{'User-Agent':'numaron-local-monitor'},ctx)})});
 return sources;
}
