import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {openFounderBudget} from './founder-budget.mjs';
import {openFounderController} from './founder-controller.mjs';
import {planOrderActions} from './founder-order-lifecycle.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';

const packages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]};
const sourceId=normalizeInventory({},packages).sources[0].id;
function fixture(t){
 let at=Date.parse('2026-10-19T00:40:00Z'),on=true,reads=0;
 t.mock.method(Date,'now',()=>at);
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'reconcile-fresh-'));
 const engine=openOrderRestoration({base,directory:path.join(base,'restoration'),workPackages:packages,isEnabled:()=>on,actionAdapters:{'reconcile-application':{sourceIds:[sourceId],maxCostRappen:0,async execute(){reads++;return {confirmed:true,status:'pending',assignmentConfirmed:false};},verify:r=>r.confirmed===true}}});
 const budget=openFounderBudget(path.join(base,'budget.db'));budget.activate({startAt:at,authorizationRef:'isolated-fixture'});
 const controller=openFounderController({file:path.join(base,'controller.db'),budget,adapters:engine.adapters});
 const renew=()=>engine.registry.setCapability(sourceId,'reconcile',{state:'live-verified',expiresAt:at+60000,evidenceRefs:['fake-fresh-monitor-receipt']});
 renew();
 function enqueue(id){
  const order={sourceId,externalId:id,ownerId:'own',rootTaskId:'root-'+id,sourceRevision:'existing-application',state:'applied',termsVerified:false,applicationAllowed:false,provenance:{type:'reviewed-local-registration',ownerId:'own',evidenceRef:'fake-own-application'}};
  engine.store.register(order);
  const action=planOrderActions({order,source:engine.registry.snapshot().sources[0],budget:{active:true,rootRemainingRappen:250},now:at})[0];
  assert.ok(action);
  const task={id:action.id,rootTaskId:action.rootTaskId,kind:'source-reconcile-application',input:{action},dependencies:[],resources:['one-source']};
  controller.enqueue(task);return task;
 }
 return {base,engine,budget,controller,enqueue,renew,advance:ms=>at+=ms,setOff:()=>on=false,reads:()=>reads,async close(){await controller.close();engine.close();budget.close();}};
}

test('queued application reads wait before a reservation or attempt when their source evidence expires',async t=>{
 const f=fixture(t);
 try{
  const tasks=[f.enqueue('first'),f.enqueue('second')];
  f.controller.control('start',f.controller.snapshot().revision);
  f.advance(60001);
  for(let i=0;i<3;i++)await f.controller.tick();
  const s=f.controller.snapshot();
  for(const task of tasks){const saved=s.tasks.find(t=>t.id===task.id);assert.equal(saved.status,'queued');assert.equal(saved.attempts,0);assert.equal(saved.waitState.code,'source-evidence');}
  assert.equal(f.reads(),0);assert.equal(s.budget.entries.length,0);
  assert.equal(s.budget.spentRappen,0);assert.equal(s.budget.heldRappen,0);
  f.renew();
  await f.controller.tick();await f.controller.tick();
  const after=f.controller.snapshot();
  for(const task of tasks){const saved=after.tasks.find(t=>t.id===task.id);assert.equal(saved.status,'done');assert.equal(saved.attempts,1);assert.equal(saved.rootTaskId,task.rootTaskId);}
  assert.equal(f.reads(),2);assert.equal(after.budget.spentRappen,0);assert.equal(after.budget.heldRappen,0);
  assert.equal(after.budget.periodRappen,15000);assert.equal(after.budget.dailyRappen,2000);assert.equal(after.budget.taskRappen,250);
 }finally{await f.close();}
});

test('expired evidence still blocks direct execution; waiting never grants authority',async t=>{
 const f=fixture(t);
 try{
  const task=f.enqueue('direct');f.advance(60001);
  const result=await f.engine.adapters['source-reconcile-application'].execute({task,assertActive(){},grant:{reservationId:'fake',maxCostRappen:0},dependencies:[],signal:new AbortController().signal});assert.equal(result.outcome.confirmed,false);assert.equal(result.outcome.waiting,true);
  assert.equal(f.reads(),0);
 }finally{await f.close();}
});

test('OFF remains stopped even if a fresh monitor receipt appears',async t=>{
 const f=fixture(t);
 try{
  const task=f.enqueue('off');f.controller.control('start',f.controller.snapshot().revision);
  f.advance(60001);await f.controller.tick();
  f.controller.control('stop',f.controller.snapshot().revision);f.setOff();f.renew();
  await f.controller.tick();
  assert.equal(f.reads(),0);assert.equal(f.controller.snapshot().status,'stopped');
  assert.equal(f.controller.snapshot().tasks.find(t=>t.id===task.id).attempts,0);
 }finally{await f.close();}
});

test('waiting is restricted to free bound application reads and preserves the actual dispatch guard',async t=>{
 const f=fixture(t);
 try{
  const task=f.enqueue('bounds');f.advance(60001);
  const read=f.engine.adapters['source-reconcile-application'];
  assert.ok(read.nextReadyAtFor({task})>Date.now());
  for(const invalid of [
   {...task,rootTaskId:'unrelated-root'},
   {...task,input:{action:{...task.input.action,sourceRevision:'wrong-revision'}}},
   {...task,input:{action:{...task.input.action,maxCostRappen:1}}},
   {...task,kind:'source-apply',input:{action:{...task.input.action,kind:'apply'}}}
  ])assert.equal(read.nextReadyAtFor({task:invalid}),0);
  assert.equal(f.engine.adapters['source-apply'].waitStateFor({task:{...task,kind:'source-apply',input:{action:{...task.input.action,kind:'apply'}}}}),null);
  f.renew();
  await assert.rejects(read.execute({task:{...task,rootTaskId:'unrelated-root'},assertActive(){},grant:{reservationId:'fake',maxCostRappen:0},dependencies:[],signal:new AbortController().signal}),/Exact action binding required/);
  assert.equal(f.reads(),0);
 }finally{await f.close();}
});
