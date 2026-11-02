import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {normalizeInventory,openSourceRegistry} from './founder-source-registry.mjs';
import {openOpportunityStore,observationDigest} from './founder-opportunity-store.mjs';
import {publishObservations,ingestMonitorObservations} from './founder-monitor-handoff.mjs';
import {planOrderActions,guardOrderAction,advanceOrderActions} from './founder-order-lifecycle.mjs';
import {openDeliveryJournal,verifyDeliverable} from './founder-order-delivery.mjs';
const fixture=fn=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'restoration-core-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}};
const key={sourceId:'s',externalId:'42',ownerId:'own'};
const observation=changes=>{const value={sourceId:'s',externalId:'42',revision:'r1',observedAt:new Date().toISOString(),evidenceRef:'evidence/one.json',kind:'listing',data:{title:'A public listing'},...changes};return {...value,digest:observationDigest(value)};};
test('assigned funded work advances without a communication prerequisite, but OFF still blocks scheduling',()=>{
 const now=Date.now(),source={id:'s',capabilities:{work:{state:'live-verified',expiresAt:now+60000,evidenceRefs:['fake']}}},budget={active:true,rootRemainingRappen:250};
 const order={...key,rootTaskId:'root',sourceRevision:'r',state:'assigned',termsVerified:true,funding:{...key,verified:true,expiresAt:now+60000}};
 const tasks=[],controller={enqueue:t=>tasks.push(t),hasTask:()=>false},registry={snapshot:()=>({sources:[source]})};
 assert.equal(advanceOrderActions({controller,orders:[order],registry,budget,isEnabled:()=>false}).enqueued,0);
 assert.equal(advanceOrderActions({controller,orders:[order],registry,budget,isEnabled:()=>true}).enqueued,1);
 assert.equal(tasks[0].kind,'source-prepare');assert.deepEqual(tasks[0].dependencies,[]);
 assert.equal(planOrderActions({order:{...order,funding:null},source,budget}).length,0);
 assert.equal(planOrderActions({order:{...order,termsVerified:false},source,budget}).length,0);
});
test('all real inventory rows remain mapped; only explicit aliases collapse',()=>fixture(dir=>{
 const inventory=JSON.parse(fs.readFileSync('docs/superpowers/specs/2026-10-18-numaron-source-inventory.json'));
 const packages=JSON.parse(fs.readFileSync('docs/superpowers/plans/2026-10-18-numaron-source-work-packages.json'));
 const r=normalizeInventory(inventory,packages);assert.equal(r.mappings.length,packages.rows.length);assert.equal(new Set(r.mappings.map(x=>x.rowId)).size,packages.rows.length);
 const mini=normalizeInventory({}, {rows:[{id:'1',label:'ArcBounty',inventoryKind:'core'},{id:'2',label:'arcbounty',inventoryKind:'register-label'},{id:'3',label:'OpenBounty'},{id:'4',label:'Openbounty.ai'}]});
 assert.equal(mini.sources.length,3);assert.equal(mini.mappings[0].sourceId,mini.mappings[1].sourceId);
 const db=openSourceRegistry(path.join(dir,'sources.db'));try{db.import(r.sources,r.mappings);assert.equal(db.snapshot().mappings.length,packages.rows.length);assert.ok(db.snapshot().sources.every(s=>s.capabilities.submit.state==='blocked'));}finally{db.close();}
}));
test('capability evidence expires separately and index cannot gain submission',()=>fixture(dir=>{
 const r=normalizeInventory({}, {rows:[{id:'1',label:'index',inventoryKind:'publisher'},{id:'2',label:'market',inventoryKind:'core'}]});const db=openSourceRegistry(path.join(dir,'r.db'));
 try{db.import(r.sources,r.mappings);const index=r.mappings[0].sourceId,market=r.mappings[1].sourceId;assert.throws(()=>db.setCapability(index,'submit',{state:'offline-verified',evidenceRefs:['fake'],expiresAt:2000}));db.setCapability(market,'read',{state:'offline-verified',evidenceRefs:['fake'],expiresAt:2000});assert.equal(db.snapshot(1000).sources.find(s=>s.id===market).capabilities.read.state,'offline-verified');assert.equal(db.snapshot(2000).sources.find(s=>s.id===market).capabilities.read.state,'expired');}finally{db.close();}
}));
test('store rejects digest conflicts and never converts listings into assignments',()=>fixture(dir=>{
 let db=openOpportunityStore(path.join(dir,'orders.db'));const o=observation();assert.equal(db.ingest(o),true);assert.equal(db.ingest(o),false);assert.equal(db.snapshot().orders.length,0);assert.throws(()=>db.ingest({...o,data:{assignmentConfirmed:true}}));db.close();db=openOpportunityStore(path.join(dir,'orders.db'));try{assert.equal(db.snapshot().observations.length,1);assert.throws(()=>db.register({...key,provenance:'model claim'}));db.register({...key,provenance:{type:'reviewed-local-registration',evidenceRef:'saved-own-application',ownerId:'own'}});assert.equal(db.snapshot().orders.length,1);db.register({...key,sourceId:'other',provenance:{type:'reviewed-local-registration',evidenceRef:'other',ownerId:'own'}});assert.equal(db.snapshot().orders.length,2);}finally{db.close();}
}));
test('handoff requires completed leased round, rejects corrupt files, and is idempotent',()=>fixture(dir=>{
 let active=true;const assertActive=()=>assert.ok(active);const value={id:'s',status:'succeeded',checkedAt:Date.now(),data:{observations:[{externalId:'42',revision:'1',kind:'listing',data:{title:'hello'}}]}};
 const result=publishObservations({round:{id:'round1',status:'completed',rows:[value]},directory:dir,assertActive});const db=openOpportunityStore(path.join(dir,'o.db'));
 try{const observations=JSON.parse(fs.readFileSync(result.file)).observations;assert.equal(ingestMonitorObservations({store:db,observations,assertActive}).inserted,1);assert.equal(ingestMonitorObservations({store:db,observations,assertActive}).duplicates,1);assert.equal(db.snapshot().orders.length,0);active=false;assert.throws(()=>ingestMonitorObservations({store:db,observations,assertActive}));assert.throws(()=>publishObservations({round:{status:'partial',rows:[value]},directory:dir,assertActive:()=>{}}));}finally{db.close();}
}));
test('lifecycle separates applications from funded work and preserves root budget',async()=>{
 const source={id:'s',capabilities:Object.fromEntries(['apply','work','verify','submit','reconcile'].map(k=>[k,{state:'live-verified',expiresAt:Date.now()+10000,evidenceRefs:['fake']}]))};
 const budget={active:true,rootRemainingRappen:250};const order={...key,rootTaskId:'root',sourceRevision:'r',state:'qualified',applicationAllowed:true,termsVerified:true};
 assert.equal(planOrderActions({order,source,budget})[0].kind,'apply');const work={...order,state:'assigned'};assert.equal(planOrderActions({order:work,source,budget}).length,0);
 const ctx={powerEnabled:true,controllerRunning:true,budget,source,order:{...work,state:'prepared',funding:{verified:true,sourceId:'s',externalId:'42',ownerId:'own',expiresAt:Date.now()+10000}}};const action={kind:'work',orderKey:key,rootTaskId:'root',sourceRevision:'r',maxCostRappen:50};assert.equal(guardOrderAction(action,ctx).allowed,true);assert.equal(guardOrderAction(action,{...ctx,powerEnabled:false}).allowed,false);assert.equal(guardOrderAction({...action,rootTaskId:'new'},ctx).allowed,false);
 let writes=0;const tasks=[];const controller={enqueue:t=>{writes++;tasks.push(t);},hasTask:()=>false};advanceOrderActions({controller,orders:[order],registry:{snapshot:()=>({sources:[source]})},budget,isEnabled:()=>false});assert.equal(writes,0);
});
test('delivery journal persists ambiguous outcome and reconciles exact delivery once',()=>fixture(dir=>{
 let db=openDeliveryJournal(path.join(dir,'d.db'));const digest='a'.repeat(64),id=db.prepare(key,digest);assert.equal(db.prepare(key,digest),id);db.markSent(id,{status:'unknown'});assert.throws(()=>db.markSent(id,{status:'sent',remoteId:'duplicate'}));db.close();db=openDeliveryJournal(path.join(dir,'d.db'));try{assert.throws(()=>db.reconcile(id,{...key,digest:'b'.repeat(64),remoteId:'5',verified:true,evidenceRef:'remote'}));db.reconcile(id,{...key,digest,remoteId:'5',verified:true,evidenceRef:'remote'});assert.equal(db.snapshot()[0].status,'confirmed');assert.equal(db.snapshot()[0].paymentConfirmed,false);}finally{db.close();}
}));
test('independent verifier binds output, not model passed flags, and rechecks OFF',async()=>{
 const order={...key,scopeDigest:'scope'},result={content:'data',passed:true};let active=true;const ctx={assertActive:()=>assert.ok(active)};
 assert.equal((await verifyDeliverable({order,result,verifier:async()=>({passed:false,evidenceRefs:['test']})},ctx)).passed,false);
 await assert.rejects(verifyDeliverable({order,result,verifier:async()=>{active=false;return {passed:true,evidenceRefs:['test']};}},ctx));
});

test('stale poll actions cannot regress a paid or advanced order',()=>{
 const key={sourceId:'s',externalId:'e',ownerId:'o'},source={id:'s',capabilities:{reconcile:{state:'live-verified',expiresAt:Date.now()+10000,evidenceRefs:['fake']}}},order={...key,state:'paid',sourceRevision:'r',rootTaskId:'root',termsVerified:true},ctx={order,source,powerEnabled:true,controllerRunning:true,budget:{active:true,rootRemainingRappen:250}};for(const kind of ['payment','acceptance','reconcile-application','reconcile-delivery'])assert.equal(guardOrderAction({kind,orderKey:key,sourceRevision:'r',rootTaskId:'root',maxCostRappen:0},ctx).allowed,false);
});
