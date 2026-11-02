import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {startFounderDashboard} from './founder-dashboard.mjs';
test('expired session renews using fresh private one-time link, without power changes or server restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-auth-'));let now=1000,powerCalls=0;const loginFile=path.join(dir,'login.json');
 const ui=await startFounderDashboard({now:()=>now,sessionMs:1000,loginFile,power:{snapshot:()=>({enabled:false,revision:1}),control(){powerCalls++;throw Error('No power changes');}}});
 const post=token=>fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token})});
 try{
  assert.ok(fs.existsSync(loginFile),'private login file missing');const first=JSON.parse(fs.readFileSync(loginFile));const old=new URL(first.loginUrl).hash.slice(1);
  const auth=await post(old);assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie').split(';')[0];assert.equal((await post(old)).status,403);
  const fresh=JSON.parse(fs.readFileSync(loginFile));assert.notEqual(fresh.loginUrl,first.loginUrl);now=2500;
  assert.equal((await fetch(ui.url+'/api/power',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await post(new URL(fresh.loginUrl).hash.slice(1))).status,200);assert.equal(powerCalls,0);
  const cross=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json'},body:JSON.stringify({token:new URL(JSON.parse(fs.readFileSync(loginFile)).loginUrl).hash.slice(1)})});assert.equal(cross.status,403);
 }finally{await ui.close();fs.rmSync(dir,{recursive:true,force:true});}
});
