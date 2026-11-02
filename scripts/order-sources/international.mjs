// Offline preparation of additional order sources. No I/O, provider calls, grants or activation.
// Listing text is untrusted data: it can raise flags, never change a structured field or a permission.
import {bounded} from '../founder-restoration-integrity.mjs';
import {selectOrderCandidate} from '../founder-order-selection.mjs';
import {canonicalText,identityText,realRef,recordIssues,strictTime} from '../founder-operating-boundary.mjs';
const DOC='docs/numaron-international-order-sources-20261026.md';
export const INTERNATIONAL_SOURCES=Object.freeze([
 ['upwork','Upwork',1,['en']],['freelancer','Freelancer',1,['en']],['guru','Guru',1,['en']],
 ['peopleperhour','PeoplePerHour',2,['en']],['contra','Contra',2,['en']],['freelancermap','freelancermap',2,['en','de']],
 ['malt','Malt',3,['fr','de','en']],
].map(([id,label,priority,languages])=>Object.freeze({id,label,priority,languages:Object.freeze(languages)})));
export const candidateInventoryRows=()=>INTERNATIONAL_SOURCES.map(s=>({id:'intl-'+s.id,label:s.label,inventoryKind:'catalogue-candidate',lane:'extended-source-review',provenance:[DOC]}));

const STAGES=['candidate','public-check','access-check','isolated-adapter','offline-accepted','ready-disabled'];
/** A stage records evidence. ready-disabled is the last stage: activation is never derived from it. */
export function advanceStage(record,{stage,passed,evidenceRef,blocker,at}={}){
 if(STAGES[STAGES.indexOf(record.stage)+1]!==stage)throw Error('Exact next stage required');
 if(!bounded(evidenceRef,2000))throw Error('Stage evidence required');
 if(passed!==true&&!bounded(blocker,500))throw Error('Concrete blocker required');
 const history=[...record.history,{stage,passed:passed===true,evidenceRef,blocker:passed===true?null:blocker,at}];
 return {...record,stage:passed===true?stage:record.stage,history,blockers:passed===true?[]:[blocker],enabled:false};
}

const CAPABILITIES={discovery:['read'],apply:['apply'],work:['work','verify'],submit:['submit'],acceptancePayment:['reconcile']};
const SEPARATE=['communication','assignmentFunding'],ACCESS=['account','api','rights'];
const stateOf=(e,now)=>{
 if(!e||!['live-verified','offline-verified'].includes(e.state))return 'blocked';
 if(!Array.isArray(e.evidenceRefs)||!e.evidenceRefs.length||!e.evidenceRefs.every(realRef))return 'blocked';
 if(!Number.isFinite(e.expiresAt)||e.expiresAt<=now)return 'expired';
 return e.state;
};
// Only a view this module worked out itself can allow anything; a hand-built object cannot.
const issuedViews=new WeakSet();
const deepFreeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){Object.freeze(x);for(const v of Object.values(x))deepFreeze(v);}return x;};
/** Reads existing registry capabilities; communication and assignment/funding have no registry field yet. */
export function capabilityView(source,{now=Date.now(),extra={},access={}}={}){
 const capabilities={};
 for(const [name,fields] of Object.entries(CAPABILITIES)){const states=fields.map(f=>stateOf(source?.capabilities?.[f],now));capabilities[name]={state:states.find(s=>s!=='live-verified')??'live-verified'};}
 for(const name of SEPARATE)capabilities[name]={state:stateOf(extra[name],now)};
 const blockers=ACCESS.filter(k=>!(access?.[k]?.state==='verified'&&realRef(access[k].evidenceRef)&&Number.isFinite(access[k].expiresAt)&&access[k].expiresAt>now)).map(k=>k+'-missing');
 const view=deepFreeze({sourceId:source?.id??null,capabilities,blockers,liveReady:!blockers.length&&Object.values(capabilities).every(c=>c.state==='live-verified'),activated:false});
 issuedViews.add(view);
 return view;
}
export function actionAllowed(view,capability){
 const state=view?.capabilities?.[capability]?.state??'blocked',blockers=[...(view?.blockers??[])];
 if(!issuedViews.has(view))blockers.push('view-not-issued');
 if(state!=='live-verified')blockers.push(capability+'-'+state);
 return {allowed:blockers.length===0,blockers};
}

