import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderController} from './founder-controller.mjs';import {openFounderBudget} from './founder-budget.mjs';
import Database from 'better-sqlite3';

test('an aged free history task gets a worker slot ahead of a communication backlog',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-fairness-')),file=path.join(dir,'controller.db');
 const budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'isolated-history-fairness'});const calls=[];
 const adapter=kind=>({maxCostRappen:0,execute:async()=>{calls.push(kind);return {costReceipt:{actualCostRappen:0,evidenceRef:'fixture'}};},verify:()=>true});
 const c=openFounderController({file,budget,maxWorkers:4,adapters:{'external-communication':adapter('message'),'adaptive-history':adapter('history')}});
 try{for(let i=0;i<8;i++)c.enqueue({id:'message-'+i,rootTaskId:'message-'+i,kind:'external-communication',input:{},dependencies:[],resources:[]});
 c.enqueue({id:'history',rootTaskId:'history',kind:'adaptive-history',input:{},dependencies:[],resources:['research-cpu']});
 const db=new Database(file);db.prepare('UPDATE founder_jobs SET created_ms=? WHERE id=?').run(Date.now()-120000,'history');db.prepare("UPDATE founder_jobs SET created_ms=? WHERE id LIKE 'message-%'").run(Date.now()-180000);db.close();
 c.control('start');await c.tick();assert.ok(calls.includes('history'));assert.equal(calls.length,4);assert.equal(budget.snapshot().heldRappen,0);assert.equal(budget.snapshot().spentRappen,0);
 }finally{await c.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('task-budget deferral resumes after the authorized root ceiling increases without resetting costs',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'task-budget-change-'));let raised=false,calls=0;
 const budget={snapshot:()=>({active:true,remainingRappen:1000,dayRemainingRappen:1000,taskRappen:raised?250:200,entriesComplete:true,entries:[{taskId:'root-limit',actualCostRappen:200,maxCostRappen:200}]}),reserve(){if(!raised)throw Error('Budget task limit');return {};},settle(){}};
 const c=openFounderController({file:path.join(dir,'c.db'),budget,adapters:{read:{maxCostRappen:50,execute:async()=>{calls++;return {costReceipt:{actualCostRappen:1,evidenceRef:'fake'}};},verify:()=>true}}});
 try{c.enqueue(task('root-limit'));c.control('start');await c.tick();assert.equal(c.snapshot().tasks[0].status,'blocked');assert.equal(calls,0);raised=true;await c.tick();assert.equal(calls,1);assert.equal(c.snapshot().tasks[0].status,'done');}finally{await c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('dead worker recovery blocks uncertain execution and preserves outstanding cost',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recover-')),file=path.join(dir,'jobs.db'),budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'user'});let c;
 try{c=openFounderController({file,budget,adapters:{}});c.enqueue({id:'task',rootTaskId:'task',kind:'paid',input:{},dependencies:[],resources:[]});await c.close();c=null;budget.reserve({id:'orphan',rootTaskId:'task',maxCostRappen:50});const db=new Database(file);db.prepare("UPDATE founder_jobs SET status='running',owner_pid=99999999,lease_ms=?,run_id='orphan'").run(Date.now()+10000);db.close();c=openFounderController({file,budget,adapters:{paid:{maxCostRappen:50,execute(){throw Error('must not retry');}}}});assert.equal(c.snapshot().tasks[0].status,'blocked');assert.equal(budget.snapshot().heldRappen,50);c.control('start');await c.tick();assert.equal(c.snapshot().tasks[0].status,'blocked');}finally{await c?.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});
async function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-controller-')),budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'user'});let c;try{await fn((adapters)=>c=openFounderController({file:path.join(dir,'jobs.db'),budget,adapters,maxWorkers:4}),budget);}finally{await c?.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}}

test('service cooldown defers a job without an attempt or reservation',()=>fixture(async(make,budget)=>{
 let calls=0;const due=Date.now()+3600000,c=make({read:{nextReadyAt:due,maxCostRappen:0,execute:async()=>{calls++;return {};},verify:()=>true}});
 c.enqueue(task('cooldown'));c.control('start');await c.tick();assert.equal(calls,0);assert.equal(budget.snapshot().entries.length,0);assert.equal(c.snapshot().tasks[0].nextEligibleAt,due);assert.equal(c.snapshot().tasks[0].attempts,0);
}));

test('failed zero-cost services settle zero holds with a truthful diagnostic',()=>fixture(async(make,budget)=>{
 const c=make({read:{maxCostRappen:0,execute:async()=>{throw Object.assign(Error('private response'),{diagnostic:{code:'service_rate_limited',httpStatus:429}});},verify:()=>true}});
 c.enqueue(task('free-failed'));c.control('start');await c.tick();const t=c.snapshot().tasks[0];assert.equal(budget.snapshot().entries[0].actualCostRappen,0);assert.equal(t.diagnostic.code,'service_rate_limited');assert.match(t.reason,/keine Kostenreservierung/);assert.ok(!JSON.stringify(t).includes('private response'));
}));

test('a repaired request retries only a settled rejection and preserves attempt and budget limits',()=>fixture(async(make,budget)=>{
 let calls=0;const adapter={requestRevision:'old',providerTracked:true,autoRetrySafe:true,manualRetrySafe:true,maxCostRappen:50,execute:async({recordProviderEvent})=>{calls++;if(adapter.requestRevision==='old'){recordProviderEvent({stage:'dispatch'});recordProviderEvent({stage:'rejected',httpStatus:400,code:'provider_http_error',requestRevision:'old',costReceipt:{actualCostRappen:0,evidenceRef:'rejected:req400'}});throw Error('bad request');}return {costReceipt:{actualCostRappen:5,evidenceRef:'response-fixed'}};},verify:()=>true};
 const c=make({read:adapter});c.enqueue(task('repaired'));c.control('start');await c.tick();await c.tick();assert.equal(calls,1);assert.equal(budget.snapshot().heldRappen,0);adapter.requestRevision='fixed';await c.tick();assert.equal(calls,2);assert.equal(c.snapshot().tasks[0].status,'done');assert.equal(budget.snapshot().spentRappen,5);
}));
const task=(id,resources=[])=>({id,rootTaskId:id,kind:'read',input:{title:id},dependencies:[],resources});
test('free retry policy schedules only transient errors and honors connector backoff',()=>fixture(async(make,budget)=>{
 let due=0;const c=make({read:{maxCostRappen:0,retrySafe:true,autoRetrySafe:true,get nextReadyAt(){return due;},shouldAutoRetry:e=>e.diagnostic?.code==='service_dns_failed',execute:async ctx=>{const e=Error('offline');if(ctx.task.id==='transient'){due=Date.now()+300000;e.diagnostic={code:'service_dns_failed'};}else e.diagnostic={code:'service_no_results'};throw e;},verify:()=>false}});
 c.enqueue(task('permanent'));c.control('start');await c.tick();assert.equal(c.snapshot().tasks.find(t=>t.id==='permanent').nextRetryAt,null);
 c.enqueue(task('transient'));await c.tick();const t=c.snapshot().tasks.find(t=>t.id==='transient');assert.equal(t.attempts,1);assert.ok(t.nextRetryAt>=due);await c.tick();assert.equal(c.snapshot().tasks.find(t=>t.id==='transient').attempts,1);assert.equal(budget.snapshot().spentRappen,0);
}));
test('automatic private retries stop at three attempts and charge every response',()=>fixture(async(make,budget)=>{
 let calls=0;const c=make({read:{providerTracked:true,autoRetrySafe:true,manualRetrySafe:true,maxCostRappen:50,execute:async()=>({costReceipt:{actualCostRappen:5,evidenceRef:'receipt-'+(++calls)}}),verify:()=>false}});
 c.enqueue(task('bounded'));c.control('start');const db=new Database(c.databaseFile);
 for(let i=0;i<6;i++){await c.tick();db.prepare('UPDATE founder_jobs SET next_retry_ms=0 WHERE next_retry_ms IS NOT NULL').run();}
 db.close();assert.equal(calls,3);assert.equal(budget.snapshot().spentRappen,15);assert.equal(c.snapshot().tasks[0].nextRetryAt,null);
}));
test('restart replays persisted receipt without duplicating provider execution',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'receipt-recover-')),file=path.join(dir,'jobs.db'),budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'user'});let c;
 try{
  c=openFounderController({file,budget,adapters:{}});c.enqueue(task('recover'));await c.close();c=null;budget.reserve({id:'persisted',rootTaskId:'recover',maxCostRappen:50});
  const db=new Database(file);db.prepare("UPDATE founder_jobs SET status='running',owner_pid=99999999,lease_ms=0,run_id='persisted'").run();db.prepare('INSERT INTO founder_attempts VALUES(?,?,?,?,?,?,?)').run('persisted','recover','receipt','{}',JSON.stringify({actualCostRappen:6,evidenceRef:'resp_saved'}),null,Date.now());db.close();
  c=openFounderController({file,budget,adapters:{}});assert.equal(budget.snapshot().heldRappen,0);assert.equal(budget.snapshot().spentRappen,6);assert.equal(c.snapshot().tasks[0].status,'blocked');
 }finally{await c?.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('tracked preflight failure releases only undispatched cost and persists diagnosis',()=>fixture(async(make,budget)=>{
 const c=make({read:{providerTracked:true,maxCostRappen:50,execute:async()=>{throw Error('private input must not leak');},verify:()=>true}});
 c.enqueue(task('preflight'));c.control('start');await c.tick();assert.equal(budget.snapshot().heldRappen,0);assert.equal(budget.snapshot().entries[0].actualCostRappen,0);assert.equal(c.snapshot().tasks[0].diagnostic.code,'preflight_failed');assert.ok(!JSON.stringify(c.snapshot()).includes('private input must not leak'));
}));
test('uncertain dispatched calls keep the hold and cannot auto retry',()=>fixture(async(make,budget)=>{
 let calls=0;const c=make({read:{providerTracked:true,autoRetrySafe:true,maxCostRappen:50,execute:async({recordProviderEvent})=>{calls++;recordProviderEvent({stage:'dispatch'});throw Error('socket lost');},verify:()=>true}});
 c.enqueue(task('uncertain'));c.control('start');await c.tick();await c.tick();assert.equal(calls,1);assert.equal(budget.snapshot().heldRappen,50);assert.equal(c.snapshot().tasks[0].diagnostic.code,'provider_outcome_unknown');
}));
test('settled private failures retry automatically after backoff and unblock dependents',()=>fixture(async(make,budget)=>{
 let calls=0;const c=make({read:{providerTracked:true,autoRetrySafe:true,manualRetrySafe:true,maxCostRappen:50,execute:async()=>({ok:++calls>1,costReceipt:{actualCostRappen:5,evidenceRef:'receipt-'+calls}}),verify:r=>r.ok}});
 c.enqueue(task('auto'));c.enqueue({...task('dependent'),dependencies:['auto']});c.control('start');await c.tick();await c.tick();assert.equal(calls,1);assert.ok(c.snapshot().tasks.find(t=>t.id==='auto').nextRetryAt>Date.now());
 // Advance the persisted due time, without sleeping or modifying global clock.
 const db=new Database(c.databaseFile);db.prepare("UPDATE founder_jobs SET next_retry_ms=0 WHERE id='auto'").run();db.close();
 await c.tick();await c.tick();assert.equal(c.snapshot().tasks.find(t=>t.id==='auto').status,'done');assert.equal(c.snapshot().tasks.find(t=>t.id==='dependent').status,'done');assert.equal(budget.snapshot().heldRappen,0);
}));
test('reconcilable free output retries lost responses automatically at most three attempts',()=>fixture(async make=>{
 let calls=0;const c=make({read:{maxCostRappen:0,retrySafe:true,reconcileSafe:true,execute:async()=>{calls++;throw Error('lost response');},verify:()=>true}});c.enqueue(task('lost'));c.control('start');for(let i=0;i<5;i++)await c.tick();assert.equal(calls,3);assert.equal(c.snapshot().tasks[0].status,'blocked');
}));
test('scheduled work stays queued before its persisted due time without reserving costs',()=>fixture(async(make,budget)=>{
 let calls=0;const c=make({read:{maxCostRappen:0,execute:async()=>{calls++;return {};},verify:()=>true}});c.enqueue({...task('later'),input:{notBefore:Date.now()+3600000}});c.control('start');await c.tick();assert.equal(calls,0);assert.equal(c.snapshot().tasks[0].status,'queued');assert.equal(budget.snapshot().entries.length,0);
}));
test('pause and resume safely continue repeatable free reads and their dependent tasks',()=>fixture(async make=>{
 let first=true,finish;const c=make({read:{maxCostRappen:0,retrySafe:true,execute:async({signal})=>{if(first){first=false;await new Promise(resolve=>finish=resolve);}return {sources:['safe read']};},verify:()=>true}});c.enqueue(task('parent'));c.enqueue({...task('child'),dependencies:['parent']});c.control('start');const run=c.tick();await new Promise(r=>setImmediate(r));c.control('pause');finish();await run;c.control('resume');await c.tick();await c.tick();assert.equal(c.snapshot().tasks.find(t=>t.id==='parent').status,'done');assert.equal(c.snapshot().tasks.find(t=>t.id==='child').status,'done');
}));
test('parallelism, dependencies, resource locks and automatic verified results',()=>fixture(async make=>{
 const releases=[];let active=0,peak=0;const c=make({read:{maxCostRappen:0,execute:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>releases.push(r));active--;return {text:'result',evidence:['source']};},verify:r=>r.text==='result'}});
 for(let i=0;i<5;i++)c.enqueue(task(`t${i}`));c.control('start');const run=c.tick();await new Promise(r=>setImmediate(r));assert.equal(releases.length,4);assert.equal(c.snapshot().tasks.filter(t=>t.status==='running').length,4);releases.splice(0).forEach(r=>r());await run;assert.equal(peak,4);assert.equal(c.snapshot().tasks.filter(t=>t.status==='done').length,4);assert.equal(c.result('t0').text,'result');
 const run2=c.tick();await new Promise(r=>setImmediate(r));releases.splice(0).forEach(r=>r());await run2;
 c.enqueue(task('a',['shared']));c.enqueue(task('b',['shared']));c.enqueue({...task('child'),dependencies:['a']});const run3=c.tick();await new Promise(r=>setImmediate(r));assert.equal(releases.length,1);releases.splice(0).forEach(r=>r());await run3;assert.equal(c.snapshot().tasks.find(t=>t.id==='child').status,'queued');
}));
test('pause preserves completed work, unsupported work blocks, stale control rejected',()=>fixture(async make=>{
 let resolve;const c=make({read:{maxCostRappen:0,execute:()=>new Promise(r=>resolve=r),verify:()=>true}});c.enqueue(task('a'));c.enqueue({...task('unknown'),kind:'missing'});c.control('start');const running=c.tick();await new Promise(r=>setImmediate(r));const rev=c.snapshot().revision;c.control('pause',rev);assert.throws(()=>c.control('resume',rev));resolve({text:'late'});await running;assert.equal(c.snapshot().tasks.find(t=>t.id==='a').status,'done');assert.equal(c.snapshot().tasks.find(t=>t.id==='unknown').status,'blocked');assert.equal(c.result('a').text,'late');assert.throws(()=>c.enqueue({...task('a'),kind:'changed'}));
}));
test('paid workers need reservation and valid receipts; failed verification never completes',()=>fixture(async(make,budget)=>{
 const c=make({read:{maxCostRappen:100,execute:async()=>({text:'bad',costReceipt:{actualCostRappen:20,evidenceRef:'receipt'}}),verify:()=>false}});c.enqueue(task('a'));c.control('start');await c.tick();assert.equal(c.snapshot().tasks[0].status,'failed');assert.equal(budget.snapshot().spentRappen,20);assert.throws(()=>c.result('a'));
}));

