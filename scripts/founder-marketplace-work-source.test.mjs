import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';import {openOrderExecution} from './founder-order-execution.mjs';import {digest} from './founder-restoration-integrity.mjs';import {profileFilesDigest} from './founder-work-profiles.mjs';
const image='sha256:'+'a'.repeat(64),now=Date.now(),files=[{path:'src/main.py',content:'def f(): return 1\n'},{path:'tests/test_main.py',content:'original tests'}];
for(const value of [undefined,null,'','   '])test('delivery readback rejects absent product identity: '+String(value),async()=>{
 const f=fixture('guru');let reads=0;
 const product=value===undefined?{}:{digest:value};
 const response={...f.order,...product,verified:true,remoteId:'fake-native-delivery',evidenceRef:'fake-independent-readback',observedAt:now,expiresAt:now+60000};
 const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks,readDelivery:async()=>{reads++;return response;}});
 await assert.rejects(c.methods['reconcile-delivery']({...f.ctx,product,deliveryIntent:'fake-intent'}),/product digest/);
 assert.equal(reads,0);assert.equal(f.sends(),0);
});
test('delivery readback accepts a bound product and rejects a different product',async()=>{
 const f=fixture('guru'),hash=digest({files});
 f.setDelivery({...f.order,digest:hash,verified:true,remoteId:'fake-native-delivery',evidenceRef:'fake-independent-readback',observedAt:now,expiresAt:now+60000});
 const ctx={...f.ctx,product:{digest:hash},deliveryIntent:'fake-intent'};
 assert.equal((await f.contract.methods['reconcile-delivery'](ctx)).confirmed,true);
 await assert.rejects(f.contract.methods['reconcile-delivery']({...ctx,product:{digest:digest('different')}}),/readback/);
 assert.equal(f.sends(),0);
});
for(const change of ['permission','terms','expiry','unchanged'])test('verification rechecks assignment after verifier: '+change,async()=>{
 const f=fixture('guru');let clock=now,reads=0;
 const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>clock,...f.hooks,
  readAssignment:async()=>{reads++;return f.receipt();},
  verifyProduct:async()=>{if(change==='permission')f.binding.aiAllowed=false;if(change==='terms')f.funding.netAmountMinor--;if(change==='expiry')clock+=60001;return true;}});
 const prepared=await c.prepareLocal(f.ctx),product={binding:prepared.binding};reads=0;
 if(change==='unchanged'){assert.equal(await c.verifyProduct(product,f.ctx),true);assert.equal(reads,2);}
 else await assert.rejects(c.verifyProduct(product,f.ctx),/permission|changed|Fresh authoritative/);
 assert.equal(f.sends(),0);
});
for(const method of ['prepareLocal','acceptance','payment','reconcile-delivery'])test('foreign source is rejected before '+method+' evidence reads',async()=>{
 let reads=0;
 const reader=async()=>{reads++;throw Error('Reader must not be reached');};
 const source=createMarketplaceWorkSource({platform:'guru',sourceId:'source-guru',isEnabled:()=>true,readAssignment:reader,verifyProduct:async()=>true,submitDelivery:reader,readDelivery:reader,readAcceptance:reader,readPayment:reader});
 const ctx={order:{sourceId:'source-other',externalId:'job',ownerId:'own'},assertActive(){}};
 await assert.rejects(()=>method==='prepareLocal'?source.prepareLocal(ctx):source.methods[method](ctx),/(Marketplace|Delivery) source mismatch/);
 assert.equal(reads,0);
});
function fixture(platform){let on=true,sends=0;const order={sourceId:'source-'+platform,externalId:'job-1',ownerId:'own',rootTaskId:'unchanged-order-root',sourceRevision:'revision-1',scopeDigest:'scope-1'};
 const funding={...order,verified:true,expiresAt:now+60000,evidenceRef:'fake-independent-funding',amountMinor:10000,netAmountMinor:9500,currency:'USD',recipient:'own-payment-account'};
 const binding={...order,assignmentConfirmed:true,termsVerified:true,aiAllowed:true,buyerId:'buyer',profileId:'python',inputs:[{privacy:'public',id:'sample'}],acceptanceCriteria:['regression fails original'],files,funding};
 let receipt={platform,accountId:'own',observedAt:now,expiresAt:now+60000,evidenceRef:'fake-authoritative-assignment',binding},delivery=null;
 const hooks={readAssignment:async()=>receipt,verifyProduct:async()=>true,submitDelivery:async request=>{sends++;delivery={...order,verified:true,digest:request.product.digest,remoteId:'native-delivery',evidenceRef:'fake-native-readback',observedAt:now,expiresAt:now+60000};},readDelivery:async()=>delivery};
 const contract=createMarketplaceWorkSource({platform,sourceId:order.sourceId,isEnabled:()=>on,now:()=>now,...hooks});return {order,binding,funding,contract,hooks,setReceipt:r=>receipt=r,receipt:()=>receipt,on:v=>on=v,sends:()=>sends,ctx:{order,assertActive(){},grant:{reservationId:'fake-only',maxCostRappen:50}},setDelivery:x=>delivery=x};}
