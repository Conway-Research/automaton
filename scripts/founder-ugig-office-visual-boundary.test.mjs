import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createOfficeVisualInspector} from './founder-ugig-office-visual.mjs';
import {officeFixture} from './founder-ugig-office-fixture.mjs';import {officeGenerationKey} from './founder-ugig-office-contract.mjs';import {sha256,binaryMime,binaryManifestFiles} from './founder-binary-artifacts.mjs';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
for(const fault of ['none','layout-failed','missing-layout','wrong-layout','off','revoke','wrong-input','wrong-pdf','wrong-image','false-review','missing-page','extra-file','changed-bytes','no-reservation','confidential','revoke-at-publish','staged-tamper','staged-review','staged-binding','staged-extra','abort'])test('isolated visual evidence boundary: '+fault,async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'visual-boundary-')),f=officeFixture();let on=true,allowed=true,calls=0,authorizations=0;const controller=new AbortController();let bytes=Buffer.from('synthetic-not-a-real-docx');
 const artifact={name:'delivery.docx',type:binaryMime('delivery.docx'),size:bytes.length,sha256:sha256(bytes)};
 const files=['delivery.md','README.md','changes.json'].map(path=>({path,content:'synthetic'}));
 files.push({path:'technical-report.json',content:JSON.stringify({schema:'numaron-office-technical-v1',workKind:f.a.workKind,validationMode:'fixed-reference',technicalPassed:true,independentlyVerified:false,files:[{name:artifact.name,size:artifact.size,sha256:artifact.sha256},...files.map(t=>({name:t.path,size:Buffer.byteLength(t.content),sha256:sha256(t.content)}))]})});
 const result=checkedJSON({generationKey:officeGenerationKey(f.a),binaryArtifacts:[artifact],files});result.packageDigest=digest({binaryArtifacts:result.binaryArtifacts,files:result.files});result.productDigest=digest({files:binaryManifestFiles({...result,deliveryProtocol:'mixed-files-v1'})});
 const inspector=createOfficeVisualInspector({base,specBytes:f.blobs.get(f.a.specRef.sha256),runtime:{python:path.join(base,'python'),soffice:path.join(base,'soffice'),poppler:base,rendererSha256:'c'.repeat(64)},artifactStore:{read:()=>bytes},isEnabled:()=>on,authorize:async()=>{authorizations++;if(fault.startsWith('staged-')&&authorizations===5){const root=path.join(base,'artifacts/founder-autonomy-20261013/ugig-office-visual');const dir=fs.readdirSync(root).find(n=>n.startsWith('.pending-'));if(fault==='staged-tamper')fs.appendFileSync(path.join(root,dir,'page-1.png'),'tampered');if(fault==='staged-review')fs.writeFileSync(path.join(root,dir,'specialist-review.json'),JSON.stringify({reviewed:true}));if(fault==='staged-binding')fs.writeFileSync(path.join(root,dir,'binding.json'),JSON.stringify({deliveryReady:true}));if(fault==='staged-extra')fs.writeFileSync(path.join(root,dir,'extra.json'),'{}');}return allowed&&!(fault==='revoke-at-publish'&&authorizations===5);},run:async(_python,args)=>{
  calls++;const cfg=JSON.parse(fs.readFileSync(args.at(-1))),out=cfg.output;fs.mkdirSync(out);
  const pdf=Buffer.from('%PDF-synthetic'),png=pngHeader();
  const report={schema:'numaron-docx-visual-v1',expectedPages:cfg.expectedPages,inputSha256:artifact.sha256,workKind:f.a.workKind,rendererSha256:'c'.repeat(64),pdfSha256:sha256(pdf),pages:[{page:1,image:'page-1.png',imageSha256:sha256(png),width:600,height:800,outside:false}],issues:[],geometryPassed:true,independentlyVerified:false,deliveryReady:false,visualReviewRequired:true};
  if(fault==='missing-layout')delete report.expectedPages;if(fault==='wrong-layout')report.expectedPages={Titel:2};
  if(fault==='abort')controller.abort();if(fault==='off')on=false;if(fault==='revoke')allowed=false;
  if(fault==='wrong-input')report.inputSha256='d'.repeat(64);
  if(fault==='wrong-pdf')report.pdfSha256='d'.repeat(64);
  if(fault==='wrong-image')report.pages[0].imageSha256='d'.repeat(64);
  if(fault==='false-review')report.independentlyVerified=true;
  if(fault==='changed-bytes')bytes=Buffer.from('changed');
  if(fault==='layout-failed'){report.geometryPassed=false;report.issues=['heading-separated'];}
  fs.writeFileSync(path.join(out,'input.pdf'),pdf);if(fault!=='missing-page')fs.writeFileSync(path.join(out,'page-1.png'),png);
  if(fault==='extra-file')fs.writeFileSync(path.join(out,'unexpected.txt'),'x');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report));
 }});
 try{
  const ctx={grant:{reservationId:'synthetic'},signal:controller.signal};
  if(fault==='no-reservation')delete ctx.grant;if(fault==='confidential')f.a.privacy='confidential';
  if(['none','layout-failed'].includes(fault)){const r=await inspector.inspect(f.a,result,ctx);assert.equal(r.specialistReview.status,fault==='none'?'pending-specialist-review':'blocked-layout-issues');assert.equal(r.specialistReviewDigest,digest(r.specialistReview));assert.equal(r.specialistReview.productDigest,result.productDigest);assert(r.specialistReview.checks.every(c=>c.status==='pending'));assert.equal(r.specialistReview.deliveryReady,false);const saved=JSON.parse(fs.readFileSync(path.join(base,'artifacts/founder-autonomy-20261013/ugig-office-visual',r.evidenceId,'specialist-review.json')));assert.equal(digest(saved),r.specialistReviewDigest);assert.equal(r.deliveryReady,false);assert.equal(r.independentlyVerified,false);assert.equal(r.geometryPassed,fault==='none');assert(fs.existsSync(path.join(base,'artifacts/founder-autonomy-20261013/ugig-office-visual',r.evidenceId,'binding.json')));}
  else{await assert.rejects(inspector.inspect(f.a,result,ctx));const root=path.join(base,'artifacts/founder-autonomy-20261013/ugig-office-visual');assert(!fs.existsSync(root)||fs.readdirSync(root).length===0);}
  if(['no-reservation','confidential'].includes(fault))assert.equal(calls,0);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

function pngHeader(){const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(800,16);b.writeUInt32BE(1067,20);return b;}
