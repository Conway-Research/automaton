import {bounded,checkedJSON,digest,orderKey} from './founder-restoration-integrity.mjs';
import {binaryManifestFiles,safeBinaryName} from './founder-binary-artifacts.mjs';
import {validateBinaryAgreement} from './founder-ugig-binary-delivery.mjs';
import {mixedPackageDigest} from './founder-ugig-mixed-package.mjs';
export const OFFICE_CHECKS=Object.freeze(Object.fromEntries(Object.entries({
 'document-cleanup':['source-preservation','structure','change-report','visual-layout'],
 'support-templates':['policy-compliance','placeholders','escalation','no-invented-promises','visual-layout'],
 'research-report':['source-quality','claim-meaning','coverage','reuse-rights'],
 'xlsx-automation':['reference-workbooks','formulas-and-types','invalid-rows','original-preservation']
}).map(([k,v])=>[k,[...v,'binary-format-decode','binary-content-and-privacy','binary-provenance','mixed-package-completeness','source-code-isolated-tests','csv-reference-output','readme-reproducibility']])));
const fields='schema profileId sourceId externalId ownerId rootTaskId sourceRevision gigId applicationId conversationId buyerId reviewed reviewEvidenceRef assignmentConfirmed termsVerified aiAllowed privacy deadline acceptanceCriteria agreementEvidence processing workKind inputRefs specRef referenceRef generatorVersion requiredFiles paymentTerms scopeDigest'.split(' ');
const scopeFields=fields.filter(k=>!['scopeDigest','reviewed','reviewEvidenceRef'].includes(k));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join('|')===[...keys].sort().join('|');
export const officeMust=(ok,m)=>{if(!ok)throw Error('Office authority: '+m);};
const check=(fn)=>{try{fn();return {valid:true,blockers:[]};}catch(e){return {valid:false,blockers:[e.message]};}};
export const officeScopeDigest=a=>digest({...Object.fromEntries(scopeFields.map(k=>[k,a[k]??null])),...(Object.hasOwn(a,'conversationBinding')?{conversationBinding:a.conversationBinding}:{}),...(Object.hasOwn(a,'customerWork')?{customerWork:a.customerWork}:{})});
export const officeGenerationKey=a=>digest({order:orderKey(a),revision:a.sourceRevision,scope:officeScopeDigest(a),spec:a.specRef??null,reference:a.referenceRef??null,inputs:a.inputRefs??null,generator:a.generatorVersion??null});
function ref(r,format,max){return exact(r,['sha256','size','format','privacy'])&&hash(r.sha256)&&Number.isSafeInteger(r.size)&&r.size>0&&r.size<=max&&r.format===format&&r.privacy==='public';}
function proof(p,buyer){return p&&uuid(p.messageId)&&p.senderId===buyer&&hash(p.contentDigest);}
export function validateOfficeWork(a){return check(()=>{
 checkedJSON(a);officeMust(exact(a,[...fields,...(Object.hasOwn(a,'conversationBinding')?['conversationBinding']:[]),...(Object.hasOwn(a,'customerWork')?['customerWork']:[])]),'unknown or missing agreement fields');
 officeMust(a.schema==='numaron-ugig-office-work-v1'&&a.profileId==='office-generation'&&Object.hasOwn(OFFICE_CHECKS,a.workKind),'version/profile');
 orderKey(a);officeMust(uuid(a.gigId)&&uuid(a.applicationId)&&uuid(a.conversationId)&&bounded(a.buyerId)&&a.buyerId!==a.ownerId&&a.externalId==='application:'+a.gigId&&a.rootTaskId==='ugig-'+digest(a.gigId).slice(0,24)&&bounded(a.sourceRevision),'identity');
 officeMust(a.reviewed===true&&bounded(a.reviewEvidenceRef,2000)&&a.assignmentConfirmed===true&&a.termsVerified===true&&a.aiAllowed===true&&a.privacy==='public','explicit work permission');
 officeMust(Number.isFinite(Date.parse(a.deadline))&&Array.isArray(a.acceptanceCriteria)&&a.acceptanceCriteria.length>0&&a.acceptanceCriteria.every(x=>bounded(x,2000)),'deadline/acceptance');
 officeMust(Array.isArray(a.agreementEvidence)&&a.agreementEvidence.length>0&&a.agreementEvidence.every(p=>exact(p,['messageId','senderId','contentDigest'])&&proof(p,a.buyerId)),'buyer evidence');
 if(Object.hasOwn(a,'conversationBinding')){
  const b=a.conversationBinding;
  officeMust(exact(b,['mode','messageId'])&&b.mode==='reviewed-buyer-message'&&uuid(b.messageId)&&a.agreementEvidence.filter(p=>p.messageId===b.messageId&&p.senderId===a.buyerId).length===1,'reviewed conversation binding');
 }
 officeMust(exact(a.processing,['approved','messageId','senderId','contentDigest'])&&a.processing.approved===true&&a.agreementEvidence.some(p=>p.messageId===a.processing.messageId&&p.contentDigest===a.processing.contentDigest&&p.senderId===a.processing.senderId),'processing consent');
 officeMust(ref(a.specRef,'json',96000)&&ref(a.referenceRef,'json',16*1024*1024)&&hash(a.generatorVersion),'input references/runtime');
 officeMust(Array.isArray(a.inputRefs)&&a.inputRefs.length<=3&&a.inputRefs.every(i=>exact(i,['name','blob'])&&safeBinaryName(i.name)&&i.name.endsWith('.xlsx')&&ref(i.blob,'xlsx',10*1024*1024))&&new Set(a.inputRefs.map(i=>i.name.toLowerCase())).size===a.inputRefs.length,'workbook inputs');
 officeMust(a.workKind==='xlsx-automation'?a.inputRefs.length>0:a.inputRefs.length===0,'workbook scope');
 officeMust(Array.isArray(a.requiredFiles)&&a.requiredFiles.length>1&&a.requiredFiles.length<=50&&a.requiredFiles.every(n=>bounded(n,120)&&/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(docx|xlsx|md|json|csv|py|bat)$/.test(n))&&new Set(a.requiredFiles.map(n=>n.toLowerCase())).size===a.requiredFiles.length,'required files');
 const t=a.paymentTerms;officeMust(t&&Object.keys(t).every(k=>['paymentMode','amountMinor','netAmountMinor','currency','recipient','settlement','policyVersion','exposureRappen','commitmentDigest','contractDigest'].includes(k))&&Number.isSafeInteger(t.amountMinor)&&t.amountMinor>0&&Number.isSafeInteger(t.netAmountMinor)&&t.netAmountMinor>0&&t.netAmountMinor<=t.amountMinor&&/^[A-Z]{3}$/.test(t.currency)&&bounded(t.recipient),'payment terms');
 officeMust(a.scopeDigest===officeScopeDigest(a),'scope changed');
});}
export function validateOfficeGrant(g,kind,binding,now){const work=kind==='work',key=work?'agreementDigest':'releaseDigest';officeMust(exact(g,['approved',key,'expiresAt','evidenceRef','operations'])&&g.approved===true&&g[key]===binding&&Number.isFinite(g.expiresAt)&&g.expiresAt>now&&bounded(g.evidenceRef,2000)&&Array.isArray(g.operations)&&g.operations.length===(work?3:2)&&digest([...g.operations].sort())===digest((work?['read','work','verify']:['submit','reconcile']).sort()),'exact current '+kind+' grant');}
export function officeWorkView(a,evidence){return {...a,officeAgreement:a,inputs:[a.specRef,a.referenceRef,...a.inputRefs.map(i=>i.blob)],deliveryChannel:'existing-ugig-conversation',deliveryAllowed:false,...(evidence.funding?{funding:evidence.funding}:{}),...(evidence.paymentAuthorization?{paymentAuthorization:evidence.paymentAuthorization}:{})};}
export function officeDeliveryView(a,result,r){return {...officeWorkView(a,{}),schema:'numaron-ugig-office-delivery-view-v1',profileId:'reviewed-binary',deliveryAllowed:true,deliveryProtocol:'mixed-files-v1',binaryArtifacts:result.binaryArtifacts,files:result.files,binaryProvenance:r.provenance,agreementEvidence:[...a.agreementEvidence,{messageId:r.customer.messageId,senderId:r.customer.senderId,contentDigest:r.customer.contentDigest}],deliveryRequirements:{format:'mixed-files-v1',requiredFiles:[...result.binaryArtifacts.map(f=>f.name),...result.files.map(f=>f.path)],publicAccess:r.customer}};}
export function validateOfficeRelease({agreement:a,result,releasePack,now}){return check(()=>{
 officeMust(validateOfficeWork(a).valid,'work agreement');
 const {release:r,deliveryGrant:g}=releasePack??{};officeMust(exact(releasePack,['release','deliveryGrant'])&&exact(r,['schema','order','agreementDigest','generationKey','packageDigest','productDigest','binaryArtifacts','files','customer','provenance','productReview']),'release shape');
 officeMust(r.schema==='numaron-ugig-office-release-v1'&&r.agreementDigest===digest(a)&&r.generationKey===officeGenerationKey(a)&&result.generationKey===r.generationKey&&digest(r.order)===digest({...orderKey(a),rootTaskId:a.rootTaskId,sourceRevision:a.sourceRevision,scopeDigest:a.scopeDigest}),'release identity');
 officeMust(result.packageDigest===mixedPackageDigest(result)&&r.packageDigest===result.packageDigest&&digest(r.binaryArtifacts)===digest(result.binaryArtifacts)&&digest(r.files)===digest(result.files),'exact package');
 const product=digest({files:binaryManifestFiles({...result,deliveryProtocol:'mixed-files-v1'})});officeMust(result.productDigest===product&&r.productDigest===product,'exact product');
 officeMust(digest([...a.requiredFiles].sort())===digest([...result.binaryArtifacts.map(f=>f.name),...result.files.map(f=>f.path)].sort()),'complete required package');
 officeMust(r.customer.conversationId===a.conversationId&&proof(r.customer,a.buyerId)&&validateBinaryAgreement(officeDeliveryView(a,result,r)),'exact public consent');
 const v=r.productReview;officeMust(v?.reviewed===true&&v.independentlyVerified===true&&bounded(v.reviewerId)&&v.reviewerId.trim()!==a.ownerId.trim()&&v.agreementDigest===digest(a)&&v.productDigest===product&&v.workKind===a.workKind&&Number.isFinite(v.expiresAt)&&v.expiresAt>now,'independent current specialist review');
 officeMust(OFFICE_CHECKS[a.workKind].every(k=>v.checks?.[k]?.passed===true&&Array.isArray(v.checks[k].evidenceRefs)&&v.checks[k].evidenceRefs.length>0&&v.checks[k].evidenceRefs.every(e=>bounded(e,2000))),'specialist checks');
 validateOfficeGrant(g,'delivery',digest(r),now);
});}
