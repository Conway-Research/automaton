import {createHash,randomUUID} from 'node:crypto';
import {collectSourceHints,prioritizeSourceIds} from './source-scout.js';
import type {Database} from 'better-sqlite3';
import {DIVERSE_SOURCES,SOURCE_CATALOG_VERSION,sourceDefinition,sourceEndpoint,type SourceKind} from './source-catalog.js';
import {publicJson,SOURCE_LIMITS,type PublicFetch} from './sources.js';
import {fixedPublicFetch} from './fixed-public-fetch.js';
import {assertModelPrivacy} from '../security/privacy-egress.js';
import {actionContextDigest,assertActionGate,evaluateActionGate,securityTransaction} from '../security/action-gate.js';
import {inferencePhaseSnapshot,observeInferencePhase} from '../inference/phase-budget.js';
import {HORIZON_TOPIC} from './discovery.js';
import {extractBountyPrograms,recordBountyCandidates} from '../revenue/bug-bounty.js';
import {preselectDigitalTender} from '../revenue/revenue-paths.js';
const DAY=86400000;
// Never shorten a provider's delay. Uninterpretable restrictions need review.
function providerDeadline(value:unknown,now:number,http=false):number{
 let delay:number;
 if(http&&typeof value==='string'){
  if(/^\d+$/.test(value.trim()))delay=Number(value.trim())*1000;
  else {const date=Date.parse(value);return Number.isSafeInteger(date)&&date>now?date:Number.MAX_SAFE_INTEGER;}
 }else delay=typeof value==='number'&&Number.isFinite(value)&&value>=0?value*1000:NaN;
 const deadline=now+Math.max(DAY,delay);
 return Number.isSafeInteger(Math.ceil(deadline))?Math.ceil(deadline):Number.MAX_SAFE_INTEGER;
}
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const array=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
function text(v:unknown):string{
 if(typeof v==='object'&&v&&!Array.isArray(v)){const r=record(v);v=r.de??r.en??r.fr??r.it;}
 return typeof v==='string'?v.replace(/<[^>]*>/g,' ').replace(/&(?:lt|gt|amp|quot|#39);/g,' ').replace(/\s+/g,' ').trim().slice(0,1600):'';
}
const date=(v:unknown)=>{const t=typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(t)?new Date(t).toISOString():null;};
export interface DiverseSignal {deliveryPreselection?:ReturnType<typeof preselectDigitalTender>;id:string;sourceId:string;sourceUrl:string;publisher:string;family:string;kind:SourceKind;title:string;excerpt:string;observedAt:string|null;dateMeaning:'publication'|'catalogue_update'|'directory_snapshot';retrievedAt:string;contentDigest:string;untrusted:true;verifiedDemand:false;verifiedRevenue:false}
export function normalizeDiverseSource(sourceId:string,payload:unknown,now=Date.now()):DiverseSignal[]{
 const s=sourceDefinition(sourceId),r=record(payload);let rows:unknown[];
 if(s.kind==='bounty_program'){rows=extractBountyPrograms(payload);}
 else if(sourceId==='github-bounties'){if(!Array.isArray(r.items)||r.incomplete_results!==false)throw Error('Incomplete bounty issue search');rows=r.items;}
 else if(sourceId==='simap-public'){if(!Array.isArray(r.projects)||!r.pagination||typeof r.pagination!=='object')throw Error('Invalid simap response');rows=r.projects;}
 else if(s.site){if(!Array.isArray(r.items)||r.error_id)throw Error('Invalid public question response');rows=r.items;}
 else if(sourceId.endsWith('-data')){const result=record(r.result);if(r.success!==true||!Array.isArray(result.results))throw Error('Invalid catalogue response');rows=result.results;}
 else if(sourceId==='crossref'){const message=record(r.message);if(r.status!=='ok'||!Array.isArray(message.items))throw Error('Invalid metadata response');rows=message.items;}
 else if(sourceId==='europe-pmc'){const result=record(r.resultList);if(!Array.isArray(result.result))throw Error('Invalid scientific response');rows=result.result;}
 else if(sourceId==='federal-register'){if(!Array.isArray(r.results))throw Error('Invalid regulatory response');rows=r.results;}
 else {rows=array(r.releases);if(!Array.isArray(r.releases)){
  if(!Array.isArray(r.releasePackages))throw Error('Invalid procurement response');
  rows=r.releasePackages.slice(0,5).flatMap(p=>array(record(p).releases).slice(0,5));
 }}
 const output:DiverseSignal[]=[];
 for(const value of rows.slice(0,s.kind==='bounty_program'?20:5)){
  const item=record(value);let title='',excerpt='',url='',published:string|null=null;let dateMeaning:DiverseSignal['dateMeaning']='publication';
  if(s.kind==='bounty_program'){title=`Bug bounty program candidate: ${text(item.name)}`;excerpt=title+'; directory listing only, scope, eligibility and rewards unverified';url=text(item.url);published=new Date(now).toISOString();dateMeaning='directory_snapshot';}
  else if(sourceId==='github-bounties'){
   if(item.state!=='open'||item.pull_request)continue;
   title=text(item.title);excerpt=title+'; bounty keyword only, payment, acceptance and rights unverified';published=date(item.created_at);
   const candidate=typeof item.html_url==='string'?item.html_url:'';
   if(!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/[1-9][0-9]*$/.test(candidate))continue;url=candidate;
  }
  else if(sourceId==='simap-public'){
   // Only project-level initial notices without lots. Awards, corrections and
   // ambiguous lot states require a separate review, never promotion to demand.
   if(!['tender','competition','study_contract','request_for_information'].includes(String(item.pubType))||item.corrected!==false||item.lotsType!=='without'||!Array.isArray(item.lots)||item.lots.length)continue;
   const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
   if(typeof item.id!=='string'||typeof item.publicationId!=='string'||!uuid.test(item.id)||!uuid.test(item.publicationId))continue;
   title=text(item.title);excerpt=title+'; publication only, deadline, eligibility and delivery requirements unverified';published=date(item.publicationDate);
   url=`https://www.simap.ch/api/publications/v1/project/${item.id}/publication-details/${item.publicationId}`;
  }
  else if(s.site){title=text(item.title);excerpt=title;published=typeof item.creation_date==='number'?date(new Date(item.creation_date*1000).toISOString()):null;
   if(Number.isSafeInteger(item.question_id)&&Number(item.question_id)>0)url=`https://${s.site}.stackexchange.com/questions/${item.question_id}`;
  }else if(sourceId.endsWith('-data')){
   title=text(item.title);excerpt=text(`${title} ${text(item.notes)}`);published=date(item.metadata_modified);dateMeaning='catalogue_update';
   const name=text(item.name),id=text(item.id);if(/^[a-zA-Z0-9_-]{1,180}$/.test(name)&&/^[a-zA-Z0-9_-]{1,180}$/.test(id))url=sourceId==='swiss-data'?`https://opendata.swiss/en/dataset/${name}`:`https://data.gov.uk/dataset/${id}`;
  }else if(sourceId==='crossref'){
   title=text(array(item.title)[0]);excerpt=title;const parts=array(array(record(item.published)['date-parts'])[0]);
   if(parts.length>=3&&parts.slice(0,3).every(Number.isInteger))published=date(`${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}T00:00:00Z`);
   const doi=text(item.DOI);if(/^10\.\d{4,9}\/\S{1,180}$/.test(doi))url=`https://doi.org/${encodeURI(doi)}`;
  }else if(sourceId==='europe-pmc'){
   title=text(item.title);excerpt=title;published=date(item.firstPublicationDate);const id=text(item.id),source=text(item.source);
   if(/^[A-Z0-9]{1,12}$/.test(source)&&/^[A-Za-z0-9_-]{1,50}$/.test(id))url=`https://europepmc.org/article/${source}/${id}`;
  }else if(sourceId==='federal-register'){
   title=text(item.title);excerpt=text(`${title} ${text(item.abstract)}`);published=date(item.publication_date);url=text(item.html_url);
   if(!url.startsWith('https://www.federalregister.gov/documents/'))url='';
  }else{
   const tender=record(item.tender);title=text(tender.title);excerpt=text(`${title} ${text(tender.description)}`);published=date(item.date);
   // No contacts, parties, monetary values or presumed contract wins are imported.
   const ocid=text(item.ocid);if(/^[A-Za-z0-9-]{1,120}$/.test(ocid)){const u=new URL(s.endpoint);u.pathname+=`/${encodeURIComponent(ocid)}`;url=u.href;}
  }
  if(!title||!url)continue;
  try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)continue;}catch{continue;}
  output.push({id:`div-${hash([sourceId,url]).slice(0,30)}`,sourceId,sourceUrl:url,publisher:s.publisher,family:s.family,kind:s.kind,title,excerpt,observedAt:published,dateMeaning,retrievedAt:new Date(now).toISOString(),contentDigest:hash([url,title,excerpt,published]),untrusted:true,verifiedDemand:false,verifiedRevenue:false,...(s.kind==='procurement_notice'?{deliveryPreselection:preselectDigitalTender(title,excerpt)}:{})});
 }
 if(s.kind==='procurement_notice'){
  const rank={'review-first':0,unknown:1,defer:2};
  output.sort((a,b)=>rank[a.deliveryPreselection!.priority]-rank[b.deliveryPreselection!.priority]);
 }
 return output;
}
function schema(db:Database){db.exec(`
 CREATE TABLE IF NOT EXISTS source_diversity_policy(id INTEGER PRIMARY KEY CHECK(id=1),version TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS source_diversity_runs(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,status TEXT NOT NULL,started_ms INTEGER NOT NULL,finished_ms INTEGER,available_ms INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0,accepted INTEGER NOT NULL DEFAULT 0,rejections TEXT NOT NULL DEFAULT '{}',bytes INTEGER NOT NULL DEFAULT 0,provider_halt INTEGER NOT NULL DEFAULT 0,elapsed_ms INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS source_diversity_fingerprints(digest TEXT PRIMARY KEY,seen_ms INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS source_diversity_receipts(id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_ms INTEGER NOT NULL);
 CREATE TRIGGER IF NOT EXISTS source_diversity_policy_immutable BEFORE UPDATE ON source_diversity_policy BEGIN SELECT RAISE(ABORT,'Immutable source policy'); END;
 CREATE TRIGGER IF NOT EXISTS source_diversity_policy_retained BEFORE DELETE ON source_diversity_policy BEGIN SELECT RAISE(ABORT,'Source policy retained'); END;
 `);}
