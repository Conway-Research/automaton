import {createBinaryArtifactStore} from './founder-binary-artifacts.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import {ugigOrderScopeDigest} from './founder-ugig-order-contract.mjs';
import {UGIG_WORK_CHECKS} from './founder-ugig-order-pipeline.mjs';
import {orderAccounts} from './founder-order-accountability.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {pilotSettlementFixture} from './founder-ugig-sol-fixture.mjs';
import {pilotFixture} from './founder-ugig-pilot-fixture.mjs';
import {pilotScopeDigest} from './founder-ugig-pilot-contract.mjs';
import {digest,orderKey} from './founder-restoration-integrity.mjs';
import {createProductionOrderBindings} from './founder-production-order-bindings.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {planOrderActions} from './founder-order-lifecycle.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
import Database from 'better-sqlite3';
const packages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]};
function setup(multipart=false,solMode=false,general=false){
 const sf=solMode?pilotSettlementFixture():null,base=fs.mkdtempSync(path.join(os.tmpdir(),'ugig-production-')),f=sf?.f??pilotFixture();let on=true,calls=0;
 if(multipart){f.a.deliveryProtocol='numbered-messages-v1';f.a.conversationBinding={mode:'reviewed-buyer-message',messageId:f.messages[0].id};f.messages[0].content+=' Gig '+f.a.gigId+' application '+f.a.applicationId;f.a.agreementEvidence[0].contentDigest=digest(f.messages[0].content);f.a.contentBrief.formats=[{id:'social',kind:'social-post',count:5,maxCharacters:2000},{id:'email',kind:'email',count:1,maxCharacters:2000},{id:'summary',kind:'summary',count:3,maxCharacters:2000}];}
 const originalGig=f.a.gigId;
 if(general){const gig='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';Object.assign(f.a,{gigId:gig,externalId:'application:'+gig,rootTaskId:'ugig-'+digest(gig).slice(0,24),profileId:'structured-data',workKind:'data-cleaning',deliveryProtocol:'numbered-messages-v1',deliveryRequirements:{format:'text-files-v1',requiredFiles:['delivery.csv']},data:{rows:[{id:'one'}],contract:{columns:['id'],required:['id'],deduplicateBy:['id'],trim:[],lowercase:[]}}});delete f.a.contentBrief;if(solMode){sf.escrow.gig_id=gig;sf.provider.metadata.gig_id=gig;}}
 if(general==='report'){Object.assign(f.a,{profileId:'source-report',workKind:'research-report',report:{sources:[{id:'s',url:'https://example.com',observedAt:f.now,excerpt:'Synthetic fact.'}],claims:[{text:'Synthetic fact.',sourceId:'s',quote:'Synthetic fact.'}],now:f.now,maxAgeMs:10000},deliveryRequirements:{format:'text-files-v1',requiredFiles:['report.json']}});}
 if(general==='code'){Object.assign(f.a,{profileId:'node-js',workKind:'rest-api',files:[{path:'main.js',content:'module.exports=1'}],sources:[{id:'s',url:'https://example.com',claim:'synthetic'}],deliveryRequirements:{format:'text-files-v1',requiredFiles:['main.js','added.test.js']}});}
 if(['binary','mixed'].includes(general)){const artifacts=createBinaryArtifactStore({base,isEnabled:()=>on}).importExport({directory:path.resolve('scripts/fixtures/ugig-binary'),names:['book.xlsx','document.docx','plot.png','photo.jpg','model.zip']});f.messages[0].content+=' I explicitly approve public uGig attachments for book.xlsx, document.docx, plot.png, photo.jpg, model.zip.';f.a.agreementEvidence[0].contentDigest=digest(f.messages[0].content);Object.assign(f.a,{profileId:'reviewed-binary',workKind:'xlsx-automation',privacy:'public',inputs:[{id:'synthetic',privacy:'public'}],deliveryProtocol:'binary-attachments-v1',binaryArtifacts:artifacts,binaryProvenance:{reviewed:true,independentlyVerified:true,artifactDigest:digest(artifacts),evidenceRef:'synthetic-export'},deliveryRequirements:{format:'binary-attachments-v1',requiredFiles:artifacts.map(x=>x.name),publicAccess:{approved:true,buyerId:f.a.buyerId,...f.a.agreementEvidence[0],artifactDigest:digest(artifacts)}}});}
 if(general==='mixed'){f.a.deliveryProtocol='mixed-files-v1';f.a.deliveryRequirements.format='mixed-files-v1';f.a.files=[{path:'src/main.py',content:'print(42)\n'},{path:'results.csv',content:'id,value\n1,42\n'},{path:'README.md',content:'Synthetic offline usage instructions'}];f.a.deliveryRequirements.requiredFiles.push(...f.a.files.map(f=>f.path));f.a.deliveryRequirements.publicAccess.textDelivery='numbered-messages-v1';const packageDigest=digest({binaryArtifacts:f.a.binaryArtifacts,files:f.a.files});f.a.deliveryRequirements.publicAccess.packageDigest=packageDigest;f.a.binaryProvenance.packageDigest=packageDigest;}
 f.a.sourceId=normalizeInventory({},packages).sources[0].id;delete f.a.paymentAuthorization;
 if(!solMode)f.a.funding={...f.order(),verified:true,expiresAt:f.now+3600000,evidenceRef:'synthetic-prepayment',amountMinor:1000,netAmountMinor:900,currency:'USD',recipient:'synthetic-payee'};
 if(solMode)Object.assign(f.a.funding,f.order());
 f.a.scopeDigest=(general?ugigOrderScopeDigest:pilotScopeDigest)(f.a);f.a.funding.scopeDigest=f.a.scopeDigest;
 const terms=f.a.paymentAuthorization??f.a.funding,nowFn=()=>general?Math.max(Date.now(),f.now):f.now;f.a.customerWork={milestoneId:'one',inputsDigest:digest('inputs'),acceptanceDigest:digest('acceptance'),deadlineUtc:new Date(nowFn()+86400000).toISOString(),correctionScopeDigest:digest('corrections'),grossDecimal:'10',deductionsDecimal:'1',netDecimal:'9',currency:terms.currency,recipient:terms.recipient,paymentTrigger:'buyer-acceptance'};
 const confirmedWorkSource={testOnly:true,origin:'https://fixtures.invalid',async read(expected){const d=digest(expected),part={bindingDigest:d,sourceRef:'https://fixtures.invalid/evidence/1'};return {schema:'confirmed-funded-customer-work-v1',environment:'synthetic',bindingDigest:d,observedAt:nowFn(),expiresAt:nowFn()+60000,assignment:{...part,status:'assigned',buyerId:f.a.buyerId,contractorId:f.a.ownerId},compensation:{...part,...f.a.customerWork},funding:{...part,kind:'funded-escrow',status:'held',amountDecimal:'10',currency:terms.currency,recipient:terms.recipient}};}};

 const invoice={id:'77777777-7777-4777-8777-777777777777',gig_id:f.a.gigId,application_id:f.a.applicationId,worker_id:f.a.ownerId,poster_id:f.a.buyerId,status:'paid',amount_usd:10,currency:'USD'};
 const p={schema:'numaron-ugig-reviewed-v1',agreement:f.a,grant:{approved:true,agreementDigest:digest(f.a),expiresAt:f.now+3600000,evidenceRef:'synthetic-reviewed-grant',operations:['read','work','verify','submit','reconcile']},netReceipt:{reviewed:true,independentlyVerified:true,kind:'provider-settlement',receiptId:'fake-provider:1',evidenceRef:'synthetic:settlement',evidenceDigest:digest({synthetic:true}),scopeDigest:f.a.scopeDigest,recipient:f.a.funding.recipient,netAmountMinor:900,currency:'USD',receivedAt:new Date(f.now-1000).toISOString(),invoiceId:invoice.id,invoiceDigest:digest(invoice)}};
 if(solMode){p.escrowReview={...sf.p.escrowReview,agreementDigest:digest(f.a)};p.solReference={...sf.p.solReference,agreementDigest:digest(f.a)};}
 const dir=path.join(base,'artifacts/founder-autonomy-20261013/ugig-contracts');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,digest(orderKey(f.order()))+'.json'),save=()=>fs.writeFileSync(file,JSON.stringify(p));save();
 const run='artifacts/numaron-local-monitor/runs/fake.json';fs.mkdirSync(path.dirname(path.join(base,run)),{recursive:true});fs.writeFileSync(path.join(base,run),JSON.stringify({checkedAt:new Date(f.now).toISOString(),data:{account:{username:'Obolus',id:f.a.ownerId},applicationsComplete:true,applications:[{id:f.a.applicationId,gig_id:f.a.gigId,applicant_id:f.a.ownerId,status:'accepted'}]}}));fs.writeFileSync(path.join(base,'artifacts/numaron-local-monitor/status.json'),JSON.stringify({sources:[{id:'ugig',status:'succeeded',checkedAt:f.now,evidence:run}]}));
 const binaryObjects=new Map();let uploads=0,binaryMessages=0;
 const request=async(url,opt)=>{calls++;if(url==='https://ugig.net/api/attachments/upload'){uploads++;const file=opt.body.get('file'),remote='https://storage.example/storage/v1/object/public/attachments/'+f.a.ownerId+'/'+f.a.conversationId+'/33333333-3333-4333-8333-333333333333-'+file.name;binaryObjects.set(remote,Buffer.from(await file.arrayBuffer()));return Response.json({url:remote,filename:file.name,size:file.size,type:file.type});}if(url.startsWith('https://storage.example/'))return new Response(binaryObjects.get(url));if(['binary','mixed'].includes(general)&&opt.method==='POST'){binaryMessages++;f.messages.push({id:'99999999-9999-4999-8999-'+String(binaryMessages).padStart(12,'0'),sender_id:f.a.ownerId,conversation_id:f.a.conversationId,created_at:new Date(f.now+1).toISOString(),...JSON.parse(opt.body)});return Response.json({data:f.messages.at(-1)});}if(solMode&&new URL(url).pathname.endsWith('/escrow'))return Response.json({data:[sf.escrow]});if(multipart&&new URL(url).pathname==='/api/conversations')return Response.json({data:[{id:f.a.conversationId,gig_id:null,participant_ids:[f.a.ownerId,f.a.buyerId]}]});if(multipart&&opt.method==='POST'){const result=await f.request(url,opt);if(f.posts()===2)throw Error('synthetic multipart timeout');return result;}if(new URL(url).pathname.endsWith('/invoice'))return Response.json({data:[invoice]});if(general){const r=await f.request(url.replace(f.a.gigId,originalGig),opt);return Response.json(JSON.parse((await r.text()).replaceAll(originalGig,f.a.gigId)));}return f.request(url,opt);};
 const sandbox={available:true,image:'sha256:'+'a'.repeat(64),filesDigest:profileFilesDigest,run:async files=>({passed:!(files.some(f=>f.path==='added.test.js')&&files.some(f=>f.content==='module.exports=1')),sourceDigest:profileFilesDigest(files),image:'sha256:'+'a'.repeat(64),network:'none',hostMounts:false,tests:1})};
 const e=openOrderRestoration({base,directory:path.join(base,'state'),isEnabled:()=>on,workPackages:packages,execution:{...createProductionOrderBindings({base,isEnabled:()=>on,ugigPilotRequest:request,ugigBinaryStorageOrigin:['binary','mixed'].includes(general)?'https://storage.example':undefined,...(solMode?{ugigSolanaRpc:sf.rpc,ugigCoinpayRequest:sf.coinpayRequest,ugigCoinpayCredential:()=>'synthetic'}:{}),ugigPilotCredential:()=>'synthetic',confirmedWorkSource,allowSyntheticConfirmedWorkForTests:true,confirmedOwnRecipients:{[f.a.ownerId]:[terms.recipient]},now:nowFn})({executionSandbox:general==='code'?sandbox:undefined}),...(general==='code'?{generate:Object.assign(async()=>({changes:[{path:'main.js',content:'module.exports=2'},{path:'added.test.js',content:'// synthetic regression fixture'}],costReceipt:{actualCostRappen:1,evidenceRef:'synthetic-code'}}),{maxCostRappen:50})}:{}),generateContent:Object.assign(async()=>({package:{briefDigest:digest(f.a.contentBrief),items:multipart?f.a.contentBrief.formats.flatMap(format=>Array.from({length:format.count},(_,i)=>({id:format.id+i,formatId:format.id,kind:format.kind,...(format.kind==='email'?{subject:'Approved content'}:{}),text:format.id+' '+i+' '+f.a.contentBrief.source.text.repeat(12),evidence:[{sourceId:'source',quote:'two hours'}]}))):[{id:'one',formatId:'social',kind:'social-post',text:f.a.contentBrief.source.text,evidence:[{sourceId:'source',quote:'two hours'}]}]},generationRunId:'gen',costReceipt:{actualCostRappen:1,evidenceRef:'gen'}}),{maxCostRappen:50}),reviewContent:{async execute(ctx){return {kind:'ugig-content-review',costReceipt:{actualCostRappen:1,evidenceRef:'review'},review:{agreementDigest:ctx.product.binding.workContractDigest,packageDigest:digest(ctx.product.package),reviewRunId:'review',generationRunId:'gen',verdict:'pass',checks:{factuality:true,meaning:true,tone:true,audience:true,completeness:true},findings:[],evidenceRefs:['source:two hours'],costReceipt:{actualCostRappen:1,evidenceRef:'review'}}};}}}});
 return {base,sf,f,p,e,invoice,save,uploads:()=>uploads,binaryMessages:()=>binaryMessages,setOn:v=>on=v,calls:()=>calls,close(){e.close();fs.rmSync(base,{recursive:true,force:true});}};
}
async function step(s,kind){const o=s.e.store.snapshot().orders[0],source=s.e.registry.snapshot().sources.find(x=>x.id===o.sourceId),cost=s.e.adapters['source-'+kind].maxCostRappen,action=planOrderActions({order:o,source,budget:{active:true,rootRemainingRappen:250},actionCosts:{[kind]:cost}})[0];assert.equal(action?.kind,kind);return s.e.adapters['source-'+kind].execute({task:{rootTaskId:o.rootTaskId,input:{action}},grant:{reservationId:'fake-'+kind,maxCostRappen:cost},assertActive(){}});}
test('production lifecycle resumes all nine approved content items in explicitly bound generic conversation',async()=>{
 const s=setup(true);try{
  await s.e.refreshRegistrations({assertActive(){}});for(const k of ['reconcile-application','prepare','work'])await step(s,k);
  const db=new Database(path.join(s.base,'state/products.db'),{readonly:true}),p=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();assert.equal(p.package.items.length,9);
  const o=s.e.store.snapshot().orders[0];await s.e.adapters['ugig-content-review'].execute({task:{rootTaskId:o.rootTaskId,input:{orderKey:orderKey(o),sourceRevision:o.sourceRevision,productDigest:p.digest}},grant:{reservationId:'fake-review',maxCostRappen:50},assertActive(){}});
  await step(s,'verify');await assert.rejects(step(s,'submit'),/timeout/);assert.equal(s.f.posts(),2);
  await step(s,'reconcile-delivery');assert.equal(s.e.store.snapshot().orders[0].state,'submitted');assert(s.f.posts()>2);
  const sent=s.f.messages.filter(m=>m.sender_id===s.f.a.ownerId);assert(sent.every(m=>m.content.length<=2000));assert.equal(sent.map(m=>m.content.slice(m.content.indexOf('\n\n')+2)).join(''),p.files.map(f=>f.path+'\n'+f.content).join('\n'));
 }finally{s.close();}
});
test('default production wiring promotes accepted application, prepares prepaid contract and exposes completion readers',async()=>{
 const s=setup();try{await s.e.refreshRegistrations({assertActive(){}});await step(s,'reconcile-application');assert.equal(s.e.store.snapshot().orders[0].state,'assigned');await step(s,'prepare');assert.equal(s.e.store.snapshot().orders[0].state,'prepared');const r=s.e.status().productionBindings.marketplaceWork.ugig;assert.equal(r.acceptanceReaderConfigured,true);assert.equal(r.paymentReaderConfigured,true);assert.equal(s.f.posts(),0);}finally{s.close();}
});
test('default production path refuses wrong invoice and OFF without granting work',async()=>{
 const s=setup();try{s.setOn(false);await assert.rejects(s.e.refreshRegistrations({assertActive(){}}));assert.equal(s.calls(),0);s.setOn(true);await s.e.refreshRegistrations({assertActive(){}});s.invoice.status='sent';await assert.rejects(step(s,'reconcile-application'));assert.equal(s.e.store.snapshot().orders[0].state,'applied');assert.equal(s.f.posts(),0);}finally{s.close();}
});
test('default wiring completes synthetic work, review, delivery, acceptance and exact net payment',async()=>{
 const s=setup();try{
  await s.e.refreshRegistrations({assertActive(){}});
  for(const k of ['reconcile-application','prepare','work'])await step(s,k);
  const db=new Database(path.join(s.base,'state/products.db'),{readonly:true});const p=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();
  const o=s.e.store.snapshot().orders[0];
  await s.e.adapters['ugig-content-review'].execute({task:{rootTaskId:o.rootTaskId,input:{orderKey:orderKey(o),sourceRevision:o.sourceRevision,productDigest:p.digest}},grant:{reservationId:'fake-review',maxCostRappen:50},assertActive(){}});
  for(const k of ['verify','submit'])await step(s,k);
  const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');assert.equal(s.f.posts(),1);
  const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Delivery accepted in full.',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;
  s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();
  s.p.acceptance.deliveryDigest='wrong';s.save();await assert.rejects(step(s,'acceptance'));assert.equal(s.e.store.snapshot().orders[0].state,'submitted');
  s.p.acceptance.deliveryDigest=delivered.deliveryDigest;s.save();
  await step(s,'acceptance');s.p.netReceipt.netAmountMinor=1;s.save();await assert.rejects(step(s,'payment'));assert.equal(s.e.store.snapshot().orders[0].state,'accepted');
  s.p.netReceipt.netAmountMinor=900;s.save();await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');assert.equal(s.f.posts(),1);
 }finally{s.close();}
});
for(const fault of ['invoice-owner','invoice-amount','invoice-review','missing-net-receipt','net-recipient','net-amount','revoked-grant'])test('default wiring refuses '+fault,async()=>{
 const s=setup();try{
  await s.e.refreshRegistrations({assertActive(){}});
  if(fault==='invoice-owner')s.invoice.worker_id=s.f.a.buyerId;
  if(fault==='invoice-amount')s.invoice.amount_usd=9;
  if(fault==='invoice-review')s.p.netReceipt.invoiceDigest=digest('changed');
  if(fault==='missing-net-receipt')delete s.p.netReceipt;
  if(fault==='net-recipient')s.p.netReceipt.recipient='other';
  if(fault==='net-amount')s.p.netReceipt.netAmountMinor=1000;
  if(fault==='revoked-grant')s.p.grant.approved=false;
  s.save();await assert.rejects(step(s,'reconcile-application'));assert.equal(s.e.store.snapshot().orders[0].state,'applied');assert.equal(s.f.posts(),0);
 }finally{s.close();}
});

