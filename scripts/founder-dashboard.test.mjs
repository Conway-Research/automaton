import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createFounderStore,startFounderDashboard as startDashboard} from './founder-dashboard.mjs';
const startFounderDashboard=(options={})=>startDashboard({readUsage:async()=>({status:'fake-disabled'}),...options});
test('finance polling uses fresh budget-only projection without full runtime traversal or providers while OFF',async()=>{
 let calls=0,reads=0;const budget={periodRappen:15000,spentRappen:1};
 const ui=await startFounderDashboard({power:{isOn:()=>false},autonomy:{budgetSnapshot:()=>{reads++;return {...budget};},snapshot:()=>{calls++;throw Error('Expensive full snapshot must not run');}},readFinance:async()=>{throw Error('No provider while OFF');}});
 try{
  assert.equal((await fetch(ui.url+'/api/finance/snapshot')).status,401);assert.equal(reads,0);
  const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});const Cookie=login.headers.get('set-cookie').split(';')[0];
  for(const spent of [1,2]){budget.spentRappen=spent;const response=await fetch(ui.url+'/api/finance/snapshot',{headers:{Cookie}});assert.equal(response.status,200);const data=await response.json();assert.equal(data.financeBudget.spentRappen,spent);assert.equal(data.financeStatus.reportAvailable,false);}
  assert.equal(reads,2);assert.equal(calls,0);
 }finally{await ui.close();}
});
test('communication status is authenticated and purely local; it never invokes provider snapshots',async()=>{
 let calls=0;const status={enabled:false,supported:['github','ugig','dealwork'],externalWriteVerification:'not-checked-offline'};
 const ui=await startFounderDashboard({autonomy:{communicationStatus:()=>status,snapshot:()=>{throw Error('Full runtime snapshot not needed');}},readTrading:async()=>{calls++;throw Error('No provider calls');},readStripe:async()=>{calls++;throw Error('No provider calls');}});
 try{assert.equal((await fetch(ui.url+'/api/communication/status')).status,401);const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});const Cookie=login.headers.get('set-cookie').split(';')[0];const r=await fetch(ui.url+'/api/communication/status',{headers:{Cookie}});assert.equal(r.status,200);assert.deepEqual((await r.json()).communication,status);assert.equal(calls,0);}finally{await ui.close();}
});
test('usage aggregates require founder authentication and preserve the data timestamp',async()=>{
 const usage={status:'connected',projectId:878459,observedAt:'2026-10-13T14:00:00.000Z',pageViews:2,dashboardViews:1};
 const ui=await startFounderDashboard({readUsage:async()=>usage});
 try{
  assert.equal((await fetch(ui.url+'/api/snapshot')).status,401);
  const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});
  const Cookie=login.headers.get('set-cookie').split(';')[0];
  const result=await(await fetch(ui.url+'/api/snapshot',{headers:{Cookie}})).json();
  assert.deepEqual(result.usage,usage);
 }finally{await ui.close();}
});
test('autonomy control and results require session, CSRF and current revision',async()=>{
 let revision=2;const autonomy={snapshot:()=>({status:'paused',revision,capabilities:[{kind:'research',status:'verified'}]}),control(input){if(input.revision!==revision)throw Error('Conflict');revision++;return this.snapshot();},result(id){if(id!=='task1')throw Error('Unknown');return {text:'<script>data only</script>'};}};
 const ui=await startFounderDashboard({autonomy});const post=(route,body,headers={})=>fetch(ui.url+route,{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{assert.equal((await fetch(ui.url+'/api/capabilities')).status,401);const login=await post('/api/session',{token:new URL(ui.loginUrl).hash.slice(1)}),cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();const headers={Cookie:cookie,'X-Obolus-CSRF':csrf};assert.equal((await post('/api/control',{action:'resume',revision:2},{Cookie:cookie})).status,403);assert.equal((await post('/api/control',{action:'resume',revision:1},headers)).status,409);assert.equal((await post('/api/control',{action:'resume',revision:2},headers)).status,200);const result=await fetch(ui.url+'/api/results/task1',{headers});assert.equal(result.status,200);assert.equal((await result.json()).text,'<script>data only</script>');assert.equal((await fetch(ui.url+'/api/results/%2e%2e%2fsecret',{headers})).status,403);assert.equal((await fetch(ui.url+'/api/capabilities',{headers})).status,200);}finally{await ui.close();}
});

test('version-bound reviews are idempotent, invalidate on changes, never grant execution',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-ui-'));
 try{fs.mkdirSync(path.join(base,'products'));const file=path.join(base,'products/angebotscheck-v1.md');fs.writeFileSync(file,'Synthetic product');const store=createFounderStore(base);const p=store.snapshot().products[0];assert.equal(p.available,true);assert.throws(()=>store.review({id:p.id,digest:'wrong'}));store.review({id:p.id,digest:p.digest});store.review({id:p.id,digest:p.digest});assert.equal(store.snapshot().audit.length,1);assert.equal(store.snapshot().liveReady,false);assert.equal(store.snapshot().productionAccepted,false);fs.writeFileSync(file,'Changed');assert.equal(store.snapshot().products[0].reviewed,false);assert.throws(()=>store.review({id:p.id,digest:p.digest}));assert.throws(()=>store.review({id:p.id,digest:p.digest,execute:true}));assert.throws(()=>store.document('../../package.json'));assert.equal(createFounderStore(base).snapshot().audit.length,0);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('absent and oversized files stay unavailable',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-ui-'));
 try{const store=createFounderStore(base);assert.equal(store.snapshot().products[0].available,false);fs.mkdirSync(path.join(base,'products'));fs.writeFileSync(path.join(base,'products/angebotscheck-v1.md'),Buffer.alloc(1048577));assert.equal(store.snapshot().products[0].available,false);}finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('loopback authentication, CSRF, one-time login, restricted actions and downloads',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'founder-ui-'));fs.mkdirSync(path.join(base,'products'));fs.writeFileSync(path.join(base,'products/angebotscheck-v1.md'),'<script>untrusted</script>');
 const ui=await startFounderDashboard({store:createFounderStore(base)});
 function call(route,body,headers={}){return new Promise((resolve,reject)=>{const req=http.request(ui.url+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Origin:ui.url,...headers}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);if(body!==undefined)req.write(JSON.stringify(body));req.end();});}
 try{
  assert.equal((await call('/api/snapshot')).status,401);
  assert.equal((await call('/',undefined,{Host:'evil.example'})).status,403);
  assert.equal((await call('/',undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await call('/',undefined,{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document','Sec-Fetch-User':'?1'})).status,200);
  assert.equal((await call('/api/snapshot',undefined,{'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document','Sec-Fetch-User':'?1'})).status,403);
  const page=await call('/');assert.equal(page.status,200);assert.ok(!page.text.includes(ui.loginUrl.split('#')[1]));assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
  assert.equal((await call('/api/session',{token:ui.loginUrl.split('#')[1]},{Origin:'https://evil.example'})).status,403);
  const auth=await call('/api/session',{token:ui.loginUrl.split('#')[1]});assert.equal(auth.status,200);
  assert.equal((await call('/api/session',{token:ui.loginUrl.split('#')[1]})).status,403);
  const cookie=auth.headers['set-cookie'][0].split(';')[0],csrf=JSON.parse(auth.text).csrf;
  assert.match(auth.headers['set-cookie'][0],/HttpOnly; SameSite=Strict/);
  const headers={Cookie:cookie,'X-Obolus-CSRF':csrf};const state=JSON.parse((await call('/api/snapshot',undefined,headers)).text),p=state.products[0];
  assert.equal((await call('/api/review',{id:p.id,digest:p.digest},{Cookie:cookie})).status,403);
  assert.equal((await call('/api/review',{id:p.id,digest:p.digest},headers)).status,200);
  for(const route of ['/api/control','/api/execute','/api/budget','/api/publish','/api/trade'])assert.equal((await call(route,{action:'start'},headers)).status,403);
  assert.equal((await call('/product/angebotscheck-v1')).status,401);
  const doc=await call('/product/angebotscheck-v1',undefined,headers);assert.equal(doc.status,200);assert.match(doc.headers['content-type'],/text\/plain/);assert.equal(doc.text,'<script>untrusted</script>');
  assert.equal((await call('/product/../../package.json',undefined,headers)).status,403);
  assert.equal((await call('/api/review',{id:'x'.repeat(3000)},headers)).status,413);
 }finally{await ui.close();fs.rmSync(base,{recursive:true,force:true});}
});

test('job retries require session and CSRF and financial evidence comes from stored verified results',async()=>{
 let calls=0;const autonomy={snapshot:()=>({tasks:[{id:'finance',kind:'finance-report',status:'done',updated_ms:1}]}),retry(input){assert.deepEqual(input,{id:'retry',updatedMs:1});calls++;return this.snapshot();},result:()=>({transactions:[],coverage:{complete:false}})};
 const ui=await startFounderDashboard({autonomy});const post=(route,body,headers={})=>fetch(ui.url+route,{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{assert.equal((await post('/api/job/retry',{id:'retry',updatedMs:1})).status,401);const login=await post('/api/session',{token:new URL(ui.loginUrl).hash.slice(1)}),cookie=login.headers.get('set-cookie').split(';')[0],{csrf}=await login.json();assert.equal((await post('/api/job/retry',{id:'retry',updatedMs:1},{Cookie:cookie})).status,403);assert.equal(calls,0);assert.equal((await post('/api/job/retry',{id:'retry',updatedMs:1},{Cookie:cookie,'X-Obolus-CSRF':csrf})).status,200);assert.equal(calls,1);const s=await (await fetch(ui.url+'/api/snapshot',{headers:{Cookie:cookie}})).json();assert.deepEqual(s.financeReport.transactions,[]);assert.equal((await fetch(ui.url+'/model.mjs')).status,200);}finally{await ui.close();}
});

test('fresh read-only finance report is cached and takes precedence over historical aggregates',async()=>{
 let calls=0;const ui=await startFounderDashboard({readFinance:async()=>{calls++;return {status:'reconciled-provider',transactions:[],coverage:{complete:true,from:1,to:2}};}});
 try{const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{Origin:ui.url,'Content-Type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});const Cookie=login.headers.get('set-cookie').split(';')[0];for(let i=0;i<2;i++){const s=await(await fetch(ui.url+'/api/snapshot',{headers:{Cookie}})).json();assert.equal(s.financeReport.status,'reconciled-provider');assert.deepEqual(s.financeReport.transactions,[]);}assert.equal(calls,1);}finally{await ui.close();}
});
