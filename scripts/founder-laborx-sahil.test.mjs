import test from 'node:test';
import assert from 'node:assert/strict';
import {createSahilOrderGate,SAHIL_ORDER} from './founder-laborx-sahil.mjs';
const at=Date.parse('2026-10-26T10:00:00Z');
function fixture(){
 let enabled=true,reads=0;
 const agreement={...SAHIL_ORDER,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:buyer-message',authenticated:true,actorId:SAHIL_ORDER.buyerId,assignmentConfirmed:true,aiAllowed:true,scopeDigest:'scope-1',acceptanceCriteria:['five pages, responsive checks'],inputsReady:true,assetRightsConfirmed:true,deliveryAt:'2026-10-31T15:00:00Z',feasible:true,customerDeadlineAgreed:true,amountMinor:38000,currency:'USD',netAmountMinor:37000,feesKnown:true,paymentPromise:true,paymentDueAt:'2026-11-07T15:00:00Z',paymentMethod:'native-usdc-base',recipient:'fake-personal-payee',recipientRole:'personal-payout',recipientVerified:true,recipientAcknowledged:true,network:'base:8453',token:'native-USDC',paymentMode:'postpaid-limited',paymentTermsDigest:'terms-1'};
 const gate=createSahilOrderGate({isEnabled:()=>enabled,now:()=>at,readAgreement:async()=>{reads++;return structuredClone(agreement);},paymentAuthority:{allows:b=>b.paymentAuthorization?.verified===true&&b.paymentAuthorization.exposureRappen===100}});
 const order={...SAHIL_ORDER,scopeDigest:'scope-1',paymentTermsDigest:'terms-1',paymentAuthorization:{verified:true,exposureRappen:100}};
 return {gate,agreement,order,off:()=>enabled=false,reads:()=>reads};
}
test('exact postpaid order permits assessment without asserting receipt of payment',async()=>{const f=fixture();assert.deepEqual(await f.gate.assess(f.order),{ready:true,paymentConfirmed:false,paymentMode:'postpaid-limited',scopeDigest:'scope-1',paymentTermsDigest:'terms-1',evidenceRef:'fake:buyer-message'});});
test('OFF, other buyer/order and changed payment binding fail closed',async()=>{const f=fixture();f.off();await assert.rejects(f.gate.assess(f.order),/OFF/);assert.equal(f.reads(),0);for(const field of ['buyerId','ownerId','externalId','rootTaskId','scopeDigest','paymentTermsDigest']){const q=fixture();await assert.rejects(q.gate.assess({...q.order,[field]:'other'}));}});
test('promise alone never authorizes work or loosens CHF1 authority',async()=>{for(const change of [{paymentAuthorization:null},{paymentAuthorization:{verified:true,exposureRappen:101}}]){const f=fixture();await assert.rejects(f.gate.assess({...f.order,...change}),/CHF1/);}});
test('incomplete customer agreement, recipient or deadline cannot pass',async()=>{for(const change of [{authenticated:false},{actorId:'competitor'},{assignmentConfirmed:false},{aiAllowed:false},{inputsReady:false},{assetRightsConfirmed:false},{recipientAcknowledged:false},{recipientRole:'agent-wallet'},{recipientVerified:false},{paymentPromise:false},{feesKnown:false},{netAmountMinor:0},{acceptanceCriteria:[]},{customerDeadlineAgreed:false},{feasible:false},{deliveryAt:'2026-11-01T00:00:00Z'},{paymentDueAt:'2026-10-25T00:00:00Z'},{expiresAt:at},{observedAt:at+1}]){const f=fixture();Object.assign(f.agreement,change);await assert.rejects(f.gate.assess(f.order));}});
test('assessment is not an executable transport or a payment receipt',()=>{const f=fixture();assert.equal(f.gate.status().liveReady,false);assert.equal(f.gate.submit,undefined);assert.equal(f.gate.start,undefined);});

test('payment follow-up uses only the shared independent settlement authority, never the promise',async()=>{
 let enabled=true,calls=0;const order={...SAHIL_ORDER};
 const gate=createSahilOrderGate({isEnabled:()=>enabled,paymentAuthority:{async reconcile(o){calls++;assert.equal(o.externalId,SAHIL_ORDER.externalId);return {confirmed:false,blocker:'No receipt'};}}});
 assert.deepEqual(await gate.reconcilePayment(order),{confirmed:false,blocker:'No receipt'});
 await assert.rejects(gate.reconcilePayment({...order,buyerId:'other'}));assert.equal(calls,1);
 enabled=false;await assert.rejects(gate.reconcilePayment(order),/OFF/);assert.equal(calls,1);
});

test('missing independent payment authority remains unconfirmed',async()=>{
 const gate=createSahilOrderGate({isEnabled:()=>true});
 assert.deepEqual(await gate.reconcilePayment(SAHIL_ORDER),{confirmed:false,blocker:'Independent payment reconciliation unavailable'});
});