test('default wiring keeps escrow separate from final SOL payment through complete lifecycle',async()=>{
 const s=setup(false,true);try{
  await s.e.refreshRegistrations({assertActive(){}});
  s.f.setStatus('in_progress');for(const k of ['reconcile-application','prepare','work'])await step(s,k);
  const db=new Database(path.join(s.base,'state/products.db'),{readonly:true});const p=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();
  const o=s.e.store.snapshot().orders[0];
  await s.e.adapters['ugig-content-review'].execute({task:{rootTaskId:o.rootTaskId,input:{orderKey:orderKey(o),sourceRevision:o.sourceRevision,productDigest:p.digest}},grant:{reservationId:'fake-review',maxCostRappen:50},assertActive(){}});
  for(const k of ['verify','submit'])await step(s,k);
  const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');assert.equal(s.f.posts(),1);
  const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Delivery accepted in full.',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;
  s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();
  s.p.acceptance.deliveryDigest='wrong';s.save();await assert.rejects(step(s,'acceptance'));assert.equal(s.e.store.snapshot().orders[0].state,'submitted');
  s.p.acceptance.deliveryDigest=delivered.deliveryDigest;s.save();
  await step(s,'acceptance');s.f.setStatus('completed');await assert.rejects(step(s,'payment'));assert.equal(s.e.store.snapshot().orders[0].state,'accepted');
  s.sf.release();await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');assert.equal(s.f.posts(),1);const receipt=orderAccounts(s.e.store.snapshot().orders).orders[0].received;assert.equal(receipt.settlement.asset,'SOL');assert.equal(receipt.settlement.amountAtomic,'9000000');assert.equal(receipt.currency,'USD');
 }finally{s.close();}
});

