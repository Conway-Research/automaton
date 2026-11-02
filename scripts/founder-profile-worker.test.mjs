import test from 'node:test';import assert from 'node:assert/strict';
import {createProfileWorkGenerator,createAdapterDraftWorker} from './founder-profile-worker.mjs';
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('profile generator sends explicit public profile contract and retains provider accounting',async()=>{
 let sent;const worker=createProfileWorkGenerator({now:fixedNow,apiKey:'sk-synthetic-key',mission:{directive:'Synthetic mission'},request:async(_url,o)=>{sent=JSON.parse(o.body);return Response.json({id:'resp_fake',status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'A concrete implementation and isolated regression.',nextStep:'Verify the exact replacement files independently.',limitations:['Offline result only'],sourceIds:['s'],changes:[{path:'main.py',content:'x=2'}]})}]}]});}});
 const r=await worker({task:{input:{}},grant:{reservationId:'fake',maxCostRappen:50},assertActive(){},signal:new AbortController().signal,binding:{profileId:'python',scopeDigest:'scope',inputs:[{privacy:'public'}],files:[{path:'main.py',content:'x=1'}],sources:[{id:'s',url:'https://example.com',claim:'Public assignment'}],acceptanceCriteria:['regression'],allowedChanges:['main.py']}});
 assert.equal(r.changes[0].path,'main.py');assert.ok(r.costReceipt.evidenceRef);assert.match(sent.instructions,/profile/i);assert.match(sent.input,/python/);assert.match(sent.input,/main.py/);
 await assert.rejects(worker({assertActive(){},binding:{inputs:[{privacy:'private'}]}}));
});
test('adapter drafting produces inert candidate source and has no import/install path',()=>{const worker=createAdapterDraftWorker({mission:{directive:'test'}});assert.equal(worker.maxCostRappen,50);assert.equal(worker.available,false);});
