import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openEvidenceStore} from './founder-evidence-store.mjs';
import {projectQualityBindings} from './founder-quality-bindings.mjs';
const revision='a'.repeat(64),certificate={suite:'founder-quality-v2',revision,finishedRevision:revision,startedAt:100,finishedAt:200,tests:2,passed:2,failed:0,skipped:0,cancelled:0,todo:0,exitCode:0,outputDigest:'b'.repeat(64),nodeVersion:process.version,status:'passed',scope:'offline-synthetic'};
const binding={certificateId:'c'.repeat(64),capabilityId:'source-work',sourceId:'fake-source',operation:'work',revision,profile:'invoice-reconciliation-v1',createdAt:300};
const entry={capabilityId:binding.capabilityId,sourceId:binding.sourceId,operation:'work',revision,implementation:'present',qualityProfiles:['invoice-reconciliation-v1'],executionBlockers:['power-off'],offlineVerification:'unknown'};
const run=(extra={})=>projectQualityBindings({bindings:[binding],certificates:[{id:binding.certificateId,...certificate}],entries:[entry],currentRevision:revision,now:1000,...extra});
test('explicit exact profile mapping is separate from source operation verification',()=>{
 const r=run();assert.equal(r[0].status,'profile-tested');assert.equal(r[0].sourceConnectionVerified,false);assert.equal(entry.offlineVerification,'unknown');
});
test('stale, missing, unsupported or revoked mappings never pass',()=>{
 for(const extra of [{currentRevision:undefined},{currentRevision:'b'.repeat(64)},{entries:[]},{entries:[{...entry,revision:'b'.repeat(64)}]},{entries:[{...entry,offlineVerification:'revoked'}]},{certificates:[{id:binding.certificateId,...certificate,suite:'founder-evidence-lifecycle-v1'}]},{certificates:[{id:binding.certificateId,...certificate,status:'failed'}]}])assert.notEqual(run(extra)[0].status,'profile-tested');
});
test('mapping persists, only refers to a prior covering positive certificate and reopens',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-quality-binding-'));let s;try{
  s=openEvidenceStore({file:path.join(dir,'e.db')});assert.throws(()=>s.recordQualityBinding(binding));const id=s.recordCertificate(certificate);s.recordQualityBinding({...binding,certificateId:id});s.close();s=openEvidenceStore({file:path.join(dir,'e.db'),readonly:true});assert.equal(s.snapshot().qualityBindings.length,1);assert.deepEqual(s.snapshot().proofs,[]);
  assert.equal(projectQualityBindings({...s.snapshot(),bindings:s.snapshot().qualityBindings,entries:[entry],currentRevision:revision,now:1000})[0].status,'profile-tested');
 }finally{s?.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('adapter must explicitly support the mapped profile',()=>{
 assert.notEqual(run({entries:[{...entry,qualityProfiles:[]} ]})[0].status,'profile-tested');
});
import {openFounderRuntime} from './founder-runtime.mjs';
import {normalizeInventory,openSourceRegistry} from './founder-source-registry.mjs';
import {qualityBindingText} from '../web/founder/capability-evidence.mjs';
test('OFF runtime reads exact mapping, rejects revision drift and preserves unknown live proof',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-quality-runtime-'));let s,r,currentRevision=revision;
 try{
  const normalized=normalizeInventory({},{rows:[{id:'fake-row',label:'ugig',inventoryKind:'core'}]}),sourceId=normalized.sources[0].id;
  s=openEvidenceStore({file:path.join(base,'e.db')});const certificateId=s.recordCertificate(certificate);s.recordQualityBinding({...binding,certificateId,sourceId});
  r=openFounderRuntime({base,isEnabled:()=>false,adapters:{},capabilityEvidenceStore:s,capabilityRevisionReader:()=>currentRevision,restorationAdapters:{work:{sourceIds:[sourceId],evidenceRevision:revision,qualityProfiles:['invoice-reconciliation-v1'],execute:async()=>{throw Error('must not execute');},verify:()=>true}}});
  const reg=openSourceRegistry(path.join(base,'artifacts/founder-autonomy-20261013/restoration/sources.db'));reg.import(normalized.sources,normalized.mappings);reg.close();
  const budget=r.snapshot().budget;let e=r.capabilityEvidence();assert.equal(e.qualityBindings[0].status,'profile-tested');assert.ok(e.entries.every(x=>x.liveVerification==='unknown'&&x.authorization==='unknown'));assert.match(qualityBindingText(e.qualityBindings[0]),/Quellenanbindung nicht geprüft/);
  currentRevision='b'.repeat(64);e=r.capabilityEvidence();assert.equal(e.qualityBindings[0].status,'stale');assert.deepEqual(r.snapshot().budget,budget);
 }finally{await r?.close();s?.close();fs.rmSync(base,{recursive:true,force:true});}
});

test('persistent mapping refuses old suite, wrong revisions and unsupported claims',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-quality-reject-'));const s=openEvidenceStore({file:path.join(dir,'e.db')});try{
  const old=s.recordCertificate({...certificate,suite:'founder-evidence-lifecycle-v1'});assert.throws(()=>s.recordQualityBinding({...binding,certificateId:old}));
  const id=s.recordCertificate(certificate);for(const delta of [{revision:'b'.repeat(64)},{profile:'all-skills'},{operation:'submit'},{createdAt:199},{sourceId:''}])assert.throws(()=>s.recordQualityBinding({...binding,certificateId:id,...delta}));
  assert.deepEqual(s.snapshot().qualityBindings,[]);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('inconsistent positive certificate cannot qualify a profile',()=>{
 assert.notEqual(run({certificates:[{id:binding.certificateId,...certificate,exitCode:1} ]})[0].status,'profile-tested');
});
