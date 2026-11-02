import {createHash} from 'node:crypto';import {isUtf8} from 'node:buffer';
import fs from 'node:fs';import path from 'node:path';
const MAILBOX='numaronia@gmail.com',API='https://gmail.googleapis.com/gmail/v1/users/me';
const ref=/^[a-f0-9]{1,40}$/i,email=/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const fail=message=>{throw Error(message);};
export function gmailThread(url){return typeof url==='string'?url.match(/^https:\/\/mail\.google\.com\/mail\/u\/[0-9]+\/#(?:all|inbox)\/([a-f0-9]{1,40})$/i)?.[1]??null:null;}
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function loadGmailReplyBindings(file){
 try{for(const p of [path.dirname(file),file])if(fs.lstatSync(p).isSymbolicLink())fail('Binding link rejected');const stat=fs.statSync(file);if(!stat.isFile()||stat.size>300000)fail('Binding file bound');const value=JSON.parse(fs.readFileSync(file,'utf8'));if(value.schema!=='numaron-gmail-reply-bindings-v1'||!Array.isArray(value.bindings)||value.bindings.length>100)fail('Reviewed binding schema required');const seen=new Set();for(const b of value.bindings){if(b?.verified!==true||!ref.test(b.threadId??'')||seen.has(b.threadId)||!email.test(b.recipient??'')||!b.job||typeof b.rootTaskId!=='string'||!b.rootTaskId||typeof b.evidenceRef!=='string'||!b.evidenceRef)fail('Invalid reviewed binding');seen.add(b.threadId);}return value.bindings;}catch{return [];}
}
function header(headers,name,required=false){const rows=headers.filter(h=>typeof h?.name==='string'&&h.name.toLowerCase()===name);if(rows.length>1||required&&rows.length!==1||rows.some(h=>typeof h.value!=='string'||h.value.length>1000||/[\r\n\0]/.test(h.value)))fail('Invalid or ambiguous Gmail header');return rows[0]?.value??'';}
function address(value){const s=value.match(/^[^<>\r\n,]*<([^<>]+)>$/)?.[1]??value;if(!email.test(s)||s.length>254)fail('Unambiguous single email address required');return s.toLowerCase();}
function decodeSubject(value){const decoded=value.replace(/\?=\s+(?==\?)/g,'?=').replace(/=\?UTF-8\?([BQ])\?([^?]+)\?=/ig,(_,encoding,text)=>{let bytes;if(encoding.toUpperCase()==='B'){if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail('Invalid subject encoding');bytes=Buffer.from(text,'base64');}else{const chars=text.replace(/_/g,' ');if(/=(?![a-f0-9]{2})/i.test(chars))fail('Invalid subject encoding');const numbers=[];for(let i=0;i<chars.length;i++){if(chars[i]==='='){numbers.push(parseInt(chars.slice(i+1,i+3),16));i+=2;}else{if(chars.charCodeAt(i)>127)fail('Invalid subject encoding');numbers.push(chars.charCodeAt(i));}}bytes=Buffer.from(numbers);}if(!isUtf8(bytes))fail('UTF-8 subject required');return bytes.toString('utf8');});if(decoded.includes('=?')||/[\r\n\0]/.test(decoded)||Buffer.byteLength(decoded)>300)fail('Unsupported subject encoding');return decoded;}
function encodeSubject(value){const words=[];let part='';for(const c of value){if(Buffer.byteLength(part+c)>30){words.push(part);part='';}part+=c;}if(part)words.push(part);return words.map(s=>'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=').join(' ');}
function plain(payload){let count=0,bytes=0;const out=[];const visit=p=>{if(++count>30)fail('Gmail MIME part limit');if(p?.mimeType==='text/plain'&&!p.filename&&typeof p.body?.data==='string'){if(!/^[A-Za-z0-9_-]*={0,2}$/.test(p.body.data))fail('Invalid mail encoding');const b=Buffer.from(p.body.data,'base64url');bytes+=b.length;if(bytes>20000||!isUtf8(b))fail('Mail text bound exceeded');out.push(b.toString('utf8'));}if(Array.isArray(p.parts))for(const child of p.parts)visit(child);};visit(payload);if(!out.length)fail('Plain text message required');return out.join('\n');}
export function createGmailOrderReplies({isEnabled,access=()=>({available:false}),getBinding=()=>null,request=fetch,now=Date.now}={}){
 const active=ctx=>{if(isEnabled?.()!==true)fail('Gmail communication OFF');if(ctx?.signal?.aborted)fail('Gmail communication cancelled');ctx?.assertActive?.();};
 const credentials=ctx=>{active(ctx);const a=access();if(a?.available!==true||a.scope?.account!==MAILBOX||!/^Label_[\w-]+$/.test(a.scope.labelId??'')||!Array.isArray(a.scope.granted)||!['gmail.readonly','gmail.send'].every(s=>a.scope.granted.includes('https://www.googleapis.com/auth/'+s))||typeof a.credential!=='string'||!a.credential||/\s/.test(a.credential))fail('Gmail send scope and own labelled account required');active(ctx);return a;};
 async function call(path,ctx,body,onDispatch){const a=credentials(ctx);if(!/^\/(?:profile|settings\/sendAs)$|^\/threads\/[a-f0-9]{1,40}\?format=full$/i.test(path)&&!(path==='/messages/send'&&body!==undefined))fail('Unsupported Gmail endpoint');active(ctx);onDispatch?.();const r=await request(API+path,{method:body===undefined?'GET':'POST',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+a.credential,Accept:'application/json','Content-Type':'application/json'},signal:AbortSignal.any([AbortSignal.timeout(15000),...(ctx?.signal?[ctx.signal]:[])]),...(body===undefined?{}:{body:JSON.stringify(body)})});active(ctx);if(!r.ok)fail('Gmail communication HTTP '+r.status);let size=0;const chunks=[],reader=r.body?.getReader();if(!reader)fail('Gmail body required');try{for(;;){const v=await reader.read();active(ctx);if(v.done)break;size+=v.value.length;if(size>300000)fail('Gmail response bound');chunks.push(v.value);}}finally{await reader.cancel();}active(ctx);return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 const inspect=async(url,ctx)=>{
  const a=credentials(ctx),threadId=gmailThread(url);if(!ref.test(threadId??''))fail('Exact Gmail thread required');const binding=getBinding(threadId);
  if(binding?.verified!==true||binding.threadId!==threadId||!email.test(binding.recipient??'')||binding.recipient.toLowerCase()===MAILBOX||typeof binding.rootTaskId!=='string'||!binding.rootTaskId||typeof binding.evidenceRef!=='string'||!binding.evidenceRef||!binding.job)fail('Reviewed order and recipient binding required');
  if(ctx?.task&&ctx.task.rootTaskId!==binding.rootTaskId)fail('Gmail order budget root mismatch');
  const recipient=binding.recipient.toLowerCase(),bindingDigest=digest(binding);
  if((await call('/profile',ctx)).emailAddress!==MAILBOX)fail('Gmail mailbox mismatch');
  const aliases=await call('/settings/sendAs',ctx);if(!Array.isArray(aliases.sendAs)||aliases.sendAs.length>100)fail('Bounded Gmail sender identities required');
  const ownAddresses=new Set([MAILBOX,...aliases.sendAs.filter(x=>x.verificationStatus==='accepted'&&email.test(x.sendAsEmail??'')).map(x=>x.sendAsEmail.toLowerCase())]);
  const sender=ownAddresses.has('info@numaron.com')?'info@numaron.com':MAILBOX;if(ownAddresses.has(recipient))fail('Gmail recipient is own identity');
  const thread=await call('/threads/'+threadId+'?format=full',ctx);if(thread.id!==threadId||!Array.isArray(thread.messages)||!thread.messages.length||thread.messages.length>50||thread.nextPageToken)fail('Complete bounded Gmail thread required');
  let inbound;const ids=new Set();const messages=thread.messages.map(m=>{
   if(!ref.test(m.id??'')||ids.has(m.id)||m.threadId!==threadId||!Array.isArray(m.labelIds)||m.labelIds.some(l=>['TRASH','SPAM','DRAFT'].includes(l))||!Number.isSafeInteger(Number(m.internalDate))||Number(m.internalDate)<0||!Array.isArray(m.payload?.headers)||m.payload.headers.length>100)fail('Invalid Gmail message binding');ids.add(m.id);
   const headers=m.payload.headers,from=address(header(headers,'from',true)),to=address(header(headers,'to',true)),subject=decodeSubject(header(headers,'subject',true)),messageId=header(headers,'message-id',true),replyTo=header(headers,'reply-to');
   if(!/^<[^<>\s@]+@[^<>\s@]+>$/.test(messageId)||messageId.length>200||!subject||subject.length>300||/\b(?:auto-generated|auto-replied)\b/i.test(header(headers,'auto-submitted'))||header(headers,'list-id')||/^(bulk|list|junk)$/i.test(header(headers,'precedence'))||replyTo&&address(replyTo)!==from)fail('Automated or redirected message requires review');
   const own=ownAddresses.has(from);if(own?(to!==recipient||!m.labelIds.includes('SENT')):(from!==recipient||!ownAddresses.has(to)))fail('Gmail counterparty mismatch');
   const row={id:m.id,own,trusted:!own,content:plain(m.payload),date:Number(m.internalDate),subject,messageId,labelled:m.labelIds.includes(a.scope.labelId)};return row;
  }).sort((x,y)=>x.date-y.date||x.id.localeCompare(y.id));
  for(const m of messages)if(!m.own)inbound=m;
  if(!inbound||!inbound.labelled)fail('Authorized labelled inbound message required');
  active(ctx);return {source:'gmail',url,identity:MAILBOX,sender,threadId,recipient,bindingDigest,inboundId:inbound.id,inReplyTo:inbound.messageId,subject:inbound.subject,job:structuredClone(binding.job),existingQuote:binding.quote??null,messages:messages.map(({id,own,trusted,content})=>({id,own,trusted,content})),priorOffer:true,rootTaskId:binding.rootTaskId};
 };
 return {inspect,canSend:a=>a.kind==='reply',async send(action,remote,ctx){
  let postStarted=false;
  try{
  active(ctx);if(action.kind!=='reply'||typeof action.body!=='string'||!action.body.trim()||action.body.length>5000||action.body.includes('\0'))fail('Only bounded existing-thread replies allowed');
  const fresh=await inspect(remote.url,ctx);if(fresh.sender!==remote.sender||fresh.bindingDigest!==remote.bindingDigest||fresh.inboundId!==remote.inboundId||fresh.inReplyTo!==remote.inReplyTo||action.event!=='reply:'+fresh.inboundId)fail('Gmail reply binding changed');
  if(digest(fresh.messages)!==digest(remote.messages)||fresh.messages.at(-1)?.own!==false)fail('Gmail conversation changed before send');
  const subject=encodeSubject(fresh.subject),body=Buffer.from(action.body).toString('base64').match(/.{1,76}/g).join('\r\n'),messageId='<numaron-'+digest([fresh.threadId,action.event,action.body]).slice(0,40)+'@gmail.com>';
  const raw=[`From: ${fresh.sender}`,`To: ${fresh.recipient}`,`Subject: ${subject}`,`In-Reply-To: ${fresh.inReplyTo}`,`References: ${fresh.inReplyTo}`,`Message-ID: ${messageId}`,`Date: ${new Date(now()).toUTCString()}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body].join('\r\n');
  const result=await call('/messages/send',ctx,{raw:Buffer.from(raw).toString('base64url'),threadId:fresh.threadId},()=>{postStarted=true;});if(!ref.test(result.id??'')||result.threadId!==fresh.threadId)fail('Gmail send receipt mismatch; reconcile before retry');return result;
  }catch(error){if(!postStarted)error.dispatchNotStarted=true;throw error;}
 }};
}

