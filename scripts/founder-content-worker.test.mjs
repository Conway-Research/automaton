import test from 'node:test';import assert from 'node:assert/strict';
import {verifyContentReview,contentReviewTask,createContentGenerator,createContentReviewer} from './founder-content-worker.mjs';
import {digest} from './founder-restoration-integrity.mjs';
import {pilotFixture} from './founder-ugig-pilot-fixture.mjs';
import {checkOrderQuality} from './founder-order-quality.mjs';
import {contentPackageFiles} from './founder-content-package.mjs';

test('expired production pricing blocks content generation before any request even with a sufficient grant',async()=>{
 const f=pilotFixture(),binding={...f.a,workContractDigest:'agreement'};
 for(const at of ['2026-11-09T00:00:00Z','2026-11-15T00:00:00Z']){
  let calls=0;const generate=createContentGenerator({apiKey:'sk-isolated-test',mission:{directive:'test'},now:()=>Date.parse(at),request:async()=>{calls++;throw Error('Expired policy must not dispatch');}});
  assert.equal(generate.available,false,at);
  await assert.rejects(()=>generate({binding,task:{input:{}},grant:{reservationId:'isolated-expired',maxCostRappen:50},signal:new AbortController().signal,assertActive(){}}));
  assert.equal(calls,0,at);
 }
});

const validPackage=b=>({briefDigest:digest(b),items:[{id:'one',formatId:'social',kind:'social-post',text:b.source.text,evidence:[{sourceId:'source',quote:'two hours'}]}]});

test('cached review cannot outlive changed brief or withdrawn source reuse permission',()=>{
 for(const mode of ['audience','reuse','source-digest','package-schema','missing-brief']){
  const {product,review}=reviewFixture();product.binding.profileId='content-repurpose';product.package=validPackage(product.binding.contentBrief);review.packageDigest=digest(product.package);
  assert.equal(verifyContentReview(product,review),true);
  if(mode==='audience')product.binding.contentBrief.audience='different audience';
  if(mode==='reuse')product.binding.contentBrief.source.reuseAllowed=false;
  if(mode==='source-digest')product.binding.contentBrief.source.digest='wrong';
  if(mode==='missing-brief')delete product.binding.contentBrief;
  if(mode==='package-schema'){product.package.hidden='unreviewed';review.packageDigest=digest(product.package);}
  assert.equal(verifyContentReview(product,review),false,mode);
 }
});

test('reviewer rejects missing identities before any provider request',async()=>{
 for(const field of ['agreement','generation']){
  const {product}=reviewFixture();product.package=validPackage(product.binding.contentBrief);
  if(field==='agreement')delete product.binding.workContractDigest;else delete product.generationRunId;
  let calls=0;const reviewer=createContentReviewer({apiKey:'sk-isolated-test',mission:{directive:'test'},request:async()=>{calls++;throw Error('unexpected provider call');}});
  await assert.rejects(reviewer.execute({product,task:{input:{}},signal:new AbortController().signal,grant:{reservationId:'test',maxCostRappen:50},assertActive(){},recordProviderEvent(){}}));
  assert.equal(calls,0,field);
 }
});

function reviewFixture(){const f=pilotFixture(),product={binding:{workContractDigest:'agreement',contentBrief:f.a.contentBrief},package:validPackage(f.a.contentBrief),generationRunId:'generation'};return {product,review:{agreementDigest:'agreement',packageDigest:digest(product.package),reviewRunId:'review',generationRunId:'generation',verdict:'pass',checks:{factuality:true,meaning:true,tone:true,audience:true,completeness:true},findings:[],evidenceRefs:['source:two hours'],costReceipt:{actualCostRappen:1,evidenceRef:'review'}}};}

test('missing or blank shared identities never establish review binding',()=>{
 for(const value of [undefined,null,'','   ',42])for(const field of ['agreement','generation','review']){
  const {product,review}=reviewFixture();
  if(field==='agreement'){product.binding.workContractDigest=value;review.agreementDigest=value;}
  if(field==='generation'){product.generationRunId=value;review.generationRunId=value;}
  if(field==='review'){review.reviewRunId=value;review.costReceipt.evidenceRef=value;}
  assert.equal(verifyContentReview(product,review),false,field+':'+String(value));
 }
});

test('all review citations must match the approved source, not just one',()=>{
 for(const extra of ['source:invented claim','foreign:two hours','source:','   ']){
  const {product,review}=reviewFixture();review.evidenceRefs.push(extra);assert.equal(verifyContentReview(product,review),false,extra);
 }
 const {product,review}=reviewFixture();review.evidenceRefs.push('source:approved content');assert.equal(verifyContentReview(product,review),true);
});

