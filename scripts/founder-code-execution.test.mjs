import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderCodeExecution} from './founder-code-execution.mjs';
import {codeDigest} from './founder-code-sandbox.mjs';
import {createCodeSandbox} from './founder-code-sandbox.mjs';
import {createOrderProfileSandbox} from './founder-order-profile-sandbox.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderController} from './founder-controller.mjs';
import {openFounderBudget} from './founder-budget.mjs';
const files=[{path:'check.test.cjs',content:"require('node:test')('check',()=>{});"}];
const image='sha256:'+'a'.repeat(64);
const task=()=>({kind:'code-execution',input:{files,sourceDigest:codeDigest(files)}});
function fixture(){let on=true,calls=0;const sandbox={image,available:true,async probe(){calls++;return true;},async run(f){calls++;return {passed:true,exitCode:0,tests:1,sourceDigest:codeDigest(f),image,network:'none',hostMounts:false,readOnlySource:true};}};const adapter=createFounderCodeExecution({sandbox,isEnabled:()=>on});return {adapter,sandbox,get calls(){return calls;},stop(){on=false;}};}
test('private code checks bind result to exact source and never authorize delivery',async()=>{
 const f=fixture(),result=await f.adapter.execute({task:task(),assertActive(){}});
 assert.equal(f.adapter.verify(result),true);assert.equal(result.sourceDigest,codeDigest(files));assert.equal(result.executionScope,'private-offline-tests');assert.equal(result.deliveryAuthorized,false);
 assert.equal(f.adapter.verify({...result,network:'host'}),false);
});
test('OFF, stale input, missing task guard and unsupported input never invoke sandbox',async()=>{
 const f=fixture();await assert.rejects(f.adapter.execute({task:task()}));
 await assert.rejects(f.adapter.execute({task:{...task(),input:{files,sourceDigest:'b'.repeat(64)}},assertActive(){}}));
 await assert.rejects(f.adapter.execute({task:{...task(),input:{files:[{path:'main.js',content:'x'}],sourceDigest:codeDigest([{path:'main.js',content:'x'}])}},assertActive(){}}));
 f.stop();await assert.rejects(f.adapter.execute({task:task(),assertActive(){}}));assert.equal(f.calls,0);
});
test('probe failure, stop during execution and mismatched sandbox results fail closed',async()=>{
 const f=fixture();f.sandbox.probe=async()=>false;await assert.rejects(f.adapter.execute({task:task(),assertActive(){}}));
 const g=fixture();g.sandbox.run=async()=>{g.stop();return {};};await assert.rejects(g.adapter.execute({task:task(),assertActive(){}}));
 const h=fixture();h.sandbox.run=async()=>({passed:true,exitCode:0,tests:1,sourceDigest:'b'.repeat(64),image,network:'none',hostMounts:false,readOnlySource:true});await assert.rejects(h.adapter.execute({task:task(),assertActive(){}}));
});

test('controller persists private test result within unchanged zero-cost budget',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'founder-code-worker-')),f=fixture();
 const budget=openFounderBudget(path.join(root,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'isolated-test'});
 const controller=openFounderController({file:path.join(root,'controller.db'),budget,adapters:{'code-execution':f.adapter}});
 try{
  controller.enqueue({...task(),id:'private-test',rootTaskId:'private-test',dependencies:[],resources:['code-sandbox']});
  await controller.tick();assert.equal(f.calls,0);
  controller.control('start');await controller.tick();
  assert.equal(controller.snapshot().tasks[0].status,'done');assert.equal(controller.result('private-test').sourceDigest,codeDigest(files));
  assert.equal(budget.snapshot().spentRappen,0);assert.equal(budget.snapshot().heldRappen,0);
 }finally{await controller.close();budget.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('controller stop during real probe wrapper prevents subsequent seed and test dispatch',async()=>{
 let active=true;const calls=[];
 const nodeSandbox=createCodeSandbox({image,isEnabled:()=>true,process:async args=>{calls.push(args);if(args[0]==='volume'&&args[1]==='create')active=false;return {code:0,stdout:'',stderr:''};}});
 const sandbox=createOrderProfileSandbox({isEnabled:()=>true,nodeSandbox});
 const adapter=createFounderCodeExecution({sandbox,isEnabled:()=>true});
 await assert.rejects(adapter.execute({task:task(),assertActive(){if(!active)throw Error('Controller stopped');}}));
 assert.equal(calls.filter(args=>args[0]==='run').length,0);
 assert.equal(calls.filter(args=>args[0]==='volume'&&args[1]==='create').length,1);
});
