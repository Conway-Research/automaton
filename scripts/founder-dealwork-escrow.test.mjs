import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createDealworkEscrow,readDealworkAccess,DEALWORK_ACCOUNT} from './founder-dealwork-escrow.mjs';

const at=Date.parse('2026-10-15T19:00:00Z');
const contractId='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';
const own={available:true,agentAccountId:DEALWORK_ACCOUNT,apiKey:'synthetic-api-key',hmacSecret:'synthetic-hmac-secret'};
const terms={orderUrl:'https://dealwork.ai/dashboard/jobs/'+jobId,amountMinor:1000,currency:'USD',recipient:'dealwork:'+DEALWORK_ACCOUNT};
const record=()=>({id:contractId,jobId,workerAccountId:DEALWORK_ACCOUNT,buyerAccountId:'33333333-3333-4333-8333-333333333333',amount:'10.00',state:'escrow_locked',deadline:new Date(at+3600000).toISOString()});
function fixture({me={},list,detail={},headers={},status=200}={}){
 const calls=[];
 const request=async(url,options)=>{calls.push({url,options});const u=new URL(url);let data;
  if(u.pathname==='/api/v1/agents/me')data={data:{id:'different-agent-profile-id',accountId:DEALWORK_ACCOUNT,isSuspended:false,moltbookApiKey:'never disclose',...me}};
  else if(u.pathname==='/api/v1/contracts')data={data:list??[record()],meta:{page:1,per_page:50,total:(list??[record()]).length}};
  else if(u.pathname==='/api/v1/contracts/'+contractId)data={data:{...record(),...detail}};
  else assert.fail('Unexpected endpoint '+url);
  return Response.json(data,{status,headers:{Date:new Date(at).toUTCString(),...headers}});
 };
 return {calls,request};
}
const adapter=f=>createDealworkEscrow({getAccess:()=>own,request:f.request,now:()=>at});

test('official contract lock binds its native job and beneficiary with signed GET requests only',async()=>{
 const f=fixture(),a=adapter(f),proof=await a.requireFunding(terms);
 assert.equal(proof.escrowId,contractId);assert.equal(proof.amountMinor,1000);assert.equal(proof.currency,'USD');assert.equal(proof.recipient,terms.recipient);assert.equal(proof.sourceUrl,'https://dealwork.ai/api/v1/contracts/'+contractId);
 assert.equal(f.calls.length,3);
 for(const {url,options} of f.calls){assert.equal(new URL(url).origin,'https://dealwork.ai');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.ok(!Object.hasOwn(options,'body'));assert.equal(options.headers['X-Signature'],createHmac('sha256',own.hmacSecret).update(DEALWORK_ACCOUNT+Math.floor(at/1000)).digest('hex'));}
 assert.ok(!JSON.stringify(proof).includes('synthetic'));assert.ok(!JSON.stringify(proof).includes('moltbook'));
});

test('empty authenticated contract list produces private absence evidence, never a fabricated lock',async()=>{
 const f=fixture({list:[]}),a=adapter(f);const r=await a.adapter.execute({assertActive(){}});
 assert.equal(a.adapter.verify(r),true);assert.equal(r.data.ownContracts,0);assert.deepEqual(r.data.proofs,[]);assert.equal(r.privacy,'private');assert.deepEqual(r.sources,[]);await assert.rejects(a.requireFunding(terms));
 assert.equal(f.calls.filter(c=>new URL(c.url).pathname.startsWith('/api/v1/contracts/')).length,0);
});

test('poster funds, claimability, job advertising and foreign contracts cannot substitute for an own lock',async()=>{
 for(const list of [[{...record(),currency:'EUR'}],[{...record(),workerAccountId:'foreign'}],[{...record(),state:'posted',posterFunded:true,claimable:true}],[{...record(),state:'bidding'}],[{...record(),state:'completed'}],[{...record(),state:'paid'}],[{...record(),state:'cancelled'}],[{...record(),state:'disputed'}]])await assert.rejects(adapter(fixture({list})).requireFunding(terms));
});

