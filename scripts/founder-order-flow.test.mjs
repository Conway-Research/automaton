import {createProductionGithubFunding} from './founder-production-github-funding.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createOrderFlow} from './founder-order-flow.mjs';import {openFounderController} from './founder-controller.mjs';import {openFounderBudget} from './founder-budget.mjs';import {codeDigest} from './founder-code-sandbox.mjs';

test('revoked funding is checked before any paid code invocation or validation sandbox',async()=>{
 let generated=0,runs=0;
 const github={snapshot:()=>[],close(){},async requireFunding(){throw Error('Funding revoked');}};
 const flow=createOrderFlow({directory:'unused',github,sandbox:{available:true,async run(){runs++;}},code:{maxCostRappen:50,available:true,async execute(){generated++;return {};},verify:()=>true}});
 const ctx={dependencies:[{kind:'order-prepare',prepared:{id:'example'},funding:{verified:true}}],assertActive(){}};
 try{await assert.rejects(flow.adapters['order-code'].execute(ctx),/funding/i);assert.equal(generated,0);await assert.rejects(flow.adapters['order-check'].execute({...ctx,dependencies:[{kind:'order-code',prepared:{id:'example'}}]}),/funding/i);assert.equal(runs,0);}finally{flow.close();}
});

test('unconfigured funding blocks customer work capabilities but preserves discovery',async()=>{
 const flow=createOrderFlow({directory:'unused',github:{read:async()=>({login:'tricebr'}),snapshot:()=>[],close(){}},sandbox:{available:true,async refresh(){}},code:{available:true,maxCostRappen:50}});
 try{await flow.refresh();assert.equal(flow.adapters['order-discovery'].available,true);for(const kind of ['order-prepare','order-code','order-check','order-submit'])assert.equal(flow.adapters[kind].available,false,kind);assert.equal(flow.status().funding.available,false);}finally{flow.close();}
});

test('funding lost during source preparation prevents the first sandbox run',async()=>{
 let runs=0;const github={snapshot:()=>[],close(){},async prepare(){return {id:'example',files:[]};},async requireFunding(){throw Error('Funding expired during source download');}};
 const flow=createOrderFlow({directory:'unused',github,sandbox:{available:true,async run(){runs++;return {passed:true};}},code:{available:true,maxCostRappen:50}});
 try{await assert.rejects(flow.adapters['order-prepare'].execute({task:{input:{repo:'owner/project',number:1}},assertActive(){}}),/Funding/);assert.equal(runs,0);}finally{flow.close();}
});

test('each baseline, patched and original-regression sandbox run needs fresh funding',async()=>{
 let runs=0,held=true;const files=[{path:'x.js',content:'old'},{path:'test/x.test.js',content:'test'}];
 const result={kind:'order-code',prepared:{id:'example',files,sourceDigest:codeDigest(files)},analysis:{changes:[{path:'x.js',content:'new'},{path:'test/new.test.js',content:'regression'}]}};
 const github={snapshot:()=>[],close(){},async requireFunding(){if(!held)throw Error('Funding revoked between tests');}};
 const flow=createOrderFlow({directory:'unused',github,sandbox:{available:true,async run(){runs++;held=false;return {passed:true,tests:1};}},code:{available:true,maxCostRappen:50}});
 try{await assert.rejects(flow.adapters['order-check'].execute({dependencies:[result],assertActive(){}}),/Funding/);assert.equal(runs,1);}finally{flow.close();}
});

