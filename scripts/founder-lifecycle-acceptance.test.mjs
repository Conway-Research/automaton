import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {openFounderRuntime} from './founder-runtime.mjs';
import {normalizeInventory,openSourceRegistry} from './founder-source-registry.mjs';
import {openOpportunityStore} from './founder-opportunity-store.mjs';
import {openDeliveryJournal} from './founder-order-delivery.mjs';

// All accounts, contracts, money and ON states below exist only in temp files.
async function fixture(options={}){
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-lifecycle-')),directory=path.join(base,'state'),restoration=path.join(directory,'restoration');
 fs.mkdirSync(restoration,{recursive:true});
 const workPackages={rows:[{id:'test-row',label:'ugig',inventoryKind:'core'}]},normalized=normalizeInventory({},workPackages);
 fs.mkdirSync(path.join(base,'docs/superpowers/plans'),{recursive:true});
 fs.writeFileSync(path.join(base,'docs/superpowers/plans/2026-10-18-numaron-source-work-packages.json'),JSON.stringify(workPackages));
 const sourceId=normalized.sources[0].id,key={sourceId,externalId:'fake-job',ownerId:'fake-owner'},expiresAt=Date.now()+3600000;
 const funding={...key,verified:true,evidenceRef:'contract:fake',expiresAt,amountMinor:1000,netAmountMinor:900,currency:'CHF',recipient:'fake-recipient'};
 const registry=openSourceRegistry(path.join(restoration,'sources.db'));registry.import(normalized.sources,normalized.mappings);
 for(const cap of ['read','apply','work','verify','submit','reconcile'])registry.setCapability(sourceId,cap,{state:'live-verified',evidenceRefs:['test:synthetic-only'],expiresAt});
 if(options.expired)registry.setCapability(sourceId,'work',{state:'live-verified',evidenceRefs:['test:expired'],expiresAt:Date.now()-1});
 if(options.missingAuthority)registry.setCapability(sourceId,'work',{state:'blocked',evidenceRefs:[]});
 registry.close();
 const store=openOpportunityStore(path.join(restoration,'opportunities.db'));
 store.register({...key,rootTaskId:'fake-family',sourceRevision:'r1',state:options.state??'applied',termsVerified:true,
  ...(options.state&&options.state!=='applied'?{funding}:{}),
  ...(options.seed??{}),provenance:{type:'reviewed-local-registration',ownerId:key.ownerId,evidenceRef:'test:registration'}});
 store.close();
 let on=options.on??true,runtime;const calls=[],errors=[];const hash='a'.repeat(64);
 const payment={...key,confirmed:true,evidenceRef:'receipt:fake',amountMinor:900,currency:'CHF',recipient:funding.recipient,...options.payment};
 const kinds=['reconcile-application','prepare','work','verify','submit','reconcile-delivery','acceptance','payment'];
 const adapters=Object.fromEntries(kinds.map(kind=>[kind,{
  sourceIds:[sourceId],maxCostRappen:kind==='work'?5:kind==='submit'?10:0,
  execute:async ctx=>{
   ctx.assertActive();calls.push(kind);
   if(options.execute?.[kind])return options.execute[kind](ctx,{key,funding,hash,payment,setOn:v=>{on=v;}});
   if(kind==='reconcile-application')return {confirmed:true,assignment:{...key,verified:true,evidenceRef:'contract:assignment',expiresAt},funding};
   if(kind==='verify')return {confirmed:true,verification:{passed:true,digest:hash}};
   if(kind==='payment')return {confirmed:true,payment};
   if(kind==='reconcile-delivery')return {confirmed:false};
   return {confirmed:true,...(['work','submit'].includes(kind)?{costReceipt:{actualCostRappen:kind==='work'?3:4,evidenceRef:'receipt:'+ctx.grant.reservationId}}:{})};
  },verify:r=>options.rejectVerification&&kind==='verify'?false:r?.confirmed===true||kind==='reconcile-delivery'
 }]));
 if(options.submitExtras)Object.assign(adapters.submit,options.submitExtras);
 if(options.reconcileExtras)Object.assign(adapters['reconcile-delivery'],options.reconcileExtras);
 const open=()=>openFounderRuntime({base,directory,activate:true,isEnabled:()=>on,adapters:{},restorationAdapters:adapters,onError:e=>errors.push(e.message)});
 runtime=open();
 const read=()=>{const db=new Database(path.join(restoration,'opportunities.db'),{readonly:true});try{return JSON.parse(db.prepare('SELECT payload FROM restoration_orders').get().payload);}finally{db.close();}};
 return {base,directory,restoration,key,funding,calls,errors,read,get runtime(){return runtime;},
  async cycles(n=10){for(let i=0;i<n;i++)await runtime.cycle();},
  async reopen(){await runtime.close();runtime=open();},
  setOn(value){on=value;},
  async close(){await runtime.close();fs.rmSync(base,{recursive:true,force:true});}
 };
}
test('complete assigned-order lifecycle crosses real controller and budget; reopen cannot duplicate payment',async()=>{
 const f=await fixture();try{
  await f.cycles();assert.deepEqual(f.errors,[]);assert.equal(f.read().state,'paid');
  assert.deepEqual(f.calls,['reconcile-application','prepare','work','verify','submit','acceptance','payment']);
  const s=f.runtime.snapshot();assert.equal(s.budget.spentRappen,7);assert.equal(s.budget.heldRappen,0);
  assert.ok(s.budget.entries.every(e=>e.taskId==='fake-family'));assert.equal(s.budget.entries.length,7);
  assert.ok(s.capabilityEvidence.entries.every(e=>e.liveVerification==='unknown'));
  await f.reopen();await f.cycles(3);assert.equal(f.calls.length,7);assert.equal(f.runtime.snapshot().budget.spentRappen,7);
 }finally{await f.close();}
});
test('OFF never advances orders or reserves work costs',async()=>{
 const f=await fixture({on:false});try{const before=f.read(),budget=f.runtime.snapshot().budget;await f.cycles(3);assert.deepEqual(f.read(),before);assert.deepEqual(f.runtime.snapshot().budget,budget);assert.deepEqual(f.calls,[]);}finally{await f.close();}
});
test('expired work authority prevents execution despite assigned funded order',async()=>{
 const f=await fixture({state:'assigned',expired:true});try{await f.cycles(3);assert.equal(f.read().state,'assigned');assert.deepEqual(f.calls,[]);assert.equal(f.runtime.snapshot().budget.entries.length,0);}finally{await f.close();}
});
test('independent verification failure blocks submit without losing already recorded cost',async()=>{
 const f=await fixture({rejectVerification:true});try{await f.cycles();assert.equal(f.read().state,'worked');assert.ok(!f.calls.includes('submit'));assert.equal(f.runtime.snapshot().budget.spentRappen,3);}finally{await f.close();}
});
test('response lost after submit remains pending across reopen and retains unresolved reservation',async()=>{
 const f=await fixture({execute:{submit:async()=>{throw Error('fake lost response');}}});
 try{await f.cycles();assert.equal(f.read().pendingWrite,'delivery');assert.equal(f.calls.filter(k=>k==='submit').length,1);assert.equal(f.runtime.snapshot().budget.heldRappen,10);
  await f.reopen();await f.cycles(3);assert.equal(f.calls.filter(k=>k==='submit').length,1);assert.equal(f.read().state,'verified');assert.equal(f.runtime.snapshot().budget.heldRappen,10);
 }finally{await f.close();}
});
for(const payment of [{amountMinor:1},{currency:'USD'},{recipient:'other'},{ownerId:'other'}])test('contract-mismatched payment stays accepted: '+Object.keys(payment)[0],async t=>{
 // Payment polls have minute-scoped action IDs. Keep this single-poll check in
 // one scheduler minute regardless of how long SQLite takes under suite load.
 t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-31T00:00:00.000Z')});
 const f=await fixture({payment});try{await f.cycles();assert.equal(f.read().state,'accepted');assert.equal(f.read().payment,undefined);assert.equal(f.calls.filter(k=>k==='payment').length,1);assert.equal(f.runtime.snapshot().orderAccounts.orders[0].contributionRappen,null);}finally{await f.close();}
});

