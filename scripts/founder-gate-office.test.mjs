// Isolated Office acceptance through production composition with the confirmed-funded gate on.
// Synthetic data, temporary directories and fake transports only; the real Office generator runs locally.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {officeFixture} from './founder-ugig-office-fixture.mjs';
import {officeScopeDigest} from './founder-ugig-office-contract.mjs';
import {officeRuntimeVersion} from './founder-ugig-office-pipeline.mjs';
import {digest,orderKey} from './founder-restoration-integrity.mjs';
import {createProductionOrderBindings} from './founder-production-order-bindings.mjs';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {planOrderActions} from './founder-order-lifecycle.mjs';
import {normalizeInventory} from './founder-source-registry.mjs';
const packages={rows:[{id:'u',label:'ugig',inventoryKind:'core'}]},ORIGIN='https://fixtures.invalid',STORAGE='https://storage.example.org';
const python=process.env.NUMARON_OFFICE_TEST_PYTHON;
const inputFor=kind=>JSON.parse(execFileSync(python,['-I','-c',"import sys,json;sys.path.insert(0,sys.argv[1]);from test_ugig_office import fixture;s,r=fixture(sys.argv[2]);print(json.dumps(dict(spec=s,reference=r)))",path.resolve('scripts'),kind],{encoding:'utf8',windowsHide:true}));
async function setup(kind,{withSource=true,withTerms=true,mutate=x=>x}={}){
 const f=officeFixture(kind,inputFor(kind)),base=fs.mkdtempSync(path.join(os.tmpdir(),'gate-office-')),root=path.join(base,'artifacts/founder-autonomy-20261013'),clock=()=>Math.max(Date.now(),f.now);let reads=0,posts=0,uploads=0,behaviour=mutate;
 f.a.sourceId=normalizeInventory({},packages).sources[0].id;f.a.generatorVersion=await officeRuntimeVersion(python);
 if(withTerms)f.a.customerWork={milestoneId:'one',inputsDigest:digest('inputs'),acceptanceDigest:digest('acceptance'),deadlineUtc:new Date(f.now+86400000).toISOString(),correctionScopeDigest:digest('corrections'),grossDecimal:'10',deductionsDecimal:'1',netDecimal:'9',currency:'USD',recipient:f.a.paymentTerms.recipient,paymentTrigger:'buyer-acceptance'};
 f.a.scopeDigest=officeScopeDigest(f.a);f.pack.workGrant.agreementDigest=digest(f.a);Object.assign(f.pack.fundingEvidence.funding,f.order());
 const invoice={id:'77777777-7777-4777-8777-777777777777',gig_id:f.a.gigId,application_id:f.a.applicationId,worker_id:f.a.ownerId,poster_id:f.a.buyerId,status:'paid',amount_usd:10,currency:'USD'};
 f.pack.fundingEvidence.netReceipt={reviewed:true,independentlyVerified:true,kind:'provider-settlement',receiptId:'synthetic:1',evidenceRef:'synthetic',evidenceDigest:digest('synthetic'),scopeDigest:f.a.scopeDigest,recipient:f.a.paymentTerms.recipient,netAmountMinor:900,currency:'USD',receivedAt:new Date(f.now-1).toISOString(),invoiceId:invoice.id,invoiceDigest:digest(invoice)};
 for(const d of ['ugig-office-contracts','ugig-office-inputs','ugig-office-releases'])fs.mkdirSync(path.join(root,d),{recursive:true});
 const save=()=>fs.writeFileSync(path.join(root,'ugig-office-contracts',digest(orderKey(f.a))+'.json'),JSON.stringify(f.pack));save();for(const [h,b] of f.blobs)fs.writeFileSync(path.join(root,'ugig-office-inputs',h),b);
 const run='artifacts/numaron-local-monitor/runs/fake.json';fs.mkdirSync(path.dirname(path.join(base,run)),{recursive:true});fs.writeFileSync(path.join(base,run),JSON.stringify({checkedAt:new Date(f.now).toISOString(),data:{account:{username:'Obolus',id:f.a.ownerId},applicationsComplete:true,applications:[{id:f.a.applicationId,gig_id:f.a.gigId,applicant_id:f.a.ownerId,status:'accepted'}]}}));fs.writeFileSync(path.join(base,'artifacts/numaron-local-monitor/status.json'),JSON.stringify({sources:[{id:'ugig',status:'succeeded',checkedAt:f.now,evidence:run}]}));
 const objects=new Map();
 const request=async(url,opt)=>{if(url==='https://ugig.net/api/attachments/upload'){uploads++;const file=opt.body.get('file'),remote=STORAGE+'/storage/v1/object/public/attachments/'+f.a.ownerId+'/'+f.a.conversationId+'/33333333-3333-4333-8333-333333333333-'+file.name;objects.set(remote,Buffer.from(await file.arrayBuffer()));return Response.json({url:remote,filename:file.name,size:file.size,type:file.type});}if(url.startsWith(STORAGE))return new Response(objects.get(url));if(opt.method==='POST'){posts++;f.messages.push({id:'99999999-9999-4999-8999-'+String(posts).padStart(12,'0'),sender_id:f.a.ownerId,conversation_id:f.a.conversationId,created_at:new Date(f.now+1).toISOString(),...JSON.parse(opt.body)});return Response.json({data:f.messages.at(-1)});}if(new URL(url).pathname.endsWith('/invoice'))return Response.json({data:[invoice]});return f.request(url,opt);};
 const source=withSource?{testOnly:true,origin:ORIGIN,async read(expected){reads++;const d=digest(expected),part={bindingDigest:d,sourceRef:ORIGIN+'/evidence/'+reads},t=clock();return behaviour({schema:'confirmed-funded-customer-work-v1',environment:'synthetic',bindingDigest:d,observedAt:t,expiresAt:t+60000,assignment:{...part,status:'assigned',buyerId:f.a.buyerId,contractorId:f.a.ownerId},compensation:{...part,...expected.customerWork},funding:{...part,kind:'funded-escrow',status:'held',amountDecimal:'10',currency:'USD',recipient:f.a.paymentTerms.recipient}});}}:undefined;
 const options=createProductionOrderBindings({base,isEnabled:()=>true,ugigPilotRequest:request,ugigPilotCredential:()=>'synthetic',ugigBinaryStorageOrigin:STORAGE,officeRuntime:{python,generatorVersion:f.a.generatorVersion},now:clock,...(withSource?{confirmedWorkSource:source,allowSyntheticConfirmedWorkForTests:true,confirmedOwnRecipients:{[f.a.ownerId]:[f.a.paymentTerms.recipient]}}:{})})({});
 const e=openOrderRestoration({base,directory:path.join(base,'state'),isEnabled:()=>true,workPackages:packages,execution:options});
 return {f,e,base,root,options,save,clock,reads:()=>reads,posts:()=>posts,uploads:()=>uploads,setBehaviour:b=>behaviour=b,close(){e.close();fs.rmSync(base,{recursive:true,force:true});}};
}
const order=s=>s.e.store.snapshot().orders[0];
const refresh=s=>s.e.refreshRegistrations({assertActive(){}});
async function step(s,kind){await refresh(s);const o=order(s),src=s.e.registry.snapshot().sources.find(x=>x.id===o.sourceId),cost=s.e.adapters['source-'+kind].maxCostRappen,action=planOrderActions({order:o,source:src,budget:{active:true,rootRemainingRappen:250},actionCosts:{[kind]:cost}})[0];assert.equal(action?.kind,kind,'planned '+kind+' from state '+o.state);return s.e.adapters['source-'+kind].execute({task:{rootTaskId:o.rootTaskId,input:{action}},grant:{reservationId:'fake-'+kind,maxCostRappen:cost},assertActive(){}});}
const assigned=async s=>{await step(s,'reconcile-application');assert.equal(order(s).state,'assigned');};
const journalExists=s=>fs.existsSync(path.join(s.root,'ugig-office-journal'));
const ctxFor=s=>({order:s.f.order(),grant:{reservationId:'read'},assertActive(){}});
const release=(s,r)=>{const pack=s.f.releaseFor(r);fs.writeFileSync(path.join(s.root,'ugig-office-releases',r.generationKey+'.json'),JSON.stringify(pack));s.f.messages.push({id:pack.release.customer.messageId,sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Public package '+r.packageDigest,created_at:new Date(s.clock()).toISOString()});};
const sourceFor=s=>s.options.sources({registry:s.e.registry,store:s.e.store})[0];

for(const kind of ['document-cleanup','support-templates','research-report','xlsx-automation'])test(kind+': gated Office order runs from assignment through release and delivery to paid',async()=>{const s=await setup(kind);let local;try{
 await assigned(s);assert.deepEqual(order(s).customerWork,s.f.a.customerWork);
 await step(s,'prepare');assert.equal(order(s).state,'prepared');await step(s,'work');assert.equal(order(s).state,'worked');
 await assert.rejects(step(s,'verify'),/release|review/i);assert.equal(order(s).state,'worked');assert.equal(s.posts(),0);assert.equal(s.uploads(),0);
 local=sourceFor(s);const r=await local.readOfficeResult(s.f.order(),ctxFor(s));release(s,r);
 await step(s,'verify');assert.equal(order(s).state,'verified');
 await step(s,'submit');const delivered=order(s);assert.equal(delivered.state,'submitted');assert.equal(delivered.deliveryDigest,r.productDigest);assert.ok(s.uploads()>0);assert.ok(s.posts()>0);const posts=s.posts(),uploads=s.uploads();
 await new Promise(r=>setTimeout(r,5));const m={id:'aaaaaaaa-1111-4111-8111-111111111111',sender_id:s.f.a.buyerId,conversation_id:s.f.a.conversationId,content:'Delivery accepted in full.',created_at:new Date(s.clock()).toISOString()};s.f.messages.push(m);await new Promise(r=>setTimeout(r,5));
 s.f.pack.acceptance={reviewed:true,noContractChangeReviewed:true,accepted:true,deliveryDigest:delivered.deliveryDigest,messageId:m.id,contentDigest:digest(m.content)};s.save();await step(s,'acceptance');assert.equal(order(s).state,'accepted');
 await assert.rejects(step(s,'payment'));assert.equal(order(s).state,'accepted');assert.equal(order(s).payment??null,null);
 s.f.pack.fundingEvidence.paymentAssociation={reviewed:true,independentlyVerified:true,scopeDigest:s.f.a.scopeDigest,productDigest:r.productDigest,packageDigest:r.packageDigest,receiptEvidenceRef:'ugig-receipt:'+digest(['provider-settlement','synthetic:1']),evidenceRef:'synthetic-allocation'};s.save();
 await step(s,'payment');assert.equal(order(s).state,'paid');assert.equal(s.posts(),posts);assert.equal(s.uploads(),uploads);
}finally{local?.close?.();s.close();}});
test('without a real reader an Office order never prepares or generates',async()=>{const s=await setup('document-cleanup',{withSource:false});try{await assigned(s);await assert.rejects(step(s,'prepare'),/evidence reader|authority/i);assert.equal(order(s).state,'assigned');assert.equal(journalExists(s),false);assert.equal(s.posts(),0);}finally{s.close();}});
test('an Office agreement without reviewed compensation terms is blocked',async()=>{const s=await setup('document-cleanup',{withTerms:false});try{await assigned(s);await assert.rejects(step(s,'prepare'),/reviewed inputs|payment terms|confirmed/i);assert.equal(order(s).state,'assigned');assert.equal(journalExists(s),false);assert.equal(s.reads(),0);}finally{s.close();}});
test('a pending application cannot start an Office order',async()=>{const s=await setup('document-cleanup',{mutate:e=>{e.assignment.status='pending';return e;}});try{await assigned(s);await assert.rejects(step(s,'prepare'),/assignment/i);assert.equal(order(s).state,'assigned');assert.equal(journalExists(s),false);}finally{s.close();}});
test('funding revoked after generation stops verification and delivery',async()=>{const s=await setup('document-cleanup');let local;try{await assigned(s);await step(s,'prepare');await step(s,'work');local=sourceFor(s);const r=await local.readOfficeResult(s.f.order(),ctxFor(s));release(s,r);s.setBehaviour(e=>{e.funding.status='revoked';return e;});await assert.rejects(step(s,'verify'),/funded|milestone/i);assert.equal(order(s).state,'worked');assert.equal(s.posts(),0);assert.equal(s.uploads(),0);}finally{local?.close?.();s.close();}});
