import Database from 'better-sqlite3';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {normalizeOrderReport} from './founder-orders.mjs';

// This database records human work. It has no executor, payment or broker client.
export function openFounderOperations(file) {
 const db=new Database(file);db.pragma('journal_mode = WAL');db.pragma('busy_timeout = 5000');
 db.exec(`CREATE TABLE IF NOT EXISTS founder_reviews(id TEXT PRIMARY KEY,digest TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS founder_tasks(id TEXT PRIMARY KEY,title TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,result TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS founder_audit(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,title TEXT NOT NULL,action TEXT NOT NULL,digest TEXT);`);
 const audit=(title,action,digest=null)=>db.prepare('INSERT INTO founder_audit(at,title,action,digest) VALUES(?,?,?,?)').run(new Date().toISOString(),title,action,digest);
 const transaction=db.transaction(input=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid task');
  if(input.action==='create'){
   if(Object.keys(input).sort().join(',')!=='action,title'||typeof input.title!=='string'||!input.title.trim()||input.title.length>180)throw Error('Invalid title');
   if(db.prepare('SELECT count(*) n FROM founder_tasks').get().n>=500)throw Error('Task capacity');
   const id=randomUUID();db.prepare("INSERT INTO founder_tasks(id,title,status,updated_at) VALUES(?,?,'planned',?)").run(id,input.title.trim(),new Date().toISOString());audit(input.title.trim(),'Aufgabe erfasst');return id;
  }
  if(Object.keys(input).sort().join(',')!=='action,id,result,revision,status'||input.action!=='transition'||typeof input.result!=='string'||input.result.length>1200||!Number.isSafeInteger(input.revision))throw Error('Invalid transition');
  const task=db.prepare('SELECT * FROM founder_tasks WHERE id=?').get(input.id);
  const allowed={planned:['working','cancelled'],working:['review','blocked','cancelled'],blocked:['working','cancelled'],review:['working','done'],done:['working'],cancelled:['planned']};
  if(!task||task.revision!==input.revision||!allowed[task.status]?.includes(input.status))throw Error('Task changed');
  if(['review','done','blocked'].includes(input.status)&&!input.result.trim())throw Error('Evidence or reason required');
  db.prepare('UPDATE founder_tasks SET status=?,result=?,revision=revision+1,updated_at=? WHERE id=?').run(input.status,input.result.trim(),new Date().toISOString(),task.id);
  audit(task.title,`${task.status} → ${input.status}: ${input.result.trim()}`);return task.id;
 });
 return {
  task(input){return transaction.immediate(input);},
  reviews(){return new Map(db.prepare('SELECT id,digest FROM founder_reviews').all().map(r=>[r.id,r.digest]));},
  review(id,digest,title){db.transaction(()=>{if(db.prepare('SELECT digest FROM founder_reviews WHERE id=?').get(id)?.digest===digest)return;db.prepare('INSERT INTO founder_reviews VALUES(?,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest').run(id,digest);audit(title,'Inhalt lokal geprüft',digest);}).immediate();},
  snapshot(){return {tasks:db.prepare('SELECT * FROM founder_tasks ORDER BY updated_at DESC,id').all(),audit:db.prepare('SELECT at,title,action,digest FROM founder_audit ORDER BY seq DESC LIMIT 100').all().reverse(),persistent:true,executionEnabled:false,budget:{currency:'CHF',documentedDailyCeiling:7.5,authorizedSpend:0,paidExecutionEnabled:false,reconciledCost:null,scope:'Diese Oberfläche führt keine kostenpflichtigen Aufrufe aus. Externe Konten und andere Prozesse sind nicht durch sie gedeckelt; tatsächliche Gesamtkosten sind nicht abgeglichen.'}};},
  close(){db.close();}
 };
}

