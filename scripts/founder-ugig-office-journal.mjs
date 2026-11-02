import Database from 'better-sqlite3';import fs from 'node:fs';import path from 'node:path';
import {checkedJSON,digest,bounded} from './founder-restoration-integrity.mjs';
import {officeMust as must} from './founder-ugig-office-contract.mjs';
export function openOfficeJournal({directory,isEnabled,now=Date.now,authorizeRetry}){
 const active=()=>must(isEnabled()===true,'journal OFF');active();
 let current=path.parse(path.resolve(directory)).root;for(const part of path.resolve(directory).slice(current.length).split(path.sep)){current=path.join(current,part);if(fs.existsSync(current))must(!fs.lstatSync(current).isSymbolicLink(),'journal linked path');}
 fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'office.db');if(fs.existsSync(file))must(!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).nlink===1,'journal link');
 const db=new Database(file);db.pragma('busy_timeout=5000');db.pragma('synchronous=FULL');db.exec('CREATE TABLE IF NOT EXISTS office_jobs (key TEXT PRIMARY KEY, payload TEXT NOT NULL)');
 const keyCheck=k=>must(/^[a-f0-9]{64}$/.test(k),'journal key'),get=k=>{const r=db.prepare('SELECT payload FROM office_jobs WHERE key=?').get(k);return r?JSON.parse(r.payload):null;};
 const save=(k,v)=>{active();db.prepare('INSERT INTO office_jobs VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').run(k,JSON.stringify(checkedJSON(v)));};
 const tx=fn=>db.transaction(fn).immediate();
 const api={
  prepare(key,contractDigest){active();keyCheck(key);must(/^[a-f0-9]{64}$/.test(contractDigest),'contract digest');return tx(()=>{const r=get(key);if(r){must(r.contractDigest===contractDigest,'journal contract changed');return r;}const next={status:'prepared',contractDigest,updatedAt:now(),attemptId:null};save(key,next);return next;});},
  claim(key,attemptId){active();keyCheck(key);must(bounded(attemptId,100),'attempt');return tx(()=>{const r=get(key);must(r,'prepared journal required');if(r.status!=='prepared')return {claimed:false,record:r};save(key,{...r,status:'generating',attemptId,updatedAt:now()});return {claimed:true};});},
  commit(key,attemptId,result){active();keyCheck(key);return tx(()=>{const r=get(key);must(r?.attemptId===attemptId,'exact attempt');if(r.status==='generated'){must(digest(r.result)===digest(result),'immutable generated result');return r;}must(r.status==='generating','active attempt');const next={...r,status:'generated',result:checkedJSON(result),updatedAt:now()};save(key,next);return next;});},
  read(key){active();keyCheck(key);return get(key);},
  interrupt(key,attemptId,reason){active();return tx(()=>{const r=get(key);must(r?.attemptId===attemptId&&r.status==='generating','interrupt active attempt');save(key,{...r,status:'interrupted',reason:bounded(reason,200)?reason:'interrupted',updatedAt:now()});});},
  retry(key,{previousAttemptId,newAttemptId,reviewedAuthorization}){active();return tx(()=>{const r=get(key);must(r?.status==='interrupted'&&r.attemptId===previousAttemptId&&bounded(newAttemptId,100)&&newAttemptId!==previousAttemptId&&typeof authorizeRetry==='function'&&authorizeRetry({key,record:checkedJSON(r),previousAttemptId,newAttemptId,reviewedAuthorization})===true,'independent retry authority required');save(key,{...r,status:'generating',attemptId:newAttemptId,previousAttemptId,updatedAt:now()});return {claimed:true};});},
  close(){db.close();}
 };return api;
}
