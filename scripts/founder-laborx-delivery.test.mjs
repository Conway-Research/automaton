import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createLaborxSahilSource} from './founder-laborx-delivery.mjs';
import {SAHIL_ORDER} from './founder-laborx-sahil.mjs';
import {openOrderExecution} from './founder-order-execution.mjs';
import {digest} from './founder-restoration-integrity.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
const at=Date.parse('2026-10-26T10:00:00Z'),image='sha256:'+'a'.repeat(64);
const files=[{path:'index.html',content:'<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture</title></head><body><main><h1>Synthetic</h1></main></body></html>'},{path:'style.css',content:'body {margin:0} @media(max-width:600px){main{padding:1rem}}'},{path:'README.md',content:'Synthetic source. Open index.html.'}];
function fixture(){
 let on=true,sends=0,remote=null,permission=true;
 const order={...SAHIL_ORDER,sourceId:'laborx-fixture',sourceRevision:'r1',scopeDigest:'scope-1',paymentTermsDigest:'terms-1'};
 const paymentAuthorization={paymentMode:'postpaid-limited',exposureRappen:100,amountMinor:38000,netAmountMinor:37000,currency:'USD',recipient:'fake-personal',verified:true};
 const binding={...order,paymentAuthorization,profileId:'static-website',files,inputs:[{id:'synthetic',privacy:'public'}],acceptanceCriteria:['Static one-page fixture'],assignmentConfirmed:true,termsVerified:true,aiAllowed:true};
 const agreement={...order,authenticated:true,actorId:order.buyerId,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:agreement',assignmentConfirmed:true,aiAllowed:true,scopeDigest:order.scopeDigest,acceptanceCriteria:binding.acceptanceCriteria,inputsReady:true,assetRightsConfirmed:true,deliveryAt:'2026-10-31T15:00:00Z',feasible:true,customerDeadlineAgreed:true,...paymentAuthorization,feesKnown:true,paymentPromise:true,paymentDueAt:'2026-11-07T15:00:00Z',paymentMethod:'native-usdc-base',recipientRole:'personal-payout',recipientVerified:true,recipientAcknowledged:true,network:'base:8453',token:'native-USDC',paymentTermsDigest:order.paymentTermsDigest};
 const paymentAuthority={allows:b=>b.paymentAuthorization?.exposureRappen===100};
 const transport={
  access:async()=>({...order,accountId:order.ownerId,authenticated:true,automationAllowed:permission,operations:['read','submit','reconcile'],observedAt:at,expiresAt:at+60000,evidenceRef:'fake:provider-permission'}),
  readAssignment:async()=>({platform:'laborx',accountId:order.ownerId,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:assignment',binding:structuredClone(binding)}),
  submitDelivery:async p=>{sends++;remote={...order,verified:true,remoteId:'fake-delivery',digest:p.product.digest,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:independent-readback'};},
  readDelivery:async()=>remote,
  readAcceptance:async()=>({...order,verified:true,accepted:true,actorId:order.buyerId,deliveryDigest:order.deliveryDigest,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:acceptance'})
 };
 const readVisual=async p=>({...order,verified:true,filesDigest:profileFilesDigest(p.files),scopeDigest:order.scopeDigest,viewports:[{width:375,height:812,passed:true},{width:1440,height:900,passed:true}],acceptancePassed:true,network:'none',hostMounts:false,image,observedAt:at,expiresAt:at+60000,evidenceRef:'fake:visual'});
 const source=createLaborxSahilSource({sourceId:order.sourceId,isEnabled:()=>on,now:()=>at,readAgreement:async()=>structuredClone(agreement),paymentAuthority,transport,readVisual});
 const ctx={order,assertActive(){},grant:{reservationId:'fake'}};
 return {order,binding,agreement,paymentAuthority,transport,readVisual,source,ctx,off:()=>on=false,revoke:()=>permission=false,sends:()=>sends,clear:()=>remote=null};
}
test('Sahil source refuses missing platform permission, foreign orders and revoked consent',async()=>{
 const f=fixture();f.revoke();await assert.rejects(f.source.prepareLocal(f.ctx),/permission/);assert.equal(f.sends(),0);
 const g=fixture();await assert.rejects(g.source.prepareLocal({...g.ctx,order:{...g.order,externalId:'other'}}));g.off();await assert.rejects(g.source.prepareLocal(g.ctx),/OFF/);
});
test('static website runs prepare/work/verify/delivery/readback/acceptance with postpaid fakes',async()=>{
 const f=fixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sahil-website-'));let e,runs=0;
 const sandbox={available:true,image,certification:{profileId:'static-website',image,verified:true,isolated:true,network:'none',hostMounts:false,evidenceRef:'fake:isolation'},async run(v){runs++;return {passed:true,tests:1,sourceDigest:profileFilesDigest(v),image,network:'none',hostMounts:false};}};
 try{
  e=openOrderExecution({directory,isEnabled:()=>true,options:{sources:[f.source],paymentAuthority:f.paymentAuthority,sandboxes:{'static-website':sandbox},generateWebsite:async()=>({files:files.map(v=>v.path==='index.html'?{...v,content:v.content.replace('Synthetic','Synthetic finished')}:v),costReceipt:{actualCostRappen:0,evidenceRef:'fake:zero-cost'}})}});
  assert.equal((await e.adapters.prepare.execute(f.ctx)).confirmed,true);
  assert.equal((await e.adapters.work.execute(f.ctx)).confirmed,true);
  const verification=await e.adapters.verify.execute(f.ctx);assert.equal(verification.verification.passed,true);f.order.verification=verification.verification;
  const delivery=await e.adapters.submit.execute(f.ctx);assert.equal(delivery.confirmed,true);assert.equal(f.sends(),1);assert.ok(runs>0);
  await assert.rejects(e.adapters.submit.execute(f.ctx),/reconciliation/);assert.equal(f.sends(),1);
  f.order.deliveryDigest=verification.verification.digest;assert.equal((await f.source.methods.acceptance(f.ctx)).confirmed,true);
  assert.equal(f.source.readiness().liveReady,false);
 }finally{e?.close();fs.rmSync(directory,{recursive:true,force:true});}
});
test('visual approval must match exact content, isolated rendering and both viewports',async()=>{
 const f=fixture(),p=await f.source.prepareLocal(f.ctx),product={binding:p.binding,files,digest:digest({files})};
 for(const change of [{filesDigest:'other'},{network:'bridge'},{viewports:[{width:1440,height:900,passed:true}]},{acceptancePassed:false},{observedAt:at-60000}]){
  const source=createLaborxSahilSource({sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>at,readAgreement:async()=>f.agreement,paymentAuthority:f.paymentAuthority,transport:f.transport,readVisual:async x=>({...await f.readVisual(x),...change})});
  await assert.rejects(source.verifyProduct(product,f.ctx));
 }
 assert.equal(f.sends(),0);
});

test('changed buyer payment terms cannot authorize work against an old CHF1 commitment',async()=>{
 const f=fixture();f.binding.paymentAuthorization={...f.binding.paymentAuthorization,recipient:'foreign-payee'};
 await assert.rejects(f.source.prepareLocal(f.ctx),/payment/);assert.equal(f.sends(),0);
});

test('unknown dispatch is reconciled after restart without a second send',async()=>{
 const f=fixture(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'sahil-unknown-'));let e;
 const sandbox={available:true,image,certification:{profileId:'static-website',image,verified:true,isolated:true,network:'none',hostMounts:false,evidenceRef:'fake:isolation'},async run(v){return {passed:true,tests:1,sourceDigest:profileFilesDigest(v),image,network:'none',hostMounts:false};}};
 const dispatch=f.transport.submitDelivery;f.transport.submitDelivery=async(...args)=>{await dispatch(...args);throw Error('fake:connection lost after send');};
 const source=createLaborxSahilSource({sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>at,readAgreement:async()=>f.agreement,paymentAuthority:f.paymentAuthority,transport:f.transport,readVisual:f.readVisual});
 const options={sources:[source],paymentAuthority:f.paymentAuthority,sandboxes:{'static-website':sandbox},generateWebsite:async()=>({files,costReceipt:{actualCostRappen:0,evidenceRef:'fake:zero-cost'}})};
 try{
  e=openOrderExecution({directory,isEnabled:()=>true,options});await e.adapters.prepare.execute(f.ctx);await e.adapters.work.execute(f.ctx);
  f.order.verification=(await e.adapters.verify.execute(f.ctx)).verification;
  await assert.rejects(e.adapters.submit.execute(f.ctx),/connection lost/);assert.equal(f.sends(),1);
  e.close();e=openOrderExecution({directory,isEnabled:()=>true,options});
  await assert.rejects(e.adapters.submit.execute(f.ctx),/reconciliation/);assert.equal(f.sends(),1);
  assert.equal((await e.adapters['reconcile-delivery'].execute(f.ctx)).confirmed,true);assert.equal(f.sends(),1);
 }finally{e?.close();fs.rmSync(directory,{recursive:true,force:true});}
});
