import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';
import {openEvidenceStore,verifyEvidenceArchive} from './founder-evidence-store.mjs';
import {canonical,digest} from './founder-restoration-integrity.mjs';
const rev={capabilityId:'source-work',sourceId:'fake-source',operation:'work',revision:'a'.repeat(64),dimension:'offlineVerification',revokedAt:100,ref:'policy:test'};
const certificate={suite:'founder-evidence-lifecycle-v1',revision:'a'.repeat(64),finishedRevision:'a'.repeat(64),startedAt:100,finishedAt:200,tests:2,passed:2,failed:0,skipped:0,cancelled:0,todo:0,exitCode:0,outputDigest:'b'.repeat(64),nodeVersion:process.version,status:'passed',scope:'offline-synthetic'};
const fixture=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-store-'));return {file:path.join(dir,'evidence.db'),cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};};

// Build a valid near-capacity chain in an isolated DB without quadratic setup reads.
function seedNearCapacity(file,count,tail=[]){const s=openEvidenceStore({file});s.close();const db=new Database(file);try{const insert=db.prepare('INSERT INTO evidence_events VALUES(?,?,?,?,?,?)');db.transaction(()=>{let previous='0'.repeat(64);for(let seq=1;seq<=count+tail.length;seq++){const {kind,payload}=seq<=count?{kind:'revocation',payload:{...rev,revokedAt:seq}}:tail[seq-count-1],id=digest({kind,payload}),hash=digest({seq,id,kind,payload,previous});insert.run(seq,id,kind,canonical(payload),previous,hash);previous=hash;}})();}finally{db.close();}}
const approval=()=>({scope:{sourceId:'fake-source',externalId:'job',ownerId:'owner',rootTaskId:'root',sourceRevision:'v1',scopeDigest:'scope',profile:'invoice-reconciliation-v1',contractDigest:'a'.repeat(64)},reviewerId:'Patrice',ref:'contract:reviewed',reviewedAt:100,expiresAt:1000});

test('portable archive preserves ordered history and verifies after read-only reopening',()=>{
 const f=fixture();let s;try{s=openEvidenceStore({file:f.file});s.recordCertificate(certificate);const id=s.recordReferenceApproval(approval());s.recordReferenceWithdrawal({approvalId:id,revokedAt:200,ref:'contract:withdrawn'});const before=s.snapshot(),archive=s.exportArchive(),anchor=digest(archive);assert.deepEqual(s.snapshot(),before);s.close();s=openEvidenceStore({file:f.file,readonly:true});assert.deepEqual(s.exportArchive(),archive);const result=verifyEvidenceArchive(JSON.parse(JSON.stringify(archive)),anchor);assert.equal(result.count,3);assert.equal(result.head,archive.head);assert.equal(result.capacity.reservedWithdrawals,0);}finally{s?.close();f.cleanup();}
});

test('archive verification rejects alteration, truncation, missing anchor and extra fields',()=>{
 const f=fixture(),s=openEvidenceStore({file:f.file});try{s.recordCertificate(certificate);s.recordRevocation(rev);const archive=s.exportArchive(),anchor=digest(archive);
  for(const mode of ['payload','truncate','extra','order']){const a=structuredClone(archive);if(mode==='payload')a.events[0].payload='{}';if(mode==='truncate'){a.events.pop();a.count--;a.head=a.events.at(-1).hash;}if(mode==='extra')a.extra='unsupported';if(mode==='order')a.events.reverse();assert.throws(()=>verifyEvidenceArchive(a,anchor));}
  assert.throws(()=>verifyEvidenceArchive(archive));
  const broken=structuredClone(archive);broken.events[0].hash='a'.repeat(64);assert.throws(()=>verifyEvidenceArchive(broken,digest(broken)));
 }finally{s.close();f.cleanup();}
});

test('full archive and empty archive verify without creating room or granting rights',()=>{
 const f=fixture();let s;try{s=openEvidenceStore({file:f.file});let a=s.exportArchive();assert.equal(verifyEvidenceArchive(a,digest(a)).count,0);s.close();s=null;seedNearCapacity(f.file,2048);s=openEvidenceStore({file:f.file,readonly:true});a=s.exportArchive();const r=verifyEvidenceArchive(a,digest(a));assert.equal(r.count,2048);assert.equal(r.capacity.available,0);assert.equal(r.executionAuthorized,false);}finally{s?.close();f.cleanup();}
});

