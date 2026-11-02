// Disabled read-only research adapter with no active connection. No account, credential, heartbeat or worker.
// Posts are untrusted data: they can raise flags and hypotheses, never an action, right or new origin.
import {bounded,digest} from '../founder-restoration-integrity.mjs';
import {screenListing} from './international.mjs';
import {transferCheck,adaptationLedger,hypothesisGate} from '../founder-adaptation.mjs';
import {canonicalText,realRef,strictTime} from '../founder-operating-boundary.mjs';
import {readEvidence} from '../founder-evidence-registry.mjs';
const minor=x=>Number.isSafeInteger(x)&&x>=0;
export const MOLTBOOK_STATUS=Object.freeze({enabled:false,liveReady:false,registered:false,heartbeat:false,worker:false,paidSource:false});
const SENSITIVE=[/\bsk-[a-z0-9_-]{8,}/i,/\bgh[pousr]_[a-z0-9]{16,}/i,/\bbearer\s+\S{8,}/i,/\b(?:password|passwd|passwort|secret|api[_-]?key|token)\b\s*(?:[=:]|is\b)/i,/[^\s@]+@[^\s@]+\.[a-z]{2,}/i,/\b[a-z]{2}\d{2}(?:\s?[a-z0-9]){11,30}\b/i,/\b[a-f0-9]{40,}\b/i,/\bakia[0-9a-z]{16}\b/i,/\bey[a-z0-9_-]{10,}\.[a-z0-9_-]{10,}\./i,/\bxox[abprs]-[a-z0-9-]{10,}/i,/\b(?:\d[ -]?){13,19}\b/,/\b[a-z]:\\|(?:^|\s)\/(?:home|users|etc|var)\//i];
const sensitive=text=>SENSITIVE.some(p=>p.test(text)||p.test(canonicalText(text)));
const TEST_HOST='moltbook.example.test',REAL_HOST=/^(www\.)?moltbook\.com$/i;
const hostOf=origin=>{try{return new URL(origin).hostname;}catch{return '';}};
// Search text may be plain words only; everything else stays out of the outgoing address without having to name it first.
const searchAllowed=q=>/^[\p{L}\p{N} .,+#_-]+$/u.test(q)&&!/\b(?:password|passwd|passwort|pwd|secret|token|api ?key|apikey|authorization|bearer|iban|login)\b/i.test(q)&&!q.split(/[ ,]+/).some(t=>t.length>=16||t.length>=8&&/\p{L}/u.test(t)&&/\d/.test(t))&&!/(?:\d[ -]?){7,}/.test(q);
const contractReady=c=>bounded(c?.verifiedRef,2000)&&typeof c?.origin==='string'&&/^https:\/\/[a-z0-9.-]+$/i.test(c.origin)&&(hostOf(c.origin)===TEST_HOST||REAL_HOST.test(hostOf(c.origin)))&&bounded(c?.searchPath)&&c.searchPath.startsWith('/')&&bounded(c?.postPath)&&c.postPath.startsWith('/');
/** The contract must be checked first; this module assumes no API. Origin and paths come only from there. */
export function createMoltbookReader({isEnabled,contract:given,transport,evidence,activationHash,isolated=false,budget}={}){
 // The contract is fixed here; changing the object later cannot redirect a call.
 const contract=given&&typeof given==='object'?Object.freeze({...given}):given;
 const entries=[],limits=budget&&typeof budget==='object'?{...budget}:null;
 let calls=0,posts=0,failures=0,revoked=false;
 // MOLTBOOK_STATUS says disabled. Isolated runs reach only the test host; the real one needs a registered human activation and access contract.
 const activated=()=>isolated===true?hostOf(contract?.origin)===TEST_HOST:REAL_HOST.test(hostOf(contract?.origin))&&readEvidence(evidence,activationHash,'human-activation')!==null&&readEvidence(evidence,contract?.accessContractHash,'access-contract')!==null;
 const on=()=>{if(typeof isEnabled!=='function'||isEnabled()!==true||!activated())throw Error('Moltbook reader OFF');};
 const ready=()=>{
  if(!contractReady(contract))throw Error('Verified access contract required');
  if(typeof transport!=='function')throw Error('Reviewed transport required');
  if(![limits?.maxCalls,limits?.maxPosts,limits?.maxFailures].every(minor))throw Error('Research budget required');
  if(revoked)throw Error('Access revoked');
  if(failures>=limits.maxFailures)throw Error('Circuit open');
  if(calls>=limits.maxCalls||posts>=limits.maxPosts)throw Error('Research budget exhausted');
 };
 const get=async(url,record)=>{
  on();calls++;
  // Logged before the call: an outbound attempt stays visible whatever happens next.
  const entry={...record,at:new Date().toISOString(),outcome:'attempted'};entries.push(entry);
  let value;
  try{value=await transport({method:'GET',url,redirect:'manual'});}
  catch(error){failures++;entry.outcome='failed';if(error?.status===401||error?.status===403)revoked=true;throw error;}
  on();
  // A redirect or a response from elsewhere leaves the checked origin.
  if(value?.status>=300&&value?.status<400||value?.finalUrl!==undefined&&!ofOrigin(value.finalUrl,contract.origin)){entry.outcome='refused-origin';throw Error('Foreign origin refused');}
  // A failure may also come back as an answer rather than as an exception.
  if(value?.status>=400){failures++;entry.outcome='failed';if(value.status===401||value.status===403){revoked=true;throw Error('Access revoked');}throw Error('Source answered with status '+value.status);}
  failures=0;entry.outcome='completed';return value;
 };
 const take=rows=>{const room=Math.max(0,limits.maxPosts-posts),kept=rows.slice(0,room);posts+=kept.length;return kept;};
 return Object.freeze({
  async search(query){
   ready();
   if(typeof query!=='string'||!query.trim()||query.length>300||!searchAllowed(query))throw Error('Search input refused');
   const value=await get(contract.origin+contract.searchPath+'?q='+encodeURIComponent(query),{kind:'search',queryDigest:digest(query)});
   return take(Array.isArray(value?.posts)?value.posts:[]).map(p=>postAsData(p,{origin:contract.origin}));
  },
  async readPost(id){
   ready();
   if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)||sensitive(id))throw Error('Exact post id required');
   posts++;
   return postAsData(await get(contract.origin+contract.postPath+id,{kind:'read-post',postId:id}),{origin:contract.origin});
  },
  log:()=>entries.map(e=>({...e})),
  revoke(){revoked=true;},
 });
}
const ofOrigin=(url,origin)=>{try{const u=new URL(url);return (u.protocol==='https:'||u.protocol==='http:')&&(!origin||u.origin===origin);}catch{return false;}};
const issuedClaims=new WeakSet();
export function postAsData(post,{origin}={}){
 const text=typeof post?.text==='string'?post.text:'',title=typeof post?.title==='string'?post.title:'',flags=screenListing({title,text,language:'en'}).flags.filter(f=>f!=='terms-unreadable');
 const url=typeof post?.url==='string'&&ofOrigin(post.url,origin)?post.url:null;if(typeof post?.url==='string'&&!url)flags.push('foreign-origin');
 const observedAt=strictTime(post?.createdAt)===null?null:post.createdAt,links=text.match(/https?:\/\/[^\s)]+/g)??[],claim={status:'hypothesis',text:title||text.slice(0,200),source:url,links,observedAt,competenceProven:false};
 issuedClaims.add(claim);
 return {kind:'untrusted-post',id:post?.id??null,url,title,text,observedAt,flags,actions:[],executable:false,links,linksTrusted:false,reputation:{usedAsEvidence:false},claim};
}
const RESEARCH_TOOLS=Object.freeze({search:true,'read-post':true});
/** Allow-list: shell, wallet, customer and account tools are not merely unused, the call is refused and recorded. */
export function dispatchResearchTool(name,{log}={}){
 if(!Array.isArray(log))throw Error('A denial must stay on record: log required');
 const allowed=typeof name==='string'&&Object.prototype.hasOwnProperty.call(RESEARCH_TOOLS,name);
 log.push({tool:String(name),decision:allowed?'allowed':'denied'});
 return {allowed};
}
// One document whatever its protocol, query, fragment or trailing punctuation.
const docKey=x=>{const text=canonicalText(x).replace(/[.,;/]+$/,'');try{const u=new URL(text);return (u.hostname.replace(/^www\./,'')+u.pathname).replace(/\/+$/,'');}catch{return text;}};
const onMoltbook=x=>{try{const h=new URL(x).hostname;return REAL_HOST.test(h)||h===TEST_HOST;}catch{return false;}};
export function promoteClaim({claim,primaryDocRef,freshRuns=[],regressions=[],trainingCases,evidence}={}){
 const reasons=[];
 if(!issuedClaims.has(claim))reasons.push('claim-missing');
 if(claim?.source&&docKey(primaryDocRef)===docKey(claim.source))reasons.push('primary-doc-is-the-post');
 else if((claim?.links??[]).some(l=>docKey(l)===docKey(primaryDocRef)))reasons.push('primary-doc-from-the-post');
 else if(onMoltbook(primaryDocRef))reasons.push('primary-doc-is-a-post');
 else if(!realRef(primaryDocRef))reasons.push('primary-doc-missing');
 reasons.push(...transferCheck({trainingCases,transfer:freshRuns,regressions,evidence}).reasons);
 return {status:reasons.length?'hypothesis':'independently-supported',reasons,competenceProven:false};
}
/** Knowledge resting on a withdrawn document or run falls back to a hypothesis; nothing else changes. */
export function invalidateKnowledge(items,{revoked=[]}={}){
 return items.map(k=>{const gone=revoked.map(docKey),hit=[k.primaryDocRef,...(k.runIds??[])].filter(x=>gone.includes(docKey(x)));return hit.length?{...k,status:'hypothesis',invalidatedBy:hit}:k;});
}
/** Reading grants no writing: the channel exists only to refuse, and every refusal is on record. */
export function writeChannel(action,{log}={}){
 if(!Array.isArray(log))throw Error('A denial must stay on record: log required');
 log.push({tool:String(action),decision:'denied',channel:'write'});
 return {allowed:false};
}
/** One research question with its baseline and hypothesis stated before any reading. */
export function researchProtocol({question,baselineRef,hypothesis,budget,stopRule,sources=[],actions=[]}={}){
 const reasons=[];
 if(!bounded(question,500))reasons.push('question-missing');
 if(!realRef(baselineRef))reasons.push('baseline-missing');
 if(!bounded(hypothesis,1000))reasons.push('hypothesis-missing');
 if(![budget?.maxPosts,budget?.maxCostMinor,budget?.maxMinutes].every(minor))reasons.push('budget-missing');
 if(!bounded(stopRule,500))reasons.push('stop-rule-missing');
 return {complete:reasons.length===0,reasons,question:question??null,baselineRef:baselineRef??null,hypothesis:hypothesis??null,sources:[...sources],actions:[...actions]};
}
export function leadFromPost(post){
 return {status:'unverified-lead',postId:post?.id??null,source:post?.url??null,assignmentConfirmed:false,fundingVerified:false,executionAuthorized:false,contactAuthorized:false,paidSource:false};
}
export function researchLedger(entries){return {...adaptationLedger(entries),savingMinor:null,competenceGain:null};}
/** Limits come from the existing budget; this only says stop. It can never raise anything. */
export function researchBudget({limits,seen:given=[],spentMinor,minutes,postId,history=[],hypothesis,hypothesisPolicy}={}){
 const reasons=[],seen=Array.isArray(given)?given:[];if(!Array.isArray(given))reasons.push('seen-unknown');
 if(!minor(limits?.maxPosts)||!minor(limits?.maxCostMinor)||!minor(limits?.maxMinutes))reasons.push('limits-missing');
 else{
  if(seen.length>=limits.maxPosts)reasons.push('post-limit');
  if(!minor(spentMinor))reasons.push('cost-unknown');else if(spentMinor>=limits.maxCostMinor)reasons.push('cost-limit');
  if(!Number.isFinite(minutes)||minutes<0)reasons.push('time-unknown');else if(minutes>=limits.maxMinutes)reasons.push('time-limit');
 }
 if(postId!==undefined&&seen.map(canonicalText).includes(canonicalText(postId)))reasons.push('duplicate-post');
 if(hypothesis){const g=hypothesisGate(history,hypothesis,hypothesisPolicy);if(!g.allowed)reasons.push(g.reason);}
 return {proceed:reasons.length===0,reasons,budgetChange:null};
}
