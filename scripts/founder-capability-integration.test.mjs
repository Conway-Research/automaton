import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openFounderRuntime} from './founder-runtime.mjs';
import {startFounderDashboard} from './founder-dashboard.mjs';
import * as model from '../web/founder/model.mjs';
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'founder-evidence-test-'));
test('OFF runtime evidence reads are local and preserve budget and capability semantics',async()=>{
 const base=tmp();let calls=0;
 const r=openFounderRuntime({base,isEnabled:()=>false,adapters:{research:{maxCostRappen:0,execute:async()=>{calls++;return {};},verify:()=>true}}});
 try{
  const before=r.snapshot();assert.equal(typeof r.capabilityEvidence,'function');
  const first=r.capabilityEvidence(),second=r.capabilityEvidence();
  assert.equal(first.schemaVersion,1);assert.ok(second.entries.length);
  const e=first.entries.find(e=>e.capabilityId==='research');assert.equal(e.implementation,'present');assert.equal(e.authorization,'unknown');assert.equal(e.liveVerification,'unknown');assert.ok(e.executionBlockers.includes('power-off'));
  assert.deepEqual(r.snapshot().budget,before.budget);assert.deepEqual(r.snapshot().capabilities,before.capabilities);assert.equal(calls,0);
  assert.equal(r.snapshot().capabilityEvidence.schemaVersion,1);
 }finally{await r.close();fs.rmSync(base,{recursive:true,force:true});}
});
async function login(ui){
 const r=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});
 return {Cookie:r.headers.get('set-cookie').split(';')[0]};
}
test('evidence endpoint requires authentication and never invokes broad snapshots or providers',async()=>{
 const base=tmp(),evidence={schemaVersion:1,entries:[],diagnostics:[]};let reads=0;
 const forbidden=()=>{throw Error('No broad or provider read allowed');};
 const ui=await startFounderDashboard({store:{},autonomy:{capabilityEvidence:()=>{reads++;return evidence;},snapshot:forbidden},readUsage:forbidden,readTrading:forbidden,readStripe:forbidden,readCoinbase:forbidden,readFinance:forbidden});
 try{
  assert.equal((await fetch(ui.url+'/api/capability-evidence')).status,401);
  assert.equal(reads,0);const headers=await login(ui);
  const response=await fetch(ui.url+'/api/capability-evidence',{headers});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),evidence);assert.equal(reads,1);
 }finally{await ui.close();fs.rmSync(base,{recursive:true,force:true});}
});
test('old runtime has explicit unavailable evidence response',async()=>{
 const base=tmp(),ui=await startFounderDashboard({store:{},autonomy:{snapshot:()=>{throw Error('not needed');}},readUsage:async()=>({status:'fake'})});
 try{const headers=await login(ui),r=await fetch(ui.url+'/api/capability-evidence',{headers});assert.equal(r.status,503);assert.equal((await r.json()).error,'Capability evidence unavailable');}
 finally{await ui.close();fs.rmSync(base,{recursive:true,force:true});}
});
test('UI separates proof dimensions and keeps missing or invalid dates explicit',()=>{
 assert.equal(typeof model.capabilityEvidenceText,'function');
 const e={implementation:'present',authorization:'unknown',availability:'stale',offlineVerification:'passed',liveVerification:'unknown',executionBlockers:['power-off'],evidence:[{observedAt:1000}]};
 const text=model.capabilityEvidenceText(e,61000);
 assert.match(text,/Berechtigung: unbekannt/);assert.match(text,/Offline-Prüfung: bestanden/);assert.match(text,/Live-Nachweis: unbekannt/);assert.match(text,/60 s/);assert.match(text,/ausgeschaltet/);
 assert.ok(!model.capabilityEvidenceText({...e,evidence:[{observedAt:NaN}]},61000).includes('NaN'));
 assert.equal(model.capabilityEvidenceText(null),'Nachweise nicht verfügbar.');
});

test('dashboard serves the evidence display module',async()=>{
 const ui=await startFounderDashboard({store:{},readUsage:async()=>({status:'fake'})});
 try{const r=await fetch(ui.url+'/capability-evidence.mjs');assert.equal(r.status,200);assert.match(await r.text(),/export function capabilityEvidenceText/);}
 finally{await ui.close();}
});

test('evidence display gives concrete next steps without granting execution',()=>{
 const text=model.capabilityEvidenceText({implementation:'present',revision:null,authorization:'unknown',availability:'unknown',offlineVerification:'unknown',liveVerification:'unknown',executionBlockers:['power-off','source-binding-unverified'],evidence:[]});
 assert.match(text,/Nächste Schritte/);assert.match(text,/Quellbindung/);assert.match(text,/Revision/);assert.match(text,/Offline/);assert.match(text,/Live/);assert.match(text,/persönlichen/);
});
test('positive evidence display does not recommend unnecessary proof work',()=>{
 const text=model.capabilityEvidenceText({implementation:'present',revision:'a'.repeat(64),authorization:'confirmed',availability:'observed-available',offlineVerification:'passed',liveVerification:'observed-success',executionBlockers:[],evidence:[]});
 assert.doesNotMatch(text,/Nächste Schritte/);
});

