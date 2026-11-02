import test from 'node:test';import assert from 'node:assert/strict';
import {createFreeFirecrawl} from './founder-firecrawl-free.mjs';
const ctx=()=>({assertActive(){},grant:{reservationId:'isolated',maxCostRappen:0},dependencies:[{sources:[{url:'https://github.com/example/repo'}]}]});
test('controller keeps failed scrapes idle until explicit retry with zero settled cost',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');
 const {openFounderController}=await import('./founder-controller.mjs');const {openFounderBudget}=await import('./founder-budget.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'firecrawl-retry-'));const budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now()-100,authorizationRef:'isolated-fixture'});let calls=0;
 const a=createFreeFirecrawl({keyless:true,claim(){},publicUrl:u=>u,request:async()=>{calls++;return new Response('{}',{status:503});}}),execute=a.execute;
 a.execute=c=>execute({...c,dependencies:ctx().dependencies});
 const controller=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:{scrape:a}});
 try{controller.enqueue({id:'scrape',rootTaskId:'scrape',kind:'scrape',input:{},dependencies:[],resources:[]});controller.control('start');await controller.tick();await controller.tick();
 const row=controller.snapshot().tasks.find(t=>t.id==='scrape');assert.equal(calls,1);assert.equal(row.retryAllowed,true);assert.equal(budget.snapshot().heldRappen,0);
 controller.retry(row.id,row.updated_ms);await controller.tick();assert.equal(calls,2);assert.equal(budget.snapshot().heldRappen,0);
 }finally{await controller.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('scoped keyless scrape cleans before storage and carries the original research goal',async()=>{
 let sent;const url='https://github.com/org/target-repo/blob/main/readme.md';
 const a=createFreeFirecrawl({keyless:true,claim(){},publicUrl:u=>u,source:(url,claim)=>({url,claim:claim.slice(0,4000),digest:'test'}),request:async(_,options)=>{sent=JSON.parse(options.body).url;return Response.json({success:true,data:{markdown:'Navigation '.repeat(500)+'\nEdit and raw actions\n\n# Real content\nApproval is required before work.'}});}});
 const input={...ctx(),task:{input:{researchGoal:'target-repo: Prüfen der Regeln'}},dependencies:[{sources:[{url:'https://github.com/asyncapi/website'},{url}]}]};
 const r=await a.execute(input);assert.equal(sent,url);assert.ok(r.sources[0].claim.startsWith('# Real content'));assert.equal(r.sources[0].contentQuality.cleanedBeforeTruncation,true);assert.equal(r.researchGoal,input.task.input.researchGoal);
 await assert.rejects(()=>a.execute({...input,dependencies:[{sources:[{url:'https://github.com/asyncapi/website'}]}]}),/No relevant/);
});
test('keyless free transport never transmits account credentials or falls back after quota rejection',async()=>{
 let calls=0;const a=createFreeFirecrawl({keyless:true,getAccess:()=>{throw Error('Must not read account');},claim(){},publicUrl:u=>u,source(){},request:async(url,opts)=>{calls++;assert.equal(new Headers(opts.headers).has('authorization'),false);assert.equal(new Headers(opts.headers).has('cookie'),false);assert.equal(opts.credentials,'omit');assert.equal(JSON.parse(opts.body).proxy,'basic');return new Response('{}',{status:429});}});
 assert.equal(a.available,true);await assert.rejects(()=>a.execute(ctx()),/429/);assert.equal(calls,1);
});
test('expired keyless policy blocks before networking',async()=>{
 let calls=0;const a=createFreeFirecrawl({keyless:true,expiresAt:100,now:()=>100,request:async()=>{calls++;}});
 assert.equal(a.available,false);await assert.rejects(()=>a.execute(ctx()));assert.equal(calls,0);
});
test('successful keyless evidence explicitly records free unauthenticated access',async()=>{
 const a=createFreeFirecrawl({keyless:true,claim(){},publicUrl:u=>u,source:(url,claim)=>({url,claim,digest:'test'}),request:async()=>Response.json({success:true,data:{markdown:'Public source'}})});
 const r=await a.execute(ctx());assert.equal(a.verify(r),true);assert.match(r.costEvidence.basis,/keyless free/);assert.equal(r.costReceipt.actualCostRappen,0);
});
test('credit balance or an old Free-plan observation never authorizes spending',async()=>{
 let calls=0;const a=createFreeFirecrawl({getAccess:()=>({key:'fc-test',remainingCredits:1021,plan:'free'}),request:async()=>{calls++;}});
 assert.equal(a.available,false);await assert.rejects(()=>a.execute(ctx()),/Kostenfreiheit/);assert.equal(calls,0);
});
test('missing controller grant and unknown URLs never reach provider',async()=>{
 let calls=0;const a=createFreeFirecrawl({getAccess:()=>({key:'fc-test',providerEnforcedZeroSpend:true}),request:async()=>{calls++;},claim(){},source(){},publicUrl:u=>u.startsWith('https://github.com/')?u:null});
 await assert.rejects(()=>a.execute({...ctx(),grant:null}));await assert.rejects(()=>a.execute({...ctx(),dependencies:[{sources:[{url:'http://localhost/'}]}]}));assert.equal(calls,0);
});
test('isolated free-only transport uses one bounded scrape and does not retry ambiguous failure',async()=>{
 let claimed=false,calls=0;const a=createFreeFirecrawl({getAccess:()=>({key:'fc-test',providerEnforcedZeroSpend:true}),claim(){if(claimed)throw Error('quota');claimed=true;},publicUrl:u=>u,source:(url,claim)=>({url,claim,digest:'test'}),request:async(url,opts)=>{calls++;assert.equal(url,'https://api.firecrawl.dev/v2/scrape');assert.equal(opts.redirect,'error');assert.deepEqual(JSON.parse(opts.body),{url:'https://github.com/example/repo',formats:['markdown'],onlyMainContent:true,timeout:20000});throw Error('Network outcome unknown');}});
 await assert.rejects(()=>a.execute(ctx()));await assert.rejects(()=>a.execute(ctx()));assert.equal(calls,1);
});
test('verified free-only isolated response produces one source, and a rolling cooldown blocks access',async()=>{
 let calls=0,cooldown=0;const a=createFreeFirecrawl({getAccess:()=>({key:'fc-test',providerEnforcedZeroSpend:true}),now:()=>100,nextReadyAt:()=>cooldown,claim(){cooldown=21600100;},publicUrl:u=>u,source:(url,claim)=>({url,claim,digest:'test'}),request:async()=>{calls++;return Response.json({success:true,data:{markdown:'Public evidence',metadata:{creditsUsed:1}}});}});
 const r=await a.execute(ctx());assert.equal(a.verify(r),true);assert.equal(r.costReceipt.actualCostRappen,0);assert.equal(r.costEvidence.creditsUsed,1);await assert.rejects(()=>a.execute(ctx()),/cooldown/);assert.equal(calls,1);
});