for(const solMode of [false,true])test('general production wiring requires specialist evidence and completes '+(solMode?'escrow SOL':'USD invoice'),async()=>{
 const s=setup(false,solMode,true);try{
 await s.e.refreshRegistrations({assertActive(){}});for(const k of ['reconcile-application','prepare','work'])await step(s,k);
 const db=new Database(path.join(s.base,'state/products.db'),{readonly:true}),product=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();
 await assert.rejects(step(s,'verify'));assert.equal(s.f.posts(),0);
 s.p.productReview={reviewed:true,independentlyVerified:true,reviewerId:'synthetic-independent',agreementDigest:digest(s.f.a),productDigest:product.digest,workKind:s.f.a.workKind,expiresAt:s.f.now+100000,checks:Object.fromEntries(UGIG_WORK_CHECKS[s.f.a.workKind].map(k=>[k,{passed:true,evidenceRefs:['synthetic:'+k]}]))};s.save();
 await step(s,'verify');s.p.productReview.reviewed=false;s.save();await assert.rejects(step(s,'submit'));assert.equal(s.f.posts(),0);
 // The dispatch intent is now uncertain; do not resend through the submit entrypoint.
 s.p.productReview.reviewed=true;s.save();await step(s,'reconcile-delivery');
 const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');
 const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Accepted',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();await step(s,'acceptance');if(solMode){await assert.rejects(step(s,'payment'));s.sf.release();}await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');
 }finally{s.close();}
});