test('unprobed access is explicitly unavailable even before the first refresh',()=>{
 const flow=createOrderFlow({directory:'unused',github:{snapshot:()=>[],close(){}},sandbox:{available:false,reason:'Offline isolation unavailable'},code:{available:true,maxCostRappen:50}});
 try{for(const a of Object.values(flow.adapters))assert.equal(a.available,false);}finally{flow.close();}
});
test('empty queue discovers, codes, tests, repairs and submits under one root budget, restart does not duplicate',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flow-'));const files=[{path:'x.js',content:'old'},{path:'test/x.test.js',content:'test'}];const prepared={id:'abcd',repo:'owner/project',number:1,files,sourceDigest:codeDigest(files),url:'https://github.com/owner/project/issues/1'};let published=0,generated=0,certified=0,runs=0;
 const github={fundingStatus:()=>({available:true}),async requireFunding(_prepared,ctx){return createProductionGithubFunding({isEnabled:()=>true,source:{provider:'fake-only',origin:'https://escrow.example',read:async terms=>({...terms,kind:'escrow-lock',status:'held',escrowId:'fake-lock',sourceUrl:'https://escrow.example/locks/fake-lock',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()})}}).require({orderUrl:prepared.url,amountMinor:5000,currency:'USD',recipient:'github:tricebr'},ctx);},async read(){return {login:'tricebr'};},async discover(){return [{repo:'owner/project',number:1}];},async prepare(){return prepared;},certify(){certified++;},async publish(){published++;return {id:'abcd',url:'https://github.com/owner/project/pull/2',paymentConfirmed:false};},snapshot:()=>[],close(){}};
 const sandbox={available:true,image:'sha256:'+'a'.repeat(64),async refresh(){},async run(f){runs++;return {passed:!f.some(x=>x.content==='old')||!f.some(x=>x.path==='test/new.test.js'),sourceDigest:codeDigest(f),tests:2,log:'test'};}};
 const code={available:true,maxCostRappen:50,async execute(ctx){generated++;return {kind:'order-code',prepared,analysis:{changes:[{path:'x.js',content:'new'},{path:'test/new.test.js',content:'regression'}]},sources:ctx.dependencies[0].sources,costReceipt:{actualCostRappen:10,evidenceRef:'test-receipt'}};},verify:()=>true};
 let flow=createOrderFlow({directory:dir,github,sandbox,code}),budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now(),authorizationRef:'test'});let c=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:flow.adapters});c.control('start');
 try{await flow.refresh();for(let i=0;i<8;i++){flow.advance(c);await c.tick();}assert.equal(generated,1);assert.equal(certified,1);assert.equal(published,1);assert.equal(budget.snapshot().spentRappen,10);const root=c.planningHistory().find(t=>t.kind==='order-code').rootTaskId;assert.ok(c.planningHistory().filter(t=>['order-code','order-check','order-submit'].includes(t.kind)).every(t=>t.rootTaskId===root));await c.close();flow.close();flow=createOrderFlow({directory:dir,github,sandbox,code});c=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:flow.adapters});await flow.refresh();for(let i=0;i<4;i++){flow.advance(c);await c.tick();}assert.equal(published,1);}finally{await c.close();flow.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing isolation prevents paid implementation and publication while discovery stays possible',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flow-block-'));const flow=createOrderFlow({directory:dir,github:{read:async()=>({login:'tricebr'}),close(){},snapshot:()=>[]},sandbox:{available:false,refresh:async()=>{}},code:{available:true,maxCostRappen:50}});try{await flow.refresh();assert.equal(flow.adapters['order-code'].available,false);assert.equal(flow.adapters['order-submit'].available,false);assert.equal(flow.adapters['order-discovery'].available,true);}finally{flow.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('scope invalidation schedules fresh preparation and retesting under the original root',()=>{
 const history=[{id:'submit-old',rootTaskId:'order-root',kind:'order-submit',status:'done',input:{version:1}}],queued=[];const result={prepared:{repo:'owner/project',number:1,id:'old'},submission:{invalidated:true}};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flow-version-'));const flow=createOrderFlow({directory:dir,github:{snapshot:()=>[],close(){}},sandbox:{available:true},code:{maxCostRappen:50}});try{flow.advance({snapshot:()=>({status:'running',budget:{active:true}}),planningHistory:()=>history,result:()=>result,hasTask:()=>false,enqueue:t=>queued.push(t)});assert.equal(queued.length,1);assert.equal(queued[0].kind,'order-prepare');assert.equal(queued[0].rootTaskId,'order-root');assert.equal(queued[0].input.version,2);}finally{flow.close();fs.rmSync(dir,{recursive:true,force:true});}
});
