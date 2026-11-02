import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openFounderRuntime} from './founder-runtime.mjs';import {openFounderCommunication} from './founder-communication.mjs';import {ugigGroupRoot} from './founder-ugig-group-replies.mjs';
import {openFounderController} from './founder-controller.mjs';
import {openFounderBudget} from './founder-budget.mjs';
test('reviewed conversation budget root passes real controller without blocking planning',async()=>{const base=fs.mkdtempSync(path.join(os.tmpdir(),'group-root-real-'));const id='00000000-0000-4000-8000-000000000001';let reads=0;const communication=openFounderCommunication({file:path.join(base,'communication.db'),isEnabled:()=>true,getUgigGroupBindings:()=>[{conversationId:id}],transports:{ugig:{inspect:async()=>{reads++;throw Error('No external calls in this fixture');}}}});const errors=[];const r=openFounderRuntime({base,directory:path.join(base,'runtime'),adapters:{},communication,learningOptions:{enabled:true,activationApproved:true,adapters:{available:true,discover:async()=>[]}},activate:true,isEnabled:()=>true,onError:e=>errors.push(e.message)});try{await r.cycle();assert.deepEqual(errors,[]);assert.equal(r.snapshot().schedulerError,null);const task=r.snapshot().tasks.find(t=>t.kind==='external-communication');assert.ok(task);assert.equal(task.rootTaskId,ugigGroupRoot(id));assert.equal(r.snapshot().budget.spentRappen,0);assert.equal(reads,0);assert.ok(r.learningSnapshot().events.some(e=>e.kind==='dispatch'));}finally{await r.close();communication.close();}});

test('only canonical conversation roots extend the grammar; task identity stays strict',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'group-root-grammar-'));
 const budget=openFounderBudget(path.join(base,'budget.db'));
 const controller=openFounderController({file:path.join(base,'controller.db'),budget,adapters:{fake:{maxCostRappen:0,execute:async()=>({}),verify:()=>true}}});
 const root=ugigGroupRoot('00000000-0000-4000-8000-000000000001');
 const task={id:'valid-task',rootTaskId:root,kind:'fake',input:{},dependencies:[],resources:[]};
 try{
  assert.doesNotThrow(()=>controller.enqueue(task));
  for(const invalid of ['other:root','ugig-conversation:bad','ugig-conversation:00000000-0000-4000-8000-000000000001/extra','../root','root with space'])assert.throws(()=>controller.enqueue({...task,id:'bad-root',rootTaskId:invalid}),/Invalid task/);
  for(const field of ['id','kind'])assert.throws(()=>controller.enqueue({...task,[field]:root}),/Invalid task/);
  for(const field of ['dependencies','resources'])assert.throws(()=>controller.enqueue({...task,id:'bad-list',[field]:[root]}),/Invalid task/);
 }finally{await controller.close();budget.close();}
});

test('distinct tasks keep the exact conversation root and share its existing CHF 2.50 cap',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'group-root-budget-'));
 const budget=openFounderBudget(path.join(base,'budget.db'));
 budget.activate({startAt:Date.now(),authorizationRef:'isolated-fixture'});
 const root=ugigGroupRoot('00000000-0000-4000-8000-000000000001');
 budget.reserve({id:'prior',rootTaskId:root,maxCostRappen:250});
 let calls=0;const controller=openFounderController({file:path.join(base,'controller.db'),budget,adapters:{fake:{maxCostRappen:1,execute:async()=>{calls++;return {};},verify:()=>true}}});
 try{
  controller.enqueue({id:'followup',rootTaskId:root,kind:'fake',input:{},dependencies:[],resources:[]});
  controller.control('start',controller.snapshot().revision);
  await controller.tick();
  assert.equal(calls,0);
  const state=controller.snapshot();assert.equal(state.tasks.find(t=>t.id==='followup').rootTaskId,root);
  assert.equal(state.budget.heldRappen,250);assert.equal(state.budget.spentRappen,0);
  assert.equal(state.budget.periodRappen,15000);assert.equal(state.budget.dailyRappen,2000);assert.equal(state.budget.taskRappen,250);assert.equal(state.maxWorkers,10);
 }finally{await controller.close();budget.close();}
});