test('order quality requires complete review identities and exclusively matching citations',()=>{
 for(const mode of ['missing-generation','missing-agreement','mixed-citations']){
  const {product,review}=reviewFixture(),b=product.binding.contentBrief;
  product.binding.profileId='content-repurpose';product.package={briefDigest:digest(b),items:[{id:'one',formatId:'social',kind:'social-post',text:b.source.text,evidence:[{sourceId:'source',quote:'two hours'}]}]};
  product.files=contentPackageFiles(product.package);review.packageDigest=digest(product.package);product.review=review;
  assert.equal(checkOrderQuality(product,{}, {requireReview:true}).passed,true);
  if(mode==='missing-generation'){delete product.generationRunId;delete review.generationRunId;}
  if(mode==='missing-agreement'){delete product.binding.workContractDigest;delete review.agreementDigest;}
  if(mode==='mixed-citations')review.evidenceRefs.push('source:invented');
  assert.throws(()=>checkOrderQuality(product,{}, {requireReview:true}),/Independent content review/);
 }
});
test('review needs complete independent proof bound to agreement and exact package',()=>{const b={workContractDigest:'agreement'},p={binding:b,digest:'product',package:{items:[]},generationRunId:'gen'};const proof={agreementDigest:'agreement',packageDigest:digest(p.package),reviewRunId:'provider:review',generationRunId:'gen',verdict:'pass',checks:{factuality:true,meaning:true,tone:true,audience:true,completeness:true},findings:[],evidenceRefs:['source:1'],costReceipt:{actualCostRappen:1,evidenceRef:'provider:review'}};assert.equal(verifyContentReview(p,proof),true);for(const mode of ['self','digest','finding','receipt']){const r=structuredClone(proof);if(mode==='self')r.reviewRunId='gen';if(mode==='digest')r.packageDigest='wrong';if(mode==='finding')r.findings=['not sure'];if(mode==='receipt')delete r.costReceipt;assert.equal(verifyContentReview(p,r),false);}});
test('review uses unchanged root and stable product identity',()=>{const order={sourceId:'s',externalId:'j',ownerId:'o',sourceRevision:'r',rootTaskId:'existing'},p={digest:'a'.repeat(64)};const t=contentReviewTask(order,p,'work');assert.equal(t.rootTaskId,'existing');assert.deepEqual(t.dependencies,['work']);assert.equal(t.kind,'ugig-content-review');assert.equal(contentReviewTask(order,p,'work').id,t.id);});
test('review evidence must include an actual approved source quotation',()=>{const {product,review}=reviewFixture();review.evidenceRefs=['source:invented claim'];assert.equal(verifyContentReview(product,review),false);review.evidenceRefs=['source:two hours'];assert.equal(verifyContentReview(product,review),true);});
test('real worker wrappers use distinct provider receipts and reject insufficient grants before requests',async t=>{t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-10-18T00:01:00Z')});const f=pilotFixture(),b={...f.a,workContractDigest:'agreement'},p={briefDigest:digest(b.contentBrief),items:[{id:'one',formatId:'social',kind:'social-post',text:b.contentBrief.source.text,evidence:[{sourceId:'source',quote:'two hours'}]}]};let calls=0;const events=[];const request=async(url,opt)=>{calls++;const input=JSON.parse(JSON.parse(opt.body).input);assert.deepEqual(input.codeContext.acceptanceCriteria,b.acceptanceCriteria);assert.equal(input.codeContext.briefDigest,digest(b.contentBrief));const analysis={summary:'Synthetic independent content package assessment for isolated test.',sourceIds:['source'],nextStep:'Keep within the explicit agreed scope.',limitations:['Synthetic evidence only.'],...(calls===1?{contentPackage:p}:{review:{verdict:'pass',checks:{factuality:true,meaning:true,tone:true,audience:true,completeness:true},findings:[],evidenceRefs:['source:two hours']}})};return Response.json({id:calls===1?'resp_generation':'resp_review',status:'completed',usage:{input_tokens:50,output_tokens:50},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysis)}]}]});};const opts={apiKey:'sk-isolated-test',mission:{directive:'test'},request},gen=createContentGenerator(opts),review=createContentReviewer(opts),ctx={task:{input:{}},binding:b,signal:new AbortController().signal,grant:{reservationId:'gen',maxCostRappen:49},assertActive(){},recordProviderEvent:e=>events.push(e)};await assert.rejects(gen(ctx));assert.equal(calls,0);ctx.grant.maxCostRappen=50;const generated=await gen(ctx);const product={binding:b,package:generated.package,generationRunId:generated.generationRunId};ctx.grant={reservationId:'review',maxCostRappen:50};const result=await review.execute({...ctx,product});assert.equal(calls,2);assert.equal(result.costReceipt.evidenceRef,'resp_review');assert.equal(generated.costReceipt.evidenceRef,'resp_generation');assert.equal(verifyContentReview(product,result.review),true);assert.equal(events.filter(e=>e.stage==='receipt').length,2);});