test('manual retry only admits bounded free safe jobs and rejects stale state or paid work',()=>fixture(async make=>{
 let fail=true;const c=make({read:{maxCostRappen:0,retrySafe:true,execute:async()=>{if(fail)throw Error('temporary');return {text:'ok'};},verify:()=>true},paid:{maxCostRappen:50,retrySafe:true,execute:async()=>{throw Error('paid failure');},verify:()=>true}});
 c.enqueue(task('retry'));c.enqueue({...task('paid'),kind:'paid'});c.control('start');await c.tick();
 const row=c.snapshot().tasks.find(t=>t.id==='retry');assert.equal(row.retryAllowed,true);
 assert.throws(()=>c.retry('retry',row.updated_ms-1));assert.throws(()=>c.retry('paid',c.snapshot().tasks.find(t=>t.id==='paid').updated_ms));
 fail=false;c.retry('retry',row.updated_ms);assert.throws(()=>c.retry('retry',row.updated_ms));await c.tick();assert.equal(c.snapshot().tasks.find(t=>t.id==='retry').status,'done');
}));

test('private paid manual retry requires settled costs, an active budget and explicit adapter eligibility',()=>fixture(async(make,budget)=>{
 const c=make({read:{maxCostRappen:50,manualRetrySafe:true,execute:async()=>({costReceipt:{actualCostRappen:10,evidenceRef:'paid-test'}}),verify:()=>false}});
 c.enqueue(task('private'));c.control('start');await c.tick();const row=c.snapshot().tasks[0];assert.equal(row.retryAllowed,true);assert.equal(row.retryMaxCostRappen,50);assert.equal(budget.snapshot().entries[0].actualCostRappen,10);c.retry(row.id,row.updated_ms);assert.equal(c.snapshot().tasks[0].status,'queued');
}));