test('independent contract detail must match job, worker, amount, currency, status and deadline',async()=>{
 for(const detail of [{id:jobId},{jobId:contractId},{workerAccountId:'foreign'},{amount:'9.99'},{amount:'10e3'},{amount:10},{currency:'EUR'},{state:'paid'},{state:'disputed'},{deadline:new Date(at-1).toISOString()},{deadline:'unknown'}])await assert.rejects(adapter(fixture({detail})).requireFunding(terms));
 await assert.rejects(adapter(fixture()).requireFunding({...terms,amountMinor:999}));
});

test('native evidence cannot fund GitHub URLs or another worker, and a suspended/wrong principal fails',async()=>{
 const f=fixture(),a=adapter(f);await assert.rejects(a.requireFunding({...terms,orderUrl:'https://github.com/owner/repo/issues/1'}));await assert.rejects(a.requireFunding({...terms,recipient:'dealwork:other'}));assert.equal(f.calls.length,0);
 for(const me of [{accountId:'foreign'},{isSuspended:true},{isSuspended:undefined}])await assert.rejects(adapter(fixture({me})).requireFunding(terms));
});

test('uncached fresh HTTPS responses are required and provider errors never disclose content',async()=>{
 for(const input of [{status:403},{status:302},{headers:{Date:'invalid'}},{headers:{Date:new Date(at-31000).toUTCString()}},{headers:{Age:'1'}}])await assert.rejects(adapter(fixture(input)).requireFunding(terms),e=>!e.message.includes('synthetic'));
 const a=createDealworkEscrow({getAccess:()=>own,now:()=>at,request:async()=>new Response('secret'.repeat(60000),{headers:{Date:new Date(at).toUTCString()}})});await assert.rejects(a.requireFunding(terms));
});

test('missing access and cancellation prevent any outbound request',async()=>{
 let calls=0;const a=createDealworkEscrow({getAccess:()=>({available:false}),request:async()=>{calls++;assert.fail();},now:()=>at});assert.equal(a.adapter.available,false);await assert.rejects(a.requireFunding(terms));assert.equal(calls,0);
 const abort=new AbortController();abort.abort();const f=fixture();await assert.rejects(adapter(f).requireFunding(terms,{signal:abort.signal}));assert.equal(f.calls.length,0);
});

test('all pages are required, with no duplicated, foreign or ambiguous active contracts',async()=>{
 const f=fixture({list:[record(),record()]});await assert.rejects(adapter(f).requireFunding(terms));
 const base=fixture({list:[record(),{...record(),id:'44444444-4444-4444-8444-444444444444'}]});await assert.rejects(adapter(base).requireFunding(terms));
 const partial=createDealworkEscrow({getAccess:()=>own,now:()=>at,request:async(u,o)=>{if(new URL(u).pathname==='/api/v1/contracts')return Response.json({data:[record()],meta:{page:1,per_page:50,total:2}},{headers:{Date:new Date(at).toUTCString()}});return fixture().request(u,o);}});await assert.rejects(partial.requireFunding(terms));
});

test('dedicated credential loader validates the existing owner binding and returns no credential on failure',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dealwork-access-')),file=path.join(dir,'test.dpapi');fs.writeFileSync(file,'synthetic ciphertext');
 try{const data={response:{data:{agentAccountId:DEALWORK_ACCOUNT,apiKey:own.apiKey,hmacSecret:own.hmacSecret}}};assert.equal(readDealworkAccess({file,decrypt:()=>JSON.stringify(data)}).agentAccountId,DEALWORK_ACCOUNT);data.response.data.agentAccountId='foreign';assert.deepEqual(readDealworkAccess({file,decrypt:()=>JSON.stringify(data)}),{available:false});assert.deepEqual(readDealworkAccess({file,decrypt:()=>{throw Error('secret');}}),{available:false});}finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('reported lock proofs remain timestamped platform evidence, without payment or action authorization',async()=>{
 const a=adapter(fixture()),r=await a.adapter.execute({assertActive(){}});assert.equal(a.adapter.verify(r),true);assert.equal(r.data.proofs.length,1);assert.equal(r.data.assignmentOrWorkAuthorizedByThisRead,false);assert.equal(r.data.paymentConfirmed,false);
});
