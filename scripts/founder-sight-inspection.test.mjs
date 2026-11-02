import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderController} from './founder-controller.mjs';import {openFounderBudget} from './founder-budget.mjs';
import {startFounderDashboard} from './founder-dashboard.mjs';
import Database from 'better-sqlite3';
const task=(id,inspection)=>({id,rootTaskId:id,kind:'local',input:inspection?{sightInspection:inspection}:{},dependencies:inspection?['draft']:[],resources:['shared']});
const required={required:true,reason:'customer-required',requirementRef:'contract:example-clause-3',dependencyId:'draft'};
async function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sight-inspection-')),budget=openFounderBudget(path.join(dir,'b.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'isolated-test'});const calls=[];let c;const open=()=>c=openFounderController({file:path.join(dir,'c.db'),budget,maxWorkers:1,adapters:{local:{maxCostRappen:0,execute:async({task})=>{calls.push(task.id);return {text:'prepared output'};},verify:()=>true}}});try{open();await run({get c(){return c;},calls,budget,async reopen(){await c.close();open();}});}finally{await c.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}}
test('mandatory inspection waits without a worker or reservation; other work continues; one completion suffices',()=>fixture(async f=>{
 f.c.enqueue(task('draft'));f.c.control('start');await f.c.tick();
 f.c.enqueue(task('a-inspect',required));f.c.enqueue(task('b-auto'));await f.c.tick();
 assert.deepEqual(f.calls,['draft','b-auto']);const t=f.c.snapshot().tasks.find(t=>t.id==='a-inspect');assert.equal(t.inspection.status,'pending');assert.equal(t.attempts,0);assert.equal(f.budget.snapshot().heldRappen,0);
 assert.throws(()=>f.c.recordSightInspection({id:t.id,token:'0'.repeat(64),outcome:'inspected'}));
 f.c.recordSightInspection({id:t.id,token:t.inspection.token,outcome:'inspected'});await f.c.tick();assert.deepEqual(f.calls,['draft','b-auto','a-inspect']);
}));
test('correction request remains durable and cannot be converted to completion for the same result',()=>fixture(async f=>{
 f.c.enqueue(task('draft'));f.c.control('start');await f.c.tick();f.c.enqueue(task('inspect',required));
 const t=f.c.snapshot().tasks.find(t=>t.id==='inspect');f.c.recordSightInspection({id:t.id,token:t.inspection.token,outcome:'corrections-needed'});
 await f.reopen();assert.equal(f.c.snapshot().tasks.find(t=>t.id==='inspect').inspection.status,'corrections-needed');
 assert.throws(()=>f.c.recordSightInspection({id:t.id,token:t.inspection.token,outcome:'inspected'}));await f.c.tick();assert.deepEqual(f.calls,['draft']);
}));
test('inspection cannot occur before result exists; malformed or optional declarations rejected',()=>fixture(async f=>{
 f.c.enqueue(task('draft'));f.c.enqueue(task('inspect',required));assert.throws(()=>f.c.recordSightInspection({id:'inspect',token:'0'.repeat(64),outcome:'inspected'}));
 for(const r of [{...required,required:false},{...required,reason:'nice-to-have'},{...required,requirementRef:''},{...required,dependencyId:'missing'}])assert.throws(()=>f.c.enqueue(task('bad',r)));
}));
test('recording sight inspection while stopped does not start any execution',()=>fixture(async f=>{
 f.c.enqueue(task('draft'));f.c.control('start');await f.c.tick();f.c.enqueue(task('inspect',required));f.c.control('stop');const t=f.c.snapshot().tasks.find(t=>t.id==='inspect');
 f.c.recordSightInspection({id:t.id,token:t.inspection.token,outcome:'inspected'});await f.c.tick();assert.equal(f.c.controlState().status,'stopped');assert.deepEqual(f.calls,['draft']);
}));
test('inspection identifies its wait and rejects a mutated result with a stale digest',()=>fixture(async f=>{
 f.c.enqueue(task('draft'));f.c.control('start');await f.c.tick();f.c.enqueue(task('inspect',required));
 const t=f.c.snapshot().tasks.find(t=>t.id==='inspect');assert.equal(t.waitState.code,'sight-inspection');
 const db=new Database(f.c.databaseFile);try{db.prepare('UPDATE founder_jobs SET result=? WHERE id=?').run('{"changed":true}','draft');}finally{db.close();}
 assert.throws(()=>f.c.recordSightInspection({id:t.id,token:t.inspection.token,outcome:'inspected'}));await f.c.tick();assert.deepEqual(f.calls,['draft']);
}));
test('sight inspection HTTP endpoint requires session, same origin and CSRF and never starts power',async()=>{
 let calls=0;const ui=await startFounderDashboard({store:{},readUsage:async()=>({}),autonomy:{recordSightInspection:b=>{calls++;return b;},snapshot:()=>{throw Error('No broad snapshot');}},power:{isOn:()=>false,control:()=>{throw Error('No start');}}});
 const post=(body,headers={})=>fetch(ui.url+'/api/job/sight-inspection',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  const body={id:'task',token:'a'.repeat(64),outcome:'inspected'};
  assert.equal((await post(body)).status,401);
  const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});const Cookie=login.headers.get('set-cookie').split(';')[0],csrf=(await login.json()).csrf;
  assert.equal((await post(body,{Cookie})).status,403);
  assert.equal((await post(body,{Cookie,'X-Obolus-CSRF':csrf,Origin:'https://foreign.invalid'})).status,403);
  assert.equal(calls,0);assert.equal((await post(body,{Cookie,'X-Obolus-CSRF':csrf})).status,200);assert.equal(calls,1);
 }finally{await ui.close();}
});
