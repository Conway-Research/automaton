import Database from 'better-sqlite3';

import {createHash} from 'node:crypto';

import {mkdirSync,writeFileSync,readFileSync,lstatSync,readdirSync} from 'node:fs';

import {resolve,join} from 'node:path';

import {HISTORY_LIMITS,type SourceRecord,type DatasetRecord,type ResearchReport,type ResearchJob,type ResearchSnapshot,type RunConfig,type Lesson} from './types.js';

const digest=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');

const id=(v:string)=>{if(typeof v!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(v))throw Error('Invalid id');return v;};

const hash=(v:string)=>{if(!/^[a-f0-9]{64}$/.test(v))throw Error('Invalid hash');return v;};

const canonical=(v:unknown):string=>{

 if(typeof v==='number'&&!Number.isFinite(v))throw Error('Nonfinite evidence value');

 if(v===null||typeof v!=='object'){const text=JSON.stringify(v);if(text===undefined)throw Error('Invalid evidence value');return text;}

 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';

 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}';

};

const encode=(v:unknown)=>{const s=canonical(v);if(!s||Buffer.byteLength(s)>2*1024*1024)throw Error('Evidence size limit');return s;};

export function openHistoryStore(directory:string){

 const root=resolve(directory);mkdirSync(root,{recursive:true});if(lstatSync(root).isSymbolicLink())throw Error('Unsafe archive directory');

 const rawDir=join(root,'raw');mkdirSync(rawDir,{recursive:true});if(lstatSync(rawDir).isSymbolicLink())throw Error('Unsafe raw directory');

 const db=new Database(join(root,'research.db'));const version=db.pragma('user_version',{simple:true}) as number;if(version>1){db.close();throw Error('Unsupported archive version');}db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000');db.pragma('journal_mode=WAL');

 db.exec(`CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS source_versions(id TEXT NOT NULL,digest TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,digest));

 CREATE TABLE IF NOT EXISTS datasets(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(id),raw_hash TEXT NOT NULL,bytes INTEGER NOT NULL,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS hypotheses(id TEXT PRIMARY KEY,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS trials(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS trial_outcomes(id TEXT PRIMARY KEY,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,dataset_id TEXT NOT NULL REFERENCES datasets(id),payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS final_claims(id TEXT PRIMARY KEY,lineage TEXT NOT NULL,start INTEGER NOT NULL,end INTEGER NOT NULL,run_id TEXT NOT NULL REFERENCES runs(id),payload TEXT NOT NULL);

 CREATE TABLE IF NOT EXISTS leases(name TEXT PRIMARY KEY,owner TEXT NOT NULL,expires INTEGER NOT NULL);

 PRAGMA user_version=1;`);

 const read=<T>(table:string,key:string):T|null=>{const row=db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id(key)) as {payload:string}|undefined;return row?JSON.parse(row.payload) as T:null;};

 const immutable=(table:string,key:string,payload:string,extra?:string)=>{

  const existing=db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id(key)) as {payload:string}|undefined;

  if(existing){if(existing.payload!==payload)throw Error('Immutable evidence cannot be changed');return;}

  if(table==='reports')db.prepare('INSERT INTO reports VALUES(?,?,?)').run(key,extra,payload);

  else db.prepare(`INSERT INTO ${table}(id,payload) VALUES(?,?)`).run(key,payload);

 };

 return {

  registerSource(source:SourceRecord){id(source.id);

   if(!['pending','allowed','restricted','blocked'].includes(source.licenseStatus)||!Array.isArray(source.urls)||!source.urls.length||!Array.isArray(source.allowedHosts)||!source.allowedHosts.length)throw Error('Invalid source');

   if(source.licenseStatus==='allowed'&&(!source.licenseEvidence?.trim()||!source.reviewedAt))throw Error('Missing license evidence');

   for(const u of source.urls){const parsed=new URL(u);if(parsed.protocol!=='https:'||parsed.username||parsed.password||!source.allowedHosts.includes(parsed.hostname))throw Error('Invalid source URL');}

   const payload=encode(source);db.transaction(()=>{db.prepare('INSERT OR IGNORE INTO source_versions VALUES(?,?,?)').run(source.id,digest(payload),payload);db.prepare('INSERT INTO sources VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(source.id,payload);})();

  },

  putDataset(input:Omit<DatasetRecord,'id'>,raw:Uint8Array):DatasetRecord{

   id(input.sourceId);hash(input.rawSha256);

   if(!Number.isFinite(input.start)||!Number.isFinite(input.end)||input.start>input.end||!input.normalizationVersion||!input.revision||!input.quality||typeof input.quality.valid!=='boolean')throw Error('Invalid dataset');

   if(raw.byteLength>HISTORY_LIMITS.fileBytes)throw Error('File size limit');

   if(digest(raw)!==input.rawSha256)throw Error('Raw hash mismatch');

   const source=read<SourceRecord>('sources',input.sourceId);if(source?.licenseStatus!=='allowed')throw Error('Source must be allowed');

   if(input.kind!==source.kind)throw Error('Dataset kind does not match source');

   const record:DatasetRecord={...input,id:digest(input.rawSha256+'\n'+input.normalizationVersion)};

   const payload=encode(record);

   return db.transaction(()=>{

    const old=read<DatasetRecord>('datasets',record.id);if(old){if(encode(old)!==payload)throw Error('Immutable dataset metadata');return old;}

    const files=readdirSync(rawDir);let size=0;for(const name of files){hash(name);const stat=lstatSync(join(rawDir,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe raw archive');size+=stat.size;}

    const dest=join(rawDir,record.rawSha256);

    if(!files.includes(record.rawSha256)){if(size+raw.byteLength>HISTORY_LIMITS.archiveBytes)throw Error('Archive size limit');writeFileSync(dest,raw,{flag:'wx'});}

    else if(digest(readFileSync(dest))!==record.rawSha256)throw Error('Stored raw hash mismatch');

    db.prepare('INSERT INTO datasets VALUES(?,?,?,?,?)').run(record.id,record.sourceId,record.rawSha256,raw.byteLength,payload);return record;

   })();

  },

  getDataset(key:string){return read<DatasetRecord>('datasets',key);},

  listDatasets(limit=100):DatasetRecord[]{if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw Error('Dataset limit');return (db.prepare('SELECT payload FROM datasets ORDER BY rowid DESC LIMIT ?').all(limit) as {payload:string}[]).map(r=>JSON.parse(r.payload));},

  rawData(key:string):Uint8Array{const data=read<DatasetRecord>('datasets',key);if(!data)throw Error('Dataset missing');const path=join(rawDir,hash(data.rawSha256)),stat=lstatSync(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>HISTORY_LIMITS.fileBytes)throw Error('Unsafe raw data');const bytes=readFileSync(path);if(digest(bytes)!==data.rawSha256)throw Error('Stored raw hash mismatch');return bytes;},

  archiveBytes(){let size=0;for(const name of readdirSync(rawDir)){hash(name);const stat=lstatSync(join(rawDir,name));if(!stat.isFile()||stat.isSymbolicLink())throw Error('Unsafe archive');size+=stat.size;}return size;},

  listSources():SourceRecord[]{return (db.prepare('SELECT payload FROM sources ORDER BY id').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));},

  getSource(key:string){return read<SourceRecord>('sources',key);},

  saveHypothesis(h:{id:string;runId:string;variantId:string;parameters:Record<string,unknown>;context:Record<string,unknown>}){id(h.runId);id(h.variantId);immutable('hypotheses',h.id,encode(h));},

  getHypothesis(key:string){return read<Record<string,unknown>>('hypotheses',key);},

  registerTrial(t:{id:string;roundId:string;runId:string;datasetId:string;variantId:string},limit=HISTORY_LIMITS.trials){

   id(t.id);id(t.roundId);id(t.runId);id(t.datasetId);id(t.variantId);if(!Number.isSafeInteger(limit)||limit<1||limit>HISTORY_LIMITS.trials)throw Error('Trial limit');

   return db.transaction(()=>{const old=read<Record<string,unknown>>('trials',t.id);if(old){if(encode(old)!==encode(t))throw Error('Immutable trial intent');return false;}

    const n=(db.prepare("SELECT COUNT(*) n FROM trials WHERE json_extract(payload,'$.roundId')=?").get(t.roundId) as {n:number}).n;if(n>=limit)throw Error('Trial limit reached');immutable('trials',t.id,encode(t));return true;

   })();

  },

  trialCount(roundId:string){return (db.prepare("SELECT COUNT(*) n FROM trials WHERE json_extract(payload,'$.roundId')=?").get(id(roundId)) as {n:number}).n;},

  saveRun(run:RunConfig){immutable('runs',run.id,encode(run));},

  getRun(key:string){return read<RunConfig>('runs',key);},

  claimFinal(runId:string,variantId:string,datasetId:string,start:number,end:number){

   const run=read<RunConfig>('runs',runId),data=read<DatasetRecord>('datasets',datasetId);if(!run||!data||!run.variantIds.includes(variantId)||!run.datasetIds.includes(datasetId))throw Error('Unregistered final claim');

   const claimId=digest(encode({runId,variantId,datasetId,start,end}));

   return db.transaction(()=>{

    const old=db.prepare('SELECT payload FROM final_claims WHERE id=?').get(claimId) as {payload:string}|undefined;if(old)return {...JSON.parse(old.payload),repeated:true};

    const contaminated=!!db.prepare('SELECT id FROM final_claims WHERE lineage=? AND run_id<>? AND start<=? AND end>=? LIMIT 1').get(data.sourceId,runId,end,start);

    const result={id:claimId,contaminated,repeated:false};db.prepare('INSERT INTO final_claims VALUES(?,?,?,?,?,?)').run(claimId,data.sourceId,start,end,runId,encode(result));return result;

   })();

  },

  saveReport(report:ResearchReport){id(report.id);id(report.runId);id(report.datasetId);if(report.liveAuthorized!==false)throw Error('Live authorization forbidden');immutable('reports',report.id,encode(report),report.datasetId);},

  getReport(key:string){return read<ResearchReport>('reports',key);},
  saveTrialOutcome(key:string,report:ResearchReport){if(report.liveAuthorized!==false||!read<RunConfig>('runs',report.runId)||!read<DatasetRecord>('datasets',report.datasetId))throw Error('Invalid trial outcome');immutable('trial_outcomes',key,encode(report));},
  getTrialOutcome(key:string){return read<ResearchReport>('trial_outcomes',key);},

  listReports(limit=50):ResearchReport[]{if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error('Report limit');return (db.prepare('SELECT payload FROM reports ORDER BY rowid DESC LIMIT ?').all(limit) as {payload:string}[]).map(r=>JSON.parse(r.payload));},

  getLesson(key:string){return read<Lesson>('lessons',key);},

  latestLessonForConcept(key:string):Lesson|null{const r=db.prepare("SELECT payload FROM lessons WHERE json_extract(payload,'$.conceptKey')=? ORDER BY rowid DESC LIMIT 1").get(hash(key)) as {payload:string}|undefined;return r?JSON.parse(r.payload):null;},

  saveLesson(lesson:Lesson){if(!Number.isSafeInteger(lesson.version)||lesson.version<1||!lesson.text||lesson.text.length>1600||!lesson.sourceReportIds.length||lesson.sourceReportIds.some(r=>!read<ResearchReport>('reports',r)))throw Error('Invalid lesson evidence');immutable('lessons',lesson.id,encode(lesson));},

  listLessons(limit=20):Lesson[]{if(!Number.isSafeInteger(limit)||limit<1||limit>20)throw Error('Lesson limit');return (db.prepare('SELECT payload FROM lessons ORDER BY rowid DESC LIMIT ?').all(limit) as {payload:string}[]).map(r=>JSON.parse(r.payload));},

  saveJob(job:ResearchJob){id(job.id);if(!['queued','running','completed','failed','cancelled'].includes(job.status))throw Error('Invalid job status');db.prepare('INSERT INTO jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload').run(job.id,job.status,encode(job));},

  getJob(key:string){return read<ResearchJob>('jobs',key);},

  mutateControl(update:(current:ResearchJob|null)=>ResearchJob):ResearchJob{return db.transaction(()=>{const next=update(read<ResearchJob>('jobs','runner-control'));if(next.id!=='runner-control')throw Error('Invalid control id');db.prepare('INSERT INTO jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload').run(next.id,next.status,encode(next));return next;})();},

  acquireLease(owner:string,now:number,ttl=5000){return db.transaction(()=>{const old=db.prepare("SELECT owner,expires FROM leases WHERE name='worker'").get() as {owner:string;expires:number}|undefined;if(old&&old.owner!==owner&&old.expires>now)return false;db.prepare("INSERT INTO leases VALUES('worker',?,?) ON CONFLICT(name) DO UPDATE SET owner=excluded.owner,expires=excluded.expires").run(id(owner),now+ttl);return true;})();},

  assertLease(owner:string,now:number){const row=db.prepare("SELECT owner,expires FROM leases WHERE name='worker'").get() as {owner:string;expires:number}|undefined;if(!row||row.owner!==owner||row.expires<now)throw Error('Research worker lease lost');},

  renewLease(owner:string,now:number,ttl=5000){return db.prepare("UPDATE leases SET expires=? WHERE name='worker' AND owner=?").run(now+ttl,id(owner)).changes===1;},

  saveOwnedJob(job:ResearchJob,owner:string){return db.prepare("UPDATE jobs SET status=?,payload=? WHERE id=? AND status='running' AND json_extract(payload,'$.detail.owner')=?").run(job.status,encode(job),id(job.id),owner).changes===1;},

  cancelRunningJobs(owner:string,now:number,reasonCode:string,orphans=false){return db.transaction(()=>{
   if(orphans){const lease=db.prepare("SELECT owner,expires FROM leases WHERE name='worker'").get() as {owner:string;expires:number}|undefined;if(!lease||lease.owner!==owner||lease.expires<now)throw Error('Research worker lease lost');}
   for(const row of db.prepare("SELECT payload FROM jobs WHERE status='running' AND id!='runner-control'").all() as {payload:string}[]){const job=JSON.parse(row.payload) as ResearchJob;if(!orphans&&job.detail?.owner!==owner)continue;const next={...job,status:'cancelled' as const,detail:{...job.detail,attempt:job.detail?.attempt??1,reasonCode,retryable:true}};db.prepare('UPDATE jobs SET status=?,payload=? WHERE id=?').run(next.status,encode(next),job.id);}
  })();},

  releaseLease(owner:string){db.prepare("DELETE FROM leases WHERE name='worker' AND owner=?").run(owner);},

  withResearchLease<T>(owner:string,now:number,roundId:string,action:()=>T):T{return db.transaction(()=>{

   const lease=db.prepare("SELECT owner,expires FROM leases WHERE name='worker'").get() as {owner:string;expires:number}|undefined;

   const control=read<ResearchJob>('jobs','runner-control')?.detail;

   if(!lease||lease.owner!==owner||lease.expires<now||control?.mode==='stopped'||control?.roundId!==roundId)throw Error('Research commit cancelled or lease lost');return action();

  })();},

  snapshot():ResearchSnapshot{

   const count=(t:string)=>(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as {n:number}).n;

   const datasets=(db.prepare('SELECT payload FROM datasets ORDER BY id LIMIT 100').all() as {payload:string}[]).map(x=>JSON.parse(x.payload) as DatasetRecord);

   const lastRow=db.prepare('SELECT payload FROM lessons ORDER BY rowid DESC LIMIT 1').get() as {payload:string}|undefined;const last=lastRow?JSON.parse(lastRow.payload) as Lesson:null;

   return {status:'paused',activity:'Forschungsarchiv bereit',coverage:datasets.map(d=>({kind:d.kind,start:d.start,end:d.end,frequency:d.frequency,valid:d.quality.valid})),counts:{sources:count('sources'),datasets:count('datasets'),reports:count('reports'),jobs:count('jobs'),lessons:count('lessons'),trials:count('trials'),phaseOutcomes:count('trial_outcomes'),ready:(db.prepare("SELECT COUNT(*) n FROM reports WHERE json_extract(payload,'$.kind')='cash-paper' AND json_extract(payload,'$.decision')=?").get('f\u00fcr Paper-Vorw\u00e4rtstest geeignet') as {n:number}).n,failedJobs:(db.prepare("SELECT COUNT(*) n FROM jobs WHERE status='failed'").get() as {n:number}).n},lastLesson:last?{text:last.text,status:last.status,scope:last.scope}:null,limits:HISTORY_LIMITS,blockers:count('datasets')?[]:['Noch keine zugelassenen historischen Daten importiert.']};

  },

  close(){db.close();},

 };

}

export type HistoryStore=ReturnType<typeof openHistoryStore>;