const FLAG_PATTERNS={
 aiForbidden:[/\b(?:ai|ki)[- ](?:generated|generiert\w*|written|created|erstellt\w*)\b[^.\n]{0,40}\b(?:not|never|no|reject\w*|abgelehnt|nicht|verboten|forbidden)\b/i,/\b(?:no|not|never|don'?t|must not|without)\b[^.;,\n]{0,25}\b(?:ai|chatgpt|gpt|llm)\b/i,/\b(?:ai|chatgpt|gpt|llm)\b[^.\n]{0,30}\b(?:prohibited|forbidden|banned|not allowed|not permitted|rejected)\b/i,/\b(?:automated|bots?)\b[^.\n]{0,30}\b(?:prohibited|forbidden|banned|not allowed|not permitted)\b/i,/\bno (?:bots?|automated)\b/i,/\b(?:keine?|ohne|nicht)\b[^.;,\n]{0,25}\b(?:ki|chatgpt|gpt)\b/i,/\bki\b[^.\n]{0,30}\b(?:verboten|untersagt|nicht erlaubt|unzulässig)\b/i],
 identityMisrepresentation:[/\bpretend\w*\b[^.\n]{0,30}\bhuman\b/i,/\b(?:do not|don'?t|never|must not)\s+(?:disclose|mention|reveal|say)\b[^.\n]{0,30}\b(?:ai|chatgpt|gpt|bot)\b/i,/\bgib dich\b[^.\n]{0,20}\bmensch/i],
 humanPresence:[/\b(?:interview|meeting|call|gespräch)\b[^.\n]{0,25}\b(?:over|via|on|per|über)\s+(?:teams|zoom|skype|meet|phone|video|telefon)\b/i,/\bon-?site\b|\bin[- ]person\b|\bin[- ]office\b|\b(?:video|phone|zoom)[- ](?:call|interview|meeting)\b|\bcamera\b/i,/\bvor[- ]ort\b|\bpräsenz\b|\bvideoanruf\b|\bpersönliche[sr]? gespräch\b/i],
 personalIdentity:[/\b(?:include|send|attach|provide|upload)\b[^.\n]{0,25}\b(?:resume|résumé|cv)\b/i,/\b[\p{L}]+ residents? only\b|\bresidents? of\b|\bonly (?:candidates|applicants) from\b/iu,/\bcv\b|\b(?:send|attach|provide|upload)\b[^.\n]{0,20}\b(?:resume|résumé)\b|\b(?:send|attach|provide|upload)\b[^.\n]{0,30}\breferences\b|\bpassport\b|\bwork permit\b|\bcitizen\w*\b|\bnative speaker\b|\bid verification\b|\bmust be located\b/i,/\blebenslauf\b|\breferenzen\b|\bausweis\b|\barbeitserlaubnis\b|\bmuttersprach\w*\b|\bwohnsitz\b/i],
 promptInjection:[/\b(?:ignore|disregard|forget|override)\b[^.]{0,40}\b(?:instructions?|prompts?)\b/i,/\b(?:ignore|disregard|forget|override)\b[^.]{0,30}\b(?:previous|prior|above|earlier|all|your)\b[^.]{0,20}\brules?\b/i,/\[\s*(?:system|assistant|admin|tool)\s*\]/i,/\b(?:executionauthorized|contactauthorized|tier|liveready|enabled|approved)\s*[=:]\s*\S/i,/\bbudget\s*=\s*\S/i,/\bgrant (?:submit|tier|permission|execution)\b/i,/\b(?:ignorier\w*|vergiss)\b[^.\n]{0,40}\b(?:anweisung\w*|regeln|vorgaben)\b/i,/\b(?:reveal|print|show|leak)\b[^.\n]{0,20}\bsystem prompt\b/i,/<\/?\s*(?:system|assistant|tool)\b/i,/\byou are now\b/i,/\bapprove this (?:job|order|listing)\b/i],
};
const READABLE=new Set(['en','de']);
const readableLanguage=x=>READABLE.has(String(x??'').toLowerCase().split('-')[0]);
const plain=canonicalText;
const lines=text=>String(text??'').split('\n').map(canonicalText).join('\n');
const foreignScript=text=>(plain(text).match(/\p{L}/gu)??[]).some(c=>!/\p{Script=Latin}/u.test(c));
const OWN_WORDS=new Set('the and of to for with is are an this that we you your our on at be will must not no please our from by or und der das ist ein eine einen einer für mit von zu im den nicht wir sie bitte oder auf aus bei'.split(' '));
const OTHER_WORDS=new Set('le les du une et est pour dans avec nous vous el los las por para con una que il gli che een het voor met zijn ou sur au aux il est sont'.split(' '));
/** A declared language is only a claim. Text that reads as another language counts as unreadable; this is a warning, it can free nothing. */
const readsForeign=text=>{const words=plain(text).match(/\p{L}+/gu)??[],own=words.filter(w=>OWN_WORDS.has(w)).length,other=words.filter(w=>OTHER_WORDS.has(w)).length;return other>own||words.length>=6&&own===0;};
const MAX_SCREENED=100000;
/** Pattern lists see only en/de text. Anything else counts as unreadable, so it can never pass as clean. */
export function screenListing({title,text,terms,translationText,translationTerms,language}={}){
 const parts=[title,text,terms,translationText,translationTerms],combined=parts.map(lines).filter(Boolean).join('\n'),flags=Object.keys(FLAG_PATTERNS).filter(f=>FLAG_PATTERNS[f].some(p=>p.test(combined.slice(0,MAX_SCREENED)))),original=[title,text,terms].join(' '),translated=[translationText,translationTerms].filter(Boolean).join(' ');
 const readableOriginal=readableLanguage(language)&&!foreignScript(original)&&!readsForeign(original);
 const readableTranslation=typeof translationText==='string'&&translationText.trim()!==''&&(!terms||typeof translationTerms==='string'&&translationTerms.trim()!=='')&&!foreignScript(translated)&&!readsForeign(translated);
 if(!readableOriginal&&!readableTranslation||combined.length>MAX_SCREENED)flags.push('terms-unreadable');
 return {flags};
}

const TAGS={'data-cleaning':/\bclean(?:s|ed|ing|se|sing|up)?\b[^.\n]{0,40}\b(?:data|csv|xlsx?|excel|export|lists?|records?|rows?|files?|spreadsheets?|datasets?)\b|\b(?:data|csv|xlsx?|excel|export|lists?|records?|rows?|files?|spreadsheets?|datasets?)\b[^.\n]{0,40}\bclean(?:s|ed|ing|se|sing|up)?\b|\b(?:dedup\w*|duplicates?|validat\w*)\b|bereinig|dubletten/i,'csv-excel-import':/\b(?:csv|xlsx?|excel|spreadsheet|import(?:s|ing|ed|er)?)\b/i,reconciliation:/reconcil|abgleich/i,reporting:/\breport(?:s|ing)?\b|bericht|kennzahl/i,'api-integration':/\bapi\b|webhook|integrat|synchroni[sz]|schnittstelle/i,'python-debug':/\bpython\b[^.\n]*\b(?:debug\w*|fix\w*|bugs?)\b|\b(?:debug\w*|fix\w*)\b[^.\n]*\bpython\b/i,'workflow-repair':/\b(?:repair\w*|fix\w*|broken)\b[^.\n]*\b(?:workflow|automation|script)\b|\b(?:workflow|automation|script)\b[^.\n]*\b(?:repair\w*|fix\w*|broken)\b/i,'document-ocr':/\bocr\b|\bscan(?:s|ned|ning)?\b|\bpdf\b/i,'catalogue-feed':/catalog|katalog|product feed|produktfeed/i,'internal-tool':/internal tool|admin panel|internes werkzeug/i};
const tagsOf=text=>{const seen=plain(text).slice(0,20000);return Object.keys(TAGS).filter(t=>TAGS[t].test(seen));};
const minorOrNull=v=>Number.isSafeInteger(v)&&v>=0?v:null;
const instant=value=>{
 const t=strictTime(value);return t===null?null:new Date(t).toISOString();
};
const canonicalUrl=value=>{
 if(typeof value!=='string'||value.length>2000||!/^https:\/\/\S+$/.test(value))return null;
 try{
  const u=new URL(value);if(u.username||u.password)return null;
  if(!u.hash.startsWith('#/'))u.hash='';u.hostname=u.hostname.replace(/\.$/,'').replace(/^www\./,'');
  for(const k of [...u.searchParams.keys()]){const key=k.toLowerCase();if(key==='ref'||key==='fbclid'||key==='gclid'||key.startsWith('utm_'))u.searchParams.delete(k);}
  u.searchParams.sort();try{u.pathname=decodeURI(u.pathname);}catch{}
  u.pathname=u.pathname.replace(/\/+$/,'');return u.toString();
 }catch{return null;}
};
export function normalizeListing(raw,{now=Date.now()}={}){
 if(!bounded(raw?.sourceId)||!bounded(raw?.externalId)||!bounded(raw?.language,20)||typeof raw?.text!=='string'||!raw.text.trim())throw Error('Invalid listing');
 const issues=[],translation=raw.translation&&readableLanguage(raw.translation.language)&&typeof raw.translation.text==='string'&&raw.translation.text.trim()&&bounded(raw.translation.method)&&bounded(raw.translation.evidenceRef,2000)?{language:raw.translation.language,text:raw.translation.text,terms:typeof raw.translation.terms==='string'?raw.translation.terms:null,method:raw.translation.method,evidenceRef:raw.translation.evidenceRef}:null;
 if(raw.translation&&!translation)issues.push('translation-untraceable');
 if(!INTERNATIONAL_SOURCES.some(s=>s.id===raw.sourceId))issues.push('source-unknown');
 const url=canonicalUrl(raw.canonicalUrl);if(raw.canonicalUrl!==undefined&&!url)issues.push('canonical-url-invalid');
 let deadline=null;if(raw.deadline!==undefined&&raw.deadline!==null){const at=instant(raw.deadline);if(!at)issues.push('deadline-instant-unknown');deadline={raw:String(raw.deadline),instant:at,timezone:typeof raw.timezone==='string'?raw.timezone:null};}
 let clientBudget=null,providerBid=null;
 if(raw.price===undefined||raw.price===null)issues.push('price-unknown');
 else{const p={amountMinor:minorOrNull(raw.price.amountMinor),currency:typeof raw.price.currency==='string'&&/^[A-Z]{3}$/.test(raw.price.currency)?raw.price.currency:null,type:['fixed','hourly'].includes(raw.price.type)?raw.price.type:null};
  if(raw.price.kind==='client-budget'){clientBudget=p;if(p.amountMinor===null||p.currency===null||p.type===null)issues.push('price-incomplete');}else if(raw.price.kind==='provider-bid'){providerBid=p;issues.push('client-budget-missing');}else issues.push('price-kind-unknown');}
 const originalReadable=readableLanguage(raw.language),basis=originalReadable?'original':translation?'translation':null;
 const captured=typeof raw.capturedAt==='string'&&Number.isFinite(Date.parse(raw.capturedAt))?new Date(Date.parse(raw.capturedAt)).toISOString():null;
 return {sourceId:raw.sourceId,externalId:raw.externalId,revision:typeof raw.revision==='string'?raw.revision:null,evidenceRef:typeof raw.evidenceRef==='string'?raw.evidenceRef:null,canonicalUrl:url,capturedAt:captured,
  original:{language:raw.language,title:typeof raw.title==='string'?raw.title:null,text:raw.text,terms:typeof raw.terms==='string'?raw.terms:null},translation,remoteState:typeof raw.remoteState==='string'?raw.remoteState:null,deadline,clientBudget,providerBid,applicationFeeMinor:minorOrNull(raw.applicationFeeMinor),clientRef:bounded(raw.clientRef)?raw.clientRef:null,
  requirements:{tags:basis===null?[]:tagsOf(basis==='original'?[raw.title,raw.text].join('\n'):translation.text),basis},
  claims:{proposalCount:minorOrNull(raw.proposalCount),scope:raw.scope,acceptance:raw.acceptance,payment:raw.payment,aiUse:raw.aiUse,requiresWorkerDeposit:raw.requiresWorkerDeposit===true,eligibilityMismatch:raw.eligibilityMismatch===true},humanMinutes:Number.isFinite(raw.humanMinutes)&&raw.humanMinutes>=0?raw.humanMinutes:null,issues};
}
const screenOf=l=>screenListing({title:l.original.title,text:l.original.text,terms:l.original.terms,translationText:l.translation?.text,translationTerms:l.translation?.terms,language:l.original.language});
const isStale=(l,now)=>{const t=Date.parse(l.capturedAt??'');return !Number.isFinite(t)||t>now+1000||now-t>7*86400000;};
const fitOf=(l,competence)=>{const tags=l.requirements.tags;if(!tags.length)return undefined;return tags.every(t=>bounded(competence?.[t],2000))?'strong':'possible';};
const selectionInput=(l,{competence}={})=>{
 const flags=screenOf(l).flags,has=f=>flags.includes(f);
 return {title:l.original.title,url:l.canonicalUrl??undefined,remoteState:l.remoteState,deadline:l.deadline?.instant??'unknown-instant',applicationFeeMinor:l.applicationFeeMinor??undefined,proposalCount:l.claims.proposalCount??undefined,fit:fitOf(l,competence),scope:l.issues.length?undefined:l.claims.scope,acceptance:l.claims.acceptance,payment:l.claims.payment,aiUse:l.claims.aiUse,requiresWorkerDeposit:l.claims.requiresWorkerDeposit,eligibilityMismatch:l.claims.eligibilityMismatch,aiForbidden:has('aiForbidden'),identityMisrepresentation:has('identityMisrepresentation'),humanPresence:has('humanPresence'),personalIdentity:has('personalIdentity'),promptInjection:has('promptInjection'),termsUnreadable:has('terms-unreadable')};
};
export const toObservation=(l,options)=>({kind:'listing',sourceId:l.sourceId,externalId:l.externalId,revision:l.revision,evidenceRef:l.evidenceRef,observedAt:l.capturedAt,data:selectionInput(l,options)});
const BLOCKING=['aiForbidden','identityMisrepresentation','humanPresence','personalIdentity','promptInjection','terms-unreadable'];
const issuedAssessments=new WeakMap();
export function assessListing(l,{now=Date.now(),competence}={}){
 const flags=screenOf(l).flags;if(isStale(l,now))flags.push('stale');
 const input=selectionInput(l,{competence});
 const assessment=deepFreeze({flags,blockers:flags.filter(f=>BLOCKING.includes(f)),issues:[...l.issues],fit:input.fit??null,selection:selectOrderCandidate({...input,observedAt:l.capturedAt},{now})});
 issuedAssessments.set(assessment,{listing:l,snapshot:JSON.stringify(l)});
 return assessment;
}

const languageOf=x=>String(x).toLowerCase().split('-')[0];
const comparableText=l=>l.translation?{language:languageOf(l.translation.language),text:l.translation.text}:readableLanguage(l.original.language)?{language:languageOf(l.original.language),text:l.original.text}:null;
const tokens=text=>new Set(plain(text).match(/[\p{L}\p{N}]+/gu)??[]);
const similarity=(a,b)=>{const x=tokens(a),y=tokens(b),shared=[...x].filter(t=>y.has(t)).length;return shared/((x.size+y.size-shared)||1);};
const SIMILAR=0.6;
// Ids can differ by case alone, so only invisible characters and width are ignored here.
const orderId=l=>JSON.stringify([plain(l.sourceId),identityText(l.externalId)]);
/** Fields where two listings of one order must not disagree; a gap is no contradiction. */
const agreement=(x,y)=>({clientRef:[x.clientRef,y.clientRef],deadline:[x.deadline?.instant??null,y.deadline?.instant??null],amount:[x.clientBudget?.amountMinor??null,y.clientBudget?.amountMinor??null],currency:[x.clientBudget?.currency??null,y.clientBudget?.currency??null],type:[x.clientBudget?.type??null,y.clientBudget?.type??null]});
const contradicts=pairs=>Object.values(pairs).some(([p,q])=>p!==null&&q!==null&&plain(p)!==plain(q));
const newest=(a,b)=>{const x=Date.parse(a.capturedAt??''),y=Date.parse(b.capturedAt??'');if(!Number.isFinite(x))return b;if(y!==x)return y>x?b:a;return String(b.revision??'')>=String(a.revision??'')?b:a;};
/** Merges only on a shared link or complete agreeing evidence. Gaps and ambiguity become review items, never a merge. */
export function dedupeListings(listings){
 const orders=new Map();
 for(const l of listings){const id=orderId(l),o=orders.get(id);if(o){o.members.push(l);o.latest=newest(o.latest,l);}else orders.set(id,{id,members:[l],latest:l});}
 const all=[...orders.values()].sort((a,b)=>a.id.localeCompare(b.id)),review=[],parent=new Map(all.map(o=>[o.id,o.id]));
 const find=id=>{while(parent.get(id)!==id)id=parent.get(id);return id;};
 const sourcesOf=root=>all.filter(o=>find(o.id)===root);
 const union=(a,b)=>{const x=find(a.id),y=find(b.id);if(x===y)return;
  const left=sourcesOf(x),right=sourcesOf(y);
  if(left.some(p=>right.some(q=>plain(p.latest.sourceId)===plain(q.latest.sourceId)))){review.push({a:a.id,b:b.id,reason:'same-source-conflict',missing:[]});return;}
  // A similar to B and B to C does not make A similar to C: every pair must hold before groups join.
  if(left.some(p=>right.some(q=>!linked(p,q)))){review.push({a:a.id,b:b.id,reason:'chained-match',missing:[]});return;}
  parent.set(y,x);};
 const linked=(p,q)=>(matches.get(p.id)??[]).includes(q)||urlLinks.has(p.id+'|'+q.id)||urlLinks.has(q.id+'|'+p.id);
 const matches=new Map(all.map(o=>[o.id,[]])),urlLinks=new Set(),linkPairs=[];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j],x=a.latest,y=b.latest,sameSource=plain(x.sourceId)===plain(y.sourceId),pairs=agreement(x,y);
  if(x.canonicalUrl&&x.canonicalUrl===y.canonicalUrl){
   if(sameSource)review.push({a:a.id,b:b.id,reason:plain(x.externalId)===plain(y.externalId)?'id-variant':'same-link-different-id',missing:[]});
   else if(contradicts(pairs))review.push({a:a.id,b:b.id,reason:'same-link-conflict',missing:[]});
   else if(comparableText(x)&&comparableText(y)&&comparableText(x).language===comparableText(y).language&&similarity(comparableText(x).text,comparableText(y).text)<SIMILAR)review.push({a:a.id,b:b.id,reason:'same-link-different-text',missing:[]});
   else{urlLinks.add(a.id+'|'+b.id);linkPairs.push([a,b]);}
   continue;
  }
  if(sameSource){if(plain(x.externalId)===plain(y.externalId))review.push({a:a.id,b:b.id,reason:'id-variant',missing:[]});continue;}
  const textA=comparableText(x),textB=comparableText(y),missing=Object.keys(pairs).filter(k=>pairs[k][0]===null||pairs[k][1]===null);
  if(textA===null||textB===null||textA.language!==textB.language){
   if(!contradicts(pairs))review.push({a:a.id,b:b.id,reason:'language-not-comparable',missing});
   continue;
  }
  if(similarity(textA.text,textB.text)<SIMILAR)continue;
  if(contradicts(pairs)){review.push({a:a.id,b:b.id,reason:'same-text-conflicting-terms',missing:[]});continue;}
  const tagsA=x.requirements.tags.join(),tagsB=y.requirements.tags.join();if(!tagsA||!tagsB)missing.push('requirements');else if(tagsA!==tagsB){review.push({a:a.id,b:b.id,reason:'requirements-differ',missing:[]});continue;}
  if(missing.length){review.push({a:a.id,b:b.id,reason:'incomplete-evidence',missing});continue;}
  matches.get(a.id).push(b);matches.get(b.id).push(a);
 }
 for(const [a,b] of linkPairs)union(a,b);
 // Two matches that do not match each other leave open which one it is: that is a question, not a merge.
 const ambiguous=o=>{const list=matches.get(o.id);return list.some((p,i)=>list.slice(i+1).some(q=>plain(p.latest.sourceId)===plain(q.latest.sourceId)||!matches.get(p.id).includes(q)));};
 for(const a of all)for(const b of matches.get(a.id)){
  if(a.id>=b.id)continue;
  if(ambiguous(a)||ambiguous(b)){review.push({a:a.id,b:b.id,reason:'ambiguous-match',missing:[]});continue;}
  union(a,b);
 }
 const groups=new Map();
 for(const o of all){const root=find(o.id),g=groups.get(root)??{key:root,members:[],latest:null};g.members.push(...o.members);g.latest=g.latest?newest(g.latest,o.latest):o.latest;groups.set(root,g);}
 return {groups:[...groups.values()],possibleDuplicates:review};
}

const ESTIMATE_COSTS=['applicationFeeMinor','platformFeeMinor','modelMinor','infrastructureMinor','toolsMinor','reworkMinor','refundsMinor','acquisitionMinor'];
/** A listing price is never revenue. The strongest result here is an estimate that grants nothing. */
export function listingEconomics(l,{costs,fx,now=Date.now()}={}){
 const missing=[],budget=l.clientBudget;
 if(isStale(l,now))missing.push('listing-stale');
 if(minorOrNull(costs?.applicationFeeMinor)!==null&&l.applicationFeeMinor!==null&&costs.applicationFeeMinor<l.applicationFeeMinor)missing.push('application-fee-understated');
 if(!budget||budget.amountMinor===null)missing.push('clientBudget');
 else{if(!budget.currency)missing.push('currency');if(budget.type!=='fixed')missing.push('billable-quantity');}
 if(l.remoteState!=='open')missing.push('open-status');
 for(const k of ESTIMATE_COSTS)if(minorOrNull(costs?.[k])===null)missing.push(k);
 const costCurrency=typeof costs?.currency==='string'?costs.currency:null;if(!costCurrency)missing.push('costCurrency');
 let rate=1,fxEvidenceRef=null;
 if(budget?.currency&&costCurrency&&budget.currency!==costCurrency){
  if(fx?.from===budget.currency&&fx?.to===costCurrency&&Number.isFinite(fx?.rate)&&fx.rate>0&&strictTime(fx?.observedAt)!==null&&strictTime(fx.observedAt)<=now+1000&&now-strictTime(fx.observedAt)<=7*86400000&&bounded(fx?.evidenceRef,2000)){rate=fx.rate;fxEvidenceRef=fx.evidenceRef;}else missing.push('fx');
 }
 const base={clientBudget:budget,providerBid:l.providerBid,revenueMinor:null,permissionToScale:false,fxEvidenceRef,missing};
 if(missing.length)return {...base,profitability:'unknown',estimatedMarginMinor:null,currency:null};
 return {...base,profitability:'estimate-only',estimatedMarginMinor:Math.round(budget.amountMinor*rate)-ESTIMATE_COSTS.reduce((n,k)=>n+costs[k],0),currency:costCurrency};
}

/** Read-only by construction: no writer exists on this object, and OFF is checked on both sides of the call. */
export function createSourceReader({sourceId,isEnabled,read}={}){
 if(!bounded(sourceId)||typeof isEnabled!=='function'||typeof read!=='function')throw Error('sourceId, isEnabled and read required');
 const on=()=>{if(isEnabled()!==true)throw Error('Source reader OFF');};
 return Object.freeze({sourceId,async read(ctx){on();const result=await read(ctx);on();return result;}});
}
export function buildOfflineCatalog(listings,{now=Date.now(),competence}={}){
 const {groups,possibleDuplicates}=dedupeListings(listings);
 return {entries:listings.map(listing=>({listing,assessment:assessListing(listing,{now,competence})})),groups,possibleDuplicates,executionAuthorized:false};
}

const SOURCE_COSTS=['implementationMinor','maintenanceMinor','acquisitionMinor','feesMinor','resourcesMinor'];
/** Sample measurement for one source. Hits are not winnable orders; no budget or expansion follows from this. */
export function sourceEvidence({sourceId,listings,now=Date.now(),humanMinutes=null,costs,competence,...rest}={}){
 const issues=recordIssues({humanMinutes,costs,...rest});
 if(issues.includes('personnel-cost-forbidden'))throw Error('Personnel costs are not part of this evidence');
 if(issues.includes('human-time-must-be-minutes'))throw Error('Human involvement is recorded in minutes only');
 if(Object.keys({...costs,...rest}).some(k=>/budget/i.test(k)))throw Error('Source evidence cannot change a budget');
 const {groups,possibleDuplicates}=dedupeListings(listings),counts={propose:0,exclude:0,clarify:0};
 // One order counts by the strictest of its listings: a ban on one source is a ban.
 for(const g of groups){const decisions=g.members.map(m=>assessListing(m,{now,competence}).selection.decision);counts[decisions.includes('exclude')?'exclude':decisions.includes('clarify')?'clarify':'propose']++;}
 const missingCosts=SOURCE_COSTS.filter(k=>minorOrNull(costs?.[k])===null);
 return {sourceId,observedAt:new Date(now).toISOString(),foreignListings:listings.filter(l=>plain(l.sourceId)!==plain(sourceId)).length,hits:listings.length,deduplicated:groups.length,suitable:counts.propose,excluded:counts.exclude,unclear:counts.clarify,possibleDuplicates:possibleDuplicates.length,winnable:null,humanMinutes,missingCosts,totalCostMinor:missingCosts.length?null:SOURCE_COSTS.reduce((n,k)=>n+costs[k],0),currency:typeof costs?.currency==='string'?costs.currency:null,additionalValue:'unknown',budgetChange:null};
}
/** Only a proposable listing becomes a discovered order. Nothing here says it is assigned, funded or may be contacted. */
export function listingRegistration(l,{assessment,ownerId,rootTaskId,registrySource}={}){
 const issued=issuedAssessments.get(assessment);
 if(issued?.listing!==l||issued.snapshot!==JSON.stringify(l)||assessment.selection.decision!=='propose')throw Error('Proposable listing required');
 const label=INTERNATIONAL_SOURCES.find(s=>s.id===l.sourceId)?.label,sourceId=registrySource?registrySource.id:l.sourceId;
 if(registrySource&&!(label&&Array.isArray(registrySource.aliases)&&registrySource.aliases.includes(label)&&bounded(sourceId)))throw Error('Registry source must be the source of this listing');
 if(!bounded(ownerId)||!bounded(rootTaskId)||!bounded(l.revision)||!bounded(l.evidenceRef,2000))throw Error('Owner, root task, revision and listing evidence required');
 return {sourceId,externalId:l.externalId,ownerId,rootTaskId,sourceRevision:l.revision,state:'discovered',termsVerified:false,provenance:{type:'reviewed-local-registration',ownerId,evidenceRef:l.evidenceRef}};
}
