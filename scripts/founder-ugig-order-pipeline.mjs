import {createBinaryArtifactStore,binaryManifestFiles} from './founder-binary-artifacts.mjs';
import {createUgigBinaryDelivery,validateBinaryAgreement} from './founder-ugig-binary-delivery.mjs';
import path from 'node:path';
import {bounded,digest,orderKey} from './founder-restoration-integrity.mjs';
import {createUgigOrderContract,validateUgigOrderAgreement,ugigOrderScopeDigest} from './founder-ugig-order-contract.mjs';
import {createUgigEvidenceReaders} from './founder-ugig-evidence.mjs';
import {createUgigCompletion} from './founder-ugig-completion.mjs';
import {createUgigPilotDelivery,createUgigDeliveryJournal} from './founder-ugig-pilot-delivery.mjs';
import {selectWorkProfile} from './founder-work-profiles.mjs';
import {prepareServiceData,prepareSourceReport} from '../src/commerce/service-delivery.ts';
import {validateContentBrief} from './founder-content-package.mjs';
export const UGIG_WORK_CHECKS=Object.freeze(Object.fromEntries(Object.entries({
 'document-cleanup':['source-preservation','structure','change-report'],
 'data-cleaning':['reference-output','conflict-handling','idempotence','row-coverage','resource-limits'],
 'rest-api':['api-contract','authentication','authorization-negative-cases','persistence','input-validation'],
 'research-report':['source-quality','claim-meaning','coverage','reuse-rights'],
 'calendar-text':['event-identity','unchanged-time-and-participants','no-invented-purpose'],
 'api-automation':['api-contract','retry-and-rate-limits','idempotence','partial-failure-recovery'],
 'support-templates':['policy-compliance','placeholders','escalation','no-invented-promises'],
 'spam-model':['held-out-evaluation','precision-recall','false-positives','data-leakage','resource-limits'],
 'pdf-extraction':['field-reference','page-coverage','ocr-errors','uncertainty'],
 'python-plots':['data-aggregation','axes-and-units','visual-review','resource-limits'],
 'executive-brief':['source-fidelity','uncertainty','decision-relevance','length'],
 'python-gui':['interaction','cancel-and-errors','responsiveness','target-system'],
 'xlsx-automation':['reference-workbooks','formulas-and-types','invalid-rows','original-preservation']
}).map(([k,v])=>[k,Object.freeze(v)])));
const requireValue=(v,m)=>{if(!v)throw Error('uGig pipeline: '+m);};
const safeFiles=files=>Array.isArray(files)&&files.length>0&&files.length<=100&&new Set(files.map(f=>f.path.toLowerCase())).size===files.length&&files.every(f=>typeof f.path==='string'&&/^[-\w.]+(?:\/[-\w.]+)*$/.test(f.path)&&!f.path.split('/').some(p=>p==='..'||p==='.'||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))&&typeof f.content==='string'&&!f.content.includes('\0'))&&Buffer.byteLength(files.map(f=>f.path+'\n'+f.content).join('\n'))<=128000;
export function validateUgigWorkPlan(a){try{
 if(a.profileId==='reviewed-binary')return Object.hasOwn(UGIG_WORK_CHECKS,a.workKind)&&validateBinaryAgreement(a);
 if(!Object.hasOwn(UGIG_WORK_CHECKS,a.workKind)||a.deliveryProtocol!=='numbered-messages-v1'||a.deliveryRequirements?.format!=='text-files-v1'||Object.keys(a.deliveryRequirements).sort().join(',')!=='format,requiredFiles')return false;
 const required=a.deliveryRequirements.requiredFiles;if(!Array.isArray(required)||!required.length||new Set(required).size!==required.length||!safeFiles(required.map(path=>({path,content:''}))))return false;
 const formats=selectWorkProfile({order:{profileId:a.profileId},files:required.map(path=>({path,content:''}))});if(formats.blockers.some(b=>b!=='certified-offline-runtime-required'))return false;
 if(a.profileId==='structured-data')return a.workKind==='data-cleaning'&&prepareServiceData(a.data?.rows,a.data?.contract).status==='prepared'&&a.qualityContract===undefined;
 if(a.profileId==='source-report')return ['research-report','executive-brief'].includes(a.workKind)&&prepareSourceReport(a.report?.sources,a.report?.claims,a.report?.now,a.report?.maxAgeMs).status==='citation_matched';
 if(a.profileId==='content-repurpose')return ['document-cleanup','calendar-text','support-templates','executive-brief'].includes(a.workKind)&&validateContentBrief(a.contentBrief).passed;
 return ['python','node-js','typescript','bash'].includes(a.profileId)&&safeFiles(a.files)&&Array.isArray(a.sources)&&a.sources.length>0;
 }catch{return false;}}
