import {createUgigGroupReplies} from './founder-ugig-group-replies.mjs';
import {createHmac} from 'node:crypto';
import {githubCredential} from './founder-order-github.mjs';
import {readUgigCredential} from './numaron-monitor-sources.mjs';
import {readDealworkAccess,DEALWORK_ACCOUNT} from './founder-dealwork-escrow.mjs';
import {createDealworkMessages} from './founder-dealwork-messages.mjs';
import {createGmailOrderReplies,gmailThread} from './founder-gmail-order-replies.mjs';
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const ugigGroupRE=new RegExp('^https://ugig\\.net/api/conversations/('+UUID+')/messages$');
const ugigRE=new RegExp('^https://ugig\\.net/gigs/('+UUID+')$');
const dealRE=new RegExp('^https://dealwork\\.ai/dashboard/(jobs|contracts)/('+UUID+')$');
const githubRE=/^https:\/\/github\.com\/([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)$/;
export function communicationTarget(url){if(typeof url!=='string')return null;let m;if((m=url.match(ugigGroupRE)))return {source:'ugig',url,id:m[1],type:'conversation'};if((m=url.match(githubRE))&&!m[1].includes('..'))return {source:'github',url,repo:m[1],id:m[2]};if((m=url.match(ugigRE)))return {source:'ugig',url,id:m[1]};if((m=url.match(dealRE)))return {source:'dealwork',url,type:m[1],id:m[2]};if(gmailThread(url))return {source:'gmail',url,id:gmailThread(url)};return null;}
const reject=message=>{throw Error(message);};
// Bound the local wait even when an injected/native transport ignores AbortSignal.
// Dispatch is never repeated; a late response cannot enter parsing or sending.
function waitForResponse(operation,signal){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const cleanup=()=>signal.removeEventListener('abort',abort);
  const abort=()=>{if(settled)return;settled=true;cleanup();reject(signal.reason??new DOMException('Aborted','AbortError'));};
  if(signal.aborted){abort();return;}
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return operation();}).then(value=>{
   if(settled){try{void Promise.resolve(value?.body?.cancel()).catch(()=>{});}catch{}return;}
   settled=true;cleanup();resolve(value);
  },error=>{if(settled)return;settled=true;cleanup();reject(error);});
 });
}
// Abort the local wait even if a response stream ignores cancellation. No retry.
function readBodyChunk(reader,signal){
 return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();reject(signal.reason??new DOMException('Aborted','AbortError'));};
  const cleanup=()=>signal.removeEventListener('abort',abort);
  if(signal.aborted){abort();return;}
  signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return reader.read();}).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
 });
}
function cancelBodyReader(reader){try{void Promise.resolve(reader.cancel()).catch(()=>{});}catch{}}

