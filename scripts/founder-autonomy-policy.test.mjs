import test from 'node:test';
import assert from 'node:assert/strict';
import {createFounderWorker} from './founder-worker.mjs';
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('every worker receives approved supplements with unchanged Genesis and bounded authority',async()=>{
 for(const purpose of ['analysis','deliverable','planner']){
  let prompt='';const worker=createFounderWorker({now:fixedNow,purpose,apiKey:'sk-test-private',mission:{directive:'EXACT ORIGINAL GENESIS'},request:async(url,options)=>{prompt=JSON.parse(options.body).instructions;return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:100,output_tokens:1},output:[]});}});
  const r=await worker.execute({task:{input:{}},dependencies:[{sources:[{id:'s',url:'https://example.com',claim:'public demand'}]}],signal:new AbortController().signal,assertActive(){},grant:{reservationId:'test',maxCostRappen:50}});
  assert.ok(prompt.includes('EXACT ORIGINAL GENESIS'));assert.ok(prompt.includes('FOUNDER SUPPLEMENTS 2026-10-13'));
  assert.match(prompt,/CHF 150/);assert.match(prompt,/CHF 20/);assert.match(prompt,/CHF 2\.50/);assert.match(prompt,/Start, Pause, Fortsetzen, Ausschalten und Not-Aus/);
  assert.match(prompt,/selbstständig/);assert.equal(r.mission.supplementsVersion,'2026-10-15.1');assert.equal(JSON.stringify(r).includes('EXACT ORIGINAL GENESIS'),false);
 }
});
test('restored configured access is picked up without restarting the service',async()=>{
 let key='sk-old-private',sent=[];const worker=createFounderWorker({now:fixedNow,getApiKey:()=>key,mission:{directive:'Genesis'},request:async(url,options)=>{sent.push(options.headers.Authorization);return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:1,output_tokens:1},output:[]});}});
 const ctx={task:{input:{}},dependencies:[{sources:[{id:'s',url:'https://example.com',claim:'public demand'}]}],signal:new AbortController().signal,assertActive(){},grant:{reservationId:'test',maxCostRappen:50}};
 assert.equal(worker.available,true);const revision=worker.accessRevision;await worker.execute(ctx);key='sk-new-private';assert.notEqual(worker.accessRevision,revision);await worker.execute(ctx);assert.deepEqual(sent,['Bearer sk-old-private','Bearer sk-new-private']);
});