export function initializeSourceDiversity(db:Database){
 const phase=inferencePhaseSnapshot(db);if(!phase)throw Error('Explicit bounded research phase required');
 const control=db.prepare('SELECT mode,status FROM online_control WHERE id=1').get() as {mode:string;status:string}|undefined;
 if(control?.mode!=='online-research'||control.status==='running')throw Error('Stopped separate research workspace required');
 db.transaction(()=>{schema(db);db.prepare('INSERT INTO source_diversity_policy VALUES(1,?)').run(SOURCE_CATALOG_VERSION);}).immediate();
}
export function hasSourceDiversity(db:Database){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='source_diversity_policy'").get())return false;
 const row=db.prepare('SELECT version FROM source_diversity_policy WHERE id=1').get() as {version:string}|undefined;
 if(row?.version!==SOURCE_CATALOG_VERSION)throw Error('Invalid source diversity policy');return true;
}
export function diverseSourceScope(){return {activity:'shadow-diverse-research',component:'founder-shadow',dataClass:'PUBLIC' as const,contextDigest:actionContextDigest({version:SOURCE_CATALOG_VERSION,catalogue:DIVERSE_SOURCES,limits:SOURCE_LIMITS,maxSources:5,maxOutput:8,maxAgeDays:90})};}
export function individualSourceScope(id:string){return {activity:'shadow-individual-source',component:'founder-shadow',dataClass:'PUBLIC' as const,contextDigest:actionContextDigest({version:SOURCE_CATALOG_VERSION,source:sourceDefinition(id),purpose:'private-paper-metadata-research',limits:SOURCE_LIMITS,maxSources:5,maxOutput:8,maxAgeDays:90})};}
export function individualSourceMode(db:Database){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='founder_paper_source_mode'").get())return false;
 const rows=db.prepare('SELECT mode FROM founder_paper_source_mode').all() as {mode:string}[];
 if(rows.length!==1||rows[0].mode!=='individual-v1')throw Error('Invalid individual source mode');return true;
}
export function individualSourceReviews(db:Database){return DIVERSE_SOURCES.map(source=>({id:source.id,...evaluateActionGate(db,individualSourceScope(source.id),Date.now(),['public-source-egress','public-source-terms'])}));}
function admission(db:Database,id?:string){
 if(!hasSourceDiversity(db))throw Error('Source diversity not explicitly initialized');
 observeInferencePhase(db);const p=inferencePhaseSnapshot(db);if(!p||p.halted||Date.now()<p.starts_ms||Date.now()>=p.ends_ms)throw Error('Active bounded source phase required');
 const c=db.prepare('SELECT status FROM online_control WHERE id=1').get() as {status:string};if(c.status!=='running')throw Error('Source research stopped');
 const individual=individualSourceMode(db);
 if(individual&&!id){
  if(!individualSourceReviews(db).some(r=>r.state==='APPROVED')){
   // Record the denied admission through the same durable audit path.
   securityTransaction(db,()=>assertActionGate(db,individualSourceScope(DIVERSE_SOURCES[0].id),Date.now(),['public-source-egress','public-source-terms'])).immediate();
   throw Error('INSUFFICIENT_EVIDENCE: no individually approved source');
  }return;
 }
 securityTransaction(db,()=>assertActionGate(db,individual?individualSourceScope(id!):diverseSourceScope(),Date.now(),['public-source-egress','public-source-terms'])).immediate();
}
export function filterDiverseSignals(db:Database,signals:DiverseSignal[],now=Date.now(),limit=8){
 const accepted:DiverseSignal[]=[],rejected:Record<string,number>={},seen=new Set<string>();
 const reject=(reason:string)=>{rejected[reason]=(rejected[reason]??0)+1;};
 for(const s of signals){
  const age=s.observedAt?now-Date.parse(s.observedAt):NaN;
  if(!Number.isFinite(age)){reject('unknown_date');continue;}
  if(age<0||age>90*DAY){reject('stale_or_future');continue;}
  try{assertModelPrivacy(s);}catch{reject('privacy');continue;}
  if(/\b(ignore.{0,30}instructions|system prompt|seed phrase|private key|guaranteed profit|execute.{0,15}command)\b/i.test(s.excerpt)){reject('instruction_or_abuse');continue;}
  const fingerprint=hash(s.excerpt.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim());
  if(seen.has(fingerprint)||db.prepare('SELECT 1 FROM source_diversity_fingerprints WHERE digest=? AND seen_ms>?').get(fingerprint,now-30*DAY)){reject('duplicate');continue;}
  seen.add(fingerprint);if(accepted.length>=limit){reject('batch_capacity');continue;}
  accepted.push(s);
 }
 return {accepted,rejected};
}
/** Human-authorized diagnostic primitive; not an agent tool or approval writer.
 * Caller must provide a marked temporary research DB with initialized policy.
 * A runtime caller supplies admission before each boundary; the developer pilot
 * uses this to measure public interfaces without granting agent permissions. */
