import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startFounderDashboard} from './founder-dashboard.mjs';

async function fixture(options={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-sessions-')),loginFile=path.join(directory,'login.json');
 let providerCalls=0,mutations=0;
 const provider=async()=>{providerCalls++;throw Error('No provider calls in OFF test');};
 const ui=await startFounderDashboard({loginFile,store:{snapshot:()=>({}),review:()=>{mutations++;return {};}},power:{isOn:()=>false,snapshot:()=>({enabled:false,status:'off'})},readUsage:provider,readTrading:provider,readFinance:provider,readStripe:provider,readCoinbase:provider,...options});
 const token=()=>new URL(JSON.parse(fs.readFileSync(loginFile)).loginUrl).hash.slice(1);
 const request=(route,{cookie,csrf,body,origin=ui.url}={})=>fetch(ui.url+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-Obolus-CSRF':csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 const login=async(cookie)=>{const response=await request('/api/session',{cookie,body:{token:token()}});assert.equal(response.status,200);return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrf};};
 return {ui,request,login,token,counts:()=>({providerCalls,mutations}),close:async()=>{await ui.close();fs.rmSync(directory,{recursive:true,force:true});}};
}

test('separate status logins preserve both browser sessions and bind CSRF to each session',async()=>{
 const f=await fixture();try{
  const first=await f.login(),second=await f.login();
  assert.notEqual(first.cookie,second.cookie);assert.notEqual(first.csrf,second.csrf);
  for(const session of [first,second]){const r=await f.request('/api/snapshot',session);assert.equal(r.status,200);assert.equal((await r.json()).csrf,session.csrf);}
  assert.equal((await f.request('/api/review',{...first,body:{id:'fake',digest:'fake'}})).status,200);
  assert.equal((await f.request('/api/review',{...first,csrf:second.csrf,body:{id:'fake',digest:'fake'}})).status,403);
  assert.equal((await f.request('/api/snapshot',second)).status,200);
  assert.deepEqual(f.counts(),{providerCalls:0,mutations:1});
 }finally{await f.close();}
});

test('reopening launcher in same browser preserves its cookie and CSRF for existing tabs',async()=>{
 const f=await fixture();try{const first=await f.login(),again=await f.login(first.cookie);assert.deepEqual(again,first);assert.equal((await f.request('/api/power',first)).status,200);assert.equal((await f.request('/api/review',{...first,body:{id:'fake',digest:'fake'}})).status,200);}finally{await f.close();}
});

test('sessions expire independently; activity on another session never revives an expired one',async()=>{
 let now=1000;const f=await fixture({now:()=>now,sessionMs:100});try{const first=await f.login();now=1050;const second=await f.login();assert.equal((await f.request('/api/power',first)).status,200);now=1101;assert.equal((await f.request('/api/power',second)).status,200);now=1151;assert.equal((await f.request('/api/power',first)).status,401);assert.equal((await f.request('/api/power',second)).status,200);now=1252;assert.equal((await f.request('/api/power',second)).status,401);const third=await f.login();assert.equal((await f.request('/api/power',third)).status,200);assert.equal((await f.request('/api/power',first)).status,401);}finally{await f.close();}
});

test('session capacity refuses new clients without evicting the browser and recovers after expiry',async()=>{
 let now=1000;const f=await fixture({now:()=>now,sessionMs:100});try{
  const first=await f.login();for(let i=1;i<256;i++)await f.login();
  const lastToken=f.token();assert.equal((await f.request('/api/session',{body:{token:lastToken}})).status,429);
  assert.equal(f.token(),lastToken);assert.equal((await f.request('/api/power',first)).status,200);
  assert.deepEqual(await f.login(first.cookie),first);
  now=1101;assert.equal((await f.request('/api/power',first)).status,401);await f.login();
 }finally{await f.close();}
});

test('launcher tokens remain single-use and invalid or foreign logins do not disrupt active sessions',async()=>{
 const f=await fixture();try{const consumed=f.token(),first=await f.login();for(const body of [{token:consumed},{token:'wrong'}])assert.equal((await f.request('/api/session',{body})).status,403);assert.equal((await f.request('/api/session',{body:{token:f.token()},origin:'https://evil.example'})).status,403);assert.equal((await f.request('/api/power',first)).status,200);assert.equal((await f.request('/api/power')).status,401);assert.deepEqual(f.counts(),{providerCalls:0,mutations:0});}finally{await f.close();}
});

test('power audit IDs persist on same-session login and differ across independent sessions',async()=>{
 const contexts=[];const f=await fixture({power:{isOn:()=>false,snapshot:()=>({enabled:false,revision:0}),control(_command,context){contexts.push(context);return {enabled:false,revision:1}}}});
 try{const first=await f.login(),same=await f.login(first.cookie),second=await f.login();
  for(const session of [first,same,second])assert.equal((await f.request('/api/power',{...session,body:{enabled:false,revision:0}})).status,200);
  assert.equal(contexts[0].sessionId,contexts[1].sessionId);assert.notEqual(contexts[0].sessionId,contexts[2].sessionId);
  for(const c of contexts){assert.match(c.sessionId,/^[a-f0-9]{32}$/);assert.deepEqual(Object.keys(c).sort(),['route','sessionId']);assert.equal(c.route,'/api/power');}
  assert.deepEqual(f.counts(),{providerCalls:0,mutations:0});
 }finally{await f.close()}
});