test('source wrapper is not proof that an actual executable verified adapter exists',async()=>{
 for(const work of [{},{sourceIds:['fake'],verify:()=>true},{sourceIds:['fake'],execute:async()=>({})},{sourceIds:['fake'],execute:async()=>({}),verify:()=>true}]){
  const base=tmp();const r=openFounderRuntime({base,isEnabled:()=>false,adapters:{},restorationAdapters:work?{work}:{}});
  try{const e=r.capabilityEvidence().entries.find(e=>e.capabilityId==='source-work');assert.equal(e.implementation,work?.verify&&work?.execute?'present':'missing');}
  finally{await r.close();fs.rmSync(base,{recursive:true,force:true});}
 }
});

test('revoked evidence is explicit in UI and never suggests routine regrant',()=>{
 const text=model.capabilityEvidenceText({authorization:'revoked',availability:'unknown',offlineVerification:'revoked',liveVerification:'unknown',executionBlockers:['authorization-evidence-revoked','power-off'],evidence:[]});
 assert.match(text,/Berechtigung: widerrufen/);assert.match(text,/Widerruf respektieren/);assert.match(text,/Revision/);assert.match(text,/persönlichen/);
});
test('OFF runtime passes revocations through without invoking adapters',async()=>{
 const base=tmp();const r=openFounderRuntime({base,isEnabled:()=>false,adapters:{},capabilityRevocations:[{invalid:true}]});
 try{const e=r.capabilityEvidence();assert.deepEqual(e.entries,[]);assert.ok(e.diagnostics.includes('invalid-revocation'));}
 finally{await r.close();fs.rmSync(base,{recursive:true,force:true});}
});

test('valid scoped withdrawal reaches authenticated endpoint while OFF and leaves budget unchanged',async()=>{
 const {normalizeInventory,openSourceRegistry}=await import('./founder-source-registry.mjs');
 const base=tmp(),revision='a'.repeat(64),now=Date.now();let calls=0;
 const normalized=normalizeInventory({},{rows:[{id:'fake-row',label:'ugig',inventoryKind:'core'}]}),sourceId=normalized.sources[0].id;
 const binding={capabilityId:'source-work',sourceId,operation:'work',revision,dimension:'authorization'};
 const r=openFounderRuntime({base,isEnabled:()=>false,adapters:{},restorationAdapters:{work:{sourceIds:[sourceId],evidenceRevision:revision,execute:async()=>{calls++;return {};},verify:()=>true}},capabilityProofs:[{...binding,outcome:'passed',environment:'production',origin:'operator-policy',ref:'policy:synthetic',observedAt:now-100,expiresAt:now+60000}],capabilityRevocations:[{...binding,revokedAt:now-50,ref:'policy:synthetic-withdrawal'}]});
 const registry=openSourceRegistry(path.join(base,'artifacts/founder-autonomy-20261013/restoration/sources.db'));registry.import(normalized.sources,normalized.mappings);registry.close();
 let ui;try{
  const before=r.snapshot().budget;ui=await startFounderDashboard({store:{},autonomy:r,readUsage:async()=>({status:'fake'})});
  const response=await fetch(ui.url+'/api/capability-evidence',{headers:await login(ui)});assert.equal(response.status,200);
  const e=(await response.json()).entries.find(e=>e.capabilityId==='source-work');assert.equal(e.authorization,'revoked');assert.equal(e.revocations[0].ref,'policy:synthetic-withdrawal');assert.ok(e.executionBlockers.includes('power-off'));assert.equal(calls,0);assert.deepEqual(r.snapshot().budget,before);
 }finally{await ui?.close();await r.close();fs.rmSync(base,{recursive:true,force:true});}
});

test('withdrawn offline result does not recommend retesting the revoked revision as a repair',()=>{
 const text=model.capabilityEvidenceText({implementation:'present',revision:'a'.repeat(64),authorization:'confirmed',availability:'observed-available',offlineVerification:'revoked',liveVerification:'observed-success',executionBlockers:[],evidence:[]});
 assert.doesNotMatch(text,/Offline-Ablaufprüfung für die aktuelle Revision/);
 assert.match(text,/neue Revision erteilt keine Berechtigung/);
});

test('revoked availability and live proof do not suggest receipt-based recovery',()=>{
 const text=model.capabilityEvidenceText({implementation:'present',revision:'a'.repeat(64),authorization:'confirmed',availability:'revoked',offlineVerification:'passed',liveVerification:'revoked',executionBlockers:[],evidence:[]});
 assert.doesNotMatch(text,/Verfügbarkeit später/);assert.doesNotMatch(text,/Live-Ergebnis bleibt offen/);assert.match(text,/Widerruf respektieren/);
});
