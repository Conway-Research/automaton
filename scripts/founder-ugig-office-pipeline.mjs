import {createOfficeVisualWorkflow} from './founder-ugig-office-visual-workflow.mjs';
import {prepareOfficeSpecialistEvidence} from './founder-ugig-office-specialist.mjs';
import {createOfficeVisualInspector} from './founder-ugig-office-visual.mjs';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {digest,orderKey,checkedJSON} from './founder-restoration-integrity.mjs';
import {createBinaryArtifactStore,binaryManifestFiles,sha256} from './founder-binary-artifacts.mjs';
import {createUgigBinaryDelivery} from './founder-ugig-binary-delivery.mjs';
import {createUgigDeliveryJournal} from './founder-ugig-pilot-delivery.mjs';
import {createUgigContractReader} from './founder-ugig-pilot-contract.mjs';
import {createUgigCompletion} from './founder-ugig-completion.mjs';
import {createUgigOfficeGenerator} from './founder-ugig-office.mjs';
import {createOfficeEvidence} from './founder-ugig-office-evidence.mjs';
import {openOfficeJournal} from './founder-ugig-office-journal.mjs';
import {createOfficeWork} from './founder-ugig-office-work.mjs';
import {validateOfficeWork,validateOfficeRelease,officeWorkView,officeDeliveryView,officeGenerationKey,officeMust as must} from './founder-ugig-office-contract.mjs';
const exec=promisify(execFile);
export async function officeRuntimeVersion(python,ctx={}){
 must(typeof python==='string'&&path.isAbsolute(python)&&fs.statSync(python).isFile(),'explicit Python runtime');
 const r=await exec(python,['-I','-c','import sys,json,importlib.metadata as m;print(json.dumps([sys.version,m.version("python-docx"),m.version("openpyxl")]))'],{windowsHide:true,timeout:10000,maxBuffer:4000,signal:ctx.signal,cwd:os.tmpdir(),env:{SYSTEMROOT:process.env.SYSTEMROOT??'C:\\Windows',TEMP:os.tmpdir(),TMP:os.tmpdir()}});
 const versions=JSON.parse(r.stdout);must(versions[1]==='1.2.0'&&versions[2]==='3.1.5','pinned Office packages');
 return digest({versions,reportValidator:sha256(fs.readFileSync(fileURLToPath(new URL('./founder-ugig-office-report.mjs',import.meta.url)))),python:sha256(fs.readFileSync(python)),formatter:sha256(fs.readFileSync(fileURLToPath(new URL('./ugig_office.py',import.meta.url)))),adapter:sha256(fs.readFileSync(fileURLToPath(new URL('./founder-ugig-office.mjs',import.meta.url))))});
}
export function createOfficePipeline({base,isEnabled,now=Date.now,request,credential,paymentAuthority,officeRuntime,officeVisualRuntime,officeRetryAuthority,binaryStorageOrigin,solanaRpc,solanaRequest,coinpayRequest,coinpayCredential}){
 const active=ctx=>{must(isEnabled()===true&&!ctx?.signal?.aborted,'pipeline OFF or cancelled');ctx?.assertActive?.();};
 const evidence=createOfficeEvidence({base,isEnabled,now}),artifacts=createBinaryArtifactStore({base,isEnabled}),root=path.join(base,'artifacts/founder-autonomy-20261013');
 let journal,worker;
 const getJournal=()=>{active();return journal??=openOfficeJournal({directory:path.join(root,'ugig-office-journal'),isEnabled,now,authorizeRetry:officeRetryAuthority});};
 const persist=createUgigDeliveryJournal({base:path.join(root,'ugig-office-proof'),isEnabled});
 const recordEvidence=async(e,ctx)=>{active(ctx);const key={digest:digest(e)};persist(key,e);return 'ugig-office-proof:'+digest(key);};
 const completion=createUgigCompletion({isEnabled,request,credential,evidence:{pack:o=>evidence.completionPack(o)},recordEvidence,claimPayment:createUgigDeliveryJournal({base:path.join(root,'ugig-office-payment-claims'),isEnabled}),solanaRpc,solanaRequest,coinpayRequest,coinpayCredential,now});
 function bundle(o){const a=evidence.work(o).agreement,key=officeGenerationKey(a),rp=evidence.release(o,key);must(rp,'exact package release required');const row=getJournal().read(key);must(row?.status==='generated'&&row.contractDigest===digest(a),'generated package required');const result=row.result;must(validateOfficeRelease({agreement:a,result,releasePack:rp,now:now()}).valid,'invalid independent package release');for(const b of result.binaryArtifacts)artifacts.read(b);return {a,result,rp};}
 function workView(o){const p=evidence.work(o),a=p.agreement,b=officeWorkView(a,p.fundingEvidence);if(evidence.release(o,officeGenerationKey(a))){const {rp}=bundle(o);b.officeReleaseDigest=digest(rp);b.agreementEvidence=[...a.agreementEvidence,{messageId:rp.release.customer.messageId,senderId:rp.release.customer.senderId,contentDigest:rp.release.customer.contentDigest}];}return b;}
 const reader=createUgigContractReader({isEnabled,request,credential,now,getReviewedAgreement:workView,getReviewedLifecycleMessages:o=>{const p=evidence.work(o),r=p.acceptance;return r?.reviewed===true&&r.noContractChangeReviewed===true&&r.deliveryDigest===o.deliveryDigest?[{messageId:r.messageId,senderId:p.agreement.buyerId,contentDigest:r.contentDigest}]:[];},validateAgreement:b=>{const v=validateOfficeWork(b?.officeAgreement);return {...v,agreementDigest:v.valid?digest(b):null};}});
 async function readAssignment(o,ctx){active(ctx);const p=evidence.work(o),a=p.agreement,releaseBefore=evidence.release(o,officeGenerationKey(a)),order={...o,scopeDigest:a.scopeDigest};const r=await reader.readAssignment(order,ctx),b=r.binding,t=a.paymentTerms,f=b.funding??b.paymentAuthorization;
  must(f&&Object.keys(t).every(k=>digest(f[k]??null)===digest(t[k])),'original financial terms');if(b.funding){must(b.funding.verified===true&&digest(orderKey(f))===digest(orderKey(a))&&f.rootTaskId===a.rootTaskId&&f.sourceRevision===a.sourceRevision&&f.scopeDigest===a.scopeDigest&&Number.isFinite(f.expiresAt)&&f.expiresAt>now(),'exact current funding');await completion.verifyFunding(order,ctx);}else must(paymentAuthority?.allows(b)===true,'existing payment authority');
  active(ctx);must(digest(evidence.work(o))===digest(p),'work/funding evidence changed');must(digest(evidence.release(o,officeGenerationKey(a)))===digest(releaseBefore),'package release changed during assignment');if(releaseBefore)bundle(o);return r;
 }
 async function authorizeWork(o,a,ctx){const r=await readAssignment(o,ctx);must(digest(r.binding.officeAgreement)===digest(a),'immutable work scope');return true;}
 function getWorker(){active();must(officeRuntime?.python&&officeRuntime?.generatorVersion,'Office runtime not configured');if(!worker){const generator=createUgigOfficeGenerator({base,python:officeRuntime.python,isEnabled,authorize:async(binding,ctx)=>{const a=evidence.work(ctx.order).agreement;const input=evidence.inputs(a);must(binding.workKind===a.workKind&&binding.inputDigest===digest(input.spec)&&binding.referenceDigest===digest(input.reference),'exact generator inputs');return authorizeWork(ctx.order,a,ctx);}});
   worker=createOfficeWork({evidence,journal:getJournal(),generator,artifactStore:artifacts,isEnabled,authorizeWork,runtimeVersion:async ctx=>{active(ctx);const version=await officeRuntimeVersion(officeRuntime.python,ctx);active(ctx);must(version===officeRuntime.generatorVersion,'runtime configuration changed');return version;}});
  }return worker;}
 const workCtx=(o,ctx)=>({...ctx,order:o});
 async function readDeliveryAssignment(o,ctx){await readAssignment(o,ctx);const {a,result,rp}=bundle(o),view={...officeDeliveryView(a,result,rp.release),officeReleaseDigest:digest(rp)};active(ctx);return {platform:'ugig',accountId:a.ownerId,observedAt:now(),expiresAt:Math.min(now()+59000,rp.deliveryGrant.expiresAt),evidenceRef:rp.deliveryGrant.evidenceRef,binding:view};}
 async function verifyProduct(product,ctx){try{await readAssignment(ctx.order,ctx);const r=await getWorker().readResult(ctx.order,ctx),b=bundle(ctx.order);must(product.digest===r.productDigest&&digest(product.files)===digest(binaryManifestFiles({...r,deliveryProtocol:'mixed-files-v1'}))&&digest(b.result)===digest(r),'exact generated product');return true;}catch{return false;}}
 const delivery=createUgigBinaryDelivery({base,isEnabled,request,credential,storageOrigin:binaryStorageOrigin,readAssignment:readDeliveryAssignment,verifyProduct,recordEvidence,now});
 async function visualOperation(method,o,ctx,authorization){
  active(ctx);must(officeVisualRuntime,'explicit visual runtime required');const a=evidence.work(o).agreement,r=await getWorker().readResult(o,workCtx(o,ctx));
  const runtime={...officeVisualRuntime,python:officeRuntime.python};
  const sourceHashes=['founder-ugig-office-visual.mjs','founder-ugig-office-layout.mjs','founder-docx-visual-evidence.mjs','ugig_docx_visual.py'].map(n=>sha256(fs.readFileSync(fileURLToPath(new URL('./'+n,import.meta.url)))));
  const binding={agreementDigest:digest(a),generationKey:r.generationKey,productDigest:r.productDigest,packageDigest:r.packageDigest,runtimeDigest:digest({runtime,sourceHashes})};binding.key=digest(binding);
  const authorize=async()=>{active(ctx);await authorizeWork(o,a,ctx);const current=await getWorker().readResult(o,workCtx(o,ctx));must(digest(current)===digest(r),'visual product changed');active(ctx);};
  const inspector=createOfficeVisualInspector({base,runtime,specBytes:evidence.reviewInputs(a).specBytes,artifactStore:artifacts,isEnabled,authorize:async()=>{await authorize();return true;}});
  const workflow=createOfficeVisualWorkflow({directory:path.join(root,'ugig-office-visual-requests'),isEnabled,now,authorize,
   inspect:()=>inspector.inspect(a,r,workCtx(o,ctx)),validate:proof=>inspector.read(proof,a,r,workCtx(o,ctx)),
   authorizeRetry:args=>officeRetryAuthority?.({...args,purpose:'docx-visual',order:o})===true});
  try{return await (method==='retry'?workflow.retry(binding,authorization,ctx):workflow[method](binding,ctx));}finally{workflow.close();}
 }
 const api={has:evidence.has,readAssignment,authorizeWork,readDeliveryAssignment,verifyProduct,
  prepareOfficeSpecialistEvidence:async(o,ctx)=>{
   active(ctx);const a=evidence.work(o).agreement,p=await getWorker().readResult(o,workCtx(o,ctx));
   await authorizeWork(o,a,ctx);const inputs=evidence.reviewInputs(a);
   const result=prepareOfficeSpecialistEvidence({agreement:a,product:p,...inputs,now:now()});
   await authorizeWork(o,a,ctx);must(digest(await getWorker().readResult(o,workCtx(o,ctx)))===digest(p),'specialist product changed');active(ctx);
   return {...result,evidenceRef:await recordEvidence(result,ctx)};
  },
  inspectOfficeLayout:(o,ctx)=>visualOperation('inspect',o,ctx),
  officeLayoutStatus:(o,ctx)=>visualOperation('status',o,ctx),
  readOfficeLayout:(o,ctx)=>visualOperation('read',o,ctx),
  retryOfficeLayout:(o,authorization,ctx)=>visualOperation('retry',o,ctx,authorization),
  prepareOffice:(o,ctx)=>getWorker().prepare(o,workCtx(o,ctx)),
  generateOffice:(o,ctx)=>getWorker().generate(o,workCtx(o,ctx)),
  readOfficeResult:(o,ctx)=>getWorker().readResult(o,workCtx(o,ctx)),
  retryOffice:(o,authorization,ctx)=>getWorker().retry(o,authorization,workCtx(o,ctx)),
  submitDelivery:async(i,ctx)=>{await readDeliveryAssignment(i,ctx);return delivery.submitDelivery(i,ctx);},
  readDelivery:async(o,intent,ctx)=>{await readDeliveryAssignment(o,ctx);return delivery.readDelivery(o,intent,ctx);},
  readAcceptance:async(o,ctx)=>{const before=bundle(o);must(o.deliveryDigest===before.result.productDigest,'accepted package identity');const r=await completion.readAcceptance(o,ctx);active(ctx);must(digest(bundle(o))===digest(before),'acceptance release changed');return r;},
  readPayment:async(o,ctx)=>{const before=bundle(o),{result,a}=before,p=evidence.work(o),f=p.fundingEvidence,allocation=f.paymentAssociation;must(o.deliveryDigest===result.productDigest,'payment package identity');must(allocation?.reviewed===true&&allocation.independentlyVerified===true&&allocation.scopeDigest===a.scopeDigest&&allocation.productDigest===result.productDigest&&allocation.packageDigest===result.packageDigest&&typeof allocation.evidenceRef==='string'&&allocation.evidenceRef.length>0,'independent exact payment allocation');must(!f.netReceipt?.deliveryDigest||f.netReceipt.deliveryDigest===result.productDigest,'receipt package conflict');must(!f.netReceipt?.packageDigest||f.netReceipt.packageDigest===result.packageDigest,'receipt package conflict');const r=await completion.readPayment(o,ctx);active(ctx);must(r.evidenceRef===allocation.receiptEvidenceRef&&digest(evidence.work(o))===digest(p)&&digest(bundle(o))===digest(before),'payment allocation or release changed');return r;},
  access(o,operation='work'){active();const p=evidence.work(o),a=p.agreement;const g=['submit','reconcile'].includes(operation)?bundle(o).rp.deliveryGrant:p.workGrant;must(g.operations.includes(operation),'operation grant');return {verified:true,accountId:a.ownerId,sourceId:a.sourceId,gigId:a.gigId,scopeDigest:a.scopeDigest,rootTaskId:a.rootTaskId,observedAt:now(),expiresAt:Math.min(now()+59000,g.expiresAt),evidenceRef:g.evidenceRef,operations:g.operations};},
  status:()=>({configured:!!officeRuntime,liveReady:false,delivery:'independent-exact-package-release-required'}),
  close(){journal?.close();journal=null;worker=null;}
 };return api;
}
