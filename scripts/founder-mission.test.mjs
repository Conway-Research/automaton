import test from 'node:test';import assert from 'node:assert/strict';
import {createFounderWorker} from './founder-worker.mjs';
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('full long Genesis reaches the worker without truncation and without leaking into its result',async()=>{
 const directive='Founder purpose: discover useful work.\n'.repeat(1100)+'END_OF_MISSION';let body;
 const a=createFounderWorker({now:fixedNow,apiKey:'sk-test-private',mission:{directive},request:async(u,o)=>{body=JSON.parse(o.body);return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:15000,output_tokens:30},output:[]});}});
 const r=await a.execute({task:{input:{}},dependencies:[{sources:[{id:'s',claim:'Public task',url:'https://example.com'}]}],signal:new AbortController().signal,assertActive(){},grant:{reservationId:'r',maxCostRappen:50}});
 assert.ok(body.instructions.includes(directive));assert.ok(body.instructions.includes('END_OF_MISSION'));assert.equal(r.mission.complete,true);assert.equal(JSON.stringify(r).includes('END_OF_MISSION'),false);assert.ok(r.costReceipt.actualCostRappen<=50);
});
test('missing or oversized mission prevents any paid worker request',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('must not call');};
 assert.equal(createFounderWorker({apiKey:'sk-test-private',request}).available,false);
 assert.equal(createFounderWorker({apiKey:'sk-test-private',mission:{directive:'x'.repeat(100000)},request}).available,false);assert.equal(calls,0);
});
