import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDealworkMessages,createDealworkMessages} from './founder-dealwork-messages.mjs';
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const binding={ownAccountId:id(1),counterpartyAccountId:id(2),channelId:id(3)};
const row={id:id(4),channelId:id(3),senderAccountId:id(2),content:'fixture only',createdAt:'2026-10-18T12:00:00Z'};
test('parses documented Message fields with explicit participants and channel',()=>assert.deepEqual(parseDealworkMessages({data:[row]},binding),[row]));
test('rejects cross-channel, foreign sender, duplicates, missing binding and invalid timestamp',()=>{
 for(const data of [[{...row,channelId:id(8)}],[{...row,senderAccountId:id(8)}],[row,row],[{...row,createdAt:'invalid'}]])assert.throws(()=>parseDealworkMessages({data},binding));
 assert.throws(()=>parseDealworkMessages({data:[row]}));
});
test('OFF and missing account both make zero transport calls',async()=>{
 let calls=0;for(const enabled of [false,true]){const adapter=createDealworkMessages({call:async()=>{calls++;},isEnabled:()=>enabled});assert.equal(adapter.available,false);await assert.rejects(adapter.inspect({contractId:id(3)}));await assert.rejects(adapter.send({contractId:id(3),content:'fixture'}));}assert.equal(calls,0);
});
const contract={id:id(9),jobId:id(10),workerAccountId:id(1),buyerAccountId:id(2)};
function fixture({changeBuyer=false,foreign=false,noReadback=false}={}){
 const calls=[],rows=[row];let posts=0;
 const adapter=createDealworkMessages({ownAccountId:id(1),isEnabled:()=>true,call:async(method,path,body)=>{
  calls.push({method,path,body});
  if(method==='POST'){posts++;if(!noReadback)rows.push({...row,id:id(11),senderAccountId:id(1),content:body.content});return {data:{}};}
  if(path.endsWith('/messages'))return {data:foreign?[{...row,senderAccountId:id(88)}]:[...rows]};
  return {data:{...contract,...(changeBuyer&&calls.length>2?{buyerAccountId:id(77)}:{})}};
 }});return {adapter,calls,get posts(){return posts;}};
}
test('binds exact contract resource and confirms send by independent readback',async()=>{
 const f=fixture(),b=await f.adapter.inspect({contractId:id(9)});assert.notEqual(b.channelId,b.contractId);
 const result=await f.adapter.send(b,{content:'new fixture'});assert.equal(result.verified,true);assert.equal(f.posts,1);
 const p=f.calls.find(c=>c.method==='POST');assert.equal(p.path,'/api/v1/contracts/'+id(9)+'/messages');assert.deepEqual(p.body,{content:'new fixture'});
 assert.equal(f.calls.at(-1).method,'GET');
});
test('rejects foreign participants and changed contract before posting',async()=>{
 const f=fixture({foreign:true});await assert.rejects(f.adapter.inspect({contractId:id(9)}));assert.equal(f.posts,0);
 const g=fixture({changeBuyer:true}),b=await g.adapter.inspect({contractId:id(9)});await assert.rejects(g.adapter.send(b,{content:'fixture'}));assert.equal(g.posts,0);
});
test('failed readback has no automatic retry',async()=>{
 const f=fixture({noReadback:true}),b=await f.adapter.inspect({contractId:id(9)});await assert.rejects(f.adapter.send(b,{content:'unconfirmed'}),/do not retry/);assert.equal(f.posts,1);
});
test('a newer buyer correction invalidates the original composed reply before POST',async()=>{const rows=[row];let posts=0;const adapter=createDealworkMessages({ownAccountId:id(1),isEnabled:()=>true,call:async(method,path)=>{if(method==='POST'){posts++;return {data:{}};}return path.endsWith('/messages')?{data:[...rows]}:{data:contract};}}),b=await adapter.inspect({contractId:contract.id});rows.push({...row,id:id(70),content:'Cancel that request',createdAt:'2026-10-18T12:00:01Z'});await assert.rejects(adapter.send(b,{content:'Old answer'}),e=>e.dispatchNotStarted===true);assert.equal(posts,0);});