const complete=(r,field)=>{const rows=r?.[field];if(!Array.isArray(rows)||rows.length>=100||r.has_more||r.hasMore||r.next_cursor||r.nextCursor||r.pagination?.hasMore||r.pagination?.has_more||(r.total??r.pagination?.total??rows.length)>rows.length)reject('Complete bounded conversation required');return rows;};
const line=(text,labels)=>[...String(text??'').matchAll(new RegExp('(?:^|\\n)\\s*(?:'+labels+')\\s*:\\s*([^\\n]{8,700})','ig'))].at(-1)?.[1]??null;
function clarified(original,messages){
 let text=String(original??'');
 for(const m of messages.filter(m=>m.trusted&&!m.own).slice(-5))for(const label of ['Acceptance','Payment']){const value=line(m.content,label+'(?: criteria| tests)?');if(value)text+='\n'+label+': '+value;}
 return text;
}
function brief({title,description,amount,currency='USD',acceptance,payment,assignment=false,aiAllowed=true}){
 const text=String(title??'')+' '+String(description??'');
 if(/\b(?:exploit|malware|phishing|bulk spam|account farm|crypto trading)\b/i.test(text))reject('Job outside supported technical profiles');
 const familiar=/\b(python|typescript|javascript|bash|node|csv|api|test|documentation|bug)\b/i.test(text);
 // Local quoting policy, not a claim of a market rate or guaranteed effort.
 const bounded=!/\b(?:entire platform|full[- ]stack|production deployment|mobile app|24\/7|ongoing maintenance)\b/i.test(text)&&text.length<=6000;
 const hours=bounded&&familiar?(/\b(?:api|typescript)\b/i.test(text)?6:4):null;
 return {title,description,profileReviewRequired:!familiar||!bounded,amount:Number(amount),currency,acceptance:acceptance??line(description,'acceptance(?: criteria| tests)?|definition of done'),payment:payment??line(description,'payment'),hours,days:hours?Math.ceil(hours/3):null,assignment,aiAllowed};
}
export function createOutreachTransports({isEnabled,request=fetch,githubKey=githubCredential,ugigCredential=readUgigCredential,dealworkCredential=readDealworkAccess,googleAccess,getGmailBinding,getUgigGroupBindings=()=>[],now=Date.now}={}){
 const active=ctx=>{if(!isEnabled())reject('Communication OFF');if(ctx?.signal?.aborted)reject('Communication cancelled');ctx?.assertActive?.();};
 const cool=new Map();
 async function call(source,endpoint,ctx,body,onDispatch){
  active(ctx);if((cool.get(source)??0)>now())reject('Communication access/rate cooldown');
  let origin,headers={Accept:'application/json','Content-Type':'application/json','User-Agent':'numaron-outreach','Cache-Control':'no-cache'},raw=body===undefined?'':JSON.stringify(body);
  if(source==='github'){
   if(!/^\/user$|^\/repos\/[\w-]+\/[\w.-]+\/issues\/[1-9]\d*(?:\/comments(?:\?per_page=100)?)?$/.test(endpoint))reject('Unapproved GitHub endpoint');
   origin='https://api.github.com';const key=githubKey();if(typeof key!=='string'||!key||/[\r\n]/.test(key))reject('GitHub access required');headers.Authorization='Bearer '+key;
  }else if(source==='ugig'){
   if(!new RegExp('^/api/(?:auth/session|applications(?:/my)?|gigs/'+UUID+'|conversations(?:/'+UUID+'/messages)?)$').test(endpoint))reject('Unapproved uGig endpoint');
   origin='https://ugig.net';const key=ugigCredential();if(typeof key!=='string'||!key||/[\r\n]/.test(key))reject('uGig access required');headers['X-API-Key']=key;
  }else{
   if(!new RegExp('^/api/v1/(?:agents/me|(?:jobs|bids/mine)\\?per_page=50&page=[1-9]\\d?|jobs/'+UUID+'/bids|contracts/'+UUID+'(?:/messages)?)$').test(endpoint))reject('Unapproved Dealwork endpoint');
   origin='https://dealwork.ai';const a=dealworkCredential();if(!a?.available||a.agentAccountId!==DEALWORK_ACCOUNT||typeof a.apiKey!=='string'||typeof a.hmacSecret!=='string')reject('Dealwork access required');
   const stamp=String(Math.floor(now()/1000));headers={...headers,Authorization:'Bearer '+a.apiKey,'X-Agent-ID':a.agentAccountId,'X-Timestamp':stamp,'X-Signature':createHmac('sha256',a.hmacSecret).update(a.agentAccountId+stamp+raw).digest('hex')};
  }
  // Explicit allowlist for mutations: never claim, accept, transfer, read-mark or change accounts.
  if(body!==undefined&&!((source==='github'&&/\/comments$/.test(endpoint))||(source==='ugig'&&(/^\/api\/applications$/.test(endpoint)||/\/messages$/.test(endpoint)))||(source==='dealwork'&&/\/(?:bids|messages)$/.test(endpoint))))reject('Unapproved communication write');
  active(ctx);const signal=AbortSignal.any([AbortSignal.timeout(20000),...(ctx?.signal?[ctx.signal]:[])]);onDispatch?.();
  const started=now();let readPhase='headers';
  const readOperation=/\/(?:user|session|me)$/.test(endpoint)?'identity':/\/(?:comments|messages)(?:\?|$)/.test(endpoint)?'messages':source==='ugig'&&/^\/api\/applications(?:\/my)?$/.test(endpoint)?'applications':source==='ugig'&&endpoint==='/api/conversations'?'conversations':endpoint.includes('?')?'list':'job';
  try{
  const r=await waitForResponse(()=>request(origin+endpoint,{method:body===undefined?'GET':'POST',headers,redirect:'error',cache:'no-store',signal,...(body===undefined?{}:{body:raw})}),signal);active(ctx);
  if(!r.ok){if([401,403,429].includes(r.status)){const seconds=Number(r.headers.get('retry-after'));cool.set(source,Math.max(now()+3600000,Number.isFinite(seconds)?now()+seconds*1000:0,Number(r.headers.get('x-bid-create-ratelimit-reset'))*1000||0,Number(r.headers.get('x-bid-attempt-ratelimit-reset'))*1000||0));}reject('Communication HTTP '+r.status);}
  readPhase='body';const reader=r.body?.getReader();if(!reader)reject('Response body required');let size=0;const chunks=[];try{for(;;){const v=await readBodyChunk(reader,signal);active(ctx);if(v.done)break;size+=v.value.length;if(size>600000)reject('Communication response limit');chunks.push(v.value);}}finally{cancelBodyReader(reader);}active(ctx);readPhase='decode';return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(error){
   if(body===undefined&&error instanceof Error){const elapsed=now()-started;try{Object.defineProperty(error,'communicationRead',{value:{source,operation:readOperation,phase:readPhase,elapsedMs:Number.isFinite(elapsed)?Math.min(240000,Math.max(0,Math.floor(elapsed))):0}});}catch{}}
   throw error;
  }
 }
 async function dealList(kind,ctx){const out=[];let total;for(let page=1;page<=10;page++){const r=await call('dealwork','/api/v1/'+kind+'?per_page=50&page='+page,ctx);if(!Array.isArray(r.data)||r.data.length>50||r.meta?.page!==page||r.meta?.per_page!==50||!Number.isSafeInteger(r.meta.total)||r.meta.total<0||r.meta.total>500||r.meta.ignored_params?.length||total!==undefined&&total!==r.meta.total)reject('Complete Dealwork list required');total=r.meta.total;out.push(...r.data);if(out.length===total)return out;if(r.data.length!==50||out.length>total)break;}reject('Complete Dealwork list required');}
 const github={async inspect(url,ctx){const t=communicationTarget(url);if(t?.source!=='github')reject('Canonical GitHub target required');const identity=await call('github','/user',ctx);if(identity.login!=='tricebr')reject('GitHub account mismatch');const endpoint='/repos/'+t.repo+'/issues/'+t.id,issue=await call('github',endpoint,ctx),body=String(issue.body??'');if(issue.html_url!==url||issue.state!=='open'||issue.pull_request||!['OWNER','MEMBER','COLLABORATOR'].includes(issue.author_association)||!Array.isArray(issue.assignees)||issue.assignees.some(a=>a.login!=='tricebr')||!/AI[- ]assisted contributions (?:welcome|allowed)/i.test(body)||/\bCLA\b|\bNDA\b/i.test(body))reject('Job not eligible for autonomous communication');const reward=body.match(/(?:bounty|reward)\s*:?\s*(?:\$|USD\s*)(\d+(?:\.\d{1,2})?)/i);if(!reward)reject('Explicit reward required');const comments=await call('github',endpoint+'/comments?per_page=100',ctx);if(!Array.isArray(comments)||comments.length>=100||comments.some(c=>!Number.isSafeInteger(c.id)||typeof c.body!=='string'||typeof c.user?.login!=='string'))reject('Complete bounded conversation required');comments.sort((a,b)=>a.id-b.id);return {source:'github',url,identity:'tricebr',endpoint,job:brief({title:issue.title,description:body,amount:reward[1],assignment:issue.assignees.some(a=>a.login==='tricebr')}),messages:comments.map(c=>({id:String(c.id),content:c.body,own:c.user.login==='tricebr',trusted:['OWNER','MEMBER','COLLABORATOR'].includes(c.author_association)})),priorOffer:comments.some(c=>c.user.login==='tricebr')};},async send(a,r,ctx){return call('github',r.endpoint+'/comments',ctx,{body:a.body});}};
 const ugigGroups=createUgigGroupReplies({isEnabled,getBindings:getUgigGroupBindings,call:(endpoint,ctx,body,onDispatch)=>call('ugig',endpoint,ctx,body,onDispatch)});
 const ugig={async inspect(url,ctx){const t=communicationTarget(url);if(t?.source!=='ugig')reject('Canonical uGig target required');if(t.type==='conversation')return ugigGroups.inspect(url,ctx);const me=await call('ugig','/api/auth/session',ctx);if(me.profile?.username!=='Obolus'||me.profile.id!==me.user?.id||!new RegExp('^'+UUID+'$').test(me.user?.id))reject('uGig account mismatch');const identity=me.user.id;
   const apps=complete(await call('ugig','/api/applications/my',ctx),'applications');if(apps.some(a=>a.applicant_id!==identity))reject('Foreign application');
   const g=(await call('ugig','/api/gigs/'+t.id,ctx)).gig;if(g?.id!==t.id||!new RegExp('^'+UUID+'$').test(g.poster_id)||g.poster_id===identity||g.listing_type!=='hiring'||!['active','filled'].includes(g.status)||g.location_type!=='remote'||g.budget_type!=='fixed')reject('uGig job not eligible');
   const app=apps.find(a=>a.gig_id===t.id);if(g.status!=='active'&&!app)reject('Inactive uGig listing');
   const conversations=complete(await call('ugig','/api/conversations',ctx),'data').filter(c=>c.gig_id===t.id);if(conversations.length>1)reject('Ambiguous conversation');const conversation=conversations[0];let messages=[];
   if(app){if(typeof app.cover_letter!=='string'||typeof app.id!=='string')reject('Invalid application');messages.push({id:'application:'+app.id,own:true,content:app.cover_letter});}
   if(conversation){if(!new RegExp('^'+UUID+'$').test(conversation.id)||!Array.isArray(conversation.participant_ids)||conversation.participant_ids.length!==2||!conversation.participant_ids.includes(identity)||!conversation.participant_ids.includes(g.poster_id))reject('Conversation participant mismatch');const rows=complete(await call('ugig','/api/conversations/'+conversation.id+'/messages',ctx),'data');if(rows.some(m=>m.conversation_id!==conversation.id||!conversation.participant_ids.includes(m.sender_id)||typeof m.content!=='string'||typeof m.id!=='string'||!Number.isFinite(Date.parse(m.created_at))))reject('Message binding required');rows.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.id.localeCompare(b.id));messages.push(...rows.map(m=>({id:m.id,content:m.content,own:m.sender_id===identity,trusted:m.sender_id===g.poster_id})));}
   const amount=g.budget_min??g.budget_max;
   const priorDays=app?.proposed_timeline?.match(/^(\d+) calendar days/);
   return {source:'ugig',url,identity,gigId:t.id,conversationId:conversation?.id,existingQuote:app&&Number.isFinite(app.proposed_rate)?{amount:app.proposed_rate,currency:g.payment_coin,days:priorDays?Number(priorDays[1]):null,hours:null}:null,job:brief({title:g.title,description:g.description,amount,currency:g.payment_coin,assignment:['accepted','in_progress','completed','paid'].includes(app?.status)}),messages,priorOffer:!!app};
  },canSend:(a,r)=>r.conversationContext?ugigGroups.canSend(a,r):a.kind==='offer'||a.kind==='inquiry'? !r.priorOffer:r.conversationId!==undefined,
  async send(a,r,ctx){if(r.conversationContext)return ugigGroups.send(a,r,ctx);if(a.kind==='reply'){if(!r.conversationId)reject('Existing participant-bound conversation required');return call('ugig','/api/conversations/'+r.conversationId+'/messages',ctx,{content:a.body});}return call('ugig','/api/applications',ctx,{gig_id:r.gigId,cover_letter:a.body,...(a.kind==='offer'?{proposed_rate:a.amount,proposed_timeline:a.days+' calendar days after payment clearance'}:{})});}};
 const dealwork={async inspect(url,ctx){const t=communicationTarget(url);if(t?.source!=='dealwork')reject('Canonical Dealwork target required');const me=(await call('dealwork','/api/v1/agents/me',ctx)).data;if(me?.accountId!==DEALWORK_ACCOUNT||me.isSuspended!==false)reject('Dealwork account mismatch');
   if(t.type==='contracts'){
    const provider=createDealworkMessages({isEnabled,ownAccountId:DEALWORK_ACCOUNT,call:(method,path,body)=>call('dealwork',path,ctx,method==='POST'?body:undefined)}),binding=await provider.inspect({contractId:t.id});
    const contract=(await call('dealwork','/api/v1/contracts/'+t.id,ctx)).data;
    if(contract?.id!==binding.contractId||contract.workerAccountId!==binding.ownAccountId||contract.buyerAccountId!==binding.counterpartyAccountId||contract.jobId!==binding.jobId)reject('Dealwork contract changed during inspection');
    return {source:'dealwork',url,identity:DEALWORK_ACCOUNT,contractBinding:binding,existingQuote:{amount:Number(contract.amount),currency:contract.currency??'USD',hours:null,days:null},job:brief({title:contract.job?.title??'Technical contract',description:contract.job?.description??'Existing assigned technical contract; no scope changes accepted.',amount:contract.amount,currency:contract.currency??'USD',acceptance:Array.isArray(contract.job?.acceptanceCriteria)?contract.job.acceptanceCriteria.map(x=>x.description).join('; '):null,assignment:true}),messages:binding.messages.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id)).map(m=>({id:m.id,content:m.content,own:m.senderAccountId===DEALWORK_ACCOUNT,trusted:m.senderAccountId===binding.counterpartyAccountId})),priorOffer:true};
   }
   const jobs=await dealList('jobs',ctx),j=jobs.find(j=>j.id===t.id);if(!j||j.posterAccountId===DEALWORK_ACCOUNT||j.status!=='posted'||j.jobMode!=='bid'||j.autoAcceptFirstBid!==false)reject('Only non-binding eligible bid jobs allowed');
   const bids=await dealList('bids/mine',ctx);if(bids.some(b=>b.bidderAccountId!==DEALWORK_ACCOUNT))reject('Foreign Dealwork bid');const own=bids.filter(b=>b.jobId===t.id);if(own.length>1||own.some(b=>typeof b.id!=='string'||typeof b.proposalText!=='string'))reject('Invalid bid evidence');
   return {source:'dealwork',url,identity:DEALWORK_ACCOUNT,jobId:t.id,job:brief({title:j.title,description:j.description,amount:j.fixedPrice??j.budgetMin??j.budgetMax,currency:j.currency??'USD',acceptance:Array.isArray(j.acceptanceCriteria)?j.acceptanceCriteria.map(c=>c.description).filter(x=>typeof x==='string').join('; '):null,payment:'USD '+(j.fixedPrice??j.budgetMin??j.budgetMax)+' through platform escrow; funding independently checked before work'}),messages:own.map(b=>({id:b.id,own:true,content:b.proposalText})),priorOffer:own.length>0};
  },canSend:(a,r)=>r.contractBinding?a.kind==='reply':a.kind==='offer',async send(a,r,ctx){if(r.contractBinding){if(a.kind!=='reply')reject('Only existing contract replies allowed');return createDealworkMessages({isEnabled,ownAccountId:DEALWORK_ACCOUNT,call:(method,path,body)=>call('dealwork',path,ctx,method==='POST'?body:undefined)}).send(r.contractBinding,{content:a.body});}if(a.kind!=='offer')reject('No documented free pre-bid chat endpoint');return call('dealwork','/api/v1/jobs/'+r.jobId+'/bids',ctx,{proposedAmount:a.amount.toFixed(2),estimatedHours:a.hours,proposalText:a.body});}};
 const gmail=createGmailOrderReplies({isEnabled,request,access:googleAccess,getBinding:getGmailBinding,now});
 const transports={github,ugig,dealwork,gmail};
 for(const transport of Object.values(transports)){
  const inspect=transport.inspect;
  transport.inspect=async(url,ctx)=>{const r=await inspect(url,ctx);if(r.conversationContext)return r;const description=clarified(r.job.description,r.messages);if(description!==r.job.description)r.job=brief({...r.job,description,acceptance:line(description,'acceptance(?: criteria| tests)?|definition of done'),payment:line(description,'payment')});return r;};
 }
 return transports;
}

