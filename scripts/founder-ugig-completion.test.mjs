import test from 'node:test';import assert from 'node:assert/strict';
import {createUgigCompletion} from './founder-ugig-completion.mjs';
import {pilotFixture} from './founder-ugig-pilot-fixture.mjs';
import {digest} from './founder-restoration-integrity.mjs';
for(const kind of ['acceptance','payment'])for(const change of ['none','revoked','off'])test(kind+' rechecks evidence after durable recording: '+change,async()=>{
 const f=pilotFixture(),order={...f.order(),deliveryDigest:digest('synthetic-delivery')};let on=true,records=0;
 const invoice={id:'77777777-7777-4777-8777-777777777777',gig_id:f.a.gigId,application_id:f.a.applicationId,worker_id:f.a.ownerId,poster_id:f.a.buyerId,status:'paid',amount_usd:1,currency:'USD'};
 const pack={agreement:f.a,acceptance:{reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:order.deliveryDigest,messageId:f.messages[0].id,contentDigest:digest(f.messages[0].content)},netReceipt:{reviewed:true,independentlyVerified:true,kind:'provider-settlement',receiptId:'synthetic-receipt',evidenceRef:'synthetic-source',evidenceDigest:digest('synthetic'),scopeDigest:f.a.scopeDigest,recipient:'synthetic-owner',netAmountMinor:100,currency:'USD',receivedAt:new Date(f.now-1).toISOString(),invoiceId:invoice.id,invoiceDigest:digest(invoice)}};
 const completion=createUgigCompletion({isEnabled:()=>on,now:()=>f.now,credential:()=>'synthetic',evidence:{pack:()=>structuredClone(pack)},request:async(url,options)=>{assert.equal(options.method,'GET');return url.endsWith('/invoice')?Response.json({data:[invoice]}):f.request(url,options);},recordEvidence:async()=>{records++;await Promise.resolve();if(change==='revoked')pack[kind==='acceptance'?'acceptance':'netReceipt'].reviewed=false;if(change==='off')on=false;return 'synthetic-durable-reference';}});
 const run=()=>completion[kind==='acceptance'?'readAcceptance':'readPayment'](order,{});
 if(change==='none'){const r=await run();assert.equal(r[kind==='acceptance'?'accepted':'confirmed'],true);}
 else await assert.rejects(run(),change==='off'?/OFF/:/changed|revoked/i);
 assert.equal(records,1);assert.equal(f.posts(),0);
});
for(const fault of ['future','duplicate-id','tied-latest'])test('buyer acceptance rejects ambiguous chronology: '+fault,async()=>{
 const f=pilotFixture(),message=f.messages[0],order={...f.order(),deliveryDigest:digest('synthetic-delivery')};let records=0;
 const pack={agreement:f.a,acceptance:{reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:order.deliveryDigest,messageId:message.id,contentDigest:digest(message.content)}};
 if(fault==='future')message.created_at=new Date(f.now+60000).toISOString();
 if(fault==='duplicate-id')f.messages.unshift({...message,content:'Different statement',created_at:new Date(f.now-1000).toISOString()});
 if(fault==='tied-latest')f.messages.unshift({...message,id:'66666666-6666-4666-8666-666666666666',content:'Do not accept this delivery'});
 const c=createUgigCompletion({isEnabled:()=>true,now:()=>f.now,request:f.request,credential:()=>'synthetic',evidence:{pack:()=>structuredClone(pack)},recordEvidence:()=>{records++;return 'synthetic-recorded';}});
 await assert.rejects(c.readAcceptance(order,{}),/buyer acceptance/);assert.equal(records,0);assert.equal(f.posts(),0);
});
