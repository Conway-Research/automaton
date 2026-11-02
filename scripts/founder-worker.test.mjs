import test from 'node:test';import assert from 'node:assert/strict';
import {createFounderWorker} from './founder-worker.mjs';
// Synthetic response fixtures must reach provider validation inside the reviewed price interval.
const reviewedPricingNow=()=>Date.parse('2026-10-18T00:01:00Z');
test('actual model request receives a late PR merge event with partial coverage and unchanged limits',async()=>{
 let calls=0;const w=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-isolated-test',mission:{directive:'test'},request:async(url,o)=>{calls++;const b=JSON.parse(o.body),s=JSON.parse(b.input).sources[0];assert.match(s.claim,/merged commit abc/);assert.equal(s.excerpt.complete,false);assert.ok(s.claim.length<=450);assert.equal(b.model,'gpt-5.2');assert.equal(b.max_output_tokens,2000);assert.match(JSON.parse(b.input).responseInstruction,/missing facts remain unknown/);return Response.json({error:{code:'invalid_request_error'}},{status:400});}});
 await assert.rejects(()=>w.execute({task:{input:{researchGoal:'PR #142 prüfen'}},dependencies:[{sources:[{id:'s',url:'https://github.com/o/r/pull/142',claim:'intro '.repeat(250)+'\nmerged commit abc into main on Oct 10, 2026'}]}],grant:{reservationId:'isolated',maxCostRappen:50},signal:new AbortController().signal,assertActive(){}}));assert.equal(calls,1);
});
test('server errors and malformed responses never manufacture zero-cost receipts',async()=>{
 for(const response of [Response.json({error:{code:'server_error'}},{status:500,headers:{'x-request-id':'req_error'}}),new Response('bad json')]){
  let calls=0;const events=[],w=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async()=>{calls++;return response;}});
  await assert.rejects(()=>w.execute({task:{input:{}},dependencies:[{sources:[{id:'s',claim:'public'}]}],grant:{reservationId:'run',maxCostRappen:50},signal:new AbortController().signal,assertActive(){},recordProviderEvent:e=>events.push(e)}));
  assert.equal(calls,1);assert.ok(events.some(e=>e.stage==='dispatch'));
  assert.ok(!events.some(e=>e.costReceipt));
 }
});
test('rate rejection records safe diagnostic, request correlation and zero usage receipt',async()=>{
 const events=[];let sent;
 const w=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async(u,o)=>{sent=o;return Response.json({error:{code:'rate_limit_exceeded',message:'never log sk-secret or private input'}},{status:429,headers:{'x-request-id':'req_rate','retry-after':'60'}});}});
 await assert.rejects(()=>w.execute({task:{input:{}},dependencies:[{sources:[{id:'s',claim:'public'}]}],grant:{reservationId:'run-test',maxCostRappen:50},signal:new AbortController().signal,assertActive(){},recordProviderEvent:e=>events.push(e)}));
 assert.equal(sent.headers['X-Client-Request-Id'],'run-test');
 assert.ok(events.some(e=>e.stage==='dispatch'));
 assert.ok(events.some(e=>e.stage==='rejected'&&e.code==='rate_limit_exceeded'&&e.costReceipt.actualCostRappen===0&&e.retryAfterMs>=60000));
 assert.ok(!JSON.stringify(events).includes('sk-secret'));
});
test('placeholder credentials are blocked before any budgeted provider work',()=>{assert.equal(createFounderWorker({now:reviewedPricingNow,apiKey:'not-a-real-key'}).available,false);});

test('pricing expiry blocks a valid worker before dispatch at the exact boundary and current offline date',async()=>{
 const expires=Date.parse('2026-11-09T00:00:00Z');
 const options={apiKey:'sk-isolated-test',mission:{directive:'test'}};
 assert.equal(createFounderWorker({...options,now:()=>expires-1}).available,true);
 for(const at of [expires,Date.parse('2026-11-15T00:00:00Z')]){
  let calls=0;const events=[],worker=createFounderWorker({...options,now:()=>at,request:async()=>{calls++;throw Error('Expired policy must not dispatch');}});
  assert.equal(worker.available,false);assert.match(worker.reason,/abgelaufen/);
  await assert.rejects(()=>worker.execute({task:{input:{}},dependencies:[{sources:[{id:'s',claim:'Synthetic source'}]}],grant:{reservationId:'expired-policy',maxCostRappen:50},signal:new AbortController().signal,assertActive(){},recordProviderEvent:event=>events.push(event)}),/Budget or provider unavailable/);
  assert.equal(calls,0);assert.deepEqual(events,[]);
 }
});