export function createUgigOrderPipeline({base,isEnabled,request,credential,now=Date.now,paymentAuthority,solanaRpc,solanaRequest,coinpayRequest,coinpayCredential,canResumeDelivery=()=>false,binaryStorageOrigin}){
 const active=ctx=>{requireValue(isEnabled()===true&&!ctx?.signal?.aborted,'OFF or cancelled');ctx?.assertActive?.();};
 const profileValidators=Object.fromEntries(['structured-data','source-report','content-repurpose','python','node-js','typescript','bash','reviewed-binary'].map(p=>[p,validateUgigWorkPlan]));
 const binaryStore=createBinaryArtifactStore({base,isEnabled});
 const evidence=createUgigEvidenceReaders({base,isEnabled,now,validateAgreement:a=>validateUgigOrderAgreement(a,profileValidators)});
 const root=path.join(base,'artifacts/founder-autonomy-20261013');const persist=createUgigDeliveryJournal({base:path.join(root,'ugig-order-evidence'),isEnabled});
 const recordEvidence=async(e,ctx)=>{active(ctx);persist({digest:digest(e)},e);return 'artifacts/founder-autonomy-20261013/ugig-order-evidence/'+digest({digest:digest(e)})+'.json';};
 const completion=createUgigCompletion({isEnabled,request,credential,evidence,recordEvidence,claimPayment:createUgigDeliveryJournal({base:path.join(root,'ugig-payment-claims'),isEnabled}),solanaRpc,solanaRequest,coinpayRequest,coinpayCredential,now});
 const contract=createUgigOrderContract({profileValidators,isEnabled,request,credential,getReviewedAgreement:evidence.agreement,getReviewedLifecycleMessages:evidence.lifecycleMessages,now});
 const readAssignment=async(o,ctx)=>{active(ctx);const r=await contract.readAssignment(o,ctx),a=r.binding;if(a.funding?.verified===true)await completion.verifyFunding(o,ctx);else requireValue(paymentAuthority?.allows(a)===true,'existing bounded payment authority required');active(ctx);requireValue(digest(evidence.agreement(o))===digest(a),'agreement changed during funding check');return r;};
 function reviewProduct(product,order,ctx){active(ctx);const p=evidence.pack(order),a=p.agreement,r=p.productReview;requireValue(product?.digest===digest({files:product.files})&&safeFiles(product.files),'exact safe text package required');const selected=selectWorkProfile({order:a,files:product.files});requireValue(!selected.blockers.some(b=>b!=='certified-offline-runtime-required'),'unsupported file format');if(a.profileId==='reviewed-binary'){requireValue(digest(product.files)===digest(binaryManifestFiles(a)),'binary manifest mismatch');for(const f of a.binaryArtifacts)binaryStore.read(f);}else requireValue(a.deliveryRequirements.requiredFiles.every(name=>product.files.some(f=>f.path===name)),'required deliverables missing');
 if(product.binding)requireValue(ugigOrderScopeDigest(product.binding)===a.scopeDigest&&digest(orderKey(product.binding))===digest(orderKey(a)),'product contract mismatch');
 if(a.profileId==='structured-data')requireValue(digest(product.files)===digest([{path:'delivery.csv',content:prepareServiceData(a.data.rows,a.data.contract).csv}]),'data output mismatch');
 if(a.profileId==='source-report')requireValue(digest(product.files)===digest([{path:'report.json',content:JSON.stringify(prepareSourceReport(a.report.sources,a.report.claims,a.report.now,a.report.maxAgeMs))}]),'report output mismatch');
 requireValue(r?.reviewed===true&&r.independentlyVerified===true&&bounded(r.reviewerId)&&r.agreementDigest===digest(a)&&r.productDigest===product.digest&&r.workKind===a.workKind&&Number.isFinite(r.expiresAt)&&r.expiresAt>now(),'current independent specialist review required');
 requireValue([...UGIG_WORK_CHECKS[a.workKind],...(a.profileId==='reviewed-binary'?['binary-format-decode','binary-content-and-privacy','binary-provenance']:[]),...(a.deliveryProtocol==='mixed-files-v1'?['mixed-package-completeness','source-code-isolated-tests','csv-reference-output','readme-reproducibility']:[])].every(k=>r.checks?.[k]?.passed===true&&Array.isArray(r.checks[k].evidenceRefs)&&r.checks[k].evidenceRefs.length>0&&r.checks[k].evidenceRefs.every(e=>bounded(e,2000))),'specialist evidence incomplete');active(ctx);return true;}
 const verifyProduct=async(p,ctx)=>{try{return reviewProduct(p,ctx?.order??p.binding,ctx);}catch{return false;}};
 const delivery=createUgigPilotDelivery({isEnabled,request,credential,readAssignment,recordEvidence,claimDelivery:createUgigDeliveryJournal({base:path.join(root,'ugig-delivery-journal'),isEnabled}),canResumeDelivery:async(o,ctx)=>await canResumeDelivery(o,ctx)===true&&await verifyProduct(ctx.product,{...ctx,order:o}),beforeSend:async(o,p,ctx)=>reviewProduct(p,o,ctx),now});
 const binaryDelivery=createUgigBinaryDelivery({base,isEnabled,request,credential,storageOrigin:binaryStorageOrigin,readAssignment,verifyProduct,recordEvidence,now});
 const selected=o=>evidence.agreement(o).profileId==='reviewed-binary'?binaryDelivery:delivery;
 return {readAssignment,verifyProduct,submitDelivery:async(i,ctx)=>{reviewProduct(i.product,i,ctx);return selected(i).submitDelivery(i,ctx);},readDelivery:(o,intent,ctx)=>selected(o).readDelivery(o,intent,ctx),readAcceptance:completion.readAcceptance,readPayment:completion.readPayment,access:evidence.access,status:()=>({workKinds:Object.keys(UGIG_WORK_CHECKS),specialistReview:'independently-reviewed-local-evidence-required',delivery:'text-and-consented-binary-attachments',binaryStorageConfigured:!!binaryStorageOrigin,fundingReaderConfigured:true,liveReady:false})};
}