test('recomputed hashes cannot make an orphan withdrawal a valid archive',()=>{
 const kind='reference-withdrawal',payload={approvalId:'a'.repeat(64),revokedAt:100,ref:'contract:orphan'},seq=1,previous='0'.repeat(64),id=digest({kind,payload}),hash=digest({seq,id,kind,payload,previous});
 const archive={schema:'founder-evidence-archive-v1',count:1,head:hash,events:[{seq,id,kind,payload:canonical(payload),previous,hash}]};
 assert.throws(()=>verifyEvidenceArchive(archive,digest(archive)),/integrity/);
});

test('new approvals reserve their withdrawal slot and unrelated writes cannot consume it',()=>{
 const f=fixture();let s;try{seedNearCapacity(f.file,2046);s=openEvidenceStore({file:f.file});const id=s.recordReferenceApproval(approval());
  assert.deepEqual(s.snapshot().capacity,{limit:2048,used:2047,available:1,reservedWithdrawals:1,freeForOtherWrites:0,reserveDeficit:0});
  assert.throws(()=>s.recordCertificate(certificate),/capacity/i);
  const withdrawal={approvalId:id,revokedAt:200,ref:'contract:withdrawn',reviewerId:'Patrice'};const wid=s.recordReferenceWithdrawal(withdrawal);assert.equal(s.recordReferenceWithdrawal(withdrawal),wid);
  s.close();s=openEvidenceStore({file:f.file,readonly:true});assert.equal(s.snapshot().referenceWithdrawals.length,1);assert.equal(s.snapshot().certificates.length,0);
 }finally{s?.close();f.cleanup();}
});

test('last free slot cannot admit an approval without room for its withdrawal',()=>{
 const f=fixture();let s;try{seedNearCapacity(f.file,2047);s=openEvidenceStore({file:f.file});assert.throws(()=>s.recordReferenceApproval(approval()),/capacity/i);assert.equal(s.snapshot().referenceApprovals.length,0);s.recordCertificate(certificate);assert.equal(s.snapshot().certificates.length,1);}finally{s?.close();f.cleanup();}
});

test('a repeated withdrawal cannot consume another approvals reserved slot',()=>{
 const f=fixture();let s;try{seedNearCapacity(f.file,2044);s=openEvidenceStore({file:f.file});const a=s.recordReferenceApproval(approval()),b=s.recordReferenceApproval({...approval(),ref:'contract:second'});
  s.recordReferenceWithdrawal({approvalId:a,revokedAt:200,ref:'contract:first'});
  assert.throws(()=>s.recordReferenceWithdrawal({approvalId:a,revokedAt:201,ref:'contract:again'}),/capacity/i);
  s.recordReferenceWithdrawal({approvalId:b,revokedAt:202,ref:'contract:second'});assert.equal(s.snapshot().referenceWithdrawals.length,2);
 }finally{s?.close();f.cleanup();}
});

