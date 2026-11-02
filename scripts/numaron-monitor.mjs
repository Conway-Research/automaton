import {publishObservations,monitorResultObservations} from './founder-monitor-handoff.mjs';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {inspectProcess} from './numaron-process.mjs';

export function atomicJSON(file,data){const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,file);}
export function openMonitorCoordination(file,{inspect=inspectProcess}={}){
 const db=new Database(file);db.pragma('busy_timeout=5000');db.pragma('journal_mode=WAL');
 db.exec(`CREATE TABLE IF NOT EXISTS monitor_control(id INTEGER PRIMARY KEY CHECK(id=1),owner TEXT NOT NULL,generation INTEGER NOT NULL,proof TEXT NOT NULL);
 INSERT OR IGNORE INTO monitor_control VALUES(1,'disabled',0,'not handed over');
 CREATE TABLE IF NOT EXISTS monitor_lease(id INTEGER PRIMARY KEY CHECK(id=1),token TEXT NOT NULL,pid INTEGER NOT NULL,birth TEXT NOT NULL,generation INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS monitor_handoffs(at TEXT NOT NULL,owner TEXT NOT NULL,proof TEXT NOT NULL);`);
 const snapshot=()=>db.prepare('SELECT owner,generation,proof FROM monitor_control WHERE id=1').get();
 function held(){const l=db.prepare('SELECT * FROM monitor_lease WHERE id=1').get();if(!l)return false;const p=inspect(l.pid);if(p.state==='dead'||p.state==='alive'&&typeof p.birth==='string'&&p.birth!==l.birth){db.prepare('DELETE FROM monitor_lease WHERE id=1 AND token=?').run(l.token);return false;}return true;}
 return {snapshot,
  setOwner:db.transaction((owner,proof)=>{if(!['disabled','codex','local'].includes(owner)||typeof proof!=='string'||proof.length<4||proof.length>2000)throw Error('Invalid ownership proof');if(held())throw Error('monitor active or identity unknown');db.prepare('UPDATE monitor_control SET owner=?,generation=generation+1,proof=? WHERE id=1').run(owner,proof);db.prepare('INSERT INTO monitor_handoffs VALUES(?,?,?)').run(new Date().toISOString(),owner,proof);}).immediate,
  acquire:db.transaction(({owner,pid,birth})=>{const c=snapshot();if(c.owner!==owner||!Number.isSafeInteger(pid)||pid<1||typeof birth!=='string'||!birth)return null;if(held())return null;const l={token:randomUUID(),pid,birth,generation:c.generation};db.prepare('INSERT INTO monitor_lease VALUES(1,?,?,?,?)').run(l.token,pid,birth,l.generation);return l;}).immediate,
  assertLease(l){const c=snapshot(),current=db.prepare('SELECT token FROM monitor_lease WHERE id=1').get();if(c.owner!=='local'||c.generation!==l.generation||current?.token!==l.token)throw Error('monitor lease lost');},
  release(l){db.prepare('DELETE FROM monitor_lease WHERE id=1 AND token=?').run(l.token);},close(){db.close();}};
}
export function openMonitorState(file){
 const db=new Database(file);db.pragma('busy_timeout=5000');db.pragma('journal_mode=WAL');db.exec('CREATE TABLE IF NOT EXISTS monitor_sources(id TEXT PRIMARY KEY,cursor TEXT,checked_at INTEGER,next_at INTEGER NOT NULL,status TEXT NOT NULL,evidence TEXT)');
 const get=id=>{const r=db.prepare('SELECT * FROM monitor_sources WHERE id=?').get(id);return r?{id,cursor:JSON.parse(r.cursor??'null'),checkedAt:r.checked_at,nextAt:r.next_at,status:r.status,evidence:r.evidence}:{id,cursor:null,checkedAt:null,nextAt:0,status:'not-checked',evidence:null};};
 return {get,all:()=>db.prepare('SELECT id FROM monitor_sources').all().map(x=>get(x.id)),save(id,value){db.prepare('INSERT INTO monitor_sources VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor,checked_at=excluded.checked_at,next_at=excluded.next_at,status=excluded.status,evidence=excluded.evidence').run(id,JSON.stringify(value.cursor??null),value.checkedAt??null,value.nextAt,value.status,value.evidence??null);},close(){db.close();}};
}
export async function runMonitorRound({coordination,lease,state,sources,assertActive,beforeSource=()=>{},directory,now=Date.now}){
 const active=()=>{coordination.assertLease(lease);assertActive();};
 const started=now(),rows=[],runId=new Date(started).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8),runDir=path.join(directory,'runs',runId);fs.mkdirSync(runDir,{recursive:true});let status='completed';
 // Publish each successful page before committing its cursor. A later OFF or
 // quota interruption must not strand observations behind an advanced cursor.
 const handoff=(sourceId,data,evidence,checkedAt,part)=>publishObservations({round:{id:runId+':'+sourceId+':'+part,status:'completed',rows:[{id:sourceId,status:'succeeded',checkedAt,evidenceRef:evidence,data:{observations:monitorResultObservations({sourceId,data})}}]},directory:path.join(directory,'handoffs'),assertActive:active});
 const progress=()=>{active();atomicJSON(path.join(directory,'status.json'),{at:new Date(now()).toISOString(),startedAt:new Date(started).toISOString(),status:'running',runId,rows,sources:state.all(),newApplications:0,customerWork:0,financialActions:0,powerChanges:0});};
 for(const source of sources){
  const previous=state.get(source.id);if(previous.nextAt>now())continue;
  if(source.provider&&state.get('__provider-'+source.provider).nextAt>now())continue;
  try{beforeSource();active();}catch{status='interrupted';break;}
  const controller=new AbortController();const timer=setInterval(()=>{try{active();}catch{controller.abort();}},1000);timer.unref();
  try{
   let checkpointNumber=0;
   const checkpoint=result=>{active();const checkedAt=now(),evidence=path.join(runDir,source.id+'.checkpoint-'+(++checkpointNumber)+'.json');atomicJSON(evidence,{checkedAt:new Date(checkedAt).toISOString(),data:result.data});handoff(source.id,result.data,evidence,checkedAt,'checkpoint-'+checkpointNumber);active();state.save(source.id,{cursor:result.cursor??state.get(source.id).cursor,checkedAt,nextAt:result.nextAt??now()+600000,status:'succeeded',evidence});};
   const result=await source.run({assertActive:active,signal:controller.signal,checkpoint},previous);active();
   const checkedAt=now(),evidence=path.join(runDir,source.id+'.json');atomicJSON(evidence,{checkedAt:new Date(checkedAt).toISOString(),data:result.data});handoff(source.id,result.data,evidence,checkedAt,'complete');active();
   state.save(source.id,{cursor:result.cursor??state.get(source.id).cursor,checkedAt,nextAt:result.nextAt??now()+(source.intervalMs??600000),status:'succeeded',evidence});rows.push({source:source.id,status:'succeeded',id:source.id,checkedAt,evidenceRef:evidence,data:{observations:monitorResultObservations({sourceId:source.id,data:result.data})}});
   progress();
  }catch(e){
   try{active();}catch{status='interrupted';break;}
   const code=/^(http-\d{3}|access-required|response-limit|invalid-response|timeout|not-configured)$/.test(e.code??'')?e.code:'source-unavailable';
   const nextAt=Number.isFinite(e.retryAt)?Math.max(now()+60000,e.retryAt):now()+(code==='access-required'?3600000:600000);
   state.save(source.id,{...state.get(source.id),nextAt,status:code});
   if(source.provider&&e.rateLimited===true)state.save('__provider-'+source.provider,{nextAt:Math.max(nextAt,state.get('__provider-'+source.provider).nextAt),status:code});
   rows.push({source:source.id,status:code});
   progress();
  }finally{clearInterval(timer);}
 }
 const result={at:new Date(now()).toISOString(),startedAt:new Date(started).toISOString(),status,runId,rows,sources:state.all(),newApplications:0,customerWork:0,financialActions:0,powerChanges:0};atomicJSON(path.join(runDir,'completion.json'),result);atomicJSON(path.join(directory,'status.json'),result);return result;
}