test('general code profile uses isolated regression and specialist gate through payment',async()=>{
 const solMode=false,s=setup(false,false,'code');try{
 await s.e.refreshRegistrations({assertActive(){}});for(const k of ['reconcile-application','prepare','work'])await step(s,k);
 const db=new Database(path.join(s.base,'state/products.db'),{readonly:true}),product=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();
 await assert.rejects(step(s,'verify'));assert.equal(s.f.posts(),0);
 s.p.productReview={reviewed:true,independentlyVerified:true,reviewerId:'synthetic-independent',agreementDigest:digest(s.f.a),productDigest:product.digest,workKind:s.f.a.workKind,expiresAt:s.f.now+100000,checks:Object.fromEntries(UGIG_WORK_CHECKS[s.f.a.workKind].map(k=>[k,{passed:true,evidenceRefs:['synthetic:'+k]}]))};s.save();
 await step(s,'verify');s.p.productReview.reviewed=false;s.save();await assert.rejects(step(s,'submit'));assert.equal(s.f.posts(),0);
 // The dispatch intent is now uncertain; do not resend through the submit entrypoint.
 s.p.productReview.reviewed=true;s.save();await step(s,'reconcile-delivery');
 const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');
 const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Accepted',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();await step(s,'acceptance');if(solMode){await assert.rejects(step(s,'payment'));s.sf.release();}await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');
 }finally{s.close();}
});

