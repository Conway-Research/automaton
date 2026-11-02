import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import Database from 'better-sqlite3';
import {controllerExecutionWindow} from './founder-execution-window.mjs';
import {openFounderController} from './founder-controller.mjs';
const task={id:'history-fixture',rootTaskId:'adaptive-history',kind:'adaptive-history',input:{timeoutMs:99999999},dependencies:[],resources:['research-cpu']};
test('only the dedicated free history task receives an eight-minute window inside its research lease',()=>{
 assert.deepEqual(controllerExecutionWindow(task,{maxCostRappen:0}),{executionMs:480000,leaseMs:540000});
 for(const [t,a] of [[{...task,kind:'external-communication'},{maxCostRappen:0}],[task,{maxCostRappen:1}],[task,{maxCostRappen:0,providerTracked:true}],[{...task,rootTaskId:'other'},{maxCostRappen:0}],[{...task,resources:[]},{maxCostRappen:0}]])assert.deepEqual(controllerExecutionWindow(t,a),{executionMs:120000,leaseMs:180000});
});
async function fixture(t,body,taskInput=task){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'history-window-'));let signal,release;
 const budget={snapshot:()=>({active:true,remainingRappen:100,dayRemainingRappen:100,entries:[]}),reserve:r=>{assert.equal(r.maxCostRappen,0);return {};},settle:r=>assert.equal(r.actualCostRappen,0)};
 const controller=openFounderController({file:path.join(directory,'controller.db'),budget,adapters:{'adaptive-history':{maxCostRappen:0,execute:async ctx=>{signal=ctx.signal;return new Promise((resolve,reject)=>{release=()=>resolve({kind:'adaptive-history',status:'checked'});ctx.signal.addEventListener('abort',()=>reject(Error('fixture aborted')),{once:true});});},verify:r=>r?.status==='checked'}}});
 t.mock.timers.enable({apis:['setTimeout']});
 try{controller.enqueue(taskInput);controller.control('start');const pending=controller.tick();await Promise.resolve();await Promise.resolve();assert.ok(signal);await body({controller,pending,signal,release,directory});}
 finally{await controller.close();t.mock.timers.reset();if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup');fs.rmSync(directory,{recursive:true,force:true});}
}
test('research can complete after two minutes with a matching persisted controller lease',t=>fixture(t,async({controller,pending,signal,release,directory})=>{
 const db=new Database(path.join(directory,'controller.db'),{readonly:true});const row=db.prepare("SELECT lease_ms FROM founder_jobs WHERE id='history-fixture'").get();db.close();assert.ok(row.lease_ms-Date.now()>530000);
 t.mock.timers.tick(200000);assert.equal(signal.aborted,false);release();await pending;assert.equal(controller.snapshot().tasks[0].status,'done');
}));
test('research still aborts at eight minutes and cannot become done',t=>fixture(t,async({controller,pending,signal})=>{
 t.mock.timers.tick(479999);assert.equal(signal.aborted,false);t.mock.timers.tick(1);await pending;assert.equal(signal.aborted,true);assert.equal(controller.snapshot().tasks[0].status,'blocked');
}));
test('manual stop aborts research immediately during the extended window',t=>fixture(t,async({controller,pending,signal})=>{
 t.mock.timers.tick(130000);controller.control('stop');await pending;assert.equal(signal.aborted,true);assert.equal(controller.controlState().status,'stopped');assert.notEqual(controller.snapshot().tasks[0].status,'done');
}));
test('ordinary work retains the existing two-minute deadline',t=>fixture(t,async({controller,pending,signal})=>{
 t.mock.timers.tick(119999);assert.equal(signal.aborted,false);t.mock.timers.tick(1);await pending;assert.equal(signal.aborted,true);assert.equal(controller.snapshot().tasks[0].status,'blocked');
},{...task,rootTaskId:'ordinary-fixture'}));
test('a full isolated OHLC run completes through controller and learning bridge after more than two simulated minutes',{timeout:30000},async t=>{
 const {openHistoryRunner}=await import('../src/revenue/long-history/runner.ts'),{openHistoryStore}=await import('../src/revenue/long-history/store.ts'),{researchWorker}=await import('../src/revenue/long-history/worker-client.ts'),{createFounderLearning}=await import('./founder-learning.mjs'),{openLearningStore}=await import('../src/research/store.ts'),{createHash}=await import('node:crypto');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'history-full-window-')),historyStore=openHistoryStore(path.join(directory,'history')),learningStore=openLearningStore({directory:path.join(directory,'learning')});
 const context={now:Date.now(),powerEnabled:true,controllerRunning:true,budgetActive:true,availableSlots:1,budgetRemainingRappen:100,dayRemainingRappen:100,rootRemainingRappen:100,goalId:'fixture',goalVersion:1,limitsDigest:'fixture',policyDigest:'fixture',activationApproved:true,permissions:['research']};
 const raw=Buffer.from(JSON.stringify(Array.from({length:1383},(_,i)=>[Date.UTC(2023,0,1)+i*86400000,1200+i%25,1201+i%25,1205+i%25,1195+i%25,10])));let elapsed=0,downloads=0;
 const runner=openHistoryRunner({store:historyStore,externalScheduling:true,download:async source=>{assert.equal(source.id,'bitfinex-ethusd-daily');downloads++;return {bytes:raw,url:source.urls[0],sha256:createHash('sha256').update(raw).digest('hex')};},evaluate:async(data,signal,timeout)=>{const result=await researchWorker(data,signal,timeout);elapsed+=6000;t.mock.timers.tick(6000);return result;}});
 const learning=createFounderLearning({store:learningStore,controller:{},budget:{},getContext:()=>context});
 const budget={snapshot:()=>({active:true,remainingRappen:100,dayRemainingRappen:100,entries:[]}),reserve:r=>{assert.equal(r.maxCostRappen,0);return {};},settle:r=>assert.equal(r.actualCostRappen,0)};
 const controller=openFounderController({file:path.join(directory,'controller.db'),budget,adapters:{'adaptive-history':{maxCostRappen:0,execute:ctx=>learning.runHistory(ctx,options=>runner.tick({...options,sourceId:'bitfinex-ethusd-daily'})),verify:r=>r?.kind==='adaptive-history'&&r.status==='checked'}}});
 t.mock.timers.enable({apis:['setTimeout']});
 try{runner.control('resume');controller.enqueue(task);controller.control('start');await controller.tick();assert.equal(controller.snapshot().tasks[0].status,'done');assert.equal(downloads,1);assert.equal(historyStore.listReports(50).length,36);assert.equal(historyStore.snapshot().counts.phaseOutcomes,36);assert.ok(elapsed>120000&&elapsed<480000);assert.ok(historyStore.listReports(50).every(r=>r.liveAuthorized===false));}
 finally{await controller.close();await runner.close();learning.close();historyStore.close();learningStore.close();t.mock.timers.reset();if(!path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('Unsafe cleanup');fs.rmSync(directory,{recursive:true,force:true});}
});
