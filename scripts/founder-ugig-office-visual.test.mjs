import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';

import {setupOfficePipeline} from './founder-ugig-office-test-support.mjs';

import {digest} from './founder-restoration-integrity.mjs';

import {sha256} from './founder-binary-artifacts.mjs';
import {officeFixture} from './founder-ugig-office-fixture.mjs';

for(const page of [1,2])test('agreed heading page reaches actual renderer: '+page,{skip:!process.env.DOCX_VISUAL_SOFFICE},async()=>{
 const f=officeFixture(),soffice=process.env.DOCX_VISUAL_SOFFICE;
 f.spec.layout={expectedPages:[{heading:'Titel',page}]};
 const s=await setupOfficePipeline({spec:f.spec,reference:f.reference},{officeVisualRuntime:{soffice,rendererSha256:sha256(fs.readFileSync(soffice)),poppler:process.env.DOCX_VISUAL_POPPLER}});
 try{
  await s.p.generateOffice(s.f.order(),s.ctx);
  const proof=await s.p.inspectOfficeLayout(s.f.order(),s.ctx);
  assert.deepEqual(proof.expectedPages,{Titel:page});assert.equal(proof.layoutDigest,digest({Titel:page}));
  assert.deepEqual(proof.specialistReview.evidence.expectedPages,{Titel:page});assert.equal(proof.specialistReview.evidence.layoutDigest,proof.layoutDigest);
  const report=JSON.parse(fs.readFileSync(path.join(s.root,'ugig-office-visual',proof.evidenceId,'report.json')));assert.deepEqual(report.expectedPages,{Titel:page});
  assert.equal(proof.geometryPassed,page===1);assert.equal(proof.issues.includes('page-break-mismatch'),page===2);
  assert.equal(proof.specialistReview.status,page===1?'pending-specialist-review':'blocked-layout-issues');
  assert.equal(proof.deliveryReady,false);assert.equal(proof.independentlyVerified,false);
  assert.deepEqual(await s.p.readOfficeLayout(s.f.order(),s.ctx),proof);
  await assert.rejects(s.p.readDeliveryAssignment(s.f.order(),s.ctx));
 }finally{s.close();}
});



test('visual step exists and rejects OFF before any provider read',async()=>{

 const s=await setupOfficePipeline();try{

  assert.equal(typeof s.p.inspectOfficeLayout,'function');s.off();const before=s.requests();

  await assert.rejects(s.p.inspectOfficeLayout(s.f.order(),s.ctx));assert.equal(s.requests(),before);

 }finally{s.close();}

});

test('visual step requires explicit runtime and existing generated package',async()=>{

 const s=await setupOfficePipeline();try{

  assert.equal(typeof s.p.inspectOfficeLayout,'function');

  await assert.rejects(s.p.inspectOfficeLayout(s.f.order(),s.ctx),/visual runtime/);

 }finally{s.close();}

});

for(const kind of ['document-cleanup','support-templates'])test('real visual step binds exact generated product without granting delivery: '+kind,{skip:!process.env.DOCX_VISUAL_SOFFICE},async()=>{

 const soffice=process.env.DOCX_VISUAL_SOFFICE;

 const input=kind==='support-templates'?{spec:{workKind:kind,privacy:'public',customerApproved:true,voiceGuide:'Sachlich.',checklist:['Prüfen.'],templates:[{id:'help',subject:'Anfrage',body:'Wir prüfen.',short:'Prüfen.',escalation:'An Team A',placeholders:[]}]},reference:{paragraphs:['help','Anfrage','Wir prüfen.','Prüfen.','An Team A','Sachlich.','Prüfen.'],cases:[{id:'case-1',templateId:'help',required:['prüfen'],forbidden:['garantiert']}],expectedCaseIds:['case-1']}}:undefined;

 const s=await setupOfficePipeline(input,{officeVisualRuntime:{soffice,rendererSha256:sha256(fs.readFileSync(soffice)),poppler:process.env.DOCX_VISUAL_POPPLER}});

 try{

  assert.equal(typeof s.p.inspectOfficeLayout,'function');

  await assert.rejects(s.p.inspectOfficeLayout(s.f.order(),s.ctx),/completed Office generation/);

  const product=await s.p.generateOffice(s.f.order(),s.ctx),before=digest(product);

  assert.equal((await s.p.officeLayoutStatus(s.f.order(),s.ctx)).status,'not-requested');
  const proof=await s.p.inspectOfficeLayout(s.f.order(),s.ctx);
  assert.equal((await s.p.officeLayoutStatus(s.f.order(),s.ctx)).status,'completed');
  assert.deepEqual(await s.p.inspectOfficeLayout(s.f.order(),s.ctx),proof);
  assert.deepEqual(await s.p.readOfficeLayout(s.f.order(),s.ctx),proof);

  assert.equal(proof.specialistReview.status,'pending-specialist-review');assert.equal(proof.specialistReview.productDigest,product.productDigest);assert.equal(proof.specialistReview.agreementDigest,digest(s.f.a));assert.equal(proof.specialistReviewDigest,digest(proof.specialistReview));assert(proof.specialistReview.checks.every(c=>c.status==='pending'));assert.equal(proof.specialistReview.deliveryReady,false);
  assert.equal(proof.agreementDigest,digest(s.f.a));assert.equal(proof.productDigest,product.productDigest);

  assert.equal(proof.packageDigest,product.packageDigest);assert.equal(proof.generationKey,product.generationKey);

  assert.equal(proof.geometryPassed,true,JSON.stringify({issues:proof.issues,report:JSON.parse(fs.readFileSync(path.join(s.root,'ugig-office-visual',proof.evidenceId,'report.json'))).pages.map(p=>p.text)}));assert.equal(proof.deliveryReady,false);assert.equal(proof.independentlyVerified,false);

  assert.equal(digest(await s.p.readOfficeResult(s.f.order(),s.ctx)),before);

  const dir=path.join(s.root,'ugig-office-visual',proof.evidenceId);

  assert(fs.existsSync(path.join(dir,'page-1.png')));assert(fs.existsSync(path.join(dir,'binding.json')));

  await assert.rejects(s.p.readDeliveryAssignment(s.f.order(),s.ctx));

  const page=path.join(dir,'page-1.png'),original=fs.readFileSync(page);fs.appendFileSync(page,'tampered');
  await assert.rejects(s.p.readOfficeLayout(s.f.order(),s.ctx),/page bytes/);fs.writeFileSync(page,original);
  s.f.pack.workGrant.approved=false;s.save();

  await assert.rejects(s.p.inspectOfficeLayout(s.f.order(),s.ctx));

 }finally{s.close();}

});