test('legacy reserve deficit permits a first withdrawal but never exceeds hard capacity',()=>{
 const f=fixture();let s;try{const p=approval(),q={...approval(),ref:'contract:second'};seedNearCapacity(f.file,2045,[{kind:'reference-approval',payload:p},{kind:'reference-approval',payload:q}]);s=openEvidenceStore({file:f.file});
  assert.deepEqual(s.snapshot().capacity,{limit:2048,used:2047,available:1,reservedWithdrawals:2,freeForOtherWrites:0,reserveDeficit:1});
  assert.throws(()=>s.recordCertificate(certificate),/capacity/i);
  s.recordReferenceWithdrawal({approvalId:digest({kind:'reference-approval',payload:p}),revokedAt:200,ref:'contract:first'});
  assert.throws(()=>s.recordReferenceWithdrawal({approvalId:digest({kind:'reference-approval',payload:q}),revokedAt:201,ref:'contract:second'}),/capacity/i);
  assert.equal(s.snapshot().referenceWithdrawals.length,1);
 }finally{s?.close();f.cleanup();}
});
test('certificate and withdrawal survive close/reopen; repeated writes are idempotent',()=>{
 const f=fixture();let s;try{s=openEvidenceStore({file:f.file});const id=s.recordCertificate(certificate);assert.equal(s.recordCertificate(certificate),id);s.recordRevocation(rev);s.close();s=openEvidenceStore({file:f.file,readonly:true});const snap=s.snapshot();assert.equal(snap.certificates.length,1);assert.equal(snap.revocations.length,1);assert.deepEqual(snap.proofs,[]);assert.throws(()=>s.recordRevocation({...rev,ref:'policy:another'}));}finally{s?.close();f.cleanup();}
});
test('malformed data and false positive certificates rejected before persistence',()=>{
 const f=fixture(),s=openEvidenceStore({file:f.file});try{
  for(const delta of [{scope:'production'},{status:'passed',exitCode:1},{status:'passed',skipped:1},{revision:'x'},{status:'passed',finishedRevision:'c'.repeat(64)},{secret:'do-not-store'}])assert.throws(()=>s.recordCertificate({...certificate,...delta}));
  assert.throws(()=>s.recordRevocation({...rev,revokedAt:-1}));assert.throws(()=>s.recordRevocation({...rev,privateText:'do-not-store'}));assert.equal(s.snapshot().certificates.length,0);
 }finally{s.close();f.cleanup();}
});
test('tampered event payload fails closed on reopen',()=>{
 const f=fixture();let s;try{s=openEvidenceStore({file:f.file});s.recordCertificate(certificate);s.close();s=null;const db=new Database(f.file);db.prepare("UPDATE evidence_events SET payload='{}'").run();db.close();assert.throws(()=>openEvidenceStore({file:f.file,readonly:true}),/integrity/i);}finally{s?.close();f.cleanup();}
});
test('read-only missing store does not create any file',()=>{
 const f=fixture();try{assert.throws(()=>openEvidenceStore({file:f.file,readonly:true}));assert.equal(fs.existsSync(f.file),false);}finally{f.cleanup();}
});

import {openFounderRuntime} from './founder-runtime.mjs';
test('runtime reads persisted certificates and withdrawals without granting capabilities',async()=>{
 const f=fixture();let s,r;try{s=openEvidenceStore({file:f.file});s.recordCertificate(certificate);s.recordRevocation(rev);s.close();s=openEvidenceStore({file:f.file,readonly:true});
 r=openFounderRuntime({base:path.dirname(f.file),isEnabled:()=>false,adapters:{},capabilityEvidenceStore:s});const before=r.snapshot().budget;const e=r.capabilityEvidence();assert.equal(e.certificates.length,1);assert.equal(e.certificates[0].currency,'not-rechecked');assert.ok(e.entries.every(x=>x.authorization!=='confirmed'&&x.liveVerification!=='observed-success'));assert.deepEqual(r.snapshot().budget,before);
 }finally{await r?.close();s?.close();f.cleanup();}
});
test('unreadable explicitly configured evidence store fails projection closed',async()=>{
 const f=fixture();let r;try{r=openFounderRuntime({base:path.dirname(f.file),isEnabled:()=>false,adapters:{},capabilityEvidenceStore:{snapshot(){throw Error('private disk detail');}}});const e=r.capabilityEvidence();assert.deepEqual(e.entries,[]);assert.deepEqual(e.diagnostics,['evidence-store-unavailable']);assert.ok(!JSON.stringify(e).includes('private disk detail'));}finally{await r?.close();f.cleanup();}
});
import {capabilityCertificateText} from '../web/founder/capability-evidence.mjs';
test('certificate display never equates historical green result with current capability',()=>{
 assert.match(capabilityCertificateText({...certificate,id:'a'.repeat(64),currency:'not-rechecked'}),/nicht erneut geprüft/);
 assert.match(capabilityCertificateText({...certificate,status:'failed'}),/fehlgeschlagen/);
 assert.match(capabilityCertificateText({...certificate,status:'invalidated'}),/geändert/);
});