test('JSON mode explicitly instructs the input and retains model, output and budget bounds',async()=>{
 const w=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async(u,o)=>{
  const body=JSON.parse(o.body);assert.match(body.input,/\bJSON\b/);assert.equal(body.model,'gpt-5.2');assert.equal(body.max_output_tokens,2000);assert.equal(body.reasoning.effort,'none');
  return Response.json({error:{type:'invalid_request_error',param:'input',message:'sensitive prompt sk-private'}},{status:400,headers:{'x-request-id':'req_json'}});
 }});const events=[];
 await assert.rejects(()=>w.execute({task:{input:{}},dependencies:[{sources:[{id:'s',claim:'public'}]}],grant:{reservationId:'run',maxCostRappen:50},signal:new AbortController().signal,assertActive(){},recordProviderEvent:e=>events.push(e)}));
 const rejection=events.find(e=>e.stage==='rejected');assert.equal(rejection.code,'invalid_request_error');assert.equal(rejection.parameter,'input');assert.ok(rejection.requestRevision);assert.equal(rejection.costReceipt.actualCostRappen,0);assert.ok(!JSON.stringify(events).includes('sk-private'));
});
test('deliverable adapter requires an actual bounded working document instead of only a next step',()=>{
 const a=createFounderWorker({now:reviewedPricingNow,apiKey:'test',purpose:'deliverable'}),r={kind:'private-draft',status:'completed',sources:[{id:'s'}],analysis:{summary:'This is a useful source-grounded document summary.',sourceIds:['s'],nextStep:'Verify demand separately',limitations:['Unverified demand']}};
 assert.equal(a.verify(r),false);assert.equal(a.verify({...r,analysis:{...r.analysis,deliverableMarkdown:'# Arbeitsvorlage\n'+('Konkreter Prüfschritt mit belegbarer Eingabe und Ausgabe. '.repeat(8))}}),true);
});
test('worker requires controller grant, bounded source input and verified output; never exposes credentials',async()=>{
 let calls=0;const a=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'Test founder mission'},request:async(url,o)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');const b=JSON.parse(o.body);assert.match(b.instructions,/numaron is the working agent/);assert.equal(b.text.format.type,'json_object');assert.equal(b.store,false);assert.equal(b.max_output_tokens,2000);assert.equal(b.tools,undefined);return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:120,output_tokens:60},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Private Analyse der gemeldeten Nachfrage, keine Bestätigung.',sourceIds:['source1'],nextStep:'Zweite unabhängige Quelle prüfen',limitations:['Nachfrage unbestätigt']})}]}]});}});
 const ctx={task:{id:'task',input:{title:'Analyse'}},dependencies:[{sources:[{id:'source1',url:'https://example.com/issue',claim:'Need invoices'}]}],signal:new AbortController().signal,assertActive(){}};
 await assert.rejects(()=>a.execute(ctx));assert.equal(calls,0);
 const r=await a.execute({...ctx,grant:{reservationId:'test-run',maxCostRappen:50}});assert.ok(a.verify(r));assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes('test-private'));assert.ok(r.costReceipt.actualCostRappen<=50);
 await assert.rejects(()=>a.execute({...ctx,grant:{reservationId:'x',maxCostRappen:50},assertActive(){throw Error('Stopped');}}));assert.equal(calls,1);
 assert.equal(a.verify({...r,analysis:{...r.analysis,sourceIds:['invented']}}),false);
 assert.equal(createFounderWorker({now:reviewedPricingNow,}).available,false);
});

test('JSON mode explicitly requests JSON inside input and keeps the existing model and budget bounds',async()=>{
 let body;const a=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async(_u,o)=>{body=JSON.parse(o.body);if(!/json/i.test(body.input))return Response.json({error:{type:'invalid_request_error',param:'text.format',code:null}},{status:400,headers:{'x-request-id':'req_format'}});return Response.json({id:'resp_ok',status:'completed',usage:{input_tokens:10,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'A sufficiently detailed source-grounded working summary.',sourceIds:['s'],nextStep:'Review the independent public evidence',limitations:['Demand unconfirmed']})}]}]});}});
 const r=await a.execute({task:{input:{title:'Find useful public work'}},dependencies:[{sources:[{id:'s',claim:'Public evidence',url:'https://example.com'}]}],grant:{reservationId:'run',maxCostRappen:50},signal:new AbortController().signal,assertActive(){}});assert.ok(a.verify(r));assert.equal(body.model,'gpt-5.2');assert.equal(body.max_output_tokens,2000);
});


test('bounded answers deduplicate source ids and preserve truncation cause without raising output limits',async()=>{
 let sent;const events=[];const a=createFounderWorker({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},purpose:'deliverable',request:async(_u,o)=>{sent=JSON.parse(o.body);return Response.json({id:'resp_partial',status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:100,output_tokens:2000},output:[{content:[{type:'output_text',text:'{"summary":"cut off'}]}]});}});
 const r=await a.execute({task:{input:{}},dependencies:[{sources:[{id:'s',claim:'public',url:'https://github.com/test/repo'},{id:'s',claim:'public',url:'https://github.com/test/repo'}]}],grant:{reservationId:'bounded',maxCostRappen:50},signal:new AbortController().signal,assertActive(){},recordProviderEvent:e=>events.push(e)});
 assert.equal(JSON.parse(sent.input).sources.length,1);assert.match(sent.instructions,/6000/);assert.equal(sent.max_output_tokens,2000);assert.equal(r.incompleteReason,'max_output_tokens');assert.equal(a.verify(r),false);assert.equal(events.at(-1).costReceipt.evidenceRef,'resp_partial');
});

