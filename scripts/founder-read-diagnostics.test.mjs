import test from 'node:test';import assert from 'node:assert/strict';
import {createOutreachTransports} from './founder-outreach-transports.mjs';
import {classifyLocalFailure,communicationRetryAllowed} from './founder-failure-classification.mjs';
const url='https://github.com/example/project/issues/1';
for(const repo of ['applications','conversations'])test('repository name does not determine operation: '+repo,async()=>{
 const t=createOutreachTransports({isEnabled:()=>true,githubKey:()=> 'fake',request:async u=>{if(u.endsWith('/user'))return Response.json({login:'tricebr'});throw Object.assign(Error('private'),{name:'TimeoutError'});}}).github;
 await assert.rejects(t.inspect('https://github.com/example/'+repo+'/issues/1',{}),e=>{assert.equal(classifyLocalFailure(e).readOperation,'job');return true;});
});
for(const phase of ['headers','body','decode'])test('safe GET diagnostics identify '+phase,async()=>{
 let clock=10;
 const t=createOutreachTransports({isEnabled:()=>true,githubKey:()=> 'secret-key',now:()=>clock,request:async()=>{clock=35;if(phase==='headers')throw Object.assign(Error('secret-response'),{name:'TimeoutError'});if(phase==='body')return {ok:true,body:{getReader:()=>({read:async()=>{throw Object.assign(Error('secret-body'),{name:'TimeoutError'});},cancel:async()=>{}})}};return new Response('private-invalid-json');}}).github;
 await assert.rejects(t.inspect(url,{}),e=>{const d=classifyLocalFailure(e);assert.equal(d.readPhase,phase);assert.equal(d.readOperation,'identity');assert.equal(d.readSource,'github');assert.equal(d.readElapsedMs,25);assert(!JSON.stringify(d).includes('secret'));assert(!JSON.stringify(d).includes('private'));assert.equal(communicationRetryAllowed(e),phase!=='decode');return true;});
});
test('OFF performs no request and carries no fabricated read phase',async()=>{let n=0;const t=createOutreachTransports({isEnabled:()=>false,request:async()=>{n++;}}).github;await assert.rejects(t.inspect(url,{}),e=>{assert.equal(classifyLocalFailure(e).readPhase,undefined);return true;});assert.equal(n,0);});
test('diagnostic metadata rejects arbitrary strings and invalid elapsed times',()=>{const e=Object.assign(Error('private'),{communicationRead:{source:'secret',operation:'https://private',phase:'private',elapsedMs:-1}});assert.deepEqual(classifyLocalFailure(e),{code:'local_read_failed'});});
for(const operation of ['job','messages'])test('GitHub failure identifies '+operation+' without target IDs',async()=>{
 const t=createOutreachTransports({isEnabled:()=>true,githubKey:()=> 'fake',request:async u=>{
  if(u.endsWith('/user'))return Response.json({login:'tricebr'});
  if(operation==='messages'&&!u.includes('/comments'))return Response.json({html_url:url,state:'open',author_association:'OWNER',assignees:[],title:'Python tests',body:'AI-assisted contributions allowed. Reward: USD 50'});
  throw Object.assign(Error('secret-target'),{name:'TimeoutError'});
 }}).github;
 await assert.rejects(t.inspect(url,{}),e=>{const d=classifyLocalFailure(e);assert.equal(d.readOperation,operation);assert.equal(d.readPhase,'headers');assert(!JSON.stringify(d).includes('example'));return true;});
});
test('POST timeout is not annotated as a safe read',async()=>{
 const t=createOutreachTransports({isEnabled:()=>true,githubKey:()=> 'fake',request:async()=>{throw Object.assign(Error('private'),{name:'TimeoutError'});}}).github;
 await assert.rejects(t.send({body:'fake'},{endpoint:'/repos/example/project/issues/1'},{}),e=>{assert.equal(e.communicationRead,undefined);assert.equal(classifyLocalFailure(e).readPhase,undefined);return true;});
});
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderController} from './founder-controller.mjs';import {openFounderBudget} from './founder-budget.mjs';
test('controller retains only safe read diagnostics across reopen in temporary database',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'read-phase-')),budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'synthetic'});let c;
 const t=createOutreachTransports({isEnabled:()=>true,githubKey:()=> 'fake',request:async()=>{throw Object.assign(Error('private-secret-body'),{name:'TimeoutError'});}}).github;
 const options={file:path.join(dir,'controller.db'),budget,adapters:{read:{maxCostRappen:0,execute:()=>t.inspect(url,{}),verify:()=>false}}};
 try{c=openFounderController(options);c.enqueue({id:'read-1',rootTaskId:'read-1',kind:'read',input:{},dependencies:[],resources:[]});c.control('start');await c.tick();await c.close();c=openFounderController(options);
  const d=c.snapshot().tasks.find(x=>x.id==='read-1').diagnostic;assert.equal(d.readOperation,'identity');assert.equal(d.readPhase,'headers');assert.equal(d.code,'service_timeout');assert(!JSON.stringify(d).includes('private'));
 }finally{await c?.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('merged diagnostics preserve bounded cancellation of an uncooperative body',async()=>{
 const abort=new AbortController();let began,cancelled=0;const ready=new Promise(r=>began=r);
 const t=createOutreachTransports({isEnabled:()=>true,githubKey:()=> 'fake',request:async()=>({ok:true,body:{getReader:()=>({read:()=>{began();return new Promise(()=>{});},cancel:()=>{cancelled++;return new Promise(()=>{});}})}})}).github;
 const pending=t.inspect(url,{signal:abort.signal});await ready;abort.abort(new DOMException('synthetic','TimeoutError'));
 await assert.rejects(pending,e=>{const d=classifyLocalFailure(e);assert.equal(d.code,'service_timeout');assert.equal(d.readPhase,'body');return true;});assert.equal(cancelled,1);
});
