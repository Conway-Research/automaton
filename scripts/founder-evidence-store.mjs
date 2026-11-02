import {validateAcceptanceRecord} from './founder-reference-admin-records.mjs';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {canonical,digest} from './founder-restoration-integrity.mjs';
import {validateQualityBinding,coveringCertificate} from './founder-quality-bindings.mjs';
import {validateReferenceRecord} from './founder-reference-approvals.mjs';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const id=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
const time=x=>Number.isSafeInteger(x)&&x>=0&&x<=8640000000000000;
const dimensions=['authorization','availability','offlineVerification','liveVerification'];
function capacity(rows){
 const withdrawn=new Set(rows.filter(r=>r.kind==='reference-withdrawal').map(r=>r.value.approvalId));
 const reservedWithdrawals=rows.filter(r=>r.kind==='reference-approval'&&!withdrawn.has(r.id)).length;
 const available=2048-rows.length;
 return {limit:2048,used:rows.length,available,reservedWithdrawals,freeForOtherWrites:Math.max(0,available-reservedWithdrawals),reserveDeficit:Math.max(0,reservedWithdrawals-available)};
}
function keys(value,allowed){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).sort().join(',')!==allowed.slice().sort().join(','))throw Error('Invalid evidence fields');}
function validate(type,p){
 if(type==='acceptance-protocol')return validateAcceptanceRecord(p);
 if(['reference-approval','reference-withdrawal'].includes(type))return validateReferenceRecord(type,p);
 if(type==='quality-binding')return validateQualityBinding(p);
 if(type==='revocation'){
  keys(p,['capabilityId','sourceId','operation','revision','dimension','revokedAt','ref']);
  if(!id(p.capabilityId)||!id(p.sourceId)||!id(p.operation)||!hex(p.revision)||!dimensions.includes(p.dimension)||!time(p.revokedAt)||! /^(test|policy|receipt|contract|report):[a-zA-Z0-9_.:-]{1,120}$/.test(p.ref))throw Error('Invalid withdrawal');
 }else if(type==='certificate'){
  keys(p,['suite','revision','finishedRevision','startedAt','finishedAt','tests','passed','failed','skipped','cancelled','todo','exitCode','outputDigest','nodeVersion','status','scope']);
  if(!['founder-evidence-lifecycle-v1','founder-quality-v2'].includes(p.suite)||!hex(p.revision)||!hex(p.finishedRevision)||!hex(p.outputDigest)||!time(p.startedAt)||!time(p.finishedAt)||p.finishedAt<p.startedAt||p.scope!=='offline-synthetic'||!/^v\d+\.\d+\.\d+$/.test(p.nodeVersion)||!['passed','failed','invalidated'].includes(p.status))throw Error('Invalid certificate');
  if(!['tests','passed','failed','skipped','cancelled','todo'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0&&p[k]<=1000000)||p.exitCode!==null&&(!Number.isSafeInteger(p.exitCode)||p.exitCode<0||p.exitCode>255))throw Error('Invalid test counts');
  if(p.status==='passed'&&(p.revision!==p.finishedRevision||p.exitCode!==0||!p.tests||p.tests!==p.passed||p.failed||p.skipped||p.cancelled||p.todo))throw Error('Invalid positive certificate');
 }else throw Error('Invalid evidence type');
 return p;
}
function validateRows(rows){
 if(!Array.isArray(rows)||rows.length>2048)throw Error('Evidence integrity: capacity exceeded');
 let previous='0'.repeat(64);const seen=new Set();
 for(let i=0;i<rows.length;i++){
  const r=rows[i];try{
   keys(r,['seq','id','kind','payload','previous','hash']);
   if(typeof r.payload!=='string'||r.payload.length>16000||seen.has(r.id))throw Error();
   const payload=validate(r.kind,JSON.parse(r.payload));
   if(r.seq!==i+1||r.previous!==previous||r.id!==digest({kind:r.kind,payload})||r.hash!==digest({seq:r.seq,id:r.id,kind:r.kind,payload,previous}))throw Error();
   if(r.kind==='quality-binding'&&!rows.slice(0,i).some(c=>c.kind==='certificate'&&c.id===payload.certificateId&&coveringCertificate(c.value,payload)))throw Error();
   if(r.kind==='reference-withdrawal'&&!rows.slice(0,i).some(c=>c.kind==='reference-approval'&&c.id===payload.approvalId))throw Error();
   previous=r.hash;seen.add(r.id);r.value=payload;
  }catch{throw Error('Evidence integrity check failed');}
 }return rows;
}
export function verifyEvidenceArchive(archive,expectedDigest){
 keys(archive,['schema','count','head','events']);
 if(!hex(expectedDigest)||archive.schema!=='founder-evidence-archive-v1'||!Array.isArray(archive.events)||archive.events.length>2048||archive.count!==archive.events.length||!hex(archive.head))throw Error('Invalid evidence archive or missing trusted digest');
 // Clone only bounded scalar event fields; verification never alters the archive.
 const rows=archive.events.map(r=>{keys(r,['seq','id','kind','payload','previous','hash']);if(typeof r.payload!=='string'||r.payload.length>16000)throw Error('Invalid archive payload');return {...r};});
 validateRows(rows);
 if(archive.head!==(rows.at(-1)?.hash??'0'.repeat(64))||digest(archive)!==expectedDigest)throw Error('Evidence archive fingerprint mismatch');
 return {valid:true,count:rows.length,head:archive.head,capacity:capacity(rows),executionAuthorized:false};
}
/** Restore into a newly created staging directory, never into an active ledger.
 * The trusted digest must come from separately retained export evidence.
 * This preserves history, including legacy capacity deficits, without granting
 * execution rights or revalidating historical certificates.
 */
