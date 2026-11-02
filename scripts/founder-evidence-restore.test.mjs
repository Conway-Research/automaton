import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openEvidenceStore,restoreEvidenceArchive} from './founder-evidence-store.mjs';
import {canonical,digest} from './founder-restoration-integrity.mjs';

test('restore preserves withdrawn references and exact archive without activating them',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-restore-'));let source,restored;
 try{
  source=openEvidenceStore({file:path.join(root,'source.db')});
  const id=source.recordReferenceApproval({scope:{sourceId:'fake-source',externalId:'job',ownerId:'owner',rootTaskId:'root',sourceRevision:'v1',scopeDigest:'scope',profile:'invoice-reconciliation-v1',contractDigest:'a'.repeat(64)},reviewerId:'Patrice',ref:'contract:reviewed',reviewedAt:100,expiresAt:1000});
  source.recordReferenceWithdrawal({approvalId:id,revokedAt:200,ref:'contract:withdrawn'});
  const archive=source.exportArchive(),before=source.snapshot();
  const result=restoreEvidenceArchive({archive,expectedDigest:digest(archive),directory:path.join(root,'restored')});
  assert.equal(result.executionAuthorized,false);assert.equal(result.activationRequired,true);
  restored=openEvidenceStore({file:result.file,readonly:true});
  assert.deepEqual(restored.exportArchive(),archive);assert.deepEqual(restored.snapshot(),before);
  assert.deepEqual(source.snapshot(),before);
 }finally{restored?.close();source?.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('restore rejects untrusted archives and existing destinations without touching their contents',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-restore-'));const source=openEvidenceStore({file:path.join(root,'source.db')});
 try{
  const archive=source.exportArchive(),directory=path.join(root,'restored');
  assert.throws(()=>restoreEvidenceArchive({archive,directory}));assert.equal(fs.existsSync(directory),false);
  assert.throws(()=>restoreEvidenceArchive({archive:{...archive,schema:'future'},expectedDigest:digest(archive),directory}));assert.equal(fs.existsSync(directory),false);
  fs.mkdirSync(directory);fs.writeFileSync(path.join(directory,'keep'),'unchanged');
  assert.throws(()=>restoreEvidenceArchive({archive,expectedDigest:digest(archive),directory}));
  assert.equal(fs.readFileSync(path.join(directory,'keep'),'utf8'),'unchanged');assert.deepEqual(fs.readdirSync(directory),['keep']);
 }finally{source.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('restore refuses directory junction traversal',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-restore-'));const source=openEvidenceStore({file:path.join(root,'source.db')});
 try{
  fs.mkdirSync(path.join(root,'real'));fs.symlinkSync(path.join(root,'real'),path.join(root,'link'),'junction');
  const archive=source.exportArchive();assert.throws(()=>restoreEvidenceArchive({archive,expectedDigest:digest(archive),directory:path.join(root,'link','restored')}),/link/i);
  assert.deepEqual(fs.readdirSync(path.join(root,'real')),[]);
 }finally{source.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('restore preserves a full ledger without inventing capacity and allows empty archives',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evidence-restore-'));let restored;
 try{
  let previous='0'.repeat(64);const events=[];
  for(let seq=1;seq<=2048;seq++){
   const kind='revocation',payload={capabilityId:'source-work',sourceId:'fake-source',operation:'work',revision:'a'.repeat(64),dimension:'offlineVerification',revokedAt:seq,ref:'policy:test'};
   const id=digest({kind,payload}),hash=digest({seq,id,kind,payload,previous});
   events.push({seq,id,kind,payload:canonical(payload),previous,hash});previous=hash;
  }
  for(const archive of [{schema:'founder-evidence-archive-v1',count:0,head:'0'.repeat(64),events:[]},{schema:'founder-evidence-archive-v1',count:events.length,head:previous,events}]){
   const result=restoreEvidenceArchive({archive,expectedDigest:digest(archive),directory:path.join(root,'restore-'+archive.count)});
   restored=openEvidenceStore({file:result.file,readonly:true});assert.deepEqual(restored.exportArchive(),archive);
   assert.equal(restored.snapshot().capacity.available,2048-archive.count);restored.close();restored=null;
  }
 }finally{restored?.close();fs.rmSync(root,{recursive:true,force:true});}
});