export async function inspectDiverseSource(db:Database,id:string,signal:AbortSignal,request:PublicFetch=fixedPublicFetch,gate:()=>void=()=>{}){
 if(!hasSourceDiversity(db))throw Error('Explicit source workspace required');sourceDefinition(id);signal.throwIfAborted();gate();
 // A new source cannot inherit a broad historical approval or diagnostic bypass.
 const callerGate=gate;
 if(['simap-public','github-bounties'].includes(id))gate=()=>{callerGate();securityTransaction(db,()=>assertActionGate(db,individualSourceScope(id),Date.now(),['public-source-egress','public-source-terms'])).immediate();};
 gate();
 observeInferencePhase(db);const phase=inferencePhaseSnapshot(db);
 if(!phase||phase.halted||Date.now()<phase.starts_ms||Date.now()>=phase.ends_ms)throw Error('Active source phase required');
 const now=Date.now(),runId=randomUUID(),family=sourceDefinition(id).family;
 db.transaction(()=>{
  const states=db.prepare('SELECT source_id,status,available_ms,provider_halt FROM source_diversity_runs').all() as {source_id:string;status:string;available_ms:number;provider_halt:number}[];
  if(states.some(r=>(r.source_id===id||r.provider_halt===1&&sourceDefinition(r.source_id).family===family)&&(r.status==='pending'||r.available_ms>now)))throw Error('Source cooldown or unresolved request');
  if(states.length>=2000)throw Error('Source metrics capacity requires review');
  db.prepare("INSERT INTO source_diversity_runs(id,source_id,status,started_ms) VALUES(?,?,'pending',?)").run(runId,id,now);
 }).immediate();
 try{
  let requestId:number|bigint|undefined;
  const data=await publicJson(db,sourceEndpoint(id,now),signal,async(input,init)=>{gate();const response=await request(input,init);try{
   gate();const retry=response.headers.get('retry-after');
   if(retry!==null){db.prepare('UPDATE source_diversity_runs SET available_ms=?,provider_halt=1 WHERE id=?').run(providerDeadline(retry,Date.now(),true),runId);throw Error('Provider retry restriction');}
   return response;
  }catch(error){void response.body?.cancel().catch(()=>{});throw error;}},id=>{requestId=id;},sourceDefinition(id).kind==='bounty_program'?text=>text:JSON.parse);
  signal.throwIfAborted();gate();
  observeInferencePhase(db);if(inferencePhaseSnapshot(db)?.halted)throw Error('Source phase expired during read');
  const r=record(data);if(r.error_id||r.quota_remaining===0||Object.hasOwn(r,'backoff')){
   const deadline=Object.hasOwn(r,'backoff')?providerDeadline(r.backoff,Date.now()):Date.now()+DAY;
   db.prepare('UPDATE source_diversity_runs SET available_ms=? WHERE id=?').run(deadline,runId);throw Error('Provider backoff; no retry');
  }
  const candidates=normalizeDiverseSource(id,data),filtered=filterDiverseSignals(db,candidates,Date.now(),sourceDefinition(id).kind==='bounty_program'?5:8);
  const bytes=requestId===undefined?0:(db.prepare('SELECT bytes FROM online_requests WHERE id=?').get(requestId) as {bytes:number}).bytes;
  const finished=Date.now();
  db.transaction(()=>{
   gate();
   db.prepare('DELETE FROM source_diversity_fingerprints WHERE seen_ms<?').run(finished-30*DAY);
   db.prepare('DELETE FROM source_diversity_receipts WHERE created_ms<?').run(finished-30*DAY);
   if((db.prepare('SELECT COUNT(*) n FROM source_diversity_fingerprints').get() as {n:number}).n+filtered.accepted.length>10000)throw Error('Source fingerprint capacity requires review');
   for(const s of filtered.accepted)db.prepare('INSERT OR REPLACE INTO source_diversity_fingerprints VALUES(?,?)').run(hash(s.excerpt.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()),finished);
   db.prepare("UPDATE source_diversity_runs SET status='done',finished_ms=?,available_ms=?,seen=?,accepted=?,rejections=?,bytes=?,elapsed_ms=? WHERE id=?")
    .run(finished,finished+(filtered.accepted.length?4:12)*3600000,candidates.length,filtered.accepted.length,JSON.stringify(filtered.rejected),bytes,finished-now,runId);
   if(sourceDefinition(id).kind==='bounty_program')recordBountyCandidates(db,filtered.accepted);
   collectSourceHints(db,filtered.accepted,finished);
   const receipt={sourceId:id,publisher:sourceDefinition(id).publisher,kind:sourceDefinition(id).kind,retrievedAt:new Date(finished).toISOString(),sources:filtered.accepted,metrics:{normalized:candidates.length,accepted:filtered.accepted.length,rejected:filtered.rejected,bytes,elapsedMs:finished-now},verifiedDemand:false,verifiedRevenue:false,paidModelCalls:0};
   // Filtered excerpts only. No complete provider payload or contact details.
   db.prepare('INSERT INTO source_diversity_receipts VALUES(?,?,?)').run(runId,JSON.stringify(receipt),finished);
   db.prepare("INSERT INTO online_audit(action,detail) VALUES('diverse_source_receipt',?)").run(JSON.stringify({runId,sourceId:id,digest:hash(receipt)}));
  }).immediate();
  return {sourceId:id,signals:filtered.accepted,metrics:{normalized:candidates.length,accepted:filtered.accepted.length,rejected:filtered.rejected,bytes,elapsedMs:finished-now}};
 }catch{
  db.prepare("UPDATE source_diversity_runs SET status='failed',provider_halt=1,finished_ms=?,available_ms=MAX(available_ms,?),elapsed_ms=? WHERE id=?").run(Date.now(),Date.now()+DAY,Date.now()-now,runId);
  throw Error('Source inspection failed; see sanitized metrics, no automatic retry');
 }
}
export function sourceDiversityMetrics(db:Database){
 if(!hasSourceDiversity(db))throw Error('Source workspace required');
 return db.prepare('SELECT source_id,COUNT(*) attempts,SUM(status=\'done\') successfulReads,SUM(seen) normalized,SUM(accepted) newPrefilteredIndicators,SUM(bytes) responseBytes,SUM(elapsed_ms) elapsedMs,MAX(available_ms) nextEligibleMs FROM source_diversity_runs GROUP BY source_id').all();
}
export async function collectReviewedDiverseSources(db:Database,topic:string,signal:AbortSignal,request:PublicFetch=fixedPublicFetch){
 admission(db);
 // Diversified broad discovery only. Existing topic-specific research is retained.
 if(topic!==HORIZON_TOPIC)throw Error('Diverse collector requires broad discovery');
 const attempts=db.prepare('SELECT source_id,COUNT(*) n,MAX(available_ms) available,SUM(status=\'pending\') pending FROM source_diversity_runs GROUP BY source_id').all() as {source_id:string;n:number;available:number;pending:number}[];
 const approved=individualSourceMode(db)?new Set(individualSourceReviews(db).filter(r=>r.state==='APPROVED').map(r=>r.id)):null;
 const eligible=DIVERSE_SOURCES.filter(s=>(!['simap-public','github-bounties'].includes(s.id)||evaluateActionGate(db,individualSourceScope(s.id),Date.now(),['public-source-egress','public-source-terms']).state==='APPROVED')&&(!approved||approved.has(s.id))&&!attempts.some(a=>(a.source_id===s.id||sourceDefinition(a.source_id).family===s.family)&&(a.pending||a.available>Date.now())));
 const priority=prioritizeSourceIds(db,eligible.map(s=>s.id));
 eligible.sort((a,b)=>priority.indexOf(a.id)-priority.indexOf(b.id));
 const families=new Set<string>(),selected=eligible.filter(s=>{if(families.has(s.family))return false;families.add(s.family);return true;}).slice(0,5);
 const reports=[];for(const source of selected){signal.throwIfAborted();admission(db,source.id);try{reports.push(await inspectDiverseSource(db,source.id,signal,request,()=>admission(db,source.id)));}catch{signal.throwIfAborted();admission(db,source.id);}}
 admission(db);for(const report of reports)admission(db,report.sourceId);
 return {reports,signals:reports.flatMap(r=>r.signals).slice(0,8),verifiedDemand:false,verifiedRevenue:false,liveReady:false,productionAccepted:false};
}