test('general source report preserves citation checks and specialist gate through payment',async()=>{
 const solMode=false,s=setup(false,false,'report');try{
 await s.e.refreshRegistrations({assertActive(){}});for(const k of ['reconcile-application','prepare','work'])await step(s,k);
 const db=new Database(path.join(s.base,'state/products.db'),{readonly:true}),product=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();
 await assert.rejects(step(s,'verify'));assert.equal(s.f.posts(),0);
 s.p.productReview={reviewed:true,independentlyVerified:true,reviewerId:'synthetic-independent',agreementDigest:digest(s.f.a),productDigest:product.digest,workKind:s.f.a.workKind,expiresAt:s.f.now+100000,checks:Object.fromEntries(UGIG_WORK_CHECKS[s.f.a.workKind].map(k=>[k,{passed:true,evidenceRefs:['synthetic:'+k]}]))};s.save();
 await step(s,'verify');s.p.productReview.reviewed=false;s.save();await assert.rejects(step(s,'submit'));assert.equal(s.f.posts(),0);
 // The dispatch intent is now uncertain; do not resend through the submit entrypoint.
 s.p.productReview.reviewed=true;s.save();await step(s,'reconcile-delivery');
 const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');
 const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Accepted',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();await step(s,'acceptance');if(solMode){await assert.rejects(step(s,'payment'));s.sf.release();}await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');
 }finally{s.close();}
});

