import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createDealworkEscrow,DEALWORK_ACCOUNT} from './founder-dealwork-escrow.mjs';

const at=Date.parse('2026-10-16T00:00:00Z'),id='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222',buyer='33333333-3333-4333-8333-333333333333';
function fixture(){
 const auth={available:true,agentAccountId:DEALWORK_ACCOUNT,apiKey:'synthetic-api-key',hmacSecret:'synthetic-hmac-secret'};
 const row={id,jobId,buyerAccountId:buyer,workerAccountId:DEALWORK_ACCOUNT,amount:'10.00',state:'escrow_locked',deadline:new Date(at+3600000).toISOString()};
 const job={id:jobId,title:'Public fix',description:'Implement public issue: https://github.com/owner/project/issues/1'};
 const calls=[];let stale=false;
 const request=async(url,o)=>{calls.push({url,o});let body;const p=new URL(url).pathname;
  if(o.method==='POST')body={data:{id:'44444444-4444-4444-8444-444444444444'}};
  else if(p.endsWith('/me'))body={data:{accountId:DEALWORK_ACCOUNT,isSuspended:false}};
  else if(p.endsWith('/contracts'))body={data:[{...row}],meta:{page:1,per_page:50,total:1}};
  else if(p.endsWith('/deliverables'))body={data:[]};
  else body={data:{...row,job:{...job}}};
  return Response.json(body,{headers:{date:new Date(at-(stale?60000:0)).toUTCString()}});
 };
 return {row,job,calls,auth,stale:()=>stale=true,provider:createDealworkEscrow({getAccess:()=>auth,request,now:()=>at})};
}
test('native work binds own buyer, contract, full scope and escrow; POST HMAC includes exact body',async()=>{
 const f=fixture(),p=await f.provider.readWork(id);assert.equal(p.contractId,id);assert.equal(p.terms.amountMinor,1000);assert.equal(p.funding.escrowId,id);
 await f.provider.writeWork(p,{type:'START_WORK'});
 const write=f.calls.find(x=>x.o.method==='POST');assert.ok(write);assert.equal(write.url,'https://dealwork.ai/api/v1/contracts/'+id+'/events');
 assert.equal(write.o.headers['X-Signature'],createHmac('sha256',f.auth.hmacSecret).update(DEALWORK_ACCOUNT+Math.floor(at/1000)+write.o.body).digest('hex'));
 assert.deepEqual(JSON.parse(write.o.body),{type:'START_WORK'});
});
test('changed private scope, buyer, deadline, foreign assignment or stale read blocks every write',async()=>{
 for(const mutate of [f=>f.job.description+=' new terms',f=>f.row.buyerAccountId=jobId,f=>delete f.row.deadline,f=>f.row.workerAccountId=buyer,f=>f.stale()]){
  const f=fixture(),p=await f.provider.readWork(id);mutate(f);await assert.rejects(f.provider.writeWork(p,{type:'START_WORK'}));assert.equal(f.calls.filter(x=>x.o.method==='POST').length,0);
 }
});
test('worker transport refuses financial/claim/message events and invalid state transitions',async()=>{
 const f=fixture(),p=await f.provider.readWork(id);
 for(const type of ['APPROVE','RELEASE_ESCROW','DISPUTE','NEW_MESSAGE','CLAIM','SUBMIT_WORK'])await assert.rejects(f.provider.writeWork(p,{type}));
 f.row.state='in_review';await assert.rejects(f.provider.writeWork(p,{type:'START_WORK'}));
 assert.equal(f.calls.filter(x=>x.o.method==='POST').length,0);
});
test('missing native job details or ambiguous contracts remain blocked',async()=>{
 const f=fixture();delete f.job.description;await assert.rejects(f.provider.readWork(id));
});
test('unknown contract scope fields are unsupported rather than ignored',async()=>{
 const f=fixture();f.row.scope='Additional private work';await assert.rejects(f.provider.readWork(id));
});
