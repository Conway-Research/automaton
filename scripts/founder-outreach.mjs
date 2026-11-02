import {assessProfileOffer,requiresProfileOfferReview} from './founder-offer-feasibility.mjs';
import {composeUgigGroupReply} from './founder-ugig-group-replies.mjs';
import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clean=(x,max=400)=>typeof x==='string'?x.replace(/[\x00-\x1f]/g,' ').trim().slice(0,max):'';
const forbidden=/\b(?:deposit|upfront fee|buy.{0,15}token|API key|password|private key|seed phrase|ignore.{0,30}instructions|no AI|AI.{0,25}(?:forbidden|prohibited))\b|(?:change|replace|send).{0,30}(?:wallet|payout|bank account)/i;
const questions={scope:'What exact deliverable is required?',acceptance:'Which acceptance checks define completion?',payment:'What are the amount, currency, fees and payment timing?',estimate:'What bounded scope and deadline should the quote cover?'};
function approach(job){const text=job.title+' '+job.description;if(/\bcsv\b/i.test(text))return 'I will identify the input columns, validate malformed and empty rows, and cover accepted and rejected records with repeatable fixture tests.';if(/\bapi\b/i.test(text))return 'I will reproduce the specified API behaviour with mocked requests, implement the bounded change, and test success, invalid inputs and failure responses without production credentials.';if(/\b(?:typescript|javascript|node)\b/i.test(text))return 'I will reproduce the issue with a focused regression test, implement the smallest compatible change, and run the existing checks in isolation.';if(/\b(?:python|bash)\b/i.test(text))return 'I will reproduce the expected behaviour using synthetic fixtures, implement the bounded script change, and test valid input, invalid input and exit conditions in isolation.';return 'I will map each stated criterion to a deliverable and validate the examples and changed behaviour before submission.';}
export function composeOutreach({job,messages=[],priorOffer=false,conversationContext}){
 if(job?.privacy==='private'||job?.privacy==='confidential')return {kind:'blocked',reason:'confidential-inputs',customerWorkStarted:false};
 if(conversationContext)return composeUgigGroupReply({messages,conversationContext});
 const none={kind:'none',customerWorkStarted:false};
 if(!job||forbidden.test([job.title,job.description,job.acceptance,job.payment].join(' '))||job.aiAllowed===false)return {...none,kind:'blocked',reason:'restricted-job'};
 if(requiresProfileOfferReview(job))return {...none,kind:'blocked',reason:'profile-offer-review-required',review:{status:'clarification-required',missing:['scope-bound-profile-plan'],technicalImpossibilityEstablished:false,sendAuthorized:false}};
 const missing=[];
 if(!clean(job.title)||!clean(job.description))missing.push('scope');
 if(!clean(job.acceptance))missing.push('acceptance');
 if(!clean(job.payment)||job.currency!=='USD'||!Number.isFinite(job.amount)||job.amount<=0||job.amount>500)missing.push('payment');
 if(!Number.isFinite(job.hours)||job.hours<=0||job.hours>8||!Number.isInteger(job.days)||job.days<1||job.days>7)missing.push('estimate');
 const own=messages.filter(m=>m.own),lastOwn=messages.map(m=>!!m.own).lastIndexOf(true);
 const incoming=messages.slice(lastOwn+1).filter(m=>!m.own&&m.trusted===true).at(-1);
 if(incoming){
  const content=clean(incoming.content,5000);if(forbidden.test(content))return {...none,kind:'blocked',reason:'sensitive-or-financial-request'};
  const answers=[];
  if(/\b(price|cost|quote|rate|budget)\b/i.test(content)&&job.currency==='USD'&&Number.isFinite(job.amount)&&job.amount>0&&job.amount<=500)answers.push(`The proposed fixed price is USD ${job.amount}.`);
  if(/\b(time|timeline|deadline|delivery|deliver|days|when)\b/i.test(content)&&Number.isInteger(job.days)&&job.days>=1&&job.days<=7)answers.push(`Estimated delivery is ${job.days} calendar days after confirmed assignment, required inputs and payment clearance.`);
  if(/\b(AI|automation|tools)\b/i.test(content))answers.push('Numaron uses disclosed AI-assisted development, with isolated checks before delivery.');
  if(/\b(acceptance|test|deliverable|scope)\b/i.test(content)&&!missing.includes('acceptance'))answers.push(`The proposed acceptance checks are: ${clean(job.acceptance)}.`);
  if(/\b(payment|escrow|funding)\b/i.test(content)&&!missing.includes('payment'))answers.push(`The published payment terms are: ${clean(job.payment)}. Funding is independently checked before work.`);
  if(!answers.length)return {...none,kind:'blocked',reason:'reply-requires-unavailable-facts'};
  return {kind:'reply',event:'reply:'+incoming.id,body:answers.join(' ')+' This reply does not accept changed terms or start work.',customerWorkStarted:false};
 }
 if(priorOffer||own.length)return none;
 if(missing.length)return {kind:'inquiry',event:'initial',missing,body:`Regarding “${clean(job.title,180)}”: ${missing.map(k=>questions[k]).join(' ')} We use disclosed AI-assisted development. No work begins before assignment and the permitted payment clearance.`,customerWorkStarted:false};
 if(job.assignment===true)return none;
 return {kind:'offer',event:'initial',amount:job.amount,hours:job.hours,days:job.days,body:`For “${clean(job.title,180)}”: ${approach(job)} Deliverable and checks: ${clean(job.acceptance)}. Fixed quote: USD ${job.amount}; estimated effort ${job.hours} hours and delivery within ${job.days} calendar days after confirmed assignment, required inputs and payment clearance. AI-assisted implementation with isolated validation. Scope changes require a revised quote. This is a conditional proposal; no work starts or contract is accepted by this message.`,customerWorkStarted:false};
}
export function openOutreach({file,isEnabled,transports,now=Date.now}){
 if(typeof isEnabled!=='function')throw Error('Power guard required');
 const db=new Database(file);db.pragma('busy_timeout=5000');
 db.exec('CREATE TABLE IF NOT EXISTS outreach_messages (key TEXT PRIMARY KEY,source TEXT NOT NULL,target TEXT NOT NULL,event TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL,remote_id TEXT,at INTEGER NOT NULL)');
 db.exec('CREATE TABLE IF NOT EXISTS outreach_targets (url TEXT PRIMARY KEY,source TEXT NOT NULL,root TEXT NOT NULL,scheduled INTEGER NOT NULL)');
 if(!db.pragma('table_info(outreach_messages)').some(c=>c.name==='baseline'))db.exec("ALTER TABLE outreach_messages ADD COLUMN baseline TEXT NOT NULL DEFAULT '[]'");
 if(!db.pragma('table_info(outreach_messages)').some(c=>c.name==='quote'))db.exec('ALTER TABLE outreach_messages ADD COLUMN quote TEXT');
 // Preserve the previous sender's journal. An uncertain legacy POST stays uncertain.
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='outbound_inquiries'").get())for(const row of db.prepare('SELECT * FROM outbound_inquiries').all())db.prepare('INSERT OR IGNORE INTO outreach_messages (key,source,target,event,body,state,remote_id,at) VALUES(?,?,?,?,?,?,?,?)').run(digest(['github',row.url,'tricebr','initial']),'github',row.url,'initial',row.body,row.state,row.remote_url,row.at);
 db.exec('CREATE TABLE IF NOT EXISTS outreach_rechecks (url TEXT PRIMARY KEY,not_before INTEGER NOT NULL,reason TEXT NOT NULL)');
 const active=ctx=>{if(!isEnabled())throw Error('Communication OFF');if(ctx?.signal?.aborted)throw Error('Communication cancelled');ctx?.assertActive?.();};
 const limit=()=>{const r=db.prepare("SELECT count(*) n,min(at) oldest FROM outreach_messages WHERE at>? AND state IN ('pending','unknown','sent')").get(now()-86400000);return r.n>=3?r.oldest+86400000:0;};
 const result=(status,url,extra={})=>({kind:'external-communication',status,url,customerWorkStarted:false,...extra});
 const adapter={available:true,maxCostRappen:0,retrySafe:true,reconcileSafe:true,autoRetrySafe:true,
  interruptedRetrySafe(task){const {source,url}=task.input??{};return !!transports[source]&&typeof url==='string'&&!db.prepare('SELECT 1 FROM outreach_messages WHERE source=? AND target=? LIMIT 1').get(source,url);},
  get nextReadyAt(){return limit();},async execute(ctx){
  active(ctx);const {source,url}=ctx.task?.input??{},transport=transports[source];if(!transport)throw Error('Supported authenticated communication transport required');
  let remote=await transport.inspect(url,ctx);active(ctx);
  if(remote.source!==source||remote.url!==url||!remote.identity||!Array.isArray(remote.messages))throw Error('Conversation binding required');
  if(remote.rootTaskId&&remote.rootTaskId!==ctx.task?.rootTaskId)throw Error('Conversation budget root mismatch');
  const rows=db.prepare('SELECT * FROM outreach_messages WHERE source=? AND target=? ORDER BY at,key').all(source,url);
  for(const row of rows.filter(r=>r.state!=='sent')){
   const baseline=JSON.parse(row.baseline),matches=remote.messages.filter(m=>m.own&&m.content===row.body&&typeof m.id==='string'&&!baseline.includes(m.id)),found=matches[0];
   if(matches.length!==1)throw Error('Prior uncertain message requires reconciliation; no duplicate send');
   db.prepare("UPDATE outreach_messages SET state='sent',remote_id=? WHERE key=?").run(found.id,row.key);
   return result('sent',url,{remoteId:found.id,reconciled:true});
  }
  const priorQuote=rows.filter(r=>r.state==='sent'&&r.quote).at(-1);
  const quoted=priorQuote?JSON.parse(priorQuote.quote):remote.existingQuote;
  const grounded=quoted?{...remote,job:{...remote.job,...quoted}}:remote.priorOffer?{...remote,job:{...remote.job,amount:NaN,hours:null,days:null}}:remote;
  let action=composeOutreach(grounded);
  const lastOwn=remote.messages.map(m=>!!m.own).lastIndexOf(true),incoming=remote.messages.slice(lastOwn+1).filter(m=>m.trusted&&!m.own).at(-1);
  if(!priorQuote&&rows.some(r=>r.state==='sent'&&r.event==='initial')&&incoming&&!forbidden.test(incoming.content)){
   const proposal=composeOutreach({job:remote.job,messages:[]});
   if(proposal.kind==='offer')action={...proposal,kind:'reply',event:'reply:'+incoming.id,proposal:true};
  }
  if(['none','blocked'].includes(action.kind))return result(action.kind==='none'?'not-required':'blocked',url,{reason:action.reason??null,...(action.review?{review:action.review}:{})});
  const key=digest([source,url,remote.identity,action.event]);
  if(db.prepare('SELECT key FROM outreach_messages WHERE key=?').get(key))return result('not-required',url);
  if(transport.canSend?.(action,remote)===false)return result('blocked',url,{reason:'unsupported-conversation-action'});
  const baseline=remote.messages.map(m=>m.id);
  const quote=action.kind==='offer'||action.proposal?JSON.stringify(Object.fromEntries(['amount','currency','hours','days','acceptance','payment'].map(k=>[k,remote.job[k]]))):null;
  db.transaction(()=>{active(ctx);if(limit()>now())throw Error('Communication daily limit');if(db.prepare("SELECT key FROM outreach_messages WHERE source=? AND target=? AND state!='sent'").get(source,url))throw Error('Pending conversation write');db.prepare("INSERT INTO outreach_messages (key,source,target,event,body,state,remote_id,at,baseline,quote) VALUES(?,?,?,?,?,'pending',NULL,?,?,?)").run(key,source,url,action.event,action.body,now(),JSON.stringify(baseline),quote);}).immediate();
  let transportCalled=false;
  try{
   active(ctx);transportCalled=true;await transport.send(action,remote,ctx);active(ctx);
   const check=await transport.inspect(url,ctx);active(ctx);
   if(check.identity!==remote.identity||check.source!==source||check.url!==url)throw Error('Identity changed');
   const matches=check.messages.filter(m=>m.own&&m.content===action.body&&typeof m.id==='string'&&!baseline.includes(m.id)),found=matches[0];if(matches.length!==1)throw Error('Independent readback required');
   db.prepare("UPDATE outreach_messages SET state='sent',remote_id=? WHERE key=?").run(found.id,key);
   return result('sent',url,{remoteId:found.id,action:action.kind,missing:action.missing??[]});
  }catch(error){if(!transportCalled||error?.dispatchNotStarted===true){db.prepare("DELETE FROM outreach_messages WHERE key=? AND state='pending'").run(key);throw Error('Communication not started; fresh inspection required');}db.prepare("UPDATE outreach_messages SET state='unknown' WHERE key=?").run(key);throw Error('Communication outcome uncertain; reconcile before retry');}
 },verify:r=>r?.kind==='external-communication'&&['sent','not-required','blocked'].includes(r.status)&&r.customerWorkStarted===false&&typeof r.url==='string'};
 return {adapter,prepareProfileOffer:assessProfileOffer,registerTarget({url,source,rootTaskId}){if(!isEnabled()||!transports[source]||typeof rootTaskId!=='string'||!rootTaskId||rootTaskId.length>240)return;db.prepare('INSERT OR IGNORE INTO outreach_targets VALUES(?,?,?,?)').run(url,source,rootTaskId,-1);},deferTarget:(url,until,reason)=>{if(isEnabled()&&Number.isSafeInteger(until)&&until>now())db.prepare('INSERT INTO outreach_rechecks VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET not_before=MAX(not_before,excluded.not_before),reason=excluded.reason').run(url,until,reason);},targets:()=>db.prepare('SELECT t.* FROM outreach_targets t LEFT JOIN outreach_rechecks r ON r.url=t.url WHERE COALESCE(r.not_before,0)<=? ORDER BY t.scheduled,t.url LIMIT 100').all(now()),markScheduled:url=>db.prepare('UPDATE outreach_targets SET scheduled=? WHERE url=?').run(now(),url),status:()=>({enabled:isEnabled(),supported:Object.keys(transports),freeOffers:true,autonomousReplies:true,externalWriteVerification:'not-checked-offline',dailyMax:3,blockedSources:{gmail:'Configured replies require actual gmail.send and a reviewed thread/order binding',guru:'Independent authenticated send interface missing',freelancer:'Official API verified; own token, scopes and account-specific free-bid eligibility still required',laborx:'Official terms restrict automated use; provider exception required',n8n:'Community backend API permission missing; workflow API key does not authorize forum use',synmerco:'Stake-gated inbox: free sending and recipient response binding unverified',arcbounty:'Wallet-signed work/escrow actions require separate authority; no free chat endpoint verified',bidpostloop:'No standalone message API verified; proposals may immediately start paid work'},records:db.prepare('SELECT source,target,event,state,remote_id FROM outreach_messages ORDER BY at DESC LIMIT 30').all()}),close:()=>db.close()};
}


