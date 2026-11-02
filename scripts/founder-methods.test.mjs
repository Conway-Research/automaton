import test from 'node:test';
import assert from 'node:assert/strict';
import {founderMethods,methodPrompt,pluginReadiness} from './founder-methods.mjs';
import {createFounderWorker} from './founder-worker.mjs';
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('methods are bounded, versioned and never equate installed connectors with runtime access',()=>{
 assert.ok(Buffer.byteLength(methodPrompt('analysis'))<2400);
 assert.ok(founderMethods.every(m=>m.version&&m.provenance&&m.id));
 assert.ok(pluginReadiness.every(p=>p.runtimeConnected===false));
 assert.throws(()=>methodPrompt('external-send'));
 assert.match(methodPrompt('analysis'),/Zahlungsbereitschaft/);
 assert.match(methodPrompt('deliverable'),/Akzeptanz/);
});
test('actual model request receives curated methods and result carries method versions without enabling tools',async()=>{
 let body;const worker=createFounderWorker({now:fixedNow,apiKey:'sk-test-methods',mission:{directive:'Private founder mission for this isolated test.'},request:async(u,o)=>{body=JSON.parse(o.body);return Response.json({id:'resp_methods',status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Quellenbasierter privater Entwurf mit offenem Nachfragebeleg.',nextStep:'Zahlungsbereitschaft anhand belegter Ausschreibung prüfen.',sourceIds:['s'],limitations:['Keine Zahlungszusage']})}]}]});}});
 const result=await worker.execute({task:{input:{}},dependencies:[{sources:[{id:'s',url:'https://example.com',claim:'Reported demand'}]}],signal:new AbortController().signal,assertActive(){},grant:{reservationId:'methods-test',maxCostRappen:50}});
 assert.match(body.instructions,/Zahlungsbereitschaft/);assert.equal(body.tools,undefined);
 assert.ok(result.methodsApplied.some(m=>m.id==='commercial-evidence'&&m.version==='1.0.0'));
 assert.equal(worker.verify(result),true);
});