export function restoreEvidenceArchive({archive,expectedDigest,directory}){
 const verified=verifyEvidenceArchive(archive,expectedDigest);
 if(typeof directory!=='string'||!directory.trim())throw Error('New restoration directory required');
 const target=path.resolve(directory);
 for(let p=target;;p=path.dirname(p)){
  try{if(fs.lstatSync(p).isSymbolicLink())throw Error('Evidence path link rejected');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(path.dirname(p)===p)break;
 }
 // Exclusive directory creation prevents overwriting any existing ledger or
 // sidecar. No recursive creation: the parent must already be selected.
 fs.mkdirSync(target,{mode:0o700});
 const file=path.join(target,'reference-evidence.db');let db,store;
 try{
  db=new Database(file);
  db.pragma('journal_mode=DELETE');db.pragma('synchronous=FULL');
  db.exec('CREATE TABLE evidence_events(seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL)');
  const insert=db.prepare('INSERT INTO evidence_events VALUES(?,?,?,?,?,?)');
  db.transaction(()=>{for(const r of archive.events)insert.run(r.seq,r.id,r.kind,r.payload,r.previous,r.hash);}) .immediate();
  db.close();db=null;
  store=openEvidenceStore({file,readonly:true});
  verifyEvidenceArchive(store.exportArchive(),expectedDigest);
  store.close();store=null;
  return {...verified,file,activationRequired:true};
 }catch(e){
  store?.close();db?.close();
  // Delete only fixed files in the directory exclusively created above.
  for(const suffix of ['','-journal','-wal','-shm'])fs.rmSync(file+suffix,{force:true});
  fs.rmdirSync(target);throw e;
 }
}
export function openEvidenceStore({file,readonly=false}){
 // Refuse symlink/junction traversal before opening. This is a local trust
 // boundary, not protection against an administrator replacing the whole DB.
 for(let p=path.resolve(file);;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Evidence path link rejected');if(path.dirname(p)===p)break;}
 const db=new Database(file,{readonly,fileMustExist:readonly});
 try{
  if(!readonly){db.pragma('journal_mode=WAL');db.pragma('busy_timeout=5000');db.exec('CREATE TABLE IF NOT EXISTS evidence_events(seq INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, payload TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL)');}
  const read=()=>{
   const count=db.prepare('SELECT count(*) AS n FROM evidence_events').get().n;if(count>2048)throw Error('Evidence integrity: capacity exceeded');
   return validateRows(db.prepare('SELECT * FROM evidence_events ORDER BY seq').all());
  };
  read();
  const append=(kind,input)=>{
   if(readonly)throw Error('Evidence store is read-only');
   const payload=JSON.parse(canonical(validate(kind,input))),eventId=digest({kind,payload});
   return db.transaction(()=>{
    const rows=read();if(rows.some(r=>r.id===eventId))return eventId;if(rows.length>=2048)throw Error('Evidence capacity reached');
    if(kind==='quality-binding'&&!rows.some(c=>c.kind==='certificate'&&c.id===payload.certificateId&&coveringCertificate(c.value,payload)))throw Error('Covering certificate required');
    if(kind==='reference-withdrawal'&&!rows.some(c=>c.kind==='reference-approval'&&c.id===payload.approvalId))throw Error('Existing reference approval required');
    // Keep one event slot per unwithdrawn approval. First withdrawals may still
    // reduce older ledgers' reserve deficit; never raise the hard capacity limit.
    const withdrawn=new Set(rows.filter(r=>r.kind==='reference-withdrawal').map(r=>r.value.approvalId));
    const outstanding=capacity(rows).reservedWithdrawals;
    const firstWithdrawal=kind==='reference-withdrawal'&&!withdrawn.has(payload.approvalId);
    const reserved=outstanding+(kind==='reference-approval'?1:0)-(firstWithdrawal?1:0);
    if(!firstWithdrawal&&rows.length+1+reserved>2048)throw Error('Evidence capacity reserved for reference withdrawals');
    const seq=rows.length+1,previous=rows.at(-1)?.hash??'0'.repeat(64),hash=digest({seq,id:eventId,kind,payload,previous});
    db.prepare('INSERT INTO evidence_events VALUES(?,?,?,?,?,?)').run(seq,eventId,kind,canonical(payload),previous,hash);return eventId;
   }).immediate();
  };
  return {exportArchive(){const events=read().map(({value,...row})=>row);return {schema:'founder-evidence-archive-v1',count:events.length,head:events.at(-1)?.hash??'0'.repeat(64),events};},recordAcceptanceProtocol:p=>append('acceptance-protocol',p),recordReferenceApproval:p=>append('reference-approval',p),recordReferenceWithdrawal:p=>append('reference-withdrawal',p),recordQualityBinding:p=>append('quality-binding',p),recordCertificate:p=>append('certificate',p),recordRevocation:p=>append('revocation',p),snapshot(){const rows=read();return {schemaVersion:1,capacity:capacity(rows),acceptanceProtocols:rows.filter(r=>r.kind==='acceptance-protocol').map(r=>({id:r.id,...r.value})),referenceApprovals:rows.filter(r=>r.kind==='reference-approval').map(r=>({id:r.id,...r.value})),referenceWithdrawals:rows.filter(r=>r.kind==='reference-withdrawal').map(r=>r.value),proofs:[],qualityBindings:rows.filter(r=>r.kind==='quality-binding').map(r=>r.value),revocations:rows.filter(r=>r.kind==='revocation').map(r=>r.value),certificates:rows.filter(r=>r.kind==='certificate').map(r=>({id:r.id,...r.value,currency:'not-rechecked'}))};},close:()=>db.close()};
 }catch(e){db.close();throw e;}
}
