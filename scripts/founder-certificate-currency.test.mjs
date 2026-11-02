import test from 'node:test';import assert from 'node:assert/strict';
import {projectCertificateCurrency} from './founder-certificate-currency.mjs';
import {capabilityCertificateText} from '../web/founder/capability-evidence.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderRuntime} from './founder-runtime.mjs';
import {fingerprintSources} from './founder-certify-offline.mjs';
import {openLocalReferenceAdmin} from './founder-reference-composition.mjs';
const revision='a'.repeat(64);
const certificate={status:'passed',revision,finishedRevision:revision,scope:'offline-synthetic',tests:2,passed:2,failed:0,skipped:0,cancelled:0,todo:0,exitCode:0};
test('certificate currency binds both run revisions and does not mutate historical data',()=>{
 const before=structuredClone(certificate);
 assert.equal(projectCertificateCurrency([certificate],revision)[0].currency,'current');
 assert.equal(projectCertificateCurrency([certificate],'b'.repeat(64))[0].currency,'stale');
 assert.equal(projectCertificateCurrency([certificate],undefined)[0].currency,'not-rechecked');
 assert.deepEqual(certificate,before);
 for(const bad of [{finishedRevision:'b'.repeat(64)},{skipped:1},{passed:1},{scope:'production'},{exitCode:1}])assert.equal(projectCertificateCurrency([{...certificate,...bad}],revision)[0].currency,'not-passed');
});
test('display distinguishes matching source from live execution and stale source',()=>{
 assert.match(capabilityCertificateText({...certificate,currency:'current'}),/Quellstand stimmt/);
 assert.match(capabilityCertificateText({...certificate,currency:'stale'}),/Quellstand geändert/);
 assert.match(capabilityCertificateText({...certificate,currency:'current'}),/kein Live-Nachweis/);
 assert.match(capabilityCertificateText({...certificate,currency:'not-rechecked'}),/nicht erneut geprüft/);
});

test('OFF runtime detects source drift and never promotes source rights or live evidence',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'certificate-currency-'));fs.mkdirSync(path.join(base,'scripts'));const file=path.join(base,'scripts/example.mjs');fs.writeFileSync(file,'export const version=1;');
 const revision=fingerprintSources(base).revision,stored={...certificate,revision,finishedRevision:revision};
 const runtime=openFounderRuntime({base,adapters:{},isEnabled:()=>false,capabilityEvidenceStore:{snapshot:()=>({certificates:[stored],revocations:[]})}});
 try{
  const first=runtime.capabilityEvidence();assert.equal(first.certificates[0].currency,'current');
  fs.writeFileSync(file,'export const version=2;');const second=runtime.capabilityEvidence();assert.equal(second.certificates[0].currency,'stale');
  assert.deepEqual(second.entries,first.entries);assert.equal(stored.currency,undefined);
 }finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}
});

test('unavailable source revision preserves evidence and reports uncertainty without private errors',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'certificate-currency-'));
 const runtime=openFounderRuntime({base,adapters:{},isEnabled:()=>false,capabilityEvidenceStore:{snapshot:()=>({certificates:[certificate],revocations:[]})},capabilityRevisionReader(){throw Error('private path or credential');}});
 try{const result=runtime.capabilityEvidence();assert.equal(result.certificates[0].currency,'not-rechecked');assert.ok(result.diagnostics.includes('source-revision-unavailable'));assert.ok(!JSON.stringify(result).includes('private path'));}
 finally{await runtime.close();fs.rmSync(base,{recursive:true,force:true});}
});

test('reference composition exposes detached read-only evidence snapshots for runtime wiring',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'currency-reference-'));
 const reference=openLocalReferenceAdmin({directory,readPower:()=>({enabled:false}),reviewerId:'Patrice'});
 try{const snapshot=reference.evidenceSnapshot();assert.deepEqual(snapshot.certificates,[]);snapshot.certificates.push(certificate);snapshot.capacity.used=999;assert.deepEqual(reference.evidenceSnapshot().certificates,[]);assert.equal(reference.evidenceSnapshot().capacity.used,0);}
 finally{reference.close();fs.rmSync(directory,{recursive:true,force:true});}
});