test('daily-budget deferral resumes when capacity returns without retrying uncertain paid work',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daily-retry-'));let allowed=false,calls=0;const budget={snapshot:()=>({active:true,remainingRappen:1000,dayRemainingRappen:allowed?100:0,entries:[]}),reserve(){if(!allowed)throw Error('Budget daily limit');return {};},settle(){}};const c=openFounderController({file:path.join(dir,'c.db'),budget,adapters:{read:{maxCostRappen:50,execute:async()=>{calls++;return {costReceipt:{actualCostRappen:10,evidenceRef:'test'}};},verify:()=>true}}});try{c.enqueue(task('later'));c.control('start');await c.tick();assert.equal(c.snapshot().tasks[0].status,'blocked');assert.equal(calls,0);allowed=true;await c.tick();assert.equal(calls,1);assert.equal(c.snapshot().tasks[0].status,'done');}finally{await c.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('truncated paid responses keep settled costs and do not repeat an unchanged request',()=>fixture(async(make,budget)=>{
 let calls=0;const c=make({read:{providerTracked:true,autoRetrySafe:true,manualRetrySafe:true,maxCostRappen:50,execute:async()=>{calls++;return {status:'incomplete',incompleteReason:'max_output_tokens',costReceipt:{actualCostRappen:12,evidenceRef:'partial'}};},verify:()=>false}});
 c.enqueue(task('partial'));c.control('start');await c.tick();const row=c.snapshot().tasks[0];assert.equal(row.status,'failed');assert.equal(row.nextRetryAt,null);assert.equal(row.diagnostic.code,'response_incomplete');assert.match(row.reason,/Ausgabegrenze/);await c.tick();assert.equal(calls,1);assert.equal(budget.snapshot().spentRappen,12);assert.equal(budget.snapshot().heldRappen,0);
}));