export function readFounderReports(base,now=Date.now()){
 function read(relative){const file=path.resolve(base,relative);let current=base;for(const part of path.relative(base,file).split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Link rejected');}const stat=fs.statSync(file);if(!stat.isFile()||stat.size>1048576)throw Error('Report unavailable');return JSON.parse(fs.readFileSync(file,'utf8'));}
 const freshness=at=>{const age=now-Date.parse(at);return Number.isFinite(age)&&age>=-1000&&age<7200000?'recent':'stale';};
 let orders={status:'unavailable'},domains={status:'unavailable'},paper={status:'unavailable'};
 try{const dirs=fs.readdirSync(path.join(base,'artifacts')).filter(n=>/^order-monitor-\d{8}-\d{4}$/.test(n)).sort().reverse();
  // Do not silently fall back to an older successful report if the latest is broken.
  const source=`artifacts/${dirs[0]}/completion.json`;let r=read(source),handoff=null;
  if(r.status==='completed'&&(typeof r.reviewedLatestCompletedRun==='string'||typeof r.runId==='string')){
   if(r.reviewedLatestCompletedRun&&r.runId&&r.reviewedLatestCompletedRun!==r.runId)throw Error('Conflicting completed run');
   const id=r.reviewedLatestCompletedRun??r.runId;
   if(!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/.test(id))throw Error('Invalid completed run');
   const completed=read(`artifacts/numaron-local-monitor/runs/${id}/completion.json`);
   if(completed.status!=='completed'||completed.runId!==id||completed.at!==r.completedAt||!Number.isFinite(Date.parse(completed.at))||!Array.isArray(completed.rows)||completed.rows.length>1000||!completed.rows.every(x=>typeof x.source==='string'&&typeof x.status==='string'))throw Error('Completed monitor evidence mismatch');
   r={at:completed.at,github:{checked:completed.rows.length,changes:[],errors:completed.rows.filter(x=>x.status!=='succeeded')},payments:'Keine Abnahme oder Zahlung aus einem zusammengefassten Monitorlauf ableitbar.'};
  }
  if(r.schema==='numaron-order-monitor-handoff-v1'){
   const target=r.lastCompletedRun;
   if(typeof target!=='string'||!/^artifacts\/order-monitor-\d{8}-\d{4}\/completion\.json$/.test(target)||target>=source)throw Error('Invalid handoff completion');
   handoff={source,status:r.status};r=read(target);
  }
  const at=r.checked_at??r.at??r.checkedAt;
  const interruptionSummary=r.newScheduledRoundOccurred===false&&r.answersFreshSincePreviousReview===false&&typeof r.lastCompletedRun==='string'&&Number.isFinite(Date.parse(r.lastCompletedAt))&&typeof r.status==='string';
  const modernSummary=Number.isSafeInteger(r.github?.checked)&&r.github.checked>=0&&Array.isArray(r.github?.changes)&&Array.isArray(r.github?.errors);
  const legacySummary=['tracked','newComments','stateChanges'].every(k=>Number.isSafeInteger(r.github?.[k])&&r.github[k]>=0);
  const completedHandoffSummary=!!handoff&&r.status==='completed'&&Number.isSafeInteger(r.github?.items)&&r.github.items>=0;
  const summaryOnly=!Array.isArray(r.prs??r.pr_states)&&Number.isFinite(Date.parse(at))&&(modernSummary||legacySummary||completedHandoffSummary);
  const normalized=summaryOnly||interruptionSummary?{prs:[],failures:modernSummary?r.github.errors.length:0}:normalizeOrderReport(r),rows=normalized.prs,valid=()=>true;
  const failedFetches=normalized.failures;
  orders={status:freshness(at)==='stale'?'stale':failedFetches||summaryOnly?'partial':'recent',at,source,summaryOnly,failedFetches,changedComments:r.changedComments??null,payments:typeof r.payments==='string'?r.payments.slice(0,1500):'Abnahme, Vergütung und Zahlung nicht durch diesen Bericht bestätigt',prs:rows.filter(valid).map(p=>({repo:p.repo,number:p.n,state:p.state,merged:p.merged===true,error:p.error===true,url:`https://github.com/${p.repo}/pull/${p.n}`}))};
  if(interruptionSummary)orders={...orders,status:freshness(r.lastCompletedAt)==='stale'?'stale':'partial',at:r.lastCompletedAt,summaryOnly:true,monitorStatus:r.status.slice(0,200),answersFreshSincePreviousReview:false};
  if(handoff)orders={...orders,handoffSource:handoff.source,monitorStatus:String(handoff.status??'handoff').slice(0,200),answersFreshSincePreviousReview:false};
 }catch{}
 try{const r=read('sites/numaron/cloudflare-deployment-status.json');domains={status:freshness(r.checked_at),at:r.checked_at,remaining:Array.isArray(r.remaining)?r.remaining.filter(x=>typeof x==='string').map(x=>x.slice(0,500)):[],source:'sites/numaron/cloudflare-deployment-status.json'};}catch{}
 try{const r=read('artifacts/forward-paper-20261012/summary.json');const age=now-Date.parse(r.observedAt);paper={status:Number.isFinite(age)&&age>=-1000&&age<120000?r.status:'stale',at:r.observedAt,endsAt:r.endsAt,feedHealthy:r.feedHealthy===true,virtualPositions:r.openVirtualPositions,accounts:Array.isArray(r.accounts)?r.accounts.length:0,source:'artifacts/forward-paper-20261012/summary.json',liveAuthorized:false};}catch{}
 return {orders,domains,paper};
}

export function boundedReader(read,timeoutMs=6000){
 let pending;
 return async()=>{
  if(!read)return {status:'disconnected'};
  // Keep one in-flight call even after a timeout; never accumulate hung requests.
  if(!pending)pending=Promise.resolve().then(read).then(data=>({status:'connected',...data})).catch(()=>({status:'unavailable'})).finally(()=>{pending=undefined;});
  let timer;try{return await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(()=>resolve({status:'unavailable',reason:'timeout'}),timeoutMs);})]);}finally{clearTimeout(timer);}
 };
}
