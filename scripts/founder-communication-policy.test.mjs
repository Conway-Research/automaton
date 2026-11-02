import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {openFounderCommunication} from './founder-communication.mjs';
for(const message of ['Job not eligible for autonomous communication','Explicit reward required','Job outside supported technical profiles'])test('policy outcome is a completed no-send decision: '+message,async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'communication-policy-'));let writes=0;const service=openFounderCommunication({file:path.join(dir,'c.db'),isEnabled:()=>true,transports:{github:{inspect:async()=>{throw Error(message);},send:async()=>writes++}}});try{const r=await service.adapter.execute({task:{input:{url:'https://github.com/example/repo/issues/1'}},assertActive(){}});assert.equal(r.status,'blocked');assert.equal(r.reason,'policy_blocked');assert.equal(service.adapter.verify(r),true);assert.equal(writes,0);}finally{service.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('network errors are not converted to policy decisions',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'communication-network-'));const s=openFounderCommunication({file:path.join(dir,'c.db'),isEnabled:()=>true,transports:{github:{inspect:async()=>{throw Error('Communication HTTP 403');}}}});try{await assert.rejects(s.adapter.execute({task:{input:{url:'https://github.com/example/repo/issues/1'}}}),/403/);}finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}});

for(const [failure,delay] of [['Explicit reward required',86400000],['timeout',3600000]])test('target cooldown survives reopening and does not suppress other targets: '+failure,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'communication-cooldown-')),file=path.join(dir,'c.db');let now=1000000,s;
 const url='https://github.com/example/repo/issues/1',other='https://github.com/example/repo/issues/2',jobs=[];
 const options={file,isEnabled:()=>true,now:()=>now,transports:{github:{inspect:async()=>{throw failure==='timeout'?new DOMException('fake','TimeoutError'):Error(failure);},send:async()=>assert.fail('must not send')}}};
 const controller={hasTask:()=>false,planningHistory:()=>[],enqueue:t=>jobs.push(t)};
 try{s=openFounderCommunication(options);s.advance(controller,[{rootTaskId:'root',sources:[{url}]}]);
 const run=s.adapter.execute({task:{input:{url}},assertActive(){}});if(failure==='timeout')await assert.rejects(run);else assert.equal((await run).policyReason,'explicit_reward_missing');
 s.close();s=openFounderCommunication(options);now+=600001;s.advance(controller,[]);assert.equal(jobs.length,1);
 s.advance(controller,[{rootTaskId:'other',sources:[{url:other}]}]);assert.equal(jobs.length,2);assert.equal(jobs[1].input.url,other);
 now=1000000+delay;s.advance(controller,[]);assert.equal(jobs.at(-1).input.url,url);
 }finally{s?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