test('contract-mismatched payment is checked again only in the next scheduler minute',async t=>{
 const now=Date.parse('2026-10-31T00:00:00.000Z');
 t.mock.timers.enable({apis:['Date'],now});
 const f=await fixture({payment:{amountMinor:1}});
 try{
  await f.cycles();assert.equal(f.calls.filter(k=>k==='payment').length,1);
  const first=f.runtime.snapshot().tasks.filter(task=>task.kind==='source-payment');
  assert.equal(first.length,1);assert.equal(first[0].status,'failed');
  t.mock.timers.setTime(now+59999);await f.cycles(3);
  assert.equal(f.calls.filter(k=>k==='payment').length,1);
  t.mock.timers.setTime(now+60000);await f.cycles(3);
  assert.equal(f.calls.filter(k=>k==='payment').length,2);
  const payments=f.runtime.snapshot().tasks.filter(task=>task.kind==='source-payment');
  assert.equal(payments.length,2);assert.ok(payments.every(task=>task.status==='failed'));
  assert.notEqual(payments[0].id,payments[1].id);
  assert.equal(f.read().state,'accepted');assert.equal(f.read().payment,undefined);
  assert.equal(f.runtime.snapshot().orderAccounts.orders[0].contributionRappen,null);
 }finally{await f.close();}
});
test('OFF during work prevents state commit and any subsequent submit',async()=>{
 const f=await fixture({execute:{work:async(ctx,{setOn})=>{setOn(false);return {confirmed:true,costReceipt:{actualCostRappen:3,evidenceRef:'receipt:fake-work'}};}}});
 try{await f.cycles();assert.equal(f.read().state,'prepared');assert.ok(!f.calls.includes('verify'));assert.ok(!f.calls.includes('submit'));assert.equal(f.runtime.snapshot().budget.heldRappen,5);}finally{await f.close();}
});
test('buyer correction retains first delivery and same family costs through revised payment',async()=>{
 let reviewed=false;
 const f=await fixture({execute:{acceptance:async(ctx,{key,hash})=>{
  if(reviewed)return {confirmed:true};reviewed=true;
  return {confirmed:true,review:{...key,verified:true,status:'changes-requested',submissionDigest:hash,revision:'r2',evidenceRef:'contract:review',expiresAt:Date.now()+60000}};
 }}});
 try{await f.cycles(16);assert.equal(f.read().state,'paid');assert.equal(f.read().reviewHistory.length,1);assert.equal(f.read().reviewHistory[0].deliveryDigest,'a'.repeat(64));assert.equal(f.calls.filter(k=>k==='submit').length,2);assert.equal(f.runtime.snapshot().budget.spentRappen,14);assert.ok(f.runtime.snapshot().budget.entries.every(e=>e.taskId==='fake-family'));}finally{await f.close();}
});
test('persisted unsent intent resumes only with exact prepared journal proof',async()=>{
 const hash='a'.repeat(64);let journal;
 const f=await fixture({state:'verified',seed:{verification:{passed:true,digest:hash},pendingWrite:'delivery',pendingActionId:'fake-interruption',pendingDeliveryJournalId:'placeholder'},
  execute:{'reconcile-delivery':async ctx=>({confirmed:false,dispatchNotStarted:true,deliveryIntent:ctx.order.pendingDeliveryJournalId})},
  reconcileExtras:{canResume:(order,outcome)=>journal.snapshot().some(r=>r.id===outcome.deliveryIntent&&r.status==='prepared'&&r.digest===hash&&r.revision===order.sourceRevision)}
 });
 try{
  journal=openDeliveryJournal(path.join(f.restoration,'test-journal.db'));const order=f.read(),intent=journal.prepare(order,hash,order.sourceRevision);
  const store=openOpportunityStore(path.join(f.restoration,'opportunities.db'));store.update(order,order.sourceRevision,{pendingDeliveryJournalId:intent});store.close();
  await f.cycles(5);assert.equal(f.read().state,'paid');assert.equal(f.read().deliveryAttempt,1);assert.equal(f.calls.filter(k=>k==='submit').length,1);
 }finally{journal?.close();await f.close();}
});

test('missing work authority blocks assigned funded work',async()=>{
 const f=await fixture({state:'assigned',missingAuthority:true});try{await f.cycles(3);assert.equal(f.read().state,'assigned');assert.deepEqual(f.calls,[]);assert.equal(f.runtime.snapshot().budget.entries.length,0);}finally{await f.close();}
});
test('unproven unsent intent cannot clear pending delivery or resubmit',async()=>{
 const f=await fixture({state:'verified',seed:{verification:{passed:true,digest:'a'.repeat(64)},pendingWrite:'delivery',pendingActionId:'fake-interruption',pendingDeliveryJournalId:'missing'},execute:{'reconcile-delivery':async()=>({confirmed:false,dispatchNotStarted:true,deliveryIntent:'wrong'})},reconcileExtras:{canResume:()=>false}});
 try{await f.cycles(4);assert.equal(f.read().pendingWrite,'delivery');assert.ok(!f.calls.includes('submit'));}finally{await f.close();}
});
