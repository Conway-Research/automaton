import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderFunding,issueFundingTerms} from './founder-order-funding.mjs';

const at=Date.parse('2026-10-15T19:00:00Z');
const terms={orderUrl:'https://github.com/owner/project/issues/1',amountMinor:5000,currency:'USD',recipient:'github:tricebr'};
const evidence=()=>({...terms,kind:'escrow-lock',status:'held',escrowId:'lock-1',sourceUrl:'https://escrow.example/locks/lock-1',observedAt:new Date(at).toISOString(),expiresAt:new Date(at+60_000).toISOString()});
const source=read=>({provider:'test-provider',origin:'https://escrow.example',read});

test('default has no financial authority and ignores freely supplied verification flags',async()=>{
 const guard=createOrderFunding({now:()=>at});assert.equal(guard.status().available,false);
 await assert.rejects(guard.require({...terms,verified:true,funding:evidence()}),/Funding/);
});

test('a fresh official lock is bound to all order terms and yields a sanitized digest',async()=>{
 let reads=0;const guard=createOrderFunding({source:source(async expected=>{reads++;assert.deepEqual(expected,terms);return {...evidence(),password:'never persist',verified:true};}),now:()=>at});
 const proof=await guard.require(terms);assert.equal(reads,1);assert.equal(proof.status,'held');assert.equal(proof.provider,'test-provider');assert.match(proof.digest,/^[a-f0-9]{64}$/);assert.ok(Object.isFrozen(proof));assert.ok(!JSON.stringify(proof).includes('password'));assert.ok(!Object.hasOwn(proof,'verified'));
});

test('wrong order, underfunding, currency, beneficiary and non-lock claims are rejected',async()=>{
 for(const change of [{environment:'sandbox'},{liveAuthority:false},{orderUrl:terms.orderUrl+'0'},{amountMinor:4999},{amountMinor:5001},{currency:'SOL'},{recipient:'github:other'},{kind:'balance'},{kind:'bounty'},{status:'posted'},{status:'released'},{status:'refunded'},{status:'cancelled'},{escrowId:''},{verified:true,kind:undefined}]){
  await assert.rejects(createOrderFunding({source:source(async()=>({...evidence(),...change})),now:()=>at}).require(terms),/Funding/);
 }
});

test('stale and future observations, expired locks and unofficial references are rejected',async()=>{
 for(const change of [{observedAt:new Date(at-60_000).toISOString(),expiresAt:new Date(at+100_000).toISOString()},{observedAt:new Date(at-60_001).toISOString(),expiresAt:new Date(at+100_000).toISOString()},{observedAt:new Date(at+1).toISOString()},{observedAt:null},{expiresAt:new Date(at).toISOString()},{expiresAt:'unknown'},{sourceUrl:'https://evil.example/locks/lock-1'},{sourceUrl:'https://secret@escrow.example/locks/lock-1'},{sourceUrl:'https://escrow.example/locks/lock-1?token=secret'},{sourceUrl:'https://escrow.example/locks/lock-1#secret'}]){
  await assert.rejects(createOrderFunding({source:source(async()=>({...evidence(),...change})),now:()=>at}).require(terms),/Funding/);
 }
});

test('renewed reads cannot silently replace the escrow commitment and persisted proof cannot authorize restart',async()=>{
 let current=evidence(),reads=0;const guard=createOrderFunding({source:source(async()=>{reads++;return current;}),now:()=>at});
 const proof=JSON.parse(JSON.stringify(await guard.require(terms)));
 current={...evidence(),escrowId:'another-lock'};await assert.rejects(guard.require(terms,null,{previous:proof}),/commitment changed/);
 current={...evidence(),status:'refunded'};await assert.rejects(guard.require(terms,null,{previous:proof}),/held escrow/);
 assert.equal(reads,3);await assert.rejects(createOrderFunding().require(terms,null,{previous:proof}),/unavailable/);
});

test('a failed source read is sanitized and cancellation after a read blocks work',async()=>{
 const guard=createOrderFunding({source:source(async()=>{throw Error('secret-access-token');}),now:()=>at});
 await assert.rejects(guard.require(terms),e=>e.message.includes('Funding')&&!e.message.includes('secret'));
 const abort=new AbortController();const other=createOrderFunding({source:source(async()=>{abort.abort();return evidence();}),now:()=>at});
 await assert.rejects(other.require(terms,{signal:abort.signal}),/cancelled/);
});

test('funding terms come from the immutable issue and reject ambiguous prices',()=>{
 assert.deepEqual(issueFundingTerms({body:'Bounty $50. AI-assisted contributions welcome.',html_url:terms.orderUrl},'tricebr'),terms);
 for(const body of ['Bounty $0','Reward $50 or $60','Bounty $1,000','Bounty $50.001','Budget $50','Bounty $50-100','Bounty $50k','Bounty $50e3','Bounty $50 + $50','Bounty $50 million','Bounty $50 CAD','Bounty $50e3. Administrative fee $50.','Bounty $1,000. Processing fee $50.','Bounty $50 to 100','Bounty $50 per hour','Bounty $50 minimum'])assert.throws(()=>issueFundingTerms({body,html_url:terms.orderUrl},'tricebr'),/Funding/);
 assert.throws(()=>issueFundingTerms({body:'Bounty $50',html_url:terms.orderUrl},'other'),/Funding/);
});
