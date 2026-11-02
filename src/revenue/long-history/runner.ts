import {assessSource} from '../../research/sources.js';
import type {SourceProbe} from '../../research/types.js';
import {createHash,randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';
import {sourceCatalogue} from './sources.js';import {HISTORY_LIMITS,type SourceRecord,type Series,type ResearchReport,type RunConfig} from './types.js';import type {HistoryStore} from './store.js';
import {fetchSource} from './download.js';import {extractSingleCsvZip,extractBoardXmlZip} from './archive.js';import {normalizeFrenchCsv,normalizeBoardXml,normalizeCashBars,assessQuality} from './normalize.js';
import {analyzeHistory,analyzeMacroHistory} from './history.js';import {registerRun,phaseView,claimFinalEvaluation} from './registry.js';import {evaluateCashTrial} from './evaluate.js';import {strategyCatalogue} from '../strategy-research.js';import {deriveLessons,recordLessons,buildResearchContext,type KnowledgeContext} from './lessons.js';
import {normalizeEcbReference,referenceVariants} from './reference.js';
import {normalizeBitfinexEthUsd} from './bitfinex.js';
import {analystKnowledge} from './trading-context.js';
import {researchWorker} from './worker-client.js';
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const requestedStart=Date.UTC(1926,9,14),requestedEnd=Date.UTC(2026,9,15)-1;
export function normalizeSource(source:SourceRecord,bytes:Uint8Array):Series{
 if(source.id==='bitfinex-ethusd-daily'&&source.kind==='cash-ohlc')return normalizeBitfinexEthUsd(bytes);
 if(source.id==='ecb-eurusd-reference'&&source.kind==='reference-rates')return normalizeEcbReference(bytes);
 if(source.id==='fed-h15')return normalizeBoardXml(extractBoardXmlZip(bytes,{maxBytes:HISTORY_LIMITS.fileBytes}));
 if(source.kind==='factor-returns')return normalizeFrenchCsv(extractSingleCsvZip(bytes,{maxBytes:HISTORY_LIMITS.fileBytes}),source);
 if(source.kind==='cash-ohlc'){const data=JSON.parse(Buffer.from(bytes).toString('utf8'));return normalizeCashBars(data.bars,data.metadata);}
 throw Error('Für diese Produkt-/Quellenart fehlt ein verifizierter Datenadapter.');
}
type Download=typeof fetchSource;
interface Options {store:HistoryStore;clock?:()=>number;download?:Download;normalize?:(source:SourceRecord,bytes:Uint8Array)=>Series;knowledge?:KnowledgeContext;evaluate?:typeof researchWorker;externalScheduling?:boolean;}
export interface HistoryTickOutcome {status:'checked'|'failed'|'cancelled'|'waiting-capacity'|'not-run';code?:string;}
const failureCode=(error:unknown)=>{const code=(error as {code?:string})?.code;if(['source_timeout','source_aborted','lease_lost'].includes(code??''))return code!;return /lease lost/.test(String((error as Error)?.message))?'lease_lost':'research_failed';};
interface Control {mode:'paused'|'running'|'stopped';roundId:string;startedAt:number;datasets:string[];trials:number;activity:string;blockers:string[];}
const dayKey=(now:number)=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const get=(type:string)=>parts.find(p=>p.type===type)!.value;return get('year')+'-'+get('month')+'-'+get('day');};
function publicReport(r:ResearchReport){const {periodPnlCents,stressPeriodPnlCents,...metrics}=r.metrics;return {...r,metrics};}
export function openHistoryRunner({store,clock=Date.now,download=fetchSource,normalize=normalizeSource,knowledge={},evaluate=researchWorker,externalScheduling=false}:Options){
 for(const s of sourceCatalogue())if(!store.getSource(s.id))store.registerSource(s);
 const owner=randomUUID(),codeHash=hash(['bitfinex.ts','reference.ts','runner.ts','store.ts','registry.ts','normalize.ts','history.ts','evaluate.ts','lessons.ts','types.ts','sources.ts','download.ts','archive.ts','worker-client.ts','trading-context.ts','../paper-trading.ts','../strategy-research.ts','../../../scripts/long-history-worker.mjs'].map(f=>readFileSync(new URL(f,import.meta.url),'utf8')).join('\n'));
 let currentAssertActive:(()=>void)|undefined;let busy:Promise<HistoryTickOutcome>|null=null,abort:AbortController|null=null,timer:ReturnType<typeof setInterval>|undefined,closed=false;
 const readControl=():Control=>store.getJob('runner-control')?.detail as unknown as Control??{mode:'paused',roundId:'initial',startedAt:clock(),datasets:[],trials:0,activity:'Bereit für die erste Forschungsrunde',blockers:[]};
 const controlJob=(c:Control)=>({id:'runner-control',status:c.mode==='running'?'queued' as const:c.mode==='stopped'?'completed' as const:'cancelled' as const,detail:{...c}});
 const writeControl=(c:Control,explicit=false)=>store.mutateControl(old=>{const previous=old?.detail as unknown as Control|undefined;if(previous&&!explicit){if(previous.roundId!==c.roundId||previous.mode==='stopped')return old!;c.mode=previous.mode;}return controlJob(c);});
 const check=(round:string)=>{currentAssertActive?.();const c=readControl();if(closed||abort?.signal.aborted||c.mode==='stopped'||c.roundId!==round)throw Error('Forschung abgebrochen');if(!store.renewLease(owner,clock()))throw Error('Research worker lease lost');if(clock()<c.startedAt-1000||clock()-c.startedAt>=HISTORY_LIMITS.roundMs)throw Error('Zeitbudget der Forschungsrunde erreicht');};
 const evaluateDataset=async(datasetId:string,series:Series,round:string)=>{
  check(round);const data=store.getDataset(datasetId)!;const values=series.kind==='cash-ohlc'?series.bars.map(b=>b.time):series.rows.map(r=>r.date),start=Math.max(requestedStart,data.start),end=Math.min(requestedEnd,data.end);
  if(start>end)throw Error('Keine Daten im angefragten Zeitraum');
  const normalizedHash=hash(JSON.stringify(series)),jobId=hash('research|'+data.sourceId+'|'+normalizedHash+'|'+codeHash),existing=store.getJob(jobId);if(existing?.status==='completed'||existing?.status==='failed')return;
  const c=readControl();if(!c.datasets.includes(normalizedHash)){if(c.datasets.length>=HISTORY_LIMITS.datasets)throw Error('Datensatzlimit der Runde erreicht');c.datasets.push(normalizedHash);writeControl(c);}
  const times=values.filter(t=>t>=start&&t<=end),long=start<=Date.UTC(1985,0,1)&&end>=Date.UTC(2006,0,1);let developmentEnd=long?Date.UTC(1986,0,1)-1:Math.floor(start+(end-start)*.6),validationEnd=long?Date.UTC(2006,0,1)-1:Math.floor(start+(end-start)*.8);
  if(!(start<developmentEnd&&developmentEnd<validationEnd&&validationEnd<end)){developmentEnd=start+1;validationEnd=start+2;}
  const runId=hash(jobId+'|run'),variants=series.kind==='reference-rates'?referenceVariants():strategyCatalogue().map(v=>v.id);
  const config:RunConfig={id:runId,registeredAt:clock(),datasetIds:[data.id],variantIds:variants,rulesVersion:series.kind==='reference-rates'?'reference-v1':'long-history-v1',split:{developmentEnd,validationEnd,finalEnd:Math.max(end,validationEnd+1)},requestedStart:start,costs:series.kind==='reference-rates'?{status:'model',oneWayCostBps:20,stressOneWayCostBps:40}:{status:'model',feeBps:10,slippageBps:10,minimumFeeCents:100},seed:42,limits:{...HISTORY_LIMITS},codeHash};
  const old=store.getRun(runId);registerRun(store,old??config);store.saveJob({id:jobId,status:'running',detail:{datasetId,owner}});
  const context=buildResearchContext(store,knowledge);
  const contextRecord={version:context.version??null,references:context.references??[],lessonIds:(context.lessons??[]).map(l=>l.id),modelRetrained:false};
  for(const variant of (series.kind==='reference-rates'?referenceVariants().map(id=>({id,kind:'reference-only'})):strategyCatalogue()))if(!store.getHypothesis(hash(runId+'|hypothesis|'+variant.id)))store.saveHypothesis({id:hash(runId+'|hypothesis|'+variant.id),runId,variantId:variant.id,parameters:{...variant},context:contextRecord});
  const reports:ResearchReport[]=[];
  if(series.kind==='factor-returns'||series.kind==='macro'){
   const params={id:hash(jobId+'|history'),runId,datasetId,start,end};const history=series.kind==='macro'?analyzeMacroHistory(series,params):analyzeHistory(series,params);history.evidenceHashes=[data.rawSha256];
   reports.push({id:hash(jobId+'|not-tradeable'),runId,datasetId,kind:'product-readiness',nativeCurrency:data.currency,costStatus:'unknown',metrics:{observations:times.length},limitations:['Diese Reihe enthält '+(series.kind==='macro'?'Zinsquotierungen':'aggregierte Renditen')+', keine ausführbaren OHLC-/Bid/Ask-Preise.','Cash-/CFD-Strategien werden darauf nicht simuliert. Geeignete Produktdaten fehlen.'],decision:'nicht prüfbar',evidenceHashes:[data.rawSha256],liveAuthorized:false});
   reports.push(history);
  }else{
   for(const variant of variants){check(round);const current=readControl();store.registerTrial({id:hash(round+'|'+jobId+'|trial|'+variant),roundId:round,runId,datasetId:data.id,variantId:variant});current.trials=store.trialCount(round);writeControl(current);
    for(const phase of ['development','validation','final'] as const){check(round);const outcomeId=hash(jobId+'|outcome|'+variant+'|'+phase),priorOutcome=store.getTrialOutcome(outcomeId);if(priorOutcome){reports.push(priorOutcome);continue;}const view=phaseView(store,runId,phase,data.id);const claim=phase==='final'?claimFinalEvaluation(store,runId,variant,data.id):null;
     try{const report=await evaluate<ResearchReport>({kind:series.kind==='reference-rates'?'reference':'cash',series,registration:{id:runId,datasetId,start:view.start,end:view.end,seed:42,variantIds:variants},variantId:variant},abort!.signal,HISTORY_LIMITS.roundMs-(clock()-readControl().startedAt));check(round);report.metrics.phase=phase;report.metrics.hypothesisId=hash(runId+'|hypothesis|'+variant);report.metrics.knowledgeVersion=context.version??null;report.metrics.contaminated=!!(claim?.contaminated||claim?.repeated);report.evidenceHashes=[data.rawSha256];if(claim?.contaminated||claim?.repeated)report.limitations.push('Dieser Schlussprüfabschnitt ist bereits aus einer früheren Runde bekannt.');store.withResearchLease(owner,clock(),round,()=>store.saveTrialOutcome(outcomeId,report));reports.push(report);}
     catch(error){if(abort!.signal.aborted||readControl().mode==='stopped')throw error;const failed:ResearchReport={id:hash(jobId+'|'+variant+'|'+phase+'|failed'),runId,datasetId,kind:series.kind==='reference-rates'?'reference-simulation':'cash-paper',nativeCurrency:data.currency,costStatus:'unknown',metrics:{phase,variantId:variant},limitations:[String((error as Error).message)],decision:'nicht prüfbar',evidenceHashes:[data.rawSha256],liveAuthorized:false};store.withResearchLease(owner,clock(),round,()=>store.saveTrialOutcome(outcomeId,failed));reports.push(failed);}
    }
   }
   for(const phase of ['development','validation','final']){check(round);const family=reports.filter(r=>r.metrics.phase===phase);const completed=await evaluate<ResearchReport[]>({kind:'family',reports:family,seed:42,expectedVariants:variants.length},abort!.signal);for(const r of completed){const index=reports.findIndex(x=>x.id===r.id);reports[index]=r;}}
  }
  check(round);store.withResearchLease(owner,clock(),round,()=>{for(const report of reports){store.saveReport(report);recordLessons(store,deriveLessons(report,context));}store.saveJob({id:jobId,status:'completed',detail:{datasetId,reports:reports.length}});});
 };
 const tick=(options:{sourceId?:string;importOnly?:boolean;controllerGrant?:boolean;signal?:AbortSignal;assertActive?:()=>void}={}):Promise<HistoryTickOutcome>=>{
  if(closed||externalScheduling&&(!options.controllerGrant||typeof options.assertActive!=='function'||!options.signal))return Promise.resolve({status:'not-run'});
  options.assertActive?.();if(options.signal?.aborted)return Promise.resolve({status:'cancelled',code:'source_aborted'});if(busy)return busy;
  if(readControl().mode!=='running')return Promise.resolve({status:'not-run'});
  store.mutateControl(old=>{const c=old?.detail as unknown as Control;if(c.mode==='running'&&dayKey(c.startedAt)!==dayKey(clock()))return controlJob({...c,roundId:randomUUID(),startedAt:clock(),datasets:[],trials:0,blockers:[]});return old!;});
  busy=(async():Promise<HistoryTickOutcome>=>{
   if(!store.acquireLease(owner,clock()))return {status:'waiting-capacity'};
   currentAssertActive=options.assertActive;abort=new AbortController();
   const parentAbort=()=>abort?.abort(options.signal?.reason);options.signal?.addEventListener('abort',parentAbort,{once:true});if(options.signal?.aborted)parentAbort();
   const round=readControl().roundId;
   const heartbeat=setInterval(()=>{try{if(!store.renewLease(owner,clock()))throw Error('Research worker lease lost');if(readControl().mode==='stopped'||readControl().roundId!==round)abort?.abort();}catch(error){abort?.abort(Object.assign(Error('Research worker lease lost'),{code:'lease_lost'}));}},1000);heartbeat.unref?.();
   let terminalCode='worker-interrupted',sourceFailed=false;
   try{
    store.cancelRunningJobs(owner,clock(),'worker-interrupted',true);
    const reportsBefore=store.snapshot().counts.reports;
    const c=readControl();c.blockers=[];c.activity='Historische Quellen und neue Datenstände prüfen';writeControl(c);
    for(const source of store.listSources().filter(s=>s.licenseStatus==='allowed'&&(!s.id.startsWith('source-')||clock()-Date.parse(s.reviewedAt)<30*86400000)&&(!options.sourceId||s.id===options.sourceId))){
     check(round);if(readControl().mode!=='running')break;
     const jobId=hash('import|'+source.id+'|'+source.reviewedAt+'|'+dayKey(clock())),importJob=store.getJob(jobId);
     if(importJob?.status==='completed')continue;
     const attempt=Number(importJob?.detail?.attempt??0)+1;
     if(importJob?.status==='failed'&&importJob.detail?.retryable!==true||attempt>3){sourceFailed=true;const current=readControl();current.blockers.push(source.label+': '+(attempt>3?'Abruflimit von drei Versuchen erreicht':String(importJob?.detail?.reason??'Import fehlgeschlagen')));writeControl(current);continue;}
     store.saveJob({id:jobId,status:'running',detail:{sourceId:source.id,attempt,owner}});
     try{
      const downloaded=await download(source,{signal:abort.signal,remainingBytes:Math.min(HISTORY_LIMITS.fileBytes,HISTORY_LIMITS.archiveBytes-store.archiveBytes())});check(round);
      const series=normalize(source,downloaded.bytes);check(round);const quality=assessQuality(series),times=series.kind==='cash-ohlc'?series.bars.map(b=>b.time):series.rows.map(r=>r.date);if(!quality.valid)throw Error('Qualitätsprüfung fehlgeschlagen');
      const data=store.withResearchLease(owner,clock(),round,()=>{const d=store.putDataset({sourceId:source.id,rawSha256:downloaded.sha256,revision:downloaded.sha256,normalizationVersion:source.id==='bitfinex-ethusd-daily'?'bitfinex-ethusd-daily-v1':'long-history-v1',kind:series.kind,start:times[0],end:times.at(-1)!,frequency:series.kind==='macro'?'monthly':'source-series',unit:series.kind==='macro'?'percent-per-year':series.kind==='factor-returns'?'decimal-return':series.kind==='reference-rates'?'USD-per-EUR-reference':'cash-cents',currency:series.currency,quality,limitations:[...series.limitations,...(quality.warnings??[])],provenance:'licensed-public-source'},downloaded.bytes);store.saveJob({id:jobId,status:'completed',detail:{sourceId:source.id,datasetId:d.id,attempt}});return d;});if(!options.importOnly)await evaluateDataset(data.id,series,round);
     }catch(error){
      const code=abort.signal.aborted?(abort.signal.reason?.code==='lease_lost'?'lease_lost':'source_aborted'):failureCode(error),cancelled=code==='source_aborted'||readControl().mode==='stopped';
      store.saveOwnedJob({id:jobId,status:cancelled?'cancelled':'failed',detail:{sourceId:source.id,attempt,owner,reason:String((error as Error).message),reasonCode:code,retryable:attempt<3&&['source_timeout','source_aborted','lease_lost'].includes(code)}},owner);
      if(cancelled||abort.signal.aborted||code==='lease_lost')throw error;
      sourceFailed=true;const current=readControl();current.blockers.push(source.label+': '+String((error as Error).message));writeControl(current);
     }
    }
    const seen=new Set<string>();if(!options.importOnly)for(const data of store.listDatasets(1000)){if(seen.has(data.sourceId)||options.sourceId&&data.sourceId!==options.sourceId)continue;const source=store.getSource(data.sourceId);if(source?.licenseStatus!=='allowed'||source.id.startsWith('source-')&&!(clock()-Date.parse(source.reviewedAt)<30*86400000)||!data.quality.valid)continue;if(seen.size>=HISTORY_LIMITS.datasets)break;seen.add(data.sourceId);check(round);if(readControl().mode!=='running')break;await evaluateDataset(data.id,normalize(source,store.rawData(data.id)),round);}
    const current=readControl();current.activity=sourceFailed?'Forschung wartet auf fehlgeschlagene Quellen':store.snapshot().counts.reports>reportsBefore?'Neue Forschungsberichte gespeichert':store.snapshot().counts.reports?'Keine neuen Simulationen · vorhandene Daten und Forschungsregeln bereits ausgewertet':'Geeignete Daten fehlen';current.blockers.push(...store.listSources().filter(s=>s.licenseStatus!=='allowed').map(s=>s.label+': Nutzungsrechte '+s.licenseStatus));writeControl(current);
    return sourceFailed?{status:'failed',code:'source_import_failed'}:{status:'checked'};
   }catch(error){
    terminalCode=abort.signal.aborted?(abort.signal.reason?.code==='lease_lost'?'lease_lost':'source_aborted'):failureCode(error);
    const c=readControl();if(c.mode!=='stopped'&&store.renewLease(owner,clock())){c.activity='Forschung wartet';c.blockers=[...new Set([...c.blockers,terminalCode==='lease_lost'?'Research worker lease lost':String((error as Error).message)])];writeControl(c);}
    return {status:terminalCode==='source_aborted'?'cancelled':'failed',code:terminalCode};
   }finally{
    options.signal?.removeEventListener('abort',parentAbort);clearInterval(heartbeat);store.cancelRunningJobs(owner,clock(),terminalCode);store.releaseLease(owner);abort=null;currentAssertActive=undefined;
   }
  })().finally(()=>busy=null);return busy;
 };
 return {tick,admitSource(probe:SourceProbe){if(probe.status!=='usable'||probe.candidate.purpose!=='market-data'||!probe.permission||assessSource(probe.candidate,probe.permission,'market-data',clock()).status!=='allowed')throw Error('Qualified product source required');const c=probe.candidate;store.registerSource({id:c.id,label:c.label,kind:'cash-ohlc',urls:[c.url],allowedHosts:[new URL(c.url).hostname],licenseStatus:'allowed',licenseEvidence:probe.permission.url+'#'+probe.permission.digest,reviewedAt:new Date(probe.permission.reviewedAt).toISOString()});},start(){if(externalScheduling)return;if(!timer){timer=setInterval(()=>void tick(),15*60*1000);timer.unref?.();if(readControl().mode==='running')void tick();}},control(action:string){if(!['pause','resume','stop'].includes(action))throw Error('Unbekannte Forschungsaktion');const c=readControl();if(action==='resume'&&(c.roundId==='initial'||c.mode==='stopped')){c.roundId=randomUUID();c.startedAt=clock();c.datasets=[];c.trials=0;c.blockers=[];}c.mode=action==='resume'?'running':action==='pause'?'paused':'stopped';c.activity=action==='stop'?'Forschung gestoppt':action==='pause'?'Forschung pausiert':'Forschung aktiviert';writeControl(c,true);if(action==='stop')abort?.abort();return this.snapshot();},snapshot(){const c=readControl(),s=store.snapshot();return {...s,status:c.mode,activity:c.activity,blockers:[...new Set([...s.blockers,...c.blockers])],counts:s.counts,recentReports:store.listReports(12).map(publicReport),sources:store.listSources().map(s=>({id:s.id,label:s.label,status:s.licenseStatus})),coverage:store.listDatasets(1000).filter((d,i,all)=>all.findIndex(x=>x.sourceId===d.sourceId)===i).map(d=>({sourceId:d.sourceId,label:store.getSource(d.sourceId)?.label,kind:d.kind,start:d.start,end:d.end,frequency:d.frequency,valid:d.quality.valid,startsLate:d.start>requestedStart,endsEarly:d.end<requestedEnd})),requestedStart,requestedEnd,analystKnowledge:analystKnowledge()};},report(id:string){const report=store.getReport(id);if(!report)throw Error('Bericht nicht gefunden');return publicReport(report);},lessons(){return store.listLessons(20);},sources(){return store.listSources().map(s=>({id:s.id,label:s.label,status:s.licenseStatus,licenseEvidence:s.licenseEvidence}));},async close(){closed=true;clearInterval(timer);abort?.abort();await busy;store.releaseLease(owner);}};
}
export type HistoryRunner=ReturnType<typeof openHistoryRunner>;