for(const platform of ['ugig','guru','freelancer'])test(platform+' has bound preparation, isolated work, validation and journalled native delivery',async()=>{
 const f=fixture(platform),dir=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-work-'));let execution;const sandbox={available:true,image,certification:{profileId:'python',image,verified:true,isolated:true,network:'none',hostMounts:false,evidenceRef:'fake-runtime'},async run(rows){return {passed:!rows.some(x=>x.path.includes('regression'))||rows.some(x=>x.content.includes('return 2')),tests:1,image,sourceDigest:profileFilesDigest(rows),network:'none',hostMounts:false};}};
 try{execution=openOrderExecution({directory:dir,isEnabled:()=>true,options:{sources:[f.contract],sandboxes:{python:sandbox},generate:async()=>({changes:[{path:'src/main.py',content:'def f(): return 2\n'},{path:'tests/test_regression.py',content:'regression'}]})}});for(const kind of ['prepare','work','verify']){const r=await execution.adapters[kind].execute(f.ctx);assert.equal(r.confirmed,true);if(r.verification)f.order.verification=r.verification;}const result=await execution.adapters.submit.execute(f.ctx);assert.equal(result.confirmed,true);assert.equal(f.sends(),1);await assert.rejects(execution.adapters.submit.execute(f.ctx),/reconciliation/);assert.equal(f.sends(),1);assert.equal(execution.snapshot().deliveries[0].status,'confirmed');assert.equal(f.order.rootTaskId,'unchanged-order-root');}finally{execution?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('OFF does not read evidence; missing platform dependencies remain explicitly blocked',async()=>{let reads=0;const source=createMarketplaceWorkSource({platform:'guru',sourceId:'s',isEnabled:()=>false,readAssignment:async()=>{reads++;}});await assert.rejects(source.prepareLocal({order:{},assertActive(){}}),/OFF/);assert.equal(reads,0);const unavailable=createMarketplaceWorkSource({platform:'freelancer',sourceId:'s',isEnabled:()=>true});assert.deepEqual(unavailable.profiles,[]);assert.equal(unavailable.readiness().liveReady,false);assert.equal(unavailable.methods.submit,undefined);});
test('foreign owner, family, revision, scope, stale proof, missing assignment and expired funding cannot prepare',async()=>{for(const change of ['owner','root','revision','scope','stale','assigned','funding','private']){const f=fixture('ugig');if(change==='owner')f.binding.ownerId='foreign';if(change==='root')f.binding.rootTaskId='new-budget';if(change==='revision')f.binding.sourceRevision='old';if(change==='scope')f.binding.scopeDigest='other';if(change==='stale')f.receipt().observedAt=now-60001;if(change==='assigned')f.binding.assignmentConfirmed=false;if(change==='funding')f.funding.expiresAt=now-1;if(change==='private')f.binding.inputs=[{privacy:'private'}];await assert.rejects(f.contract.prepareLocal(f.ctx));assert.equal(f.sends(),0);}});
test('funded status never bypasses native source/order/funding identity',async()=>{const f=fixture('guru');f.funding.externalId='different-job';await assert.rejects(f.contract.prepareLocal(f.ctx));assert.equal(f.sends(),0);});
test('delivery requires fresh independent exact readback, not a successful send response',async()=>{const f=fixture('freelancer');f.hooks.submitDelivery=async()=>({success:true});const c=createMarketplaceWorkSource({platform:'freelancer',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks}),prepared=await c.prepareLocal(f.ctx),hash=digest({files});f.order.verification={passed:true,digest:hash};await assert.rejects(c.methods.submit({...f.ctx,product:{files,digest:hash,contractDigest:prepared.binding.workContractDigest},deliveryIntent:'intent'}));});
test('changed inputs, price or recipient invalidate a previously prepared delivery without dispatch',async()=>{for(const change of ['input','amount','recipient']){const f=fixture('ugig'),p=await f.contract.prepareLocal(f.ctx),hash=digest({files});f.order.verification={passed:true,digest:hash};if(change==='input')f.binding.inputs.push({privacy:'public',id:'changed'});if(change==='amount')f.funding.netAmountMinor--;if(change==='recipient')f.funding.recipient='different-account';await assert.rejects(f.contract.methods.submit({...f.ctx,product:{files,digest:hash,contractDigest:p.binding.workContractDigest},deliveryIntent:'intent'}),/contract changed/);assert.equal(f.sends(),0);}});
test('postpaid requires the existing authority and never expands the CHF1 exposure',async()=>{const f=fixture('guru');delete f.binding.funding;f.binding.paymentAuthorization={paymentMode:'postpaid-limited',exposureRappen:101,amountMinor:10000,netAmountMinor:9500,currency:'USD',recipient:'own-payment-account'};const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks,paymentAuthority:{allows:()=>true}});await assert.rejects(c.prepareLocal(f.ctx),/CHF1/);f.binding.paymentAuthorization.exposureRappen=100;assert.equal((await c.prepareLocal(f.ctx)).confirmed,true);});
test('buyer acceptance cannot be inferred from delivery or an unrelated actor',async()=>{const f=fixture('guru');f.order.buyerId='buyer';f.order.deliveryDigest='delivered-hash';let actor='unrelated';const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks,readAcceptance:async()=>({...f.order,actorId:actor,verified:true,accepted:true,observedAt:now,expiresAt:now+60000,evidenceRef:'fake-native-acceptance'})});await assert.rejects(c.methods.acceptance(f.ctx),/buyer acceptance/);actor='buyer';assert.equal((await c.methods.acceptance(f.ctx)).confirmed,true);});