test('snapshot exposes a retry plan only for eligible automatic adapters',()=>fixture(async make=>{
 const c=make({read:{maxCostRappen:0,retrySafe:true,autoRetrySafe:false,execute:async()=>{throw Error('read');},verify:()=>false}});c.enqueue(task('stale-plan'));c.control('start');await c.tick();const db=new Database(c.databaseFile);db.prepare("UPDATE founder_jobs SET next_retry_ms=123 WHERE id='stale-plan'").run();db.close();assert.equal(c.snapshot().tasks[0].automaticRetryScheduled,false);
}));
test('startup snapshot reads the budget only once for a failed-job backlog',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'startup-budget-'));let reads=0;
 const budget={snapshot(){reads++;return {active:true,entries:[],entriesComplete:true,remainingRappen:1000,dayRemainingRappen:1000,taskRappen:250};}};
 const file=path.join(dir,'controller.db'),c=openFounderController({file,budget,adapters:{read:{maxCostRappen:0,manualRetrySafe:true,execute:async()=>({}),verify:()=>true}}});
 try{for(let i=0;i<250;i++)c.enqueue({id:'job-'+i,rootTaskId:'root-'+i,kind:'read',input:{},dependencies:[],resources:[]});
  const db=new Database(file);db.prepare("UPDATE founder_jobs SET status='failed',run_id=id,attempts=1").run();db.close();reads=0;
  const s=c.snapshot();assert.equal(s.tasks.length,250);assert.equal(reads,1);
 }finally{await c.close();fs.rmSync(dir,{recursive:true,force:true});}
});

