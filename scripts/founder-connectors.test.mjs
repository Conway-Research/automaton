import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createFounderConnectors} from './founder-connectors.mjs';
import Database from 'better-sqlite3';
const context=()=>({signal:new AbortController().signal,assertActive(){},grant:{reservationId:'test',maxCostRappen:0},dependencies:[],task:{input:{}}});
// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('explicit legacy recovery preserves old evidence and consumes its authorization once',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exa-legacy-'));let at=Date.parse('2026-10-17T00:01:00Z'),calls=0;
 const options={directory:dir,now:()=>at,request:async()=>{calls++;return Response.json({id:1,result:{content:[{type:'text',text:'Title: public evidence\nURL: https://github.com/example/project/issues/1\nText: Reported issue'}]}});}};
 let c=createFounderConnectors(options);c.close();const db=new Database(path.join(dir,'connector-usage.db')),window=Math.floor(at/21600000),original=at;
 db.prepare('INSERT INTO exa_attempts(window,seq,at,status,retry_after_ms) VALUES(?,1,?,\'attempted\',0)').run(window,at);at+=300000;
 c=createFounderConnectors(options);
 try{await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/quota/);assert.equal(calls,0);c.close();c=createFounderConnectors({...options,legacyExaRetry:{window,at:original,reference:'operator:old-run',expiresAt:at+120000}});const r=await c.adapters['exa-research'].execute(context());assert.equal(r.costReceipt.actualCostRappen,0);assert.equal(calls,1);assert.equal(db.prepare('SELECT status FROM exa_attempts WHERE seq=1').get().status,'attempted');assert.equal(db.prepare('SELECT COUNT(*) n FROM exa_operator_retries').get().n,1);await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/quota/);assert.equal(calls,1);
 }finally{c.close();db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Exa retry cap and backoff survive connector restart; rejected early calls do not unlock quota',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exa-backoff-'));let at=Date.parse('2026-10-17T00:01:00Z'),calls=0;
 const options={directory:dir,now:()=>at,request:async()=>{calls++;throw Object.assign(Error('offline'),{cause:{code:'ENOTFOUND'}});}};
 let c=createFounderConnectors(options);
 try{await assert.rejects(()=>c.adapters['exa-research'].execute(context()));assert.equal(c.adapters['exa-research'].nextReadyAt,at+300000);await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/quota/);assert.equal(calls,1);c.close();c=createFounderConnectors(options);at+=300000;await assert.rejects(()=>c.adapters['exa-research'].execute(context()));assert.equal(calls,2);assert.equal(c.adapters['exa-research'].nextReadyAt,at+600000);at+=600000;await assert.rejects(()=>c.adapters['exa-research'].execute(context()));assert.equal(calls,3);assert.equal(c.adapters['exa-research'].nextReadyAt,Date.parse('2026-10-17T06:00:00Z'));}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('network diagnostics distinguish DNS failure without leaking upstream secrets',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exa-dns-'));const c=createFounderConnectors({now:fixedNow,directory:dir,request:async()=>{throw Object.assign(Error('SECRET'),{cause:{code:'ENOTFOUND'}});}});
 try{await assert.rejects(()=>c.adapters['exa-research'].execute(context()),e=>e.diagnostic?.code==='service_dns_failed'&&!e.message.includes('SECRET'));assert.equal(c.status()[0].last.status,'failed:service_dns_failed');}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('targeted repair can read recent public repository issues when Exa returns no usable results',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exa-repair-'));let calls=0;const target='https://github.com/owner/repo/pull/115';
 const c=createFounderConnectors({now:fixedNow,directory:dir,request:async(url,options)=>{calls++;assert.equal(new Headers(options.headers).has('authorization'),false);if(url.includes('mcp.exa.ai'))return Response.json({id:1,result:{content:[{type:'text',text:'No results found'}]}});assert.equal(url,'https://api.github.com/repos/owner/repo/issues?state=all&sort=updated&direction=desc&per_page=3');return Response.json([{html_url:'https://github.com/owner/repo/pull/142',title:'Follow-up',state:'closed',body:'Public evidence',number:142}]);}});
 try{const r=await c.adapters['exa-research'].execute({...context(),task:{input:{repairTargetUrl:target}},dependencies:[{sources:[{url:target}]}]});assert.equal(calls,2);assert.equal(r.sources[0].url,'https://github.com/owner/repo/pull/142');assert.equal(r.costReceipt.actualCostRappen,0);await assert.rejects(()=>c.adapters['exa-research'].execute(context()));assert.equal(calls,2);}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('keyless Exa has bounded calls, no authorization and persistent quota',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connectors-'));let calls=0;
 const request=async(url,opts)=>{calls++;assert.equal(new Headers(opts.headers).has('authorization'),false);assert.equal(opts.redirect,'error');return Response.json({jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:'Title: public demand\nURL: https://github.com/example/project/issues/1\nText: documentation requested'}]}});};
 let c=createFounderConnectors({now:fixedNow,directory:dir,request});try{
 const a=c.adapters['exa-research'];await assert.rejects(()=>a.execute({...context(),grant:null}));assert.equal(calls,0);
 const r=await a.execute(context());assert.equal(a.verify(r),true);assert.equal(r.sources.length,1);assert.equal(r.costReceipt.actualCostRappen,0);
 c.close();c=createFounderConnectors({now:fixedNow,directory:dir,request});await assert.rejects(()=>c.adapters['exa-research'].execute(context()));assert.equal(calls,1);
 }finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Firecrawl rejects unknown targets and SOFA stays unavailable without credentials',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connectors-'));let calls=0;const c=createFounderConnectors({directory:dir,request:async()=>{calls++;return Response.json({});}});
 try{assert.equal(c.adapters['sofa-research'].available,false);for(const url of ['http://localhost/x','https://127.0.0.1/x','https://evil.test/x'])await assert.rejects(()=>c.adapters['firecrawl-research'].execute({...context(),dependencies:[{sources:[{url}]}]}));assert.equal(calls,0);}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('upstream errors are bounded and never retried or exposed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connectors-'));let calls=0;const c=createFounderConnectors({now:fixedNow,directory:dir,request:async()=>{calls++;return new Response('secret upstream detail',{status:429});}});
 try{await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/Provider HTTP 429/);await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/quota/);assert.equal(calls,1);}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('Firecrawl without an authorized metered adapter stays blocked before network access',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connectors-'));let calls=0;const c=createFounderConnectors({directory:dir,request:async(url,opts)=>{calls++;assert.equal(url,'https://api.firecrawl.dev/v2/scrape');assert.equal(new Headers(opts.headers).has('authorization'),false);assert.deepEqual(JSON.parse(opts.body),{url:'https://github.com/example/project/issues/1',formats:['markdown'],onlyMainContent:true,timeout:20000});return Response.json({success:true,data:{markdown:'A public reported request, not a paid assignment.'}});}});
 try{assert.equal(c.adapters['firecrawl-research'].available,false);assert.match(c.adapters['firecrawl-research'].reason,/Firecrawl/);await assert.rejects(()=>c.adapters['firecrawl-research'].execute({...context(),dependencies:[{sources:[{url:'https://github.com/example/project/issues/1'}]}]}));assert.equal(calls,0);}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('SOFA authenticates its restored original grant without publishing',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connectors-'));let calls=0;const id='12345678-1234-1234-1234-123456789abc';const c=createFounderConnectors({directory:dir,now:()=>Date.parse('2026-10-18T12:00:00Z'),sofaKey:'test-key-not-a-secret-123456',request:async(url,opts)=>{calls++;if(url.endsWith('/skill.md'))return new Response('guide',{headers:{'x-sofa-skill-digest':'a'.repeat(64)}});assert.equal(opts.headers.Authorization,'Bearer test-key-not-a-secret-123456');if(url.endsWith('/api/sessions'))return Response.json({session_id:id});assert.equal(opts.headers['X-Sofa-Session'],id);if(url.includes('?search='))return Response.json({posts:[{id,content_type:'til'}]});return Response.json({id,content_type:'til',title:'Budget retries',body:'Test local mocks before paid probes.'});}});
 try{const r=await c.adapters['sofa-research'].execute(context());assert.equal(c.adapters['sofa-research'].verify(r),true);assert.equal(calls,4);assert.equal(r.costEvidence.policyExpiresAt,'2026-10-20T00:00:00.000Z');assert.ok(!JSON.stringify(r).includes('test-key'));}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('empty evidence and expired policies cannot report connected or invoke provider',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connectors-'));let at=Date.parse('2026-10-13T12:00:00Z'),calls=0;const c=createFounderConnectors({directory:dir,now:()=>at,request:async()=>{calls++;return Response.json({id:1,result:{content:[]}});}});
 try{await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/service_no_results/);assert.equal(c.status()[0].last.status,'failed:service_no_results');at=Date.parse('2026-11-10T12:00:00Z');await assert.rejects(()=>c.adapters['exa-research'].execute(context()),/Access/);assert.equal(calls,1);}finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('spent connector windows defer future jobs and HTTP errors retain only safe status diagnostics',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'connector-wait-'));let at=Date.parse('2026-10-15T18:01:00Z'),calls=0;
 const c=createFounderConnectors({directory:dir,now:()=>at,request:async()=>{calls++;return new Response('private upstream body',{status:401});}});
 try{const a=c.adapters['exa-research'];assert.equal(a.nextReadyAt,0);await assert.rejects(()=>a.execute({...context(),dependencies:[{sources:[{url:'https://github.com/example/repo'}]}]}),e=>e.diagnostic?.code==='service_unauthorized'&&e.diagnostic.httpStatus===401&&!JSON.stringify(e).includes('private upstream'));
 assert.equal(a.nextReadyAt,(Math.floor(at/21600000)+1)*21600000);at+=21600000;assert.equal(a.nextReadyAt,0);assert.equal(calls,1);
 }finally{c.close();fs.rmSync(dir,{recursive:true,force:true});}
});
