import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {createFounderConnectors} from './founder-connectors.mjs';
import {openFounderRuntime} from './founder-runtime.mjs';
import {createFreeLearningAdapters} from './founder-learning-adapters.mjs';

const WINDOW=21600000;
const EVEN=Date.parse('2026-10-19T00:01:00Z');
const enabled={schemaVersion:1,enabled:true,activationApproved:true};
const context=()=>({signal:new AbortController().signal,assertActive(){},grant:{reservationId:'isolated',maxCostRappen:0},task:{input:{learningTopic:'customer-discovery'}},dependencies:[]});
const response=url=>new URL(url).hostname==='127.0.0.1'
 ?Response.json({results:[{url:'https://public.example/method',title:'Public research methods'}]})
 :Response.json({id:1,result:{content:[{type:'text',text:'Title: public task\nURL: https://github.com/example/project/issues/1\nText: Public evidence'}]}});

test('periodic Exa cannot take reserved SearXNG windows even when it is dispatched first',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quota-fair-'));
 let at=EVEN,calls=[];
 const options={directory,now:()=>at,generalWebSearch:enabled,reserveDiscoveryWindows:true,request:async url=>{calls.push(url);return response(url);}};
 let c=createFounderConnectors(options);
 try{
  for(let round=0;round<4;round++){
   const start=calls.length;
   if(round%2===0){
    assert.ok(c.adapters['exa-research'].nextReadyAt>at);
    await assert.rejects(c.adapters['exa-research'].execute(context()),/quota/);
    assert.equal(calls.length,start);
    const result=await c.discovery.execute(context());
    assert.equal(result.provider,'searxng-local');
   }else{
    assert.ok(c.discovery.nextReadyAt>at);
    await assert.rejects(c.discovery.execute(context()),/quota/);
    assert.equal(calls.length,start);
    await c.adapters['exa-research'].execute(context());
   }
   await assert.rejects(c.discovery.execute(context()),/quota/);
   await assert.rejects(c.adapters['exa-research'].execute(context()),/quota/);
   assert.equal(calls.length,start+1);
   c.close();c=createFounderConnectors(options);
   await assert.rejects(c.discovery.execute(context()),/quota/);
   assert.equal(calls.length,start+1);
   at+=WINDOW;
  }
  assert.equal(calls.filter(url=>new URL(url).hostname==='127.0.0.1').length,2);
  assert.equal(calls.length,4);
 }finally{c.close();}
});

test('consumed window remains consumed on activation; fair routing never resets shared receipts',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quota-existing-'));let calls=0;
 const options={directory,now:()=>EVEN,generalWebSearch:enabled,request:async url=>{calls++;return response(url);}};
 let c=createFounderConnectors(options);
 try{
  await c.adapters['exa-research'].execute(context());c.close();
  c=createFounderConnectors({...options,reserveDiscoveryWindows:true});
  await assert.rejects(c.discovery.execute(context()),/quota/);
  assert.equal(calls,1);
  const db=new Database(path.join(directory,'connector-usage.db'),{readonly:true});
  try{assert.equal(db.prepare('SELECT count(*) n FROM exa_attempts').get().n,1);}finally{db.close();}
 }finally{c.close();}
});

test('SearXNG failure retains the three-attempt cap, exponential pauses and Retry-After across reopen',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quota-retry-'));let at=EVEN,calls=0;
 const options={directory,now:()=>at,generalWebSearch:enabled,reserveDiscoveryWindows:true,request:async()=>{calls++;return new Response('',{status:503,headers:{'Retry-After':'600'}});}};
 let c=createFounderConnectors(options);
 try{
  for(let i=0;i<3;i++){
   const before=at;
   await assert.rejects(c.discovery.execute(context()));
   await assert.rejects(c.discovery.execute(context()),/quota/);
   await assert.rejects(c.adapters['exa-research'].execute(context()),/quota/);
   assert.equal(calls,i+1);
   const ready=c.discovery.nextReadyAt;
   assert.ok(ready>=before+600000);
   c.close();c=createFounderConnectors(options);
   assert.equal(c.discovery.nextReadyAt,ready);
   if(i<2)at=ready;
  }
  at+=1200000;
  await assert.rejects(c.discovery.execute(context()),/quota/);
  assert.equal(calls,3);
 }finally{c.close();}
});