test('binary production lifecycle binds real Office/image/model bytes through payment',async()=>{const s=setup(false,false,'binary');try{await s.e.refreshRegistrations({assertActive(){}});for(const k of ['reconcile-application','prepare','work'])await step(s,k);const db=new Database(path.join(s.base,'state/products.db'),{readonly:true}),product=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();assert.deepEqual(JSON.parse(product.files[0].content).artifacts,s.f.a.binaryArtifacts);await assert.rejects(step(s,'verify'));s.p.productReview={reviewed:true,independentlyVerified:true,reviewerId:'synthetic-independent',agreementDigest:digest(s.f.a),productDigest:product.digest,workKind:s.f.a.workKind,expiresAt:Date.now()+100000,checks:Object.fromEntries([...UGIG_WORK_CHECKS[s.f.a.workKind],'binary-format-decode','binary-content-and-privacy','binary-provenance'].map(k=>[k,{passed:true,evidenceRefs:['synthetic:'+k]}]))};s.save();await step(s,'verify');await step(s,'submit');assert.equal(s.uploads(),5);assert.equal(s.binaryMessages(),1);const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Accepted binary package',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();await step(s,'acceptance');await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');}finally{s.close();}});

test('mixed production lifecycle requires complete package review through payment',async()=>{const s=setup(false,false,'mixed');try{await s.e.refreshRegistrations({assertActive(){}});for(const k of ['reconcile-application','prepare','work'])await step(s,k);const db=new Database(path.join(s.base,'state/products.db'),{readonly:true}),product=JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);db.close();assert.deepEqual(JSON.parse(product.files[0].content).artifacts,s.f.a.binaryArtifacts);await assert.rejects(step(s,'verify'));s.p.productReview={reviewed:true,independentlyVerified:true,reviewerId:'synthetic-independent',agreementDigest:digest(s.f.a),productDigest:product.digest,workKind:s.f.a.workKind,expiresAt:Date.now()+100000,checks:Object.fromEntries([...UGIG_WORK_CHECKS[s.f.a.workKind],'binary-format-decode','binary-content-and-privacy','binary-provenance'].map(k=>[k,{passed:true,evidenceRefs:['synthetic:'+k]}]))};s.save();await assert.rejects(step(s,'verify'));for(const k of ['mixed-package-completeness','source-code-isolated-tests','csv-reference-output','readme-reproducibility'])s.p.productReview.checks[k]={passed:true,evidenceRefs:['synthetic:'+k]};s.save();await step(s,'verify');await step(s,'submit');assert.equal(s.uploads(),5);assert.equal(s.binaryMessages(),2);const delivered=s.e.store.snapshot().orders[0];assert.equal(delivered.state,'submitted');const m={id:'88888888-8888-4888-8888-888888888888',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Accepted binary package',created_at:new Date(s.f.now+200).toISOString()};s.f.messages.push(m);s.f.now+=201;s.p.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();await step(s,'acceptance');await step(s,'payment');assert.equal(s.e.store.snapshot().orders[0].state,'paid');}finally{s.close();}});
