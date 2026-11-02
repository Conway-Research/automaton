import path from 'node:path';
import {readOfficeFile} from './founder-ugig-office-evidence.mjs';
import {sha256,binaryManifestFiles} from './founder-binary-artifacts.mjs';
import {digest,checkedJSON} from './founder-restoration-integrity.mjs';
import {validateOfficeWork,officeGenerationKey,OFFICE_CHECKS} from './founder-ugig-office-contract.mjs';
import {mixedPackageDigest,validMixedTextFiles} from './founder-ugig-mixed-package.mjs';
import {validateOfficeTechnicalReport} from './founder-ugig-office-report.mjs';
const must=(ok,message)=>{if(!ok)throw Error('DOCX evidence: '+message);};
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const issues=new Set(['text-mismatch','text-outside-margins','blank-page','heading-location-ambiguous','heading-separated','page-break-mismatch']);
/** Read-only integrity check. Pinned hashes must come from the reviewed rendering run. */
export function readDocxVisualEvidence({source,directory,reportDigest,rendererDigest,workKind,expectedPages}){
 must(hex(reportDigest)&&hex(rendererDigest)&&['document-cleanup','support-templates'].includes(workKind),'expected binding');
 const reportFile=path.join(directory,'report.json'),raw=readOfficeFile(reportFile,10*1024*1024);must(sha256(raw)===reportDigest,'report changed');
 const r=JSON.parse(raw.toString('utf8')),input=readOfficeFile(source,10*1024*1024);
 if(expectedPages!==undefined)must(r.expectedPages!==undefined&&digest(r.expectedPages)===digest(expectedPages),'report layout requirements mismatch');
 must(r.schema==='numaron-docx-visual-v1'&&r.workKind===workKind&&r.inputSha256===sha256(input)&&r.rendererSha256===rendererDigest,'source or renderer mismatch');
 must(r.visualReviewRequired===true&&r.independentlyVerified===false&&r.deliveryReady===false,'unverified visual review required');
 must(Array.isArray(r.issues)&&r.issues.every(x=>issues.has(x))&&new Set(r.issues).size===r.issues.length&&r.geometryPassed===(r.issues.length===0),'layout result');
 must(Array.isArray(r.pages)&&r.pages.length>0&&r.pages.length<=30,'page count');
 const pdf=readOfficeFile(path.join(directory,'input.pdf'),25*1024*1024);must(hex(r.pdfSha256)&&sha256(pdf)===r.pdfSha256&&pdf.subarray(0,5).toString()==='%PDF-','PDF binding');
 let total=raw.length+input.length+pdf.length;
 const pages=r.pages.map((p,i)=>{
  must(p.page===i+1&&p.image===`page-${i+1}.png`&&hex(p.imageSha256)&&Number.isFinite(p.width)&&p.width>=100&&p.width<=1500&&Number.isFinite(p.height)&&p.height>=100&&p.height<=1500&&typeof p.outside==='boolean','page identity');
  must(!p.outside||r.issues.includes('text-outside-margins'),'unreported margin defect');
  const image=readOfficeFile(path.join(directory,p.image),12*1024*1024);total+=image.length;must(total<=128*1024*1024,'evidence total size');
  must(sha256(image)===p.imageSha256&&image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'page bytes');
  // PDF page sizes are points; the pinned renderer emits PNGs at 96 dpi.
  // This checks the header binding, not complete PNG decoding or visual quality.
  must(image.length>=33&&image.readUInt32BE(8)===13&&image.toString('ascii',12,16)==='IHDR','PNG header');
  const pixelWidth=image.readUInt32BE(16),pixelHeight=image.readUInt32BE(20);
  must(pixelWidth===Math.ceil(p.width*96/72)&&pixelHeight===Math.ceil(p.height*96/72),'PNG dimensions');
  return {page:p.page,image:p.image,imageSha256:p.imageSha256,width:p.width,height:p.height};
 });
 must(sha256(readOfficeFile(reportFile,10*1024*1024))===reportDigest&&sha256(readOfficeFile(source,10*1024*1024))===r.inputSha256,'evidence changed during read');
 return {...(expectedPages===undefined?{}:{expectedPages:checkedJSON(expectedPages),layoutDigest:digest(expectedPages)}),schema:'numaron-docx-evidence-v1',inputSha256:r.inputSha256,inputSize:input.length,reportDigest,rendererSha256:rendererDigest,pdfSha256:r.pdfSha256,pages,issues:[...r.issues],geometryPassed:r.geometryPassed,visualReviewRequired:true,independentlyVerified:false,deliveryReady:false};
}
/** Prepare pending specialist checks bound to an exact order and complete package. No grants or writes. */
export function prepareDocxSpecialistReview({agreement,product,...options}){
 const a=checkedJSON(agreement),p=checkedJSON(product);must(validateOfficeWork(a).valid,'work agreement');
 must(validMixedTextFiles(p),'text package');
 must(p.generationKey===officeGenerationKey(a)&&p.packageDigest===mixedPackageDigest(p)&&p.productDigest===digest({files:binaryManifestFiles({...p,deliveryProtocol:'mixed-files-v1'})}),'exact generated package');
 validateOfficeTechnicalReport(p,a.workKind);
 const evidence=readDocxVisualEvidence({...options,workKind:a.workKind});
 must(p.binaryArtifacts.length===1&&p.binaryArtifacts[0].name==='delivery.docx'&&p.binaryArtifacts[0].sha256===evidence.inputSha256&&p.binaryArtifacts[0].size===evidence.inputSize,'rendered product mismatch');
 must(digest([...a.requiredFiles].sort())===digest([...p.binaryArtifacts.map(b=>b.name),...p.files.map(f=>f.path)].sort()),'required files');
 return {schema:'numaron-docx-specialist-review-request-v1',agreementDigest:digest(a),generationKey:p.generationKey,packageDigest:p.packageDigest,productDigest:p.productDigest,evidenceDigest:digest(evidence),evidence,status:evidence.geometryPassed?'pending-specialist-review':'blocked-layout-issues',checks:OFFICE_CHECKS[a.workKind].map(id=>({id,status:'pending',evidenceRefs:id==='visual-layout'?['visual:'+digest(evidence)]:[]})),reviewed:false,independentlyVerified:false,deliveryReady:false};
}