test('worker receives no inputs after assignment permission is revoked',async()=>{
 const f=fixture('guru'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-revoke-'));let calls=0,execution;
 const sandbox={available:true,image,certification:{profileId:'python',image,verified:true,isolated:true,network:'none',hostMounts:false,evidenceRef:'fake-runtime'}};
 try{execution=openOrderExecution({directory:dir,isEnabled:()=>true,options:{sources:[f.contract],sandboxes:{python:sandbox},generate:async()=>{calls++;throw Error('worker must not run');}}});await execution.adapters.prepare.execute(f.ctx);f.binding.aiAllowed=false;await assert.rejects(execution.adapters.work.execute(f.ctx),/permission/);assert.equal(calls,0);}finally{execution?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('persisted payment terms cannot replace freshly prepared agreement',async()=>{
 const f=fixture('guru'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-terms-'));let execution;
 try{f.order.funding={...f.funding,netAmountMinor:9000};execution=openOrderExecution({directory:dir,isEnabled:()=>true,options:{sources:[f.contract]}});await assert.rejects(execution.adapters.prepare.execute(f.ctx),/agreement/);assert.equal(execution.snapshot().products,0);}finally{execution?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('payment cannot confirm amended settlement terms or a different delivery',async()=>{
 const f=fixture('guru'),p=await f.contract.prepareLocal(f.ctx);f.order.funding={...f.funding};f.order.deliveryDigest='delivered-hash';
 const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks,readPayment:async()=>({...f.order,confirmed:true,amountMinor:f.funding.netAmountMinor,currency:'USD',recipient:f.funding.recipient,deliveryDigest:f.order.deliveryDigest,observedAt:now,expiresAt:now+60000,evidenceRef:'fake-payment'})});
 const ctx={...f.ctx,product:{contractDigest:p.binding.workContractDigest}};assert.equal((await c.methods.payment(ctx)).confirmed,true);f.funding.netAmountMinor--;await assert.rejects(c.methods.payment(ctx),/contract/);
});
test('acceptance requires a nonempty delivered digest',async()=>{const f=fixture('guru');f.order.buyerId='buyer';const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks,readAcceptance:async()=>({...f.order,actorId:'buyer',verified:true,accepted:true,observedAt:now,expiresAt:now+60000,evidenceRef:'fake-acceptance'})});await assert.rejects(c.methods.acceptance(f.ctx),/acceptance/);});

test('marketplace invoice contract is bound across preparation and delivery',async()=>{
 for(const changed of [false,true]){
 const f=fixture('guru'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'marketplace-invoice-'));let execution;
 const rows=[{id:'invoice-1',amountMinor:123,currency:'CHF'}];
 Object.assign(f.binding,{profileId:'structured-data',data:{rows,contract:{columns:['id','amountMinor','currency'],required:['id','amountMinor','currency'],deduplicateBy:[],trim:[],lowercase:[]}},qualityContract:{profile:'invoice-reconciliation-v1',referenceRows:rows,referenceDigest:digest(rows),evidenceRef:'contract:reviewed-invoice'}});
 const approved=digest(f.binding.qualityContract);
 const c=createMarketplaceWorkSource({platform:'guru',sourceId:f.order.sourceId,isEnabled:()=>true,now:()=>now,...f.hooks,validateQualityContract:b=>digest(b.qualityContract)===approved});
 try{execution=openOrderExecution({directory:dir,isEnabled:()=>true,options:{sources:[c]}});
 assert.deepEqual(execution.adapters.verify.qualityProfilesForSource('unknown'),[]);assert.ok(execution.adapters.verify.qualityProfilesForSource(f.order.sourceId).includes('invoice-reconciliation-v1'));
 for(const kind of ['prepare','work','verify']){const r=await execution.adapters[kind].execute(f.ctx);assert.equal(r.confirmed,true);if(r.verification)f.order.verification=r.verification;}
 if(changed){f.binding.qualityContract={...f.binding.qualityContract,evidenceRef:'contract:changed'};await assert.rejects(execution.adapters.submit.execute(f.ctx));assert.equal(f.sends(),0);}
 else{assert.equal((await execution.adapters.submit.execute(f.ctx)).confirmed,true);assert.equal(f.sends(),1);}
 }finally{execution?.close();fs.rmSync(dir,{recursive:true,force:true});}
 }
});
