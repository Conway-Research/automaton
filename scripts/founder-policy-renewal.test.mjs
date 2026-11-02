import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createFounderWorker} from './founder-worker.mjs';
import {createFounderConnectors} from './founder-connectors.mjs';

const expires=Date.parse('2026-11-09T00:00:00Z');
const context=(maxCostRappen=0)=>({assertActive(){},signal:new AbortController().signal,task:{input:{}},grant:{reservationId:'isolated-renewal',maxCostRappen},dependencies:[{sources:[{id:'s',url:'https://github.com/example/project/issues/1',claim:'Public evidence'}]}]});

for(const purpose of ['analysis','deliverable','planner','code'])test(`renewed ${purpose} price policy permits bounded fake work and blocks at expiry`,async()=>{
 let at=expires-1,calls=0;
 const worker=createFounderWorker({purpose,apiKey:'sk-isolated-fake',mission:{directive:'Isolated policy test'},now:()=>at,request:async(_url,options)=>{
  calls++;const payload=JSON.parse(options.body);assert.equal(payload.model,'gpt-5.2');assert.equal(payload.max_output_tokens,2000);assert.equal(payload.tools,undefined);
  return Response.json({id:'resp_isolated',status:'completed',usage:{input_tokens:1000,output_tokens:2000},output:[{content:[{type:'output_text',text:'{}'}]}]});
 }});
 assert.equal(worker.available,true);assert.equal(worker.maxCostRappen,50);
 const result=await worker.execute(context(50));assert.equal(result.costReceipt.actualCostRappen,8);assert.equal(result.costEvidence.pricingExpiresAt,'2026-11-09T00:00:00.000Z');
 for(at of [expires,expires+1]){assert.equal(worker.available,false);await assert.rejects(()=>worker.execute(context(50)));}
 assert.equal(calls,1);
});

for(const kind of ['exa-research','firecrawl-research'])test(`${kind} renewal admits only free transport and stops exactly at expiry`,async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-policy-'));let at=expires-1,calls=0;
 const connectors=createFounderConnectors({directory,now:()=>at,firecrawlKeyless:true,request:async(url,options)=>{
  calls++;assert.equal(new Headers(options.headers).has('authorization'),false);assert.equal(new Headers(options.headers).has('cookie'),false);assert.equal(options.credentials,'omit');
  if(kind==='exa-research'){assert.equal(url,'https://mcp.exa.ai/mcp');return Response.json({id:1,result:{content:[{type:'text',text:'Title: Public evidence\nURL: https://github.com/example/project/issues/1\nText: Public evidence'}]}});}
  assert.equal(url,'https://api.firecrawl.dev/v2/scrape');assert.equal(JSON.parse(options.body).proxy,'basic');return Response.json({success:true,data:{markdown:'Public evidence for isolated verification.'}});
 }});
 try{const adapter=connectors.adapters[kind];assert.equal(adapter.available,true);assert.equal(adapter.maxCostRappen,0);const result=await adapter.execute(context());assert.equal(result.costReceipt.actualCostRappen,0);if(kind==='exa-research')assert.equal(result.costEvidence.policyExpiresAt,'2026-11-09T00:00:00.000Z');
  for(at of [expires,expires+1]){assert.equal(adapter.available,false);await assert.rejects(()=>adapter.execute(context()));}assert.equal(calls,1);
 }finally{connectors.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('SOFA keeps its original grant and expires independently of renewed adapters',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-sofa-policy-'));let calls=0,at=Date.parse('2026-10-19T23:59:59.999Z');
 const connectors=createFounderConnectors({directory,now:()=>at,sofaKey:'isolated-fake-key-not-a-secret',request:async()=>{calls++;throw Error('No transport permitted');}});
 try{const adapter=connectors.adapters['sofa-research'];assert.equal(adapter.available,true);await assert.rejects(()=>adapter.execute({...context(),assertActive(){throw Error('OFF');}}),/OFF/);
 for(at of [Date.parse('2026-10-20T00:00:00Z'),Date.parse('2026-10-20T00:00:00.001Z')]){assert.equal(adapter.available,false);await assert.rejects(()=>adapter.execute(context()));assert.equal(connectors.adapters['exa-research'].available,true);}assert.equal(calls,0);
 }finally{connectors.close();fs.rmSync(directory,{recursive:true,force:true});}
});
