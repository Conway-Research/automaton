import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startFounderDashboard} from './founder-dashboard.mjs';

test('isolated HTTP server logs login, expiry and CSRF denial without secrets or changing power',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-http-audit-')),file=path.join(dir,'http.jsonl');let at=1000,controls=0;
 const ui=await startFounderDashboard({port:0,auditFile:file,now:()=>at,sessionMs:100,power:{isOn:()=>false,snapshot:()=>({enabled:false,revision:0}),control(){controls++;throw Error('must never control power');}},readUsage:async()=>({status:'test'})});
 try{const post=async(route,body,extra={})=>fetch(ui.url+route,{method:'POST',headers:{origin:ui.url,'content-type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await fetch(ui.url+'/api/power?token=QUERYSECRET')).status,401);
 assert.equal((await post('/api/session',{token:'BODYSECRET'})).status,403);
 assert.equal((await post('/api/session',{token:'BODYSECRET'},{origin:'https://attacker.invalid'})).status,403);
 const token=new URL(ui.loginUrl).hash.slice(1),auth=await post('/api/session',{token});assert.equal(auth.status,200);const cookie=auth.headers.get('set-cookie').split(';')[0],csrf=(await auth.json()).csrf;
 assert.equal((await post('/api/power',{enabled:false,revision:0},{cookie})).status,403);
 at+=101;assert.equal((await fetch(ui.url+'/api/power',{headers:{cookie}})).status,401);
 await ui.close();const raw=fs.readFileSync(file,'utf8'),rows=raw.trim().split('\n').map(JSON.parse);
 for(let secret of ['QUERYSECRET','BODYSECRET',token,cookie,csrf])assert.equal(raw.includes(secret),false);
 assert.equal(rows.length,6);assert.equal(rows.filter(r=>r.event==='login'&&r.status===200).length,1);
 assert.ok(rows.some(r=>r.reason==='origin-host'));assert.ok(rows.some(r=>r.reason==='session-expired'));assert.ok(rows.some(r=>r.route==='/api/power'&&r.status===403&&r.sessionRef));assert.equal(controls,0);
 }finally{await ui.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('audit storage failure does not relax or interrupt HTTP authentication',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-http-audit-'));
 const ui=await startFounderDashboard({port:0,auditFile:dir,readUsage:async()=>({status:'test'})});
 try{assert.equal((await fetch(ui.url+'/api/power')).status,401);
 const token=new URL(ui.loginUrl).hash.slice(1),auth=await fetch(ui.url+'/api/session',{method:'POST',headers:{origin:ui.url,'content-type':'application/json'},body:JSON.stringify({token})});
 assert.equal(auth.status,200);await auth.json();assert.ok(ui.auditStatus().errors>=2);
 }finally{await ui.close();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
