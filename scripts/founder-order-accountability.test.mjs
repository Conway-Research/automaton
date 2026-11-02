import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeNativeWork} from './founder-native-work.mjs';
import {selectOrderCandidate} from './founder-order-selection.mjs';
import {orderAccounts,validateOrderPayment} from './founder-order-accountability.mjs';
import {openOpportunityStore} from './founder-opportunity-store.mjs';
const key={sourceId:'fake',externalId:'one',ownerId:'own'};
const funding={...key,verified:true,expiresAt:Date.now()+60000,evidenceRef:'fake:funding',amountMinor:10000,netAmountMinor:9000,currency:'CHF',recipient:'own-account'};
const order={...key,rootTaskId:'root',sourceRevision:'r1',scopeDigest:'scope',buyerId:'customer',termsVerified:true,assignmentConfirmed:true,aiAllowed:true,profileId:'python',inputs:[{id:'sample',privacy:'public'}],acceptanceCriteria:['agreed tests pass'],funding};
const payment={...key,confirmed:true,evidenceRef:'fake:receipt',amountMinor:9000,currency:'CHF',recipient:'own-account'};
const entry={id:'cost1',taskId:'root',actualCostRappen:50,maxCostRappen:100};
test('complete large contracts remain eligible; missing binding fields block preparation',()=>{
 assert.deepEqual(normalizeNativeWork({...order,scope:'large'},{profiles:['python']}).blockers,[]);
 for(const field of ['buyerId','termsVerified','aiAllowed','scopeDigest']){const b={...order};delete b[field];assert.ok(normalizeNativeWork(b,{profiles:['python']}).blockers.length,field);}
 for(const field of ['amountMinor','netAmountMinor','recipient','currency']){const b={...order,funding:{...funding}};delete b.funding[field];assert.ok(normalizeNativeWork(b,{profiles:['python']}).blockers.length,field);}
});
test('large scope does not force a small milestone',()=>{
 const c={title:'Complete integration',url:'https://example.invalid/1',remoteState:'open',fit:'strong',scope:'large',acceptance:'clear',payment:'protected',aiUse:'allowed',applicationFeeMinor:0,proposalCount:1,observedAt:new Date().toISOString()};
 assert.equal(selectOrderCandidate(c).decision,'propose');
});
test('payment must match price, currency, recipient and owner',()=>{
 assert.doesNotThrow(()=>validateOrderPayment(order,payment));
 for(const change of [{amountMinor:1},{currency:'USD'},{recipient:'other'},{ownerId:'other'},{confirmed:false}])assert.throws(()=>validateOrderPayment(order,{...payment,...change}));
});
test('atomic store settlement rejects reuse across orders and paid-state rollback',()=>{
 const s=openOpportunityStore(':memory:');
 try{
 const register=o=>s.register({...o,state:'accepted',provenance:{type:'reviewed-local-registration',ownerId:'own',evidenceRef:'fake:registration'}});
 register(order);s.update(order,'r1',{state:'paid',payment});s.update(order,'r1',{state:'paid',payment});
 const second={...order,externalId:'two',rootTaskId:'root2'};register(second);
 assert.throws(()=>s.update(second,'r1',{state:'paid',payment:{...payment,externalId:'two'}}),/receipt/i);
 assert.equal(s.snapshot().orders.find(o=>o.externalId==='two').state,'accepted');
 assert.throws(()=>s.update(order,'r1',{state:'accepted'}),/paid/i);
 }finally{s.close();}
});
test('costs include retries once; reservations are not actual spend; foreign currency has no invented profit',()=>{
 const budget={entriesComplete:true,entries:[entry,{...entry},{id:'retry',taskId:'root',actualCostRappen:20,maxCostRappen:50}]};
 const account=orderAccounts([{...order,state:'paid',payment}],budget).orders[0];
 assert.equal(account.actualCostRappen,70);assert.equal(account.contributionRappen,8930);
 const pending=orderAccounts([{...order,state:'paid',payment}],{...budget,entries:[entry,{id:'pending',taskId:'root',actualCostRappen:null,maxCostRappen:100}]}).orders[0];
 assert.equal(pending.heldRappen,100);assert.equal(pending.contributionRappen,null);
 const foreign={...order,funding:{...funding,currency:'USD'},state:'paid',payment:{...payment,currency:'USD'}};
 assert.equal(orderAccounts([foreign],budget).orders[0].contributionRappen,null);
 assert.equal(orderAccounts([{...order,state:'paid',payment}],{...budget,entriesComplete:false}).orders[0].contributionRappen,null);
 assert.equal(orderAccounts([{...order,state:'paid',payment}],{entriesComplete:true,entries:[]}).orders[0].contributionRappen,null);
});
test('shared cost roots, conflicting costs and reused receipts cannot produce a profit',()=>{
 const other={...order,externalId:'two',state:'paid',payment:{...payment,externalId:'two'}};
 const result=orderAccounts([{...order,state:'paid',payment},other],{entriesComplete:true,entries:[entry]});
 assert.ok(result.orders.every(o=>o.contributionRappen===null));
 const conflict=orderAccounts([{...order,state:'paid',payment}],{entriesComplete:true,entries:[entry,{...entry,actualCostRappen:10}]}).orders[0];
 assert.equal(conflict.contributionRappen,null);
});
