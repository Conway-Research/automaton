import test from 'node:test';import assert from 'node:assert/strict';
import {readJSON,createMonitorSources} from './numaron-monitor-sources.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {readSynmercoCredential} from './numaron-monitor-sources.mjs';
test('existing Windows DPAPI credential can be read with isolated fixture and explicit security module',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-dpapi-')),file=path.join(dir,'fixture.dpapi');try{const plain='isolated-fake-key-no-account';const encrypted=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; [Console]::Write((ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force | ConvertFrom-SecureString))"],{input:plain,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','ignore']});fs.writeFileSync(file,encrypted);assert.equal(readSynmercoCredential({file}),plain);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('read transport uses GET only, limits bytes and preserves quota retry',async()=>{
 let options;const ctx={assertActive(){},signal:new AbortController().signal};
 assert.deepEqual(await readJSON('https://api.github.com/user',{},ctx,{request:async(u,o)=>{options=o;return new Response('{"ok":true}');}}),{ok:true});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
 await assert.rejects(()=>readJSON('https://api.github.com/user',{},ctx,{request:async()=>new Response('x'.repeat(20)),maxBytes:10}),e=>e.code==='response-limit');
 await assert.rejects(()=>readJSON('https://api.github.com/user',{},ctx,{request:async()=>new Response('{}',{status:429,headers:{'retry-after':'120'}}),now:()=>1000}),e=>e.retryAt===121000);
});
test('power revocation after request is not a successful empty response',async()=>{
 let on=true;const ctx={assertActive(){if(!on)throw Error('OFF');},signal:new AbortController().signal};await assert.rejects(()=>readJSON('https://api.github.com/user',{},ctx,{request:async()=>{on=false;return new Response('{}');}}),/OFF/);
});
test('discovery advances exactly once only for complete real results, refuses non-API origins',async()=>{
 let calls=0;const sources=createMonitorSources({config:{discoveryNextPage:12,tracked:[]},githubKey:()=>null,request:async(u)=>{calls++;assert.equal(new URL(u).searchParams.get('page'),'1');return new Response(JSON.stringify({items:[{html_url:'https://github.com/example/repo/issues/1',title:'test'}],total_count:3349,incomplete_results:false}),{headers:{'x-ratelimit-remaining':'1'}});}});const d=sources.find(x=>x.id==='github-discovery'),ctx={assertActive(){},signal:new AbortController().signal};const r=await d.run(ctx,{cursor:null});assert.equal(r.cursor.schema,'github-time-partitions-v1');assert.equal(r.cursor.queue.length,2);assert.equal(r.data.coverageComplete,false);assert.equal(calls,1);
 await assert.rejects(()=>readJSON('https://evil.example/',{},ctx),/origin/);
});
test('discovery replaces legacy horizon with persisted smaller windows' ,async()=>{
 const sources=createMonitorSources({config:{discoveryNextPage:33,tracked:[]},githubKey:()=>null,now:()=>1000,request:async()=>new Response(JSON.stringify({items:[{html_url:'https://github.com/test/test/issues/1'}],total_count:5000,incomplete_results:false}),{headers:{'x-ratelimit-remaining':'1'}})});const r=await sources[0].run({assertActive(){},signal:new AbortController().signal},{cursor:33});assert.equal(r.cursor.queue.length,2);assert.equal(r.nextAt,601000);assert.equal(r.data.phase,'split');assert.equal(r.data.coverageComplete,false);
});
test('Gmail renews existing scoped grant without consent or added permissions before read',async()=>{
 const scope={account:'numaronia@gmail.com',labelId:'Label_1',granted:['gmail.readonly']};let saved,calls=[];const old={provider:'google',billingEnabled:false,credential:'expired-test',refreshToken:'refresh-test',expiresAt:Date.now()-1000,scope};
 const localCredential=async(op,options)=>op==='google-access'?old:op==='google-client'?{client_id:'test-id',client_secret:'test-secret'}:op==='google-save'?(saved=options.value,true):null;
 const sources=createMonitorSources({config:{discoveryNextPage:12,tracked:[]},localCredential,request:async(url,options)=>{calls.push(url);if(url==='https://oauth2.googleapis.com/token'){assert.equal(options.method,'POST');const body=new URLSearchParams(options.body);assert.equal(body.get('grant_type'),'refresh_token');assert.equal(body.has('scope'),false);return Response.json({access_token:'new-isolated-test',expires_in:3600});}assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer new-isolated-test');return Response.json({messages:[]});}});
 const result=await sources.find(x=>x.id==='gmail-orders').run({assertActive(){},signal:new AbortController().signal});assert.deepEqual(result.data,{messages:[]});assert.equal(calls.length,2);assert.deepEqual(saved.scope,scope);assert.equal(saved.billingEnabled,false);
});
