import Database from 'better-sqlite3';import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';import {officeMust as must} from './founder-ugig-office-contract.mjs';
// Attempts are shared across workflow instances in this process, not across processes.
const activeAttempts=new Set();
// Durable requests only; never schedules work, grants approval, or touches power.
export function createOfficeVisualWorkflow({directory,isEnabled,authorize,inspect,validate,authorizeRetry,now=Date.now}){
 let db;
 const active=ctx=>{must(isEnabled()===true&&!ctx?.signal?.aborted,'visual workflow OFF or cancelled');ctx?.assertActive?.();};
 const open=()=>{if(db)return db;let p=path.resolve(directory);for(;;){if(fs.existsSync(p))must(!fs.lstatSync(p).isSymbolicLink(),'linked visual journal');const parent=path.dirname(p);if(p===parent)break;p=parent;}fs.mkdirSync(directory,{recursive:true});const file=path.join(directory,'visual.db');if(fs.existsSync(file))must(!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).nlink===1,'linked visual journal');db=new Database(file);db.pragma('busy_timeout=5000');db.pragma('synchronous=FULL');db.exec('CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, payload TEXT NOT NULL)');return db;};
 const get=k=>{const r=open().prepare('SELECT payload FROM requests WHERE key=?').get(k);return r?JSON.parse(r.payload):null;};
 const put=(k,r)=>open().prepare('INSERT INTO requests VALUES (?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload').run(k,JSON.stringify(checkedJSON(r)));
 const auth=async(b,ctx)=>{active(ctx);must(/^[a-f0-9]{64}$/.test(b.key),'visual request key');await authorize(b,ctx);active(ctx);};
 const bound=(b,r)=>{must(!r||r.bindingDigest===digest(b),'visual request binding changed');return r;};
 const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;return true;}};
 const interrupted=r=>r.status==='running'&&(!alive(r.ownerPid)||(r.ownerPid===process.pid&&!activeAttempts.has(r.attemptId)));
 async function read(b,ctx){await auth(b,ctx);const r=bound(b,get(b.key));must(r?.status==='completed','completed visual request required');const p=await validate(checkedJSON(r.proof),b,ctx);await auth(b,ctx);must(digest(get(b.key))===digest(r),'visual request changed');return p;}
 async function run(b,ctx,retry){await auth(b,ctx);must(typeof ctx?.grant?.reservationId==='string'&&ctx.grant.reservationId.length>0,'visual reservation required');let old=bound(b,get(b.key));if(old?.status==='completed'){must(!retry,'completed visual request cannot retry');return read(b,ctx);}
  if(retry){must(retry.reviewedAuthorization&&typeof authorizeRetry==='function'&&await authorizeRetry({key:b.key,record:checkedJSON(old),reviewedAuthorization:retry.reviewedAuthorization})===true,'independent visual retry authority required');await auth(b,ctx);}
  const attemptId=randomUUID();open().transaction(()=>{const r=bound(b,get(b.key));must(digest(r)===digest(old),'visual request changed');if(r){must(retry,'explicit reviewed retry required');must(r.status==='failed'||interrupted(r),'visual request still running');}else must(!retry,'no failed visual request');active(ctx);put(b.key,{status:'running',bindingDigest:digest(b),ownerPid:process.pid,attemptId,updatedAt:now()});}).immediate();
  activeAttempts.add(attemptId);
  try{const proof=await inspect(b,ctx);await auth(b,ctx);await validate(proof,b,ctx);await auth(b,ctx);open().transaction(()=>{const r=get(b.key);must(r.status==='running'&&r.attemptId===attemptId,'visual attempt changed');active(ctx);put(b.key,{...r,status:'completed',proof:checkedJSON(proof),updatedAt:now()});}).immediate();return checkedJSON(proof);
  }catch(e){if(isEnabled()===true){open().transaction(()=>{const r=get(b.key);if(r?.status==='running'&&r.attemptId===attemptId)put(b.key,{...r,status:'failed',reason:'inspection failed; reviewed retry required',updatedAt:now()});}).immediate();}throw e;}finally{activeAttempts.delete(attemptId);}
 }
 return{inspect:(b,ctx)=>run(b,ctx),retry:(b,reviewedAuthorization,ctx)=>run(b,ctx,{reviewedAuthorization}),read,
 async status(b,ctx){await auth(b,ctx);const r=bound(b,get(b.key));if(r?.status==='completed')await read(b,ctx);return r?{status:r.status,attemptId:r.attemptId,updatedAt:r.updatedAt,retryRequired:r.status==='failed'||interrupted(r),deliveryReady:false,independentlyVerified:false}:{status:'not-requested',deliveryReady:false,independentlyVerified:false};},close(){db?.close();db=null;}};
}
