import test from 'node:test';import assert from 'node:assert/strict';
import {applyCodeChanges,createOrderCodeWorker,verifyOrderCode} from './founder-order-code.mjs';
import {codeDigest} from './founder-code-sandbox.mjs';
const files=[{path:'math.js',content:'exports.add=(a,b)=>a-b;'}, {path:'test/existing.test.js',content:'unchanged'}];const prepared={id:'a',repo:'owner/project',number:1,sourceDigest:codeDigest(files),files};const changes=[{path:'math.js',content:'exports.add=(a,b)=>a+b;'}, {path:'test/regression.test.js',content:'new test'}];
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('code changes preserve existing tests and restrict modifications to bounded source and new tests',()=>{
 assert.equal(applyCodeChanges(prepared,changes).length,3);
 for(const c of [[{path:'test/existing.test.js',content:'disabled'},...changes],[{path:'package.json',content:'{}'},...changes],[changes[0]],[changes[1]],[{path:'new.js',content:'x'},...changes]])assert.throws(()=>applyCodeChanges(prepared,c));
});
test('code worker receives complete mission, immutable source, problem and source identifiers',async()=>{
 let body;const w=createOrderCodeWorker({now:fixedNow,apiKey:'sk-test12345678',mission:{directive:'Mission '.repeat(50)},request:async(u,o)=>{body=JSON.parse(o.body);return Response.json({id:'resp_test',status:'completed',usage:{input_tokens:100,output_tokens:100},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Concrete fix with offline regression evidence.',nextStep:'Run exact code in isolated container.',limitations:['Offline tests only'],sourceIds:['s'],changes})}]}]});}});
 const r=await w.execute({task:{input:{title:'Fix addition'}},dependencies:[{prepared,sources:[{id:'s',url:'https://github.com/owner/project/issues/1',claim:'Fix addition',observedAt:new Date().toISOString()}]}],signal:new AbortController().signal,assertActive(){},grant:{reservationId:'test',maxCostRappen:50}});
 assert.ok(body.input.includes('exports.add'));assert.ok(body.instructions.includes('FOUNDER SUPPLEMENTS'));assert.equal(w.verify(r),true);assert.equal(r.prepared.sourceDigest,prepared.sourceDigest);
});
test('validation requires baseline pass, patched pass and regression failure against original',async()=>{
 const reports=[{passed:true,tests:1},{passed:true,tests:2},{passed:false,tests:2}];let count=0;
 const s={image:'sha256:'+'b'.repeat(64),async run(fs){return {...reports[count++],sourceDigest:codeDigest(fs),log:'bounded'};}};
 const r=await verifyOrderCode({prepared,analysis:{changes}},s,{});assert.equal(r.passed,true);assert.equal(r.sourceDigest,codeDigest(applyCodeChanges(prepared,changes)));assert.equal(count,3);
 count=0;reports[2].passed=true;assert.equal((await verifyOrderCode({prepared,analysis:{changes}},s,{})).passed,false);
});


test('test support, configuration and explicitly private code inputs cannot become publishable work',async()=>{
 for(const p of ['test/assertions.js','tests/helpers.js','jest.config.js']){const src=[...files,{path:p,content:'original'}],prep={...prepared,files:src,sourceDigest:codeDigest(src)};assert.throws(()=>applyCodeChanges(prep,[{path:p,content:'disabled'},...changes]));}
 let calls=0;const w=createOrderCodeWorker({apiKey:'sk-test12345678',mission:{directive:'test'},request:async()=>{calls++;throw Error('must not dispatch');}});
 await assert.rejects(w.execute({dependencies:[{privacy:'private',prepared,sources:[{id:'s'}]}]}));assert.equal(calls,0);
});