test('inactive research reservation or disabled local search leaves ordinary Exa scheduling unchanged',async()=>{
 for(const options of [{reserveDiscoveryWindows:false,generalWebSearch:enabled},{reserveDiscoveryWindows:true,generalWebSearch:{...enabled,activationApproved:false}}]){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quota-disabled-'));let calls=0;
  const c=createFounderConnectors({...options,directory,now:()=>EVEN,request:async url=>{calls++;return response(url);}});
  try{await c.adapters['exa-research'].execute(context());assert.equal(calls,1);}finally{c.close();}
 }
});

test('expired Exa releases odd windows to the existing free catalogues without extra quota',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quota-catalogue-'));let at=Date.parse('2026-11-10T06:01:00Z'),calls=0;
 const c=createFounderConnectors({directory,now:()=>at,generalWebSearch:enabled,reserveDiscoveryWindows:true,request:async url=>{calls++;assert.match(url,/api\.(crossref|datacite)\.org/);return url.includes('crossref')?Response.json({status:'ok',message:{items:[]}}):Response.json({data:[]});}});
 try{assert.equal(c.adapters['exa-research'].available,false);await c.discovery.execute(context());assert.equal(calls,1);await assert.rejects(c.discovery.execute(context()),/quota/);assert.equal(calls,1);}finally{c.close();}
});

test('real controller defers periodic Exa and completes adaptive SearXNG research in the same reserved window',async t=>{
 t.mock.method(Date,'now',()=>EVEN);
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'quota-runtime-'));let on=true,calls=0;
 const c=createFounderConnectors({directory:path.join(base,'connectors'),now:()=>EVEN,generalWebSearch:enabled,reserveDiscoveryWindows:true,request:async url=>{calls++;assert.equal(new URL(url).hostname,'127.0.0.1');return response(url);}});
 const learning=createFreeLearningAdapters({research:c.discovery,getContext:()=>({now:EVEN}),readMetadata:async()=>Buffer.from('<html>Fixture without a content reuse licence</html>'),readData:async()=>{throw Error('No licensed data');}});
 const r=openFounderRuntime({base,adapters:c.adapters,activate:true,isEnabled:()=>on,learningOptions:{enabled:true,activationApproved:true,adapters:learning}});
 try{
  for(let i=0;i<3;i++)await r.cycle();
  const s=r.snapshot();
  assert.equal(s.schedulerError,null);assert.equal(calls,1);
  assert.ok(s.tasks.some(t=>t.kind==='adaptive-learning'&&t.status==='done'));
  assert.ok(!s.tasks.some(t=>t.kind==='exa-research'&&t.status==='done'));
  assert.equal(s.budget.spentRappen,0);assert.equal(s.budget.heldRappen,0);
  assert.equal(s.budget.periodRappen,15000);assert.equal(s.budget.dailyRappen,2000);assert.equal(s.budget.taskRappen,250);
  on=false;await r.cycle();assert.equal(calls,1);
 }finally{await r.close();c.close();}
});

test('OFF, nonzero grants and explicit Exa recovery cannot bypass a reserved learning window',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quota-no-bypass-'));let calls=0;
 const c=createFounderConnectors({directory,now:()=>EVEN,generalWebSearch:enabled,reserveDiscoveryWindows:true,legacyExaRetry:{window:Math.floor(EVEN/WINDOW),at:EVEN-300000,reference:'fake-only',expiresAt:EVEN+60000},request:async url=>{calls++;return response(url);}});
 try{
  await assert.rejects(c.discovery.execute({...context(),assertActive(){throw Error('OFF');}}),/OFF/);
  await assert.rejects(c.discovery.execute({...context(),grant:{reservationId:'paid',maxCostRappen:1}}));
  await assert.rejects(c.adapters['exa-research'].execute(context()),/quota/);
  assert.equal(calls,0);
  await c.discovery.execute(context());assert.equal(calls,1);
 }finally{c.close();}
});

