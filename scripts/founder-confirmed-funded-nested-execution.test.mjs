import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createConfirmedFundedAuthority} from './founder-confirmed-funded-authority.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
import {digest} from './founder-restoration-integrity.mjs';
test('real authority and real nested prepare adapter refresh without self-rejecting a deliberately invalidated cache',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'confirmed-nested-real-'));let app,reads=0,preparations=0;
 const workPackages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]},sourceId=normalizeInventory({},workPackages).sources[0].id,key={sourceId,externalId:'job',ownerId:'own'};
 const work={milestoneId:'one',inputsDigest:digest('inputs'),acceptanceDigest:digest('acceptance'),deadlineUtc:new Date(Date.now()+30*86400000).toISOString(),correctionScopeDigest:digest('corrections'),grossDecimal:'38',deductionsDecimal:'2',netDecimal:'36',currency:'USD',recipient:'account:own',paymentTrigger:'accepted'};
 const order={...key,buyerId:'buyer',customerWork:work,rootTaskId:'root',sourceRevision:'r1',scopeDigest:digest('scope'),profileId:'structured-data',state:'assigned',termsVerified:true,funding:{...key,verified:true,amountMinor:3800,netAmountMinor:3600,currency:'USD',recipient:'account:own',evidenceRef:'local:synthetic-funded',expiresAt:Date.now()+3600000},provenance:{type:'reviewed-local-registration',ownerId:'own',evidenceRef:'local:synthetic-owned'}};
 const authority=createConfirmedFundedAuthority({isEnabled:()=>true,allowSyntheticForTests:true,ownRecipients:{own:['account:own']},source:{testOnly:true,origin:'https://fixtures.invalid',async read(expected,ctx){ctx.assertActive?.();reads++;const now=Date.now(),part={bindingDigest:digest(expected),sourceRef:'https://fixtures.invalid/'+reads};return {schema:'confirmed-funded-customer-work-v1',environment:'synthetic',bindingDigest:digest(expected),observedAt:now,expiresAt:now+60000,assignment:{...part,platformOrderId:expected.externalId,status:'assigned',buyerId:'buyer',contractorId:'own'},compensation:{...part,...work},funding:{...part,fundingId:'funding:'+expected.externalId+':'+expected.customerWork.milestoneId,kind:'funded-escrow',status:'held',amountDecimal:'38',currency:'USD',recipient:'account:own'}};}}});
 try{
  app=openOrderRestoration({base,directory:path.join(base,'state'),workPackages,isEnabled:()=>true,execution:{requireConfirmedFundedOrders:true,confirmedWorkAuthority:authority,sources:[{sourceId,profiles:['structured-data'],evidenceRef:'local:synthetic-contract',verify:()=>true,methods:{prepare:async()=>{preparations++;return {confirmed:true,binding:{...key,buyerId:'buyer',assignmentConfirmed:true,termsVerified:true,aiAllowed:true,profileId:'structured-data',scopeDigest:order.scopeDigest,inputs:[{id:'input',privacy:'public'}],acceptanceCriteria:['normalize data'],data:{rows:[{name:' A '}],contract:{columns:['name'],required:['name'],deduplicateBy:[],trim:['name'],lowercase:[]}}}};}}}]}});
  for(const cap of ['work','verify','submit','reconcile'])app.registry.setCapability(sourceId,cap,{state:'live-verified',expiresAt:Date.now()+60000,evidenceRefs:['local:synthetic']});
  app.store.register(order);
  const action={id:'prepare',kind:'prepare',orderKey:key,rootTaskId:'root',sourceRevision:'r1',maxCostRappen:0};
  await app.adapters['source-prepare'].execute({task:{rootTaskId:'root',input:{action}},grant:{reservationId:'synthetic-reservation',maxCostRappen:0},assertActive(){}});
  assert.equal(preparations,1);assert.equal(reads,4);assert.equal(app.store.snapshot().orders[0].state,'prepared');assert.equal(authority.allows(app.store.snapshot().orders[0]),true);
 }finally{app?.close();assert(path.resolve(base).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(base,{recursive:true,force:true});}
});
