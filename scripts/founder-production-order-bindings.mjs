import {createStaticBrowserRuntime,createStaticBrowserVisualReader} from './founder-static-browser.mjs';
import {createLaborxAccessReader} from './founder-laborx-access.mjs';
import {createImageRuntime} from './founder-image-runtime.mjs';
import {generateStaticWebsite} from './founder-static-website.mjs';
import {createLaborxSahilSource} from './founder-laborx-delivery.mjs';
import {createSahilOrderGate} from './founder-laborx-sahil.mjs';
import {createProductImageCapability} from './founder-product-images.mjs';
const processEnvBinaryOrigin=()=>globalThis.process.env.NUMARON_UGIG_BINARY_STORAGE_ORIGIN;
import {createOfficePipeline} from './founder-ugig-office-pipeline.mjs';
import {createConfirmedFundedAuthority} from './founder-confirmed-funded-authority.mjs';
import {createUgigOrderPipeline} from './founder-ugig-order-pipeline.mjs';
import {createUgigEvidenceReaders} from './founder-ugig-evidence.mjs';
import {createUgigCompletion} from './founder-ugig-completion.mjs';
import {createUgigPilotContract,PILOT_GIG} from './founder-ugig-pilot-contract.mjs';
import {createUgigPilotDelivery,createUgigDeliveryJournal} from './founder-ugig-pilot-delivery.mjs';
import {verifyContentReview} from './founder-content-worker.mjs';
import {readUgigCredential} from './numaron-monitor-sources.mjs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
import fs from 'node:fs';import path from 'node:path';
import {digest,checkedJSON,bounded} from './founder-restoration-integrity.mjs';
import {coreOrderSources} from './order-sources/index.mjs';
import {createProductionProfileRuntimes} from './founder-production-profile-runtimes.mjs';
const MAX_AGE=60000;
// Existing monitor runs every ten minutes. This grace applies only to GET
// observations, never assignment, funding, acceptance or mutation authority.
const READ_MAX_AGE=11*60000;
// Report actual implemented routes; configured scope never fabricates a live
// capability, account, assignment, payment proof or authenticated transport.
const START_SCOPES=Object.freeze({
 github:{read:'existing-authenticated-reader',messages:'configured-bound-job-replies',offers:'configured-conditional-issue-offer',writeRights:'not-checked-offline',work:'exact-funding-only',submit:'verified-draft-pr-only'},
 dealwork:{read:'existing-agent-reader',messages:'configured-owned-contract-replies',offers:'configured-non-binding-bid-only',writeRights:'send-not-tested-no-owned-contract',work:'own-assigned-held-escrow',submit:'verified-own-native-delivery'},
 ugig:{localWork:'guarded-local-pipeline; authenticated contract still required',read:'own-existing-applications',messages:'configured-existing-buyer-conversation',offers:'configured-free-application',writeRights:'not-checked-offline',work:false},
 synmerco:{read:'own-escrow-observations',messages:false,offers:false,work:false},
 guru:{localWork:'guarded-local-pipeline; authenticated contract still required',read:'personal-session-required',messages:false,offers:false,work:false},
 gmail:{read:'existing-scoped-mail-reader',messages:'configured-reviewed-labelled-thread-replies',offers:false,writeRights:'requires-live-send-scope-and-reviewed-binding',work:false},
 arcbounty:{read:'public-task-observations',messages:false,offers:false,work:false},
 bidpostloop:{read:'public-task-observations',messages:false,offers:false,work:false},
 opire:{read:'github-bounty-comments',messages:'eligible-github-issue-only',offers:false,work:false},
 freelancer:{localWork:'guarded-local-pipeline; authenticated contract still required',read:'manual-browser-only',messages:false,offers:false,work:false},
 laborx:{localWork:'exact-Sahil static website pipeline; provider-permitted transport and isolated visual evidence required',read:'manual-browser-only',messages:false,offers:false,work:false},
 n8n:{read:'manual-browser-only',messages:false,offers:false,work:false}
});
const localInterfaces={
 freelancer:{file:'artifacts/send-access-check-20261018/browser-platforms/evidence.json',read:[],writes:'Official authenticated project assignment and native delivery/readback mapper required'},
 github:{file:'scripts/founder-order-github.mjs',read:['/user','/repos/<repo>/issues/<n>','/repos/<repo>/pulls'],writes:'existing order-flow controller only; exact funding and public contribution gates'},
 ugig:{file:'scripts/numaron-monitor-sources.mjs',sendFile:'scripts/founder-outreach-transports.mjs',read:['/api/auth/session','/api/applications/my','/api/conversations','/api/gigs'],writes:'Free applications and exact participant-bound replies configured; existing API key write scope unverified'},
 dealwork:{file:'scripts/founder-dealwork-escrow.mjs',sendFile:'scripts/founder-outreach-transports.mjs',read:['/api/v1/agents/me','/api/v1/contracts','/api/v1/contracts/<id>/deliverables'],writes:'Non-binding bid mode configured; own native work remains escrow-bound; message response binding unverified'},
 synmerco:{file:'artifacts/synmerco-philadelphia-delivery-20261016/synmerco.ps1',read:['/v1/agents/<did>/bids','/v1/escrows','/v1/agents/inbox','/v1/intents'],writes:'Only exact bound escrow submit-proof is evidenced; no evaluate/release/wallet action'},
 gmail:{file:'scripts/numaron-monitor-sources.mjs',sendFile:'scripts/founder-gmail-order-replies.mjs',read:['/gmail/v1/users/me/messages with existing account/label'],writes:'Existing reviewed recipient/thread only; actual gmail.send required; no permission inferred from incoming mail'},
 guru:{file:'artifacts/guru-independent-monitor-20261017/completion.json',read:[],writes:'Existing personal login and supported independent interface required'},
 arcbounty:{file:'scripts/numaron-monitor-sources.mjs',read:['/api/v1/bounties?status=open'],writes:'No reviewed application or delivery contract'},
 bidpostloop:{file:'scripts/numaron-monitor-sources.mjs',read:['/api/public/tasks?status=open'],writes:'No reviewed application or delivery contract'}
};
function readBoundText(base,file,max=2000000){
 const root=path.resolve(base),target=path.resolve(root,file),relative=path.relative(root,target);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Evidence outside reviewed root');
 let current=root;for(const part of relative.split(path.sep)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Symlink evidence rejected');}
 const stat=fs.statSync(target);if(!stat.isFile()||stat.size>max)throw Error('Bounded local evidence required');return fs.readFileSync(target,'utf8');
}
const readBoundJSON=(base,file,max)=>JSON.parse(readBoundText(base,file,max));
export function createProductionOrderBindings({base,isEnabled,process,draft,imageRuntime,imageReviewReader,officeRuntime,officeVisualRuntime,profileImages={},marketplaceHooks={},sahilAgreementReader,sahilTransport,sahilProviderGrantReader,sahilSessionReader,sahilBrowserImage,sahilBrowserProcess,sahilBrowserReview,sahilBrowserRuntime,sahilVisualReader,sahilWebsiteGenerator=generateStaticWebsite,referenceAuthorityForSource,ugigPilotAgreementReader,ugigPilotAccessReader,ugigPilotRequest=fetch,ugigBinaryStorageOrigin=processEnvBinaryOrigin(),ugigSolanaRpc,ugigSolanaRequest=fetch,ugigCoinpayRequest=fetch,ugigCoinpayCredential,ugigPilotCredential=readUgigCredential,confirmedWorkSource=null,confirmedOwnRecipients={},allowSyntheticConfirmedWorkForTests=false,now=Date.now}={}){
 if(!base||typeof isEnabled!=='function')throw Error('Production base and OFF guard required');
 const defaultUgigEvidence=ugigPilotAgreementReader===undefined&&ugigPilotAccessReader===undefined;
 const ugigEvidence=createUgigEvidenceReaders({base,isEnabled,now});
 if(defaultUgigEvidence){ugigPilotAgreementReader=ugigEvidence.agreement;ugigPilotAccessReader=ugigEvidence.access;}
 return ({executionSandbox,orderFlow,dealworkCode,paymentAuthority}={})=>{
  const runtimes=createProductionProfileRuntimes({isEnabled,nodeSandbox:executionSandbox,process,profileImages});
  const marketplaceReadiness=new Map();const metadata=new Map();const active=ctx=>{if(!isEnabled())throw Error('Production order source OFF');ctx?.assertActive?.();};
  function receipt(name,ctx,externalId,maxAge=MAX_AGE){
   active(ctx);if(name==='guru')throw Error('Guru requires personal login and supported independent interface');const status=readBoundJSON(base,'artifacts/numaron-local-monitor/status.json');
   const rows=(status.sources??[]).filter(r=>name==='github'?r.id.startsWith('github-'):name==='dealwork'?r.id==='dealwork-contracts':name==='synmerco'?r.id==='synmerco-escrows':r.id===(name==='gmail'?'gmail-orders':name));
   for(const row of rows){if(row.status!=='succeeded'||!Number.isFinite(row.checkedAt)||row.checkedAt>now()||now()-row.checkedAt>=maxAge||typeof row.evidence!=='string')continue;
    const file=path.resolve(base,row.evidence),relative=path.relative(path.resolve(base,'artifacts/numaron-local-monitor/runs'),file);if(relative.startsWith('..')||path.isAbsolute(relative))continue;
    const value=readBoundJSON(base,path.relative(base,file)),at=Date.parse(value.checkedAt);if(!Number.isFinite(at)||Math.abs(at-row.checkedAt)>1000||at>now()||now()-at>=maxAge)continue;
    const d=value.data;if(!d||typeof d!=='object')continue;
    if(name==='ugig'&&(d.account?.username!=='Obolus'||!bounded(d.account.id)||d.applicationsComplete!==true))continue;
    if(name==='github'&&externalId&&d.url!==externalId&&d.url!=='https://github.com/'+externalId)continue;
    active(ctx);return {data:d,file:path.relative(base,file).replaceAll('\\','/'),checkedAt:Math.min(at,row.checkedAt),expiresAt:Math.min(at,row.checkedAt)+maxAge};
   }
   throw Error('Current independently observed source receipt unavailable: '+name);
  }
  const productImages=createProductImageCapability({isEnabled,runtime:imageRuntime??createImageRuntime({base,isEnabled}),readReview:imageReviewReader,now});
  let browserConfiguration=null;
  try{const c=readBoundJSON(base,'scripts/founder-static-browser-config.json');if(c.schema==='numaron-static-browser-config-v1'&&c.probePassed===true&&c.moduleDigest===digest(readBoundText(base,'scripts/founder-static-browser.mjs'))&&/^sha256:[a-f0-9]{64}$/.test(c.image))browserConfiguration=c;}catch{}
  const browserRuntime=sahilBrowserRuntime??createStaticBrowserRuntime({image:sahilBrowserImage??browserConfiguration?.image,seccompProfile:browserConfiguration?.seccompProfile,isEnabled,process:sahilBrowserProcess,now});
  const browserVisual=sahilVisualReader??(typeof sahilBrowserReview==='function'?createStaticBrowserVisualReader({runtime:browserRuntime,review:sahilBrowserReview,isEnabled,now}):undefined);
  const laborxTransport=sahilTransport??{access:createLaborxAccessReader({isEnabled,readProviderGrant:sahilProviderGrantReader,readSession:sahilSessionReader,now})};
  // No further delivery part goes out without current funding; reconciliation itself stays read-only.
  const fundedResume=async(order,ctx)=>{const authority=options.confirmedWorkAuthority;if(!authority)return false;try{await authority.refresh(order,ctx);}catch{active(ctx);return false;}return authority.allows(order)===true;};
  const sahilOrderGate=createSahilOrderGate({isEnabled,readAgreement:sahilAgreementReader,paymentAuthority,now});
  let sahilLifecycle=null;
  const options={sahilOrderGate,...(typeof sahilWebsiteGenerator==='function'?{generateWebsite:sahilWebsiteGenerator}:{}),productImages,sandboxes:runtimes.sandboxes,learning:{sandbox:runtimes.learningSandbox,...(typeof draft==='function'?{draft}:{})},
   sources:({registry,store})=>[...coreOrderSources,'freelancer','laborx'].flatMap(name=>{
    const source=registry.snapshot().sources.find(s=>s.aliases.some(a=>a.toLowerCase()===name));if(!source)return [];
    if(name==='laborx'){
     const local=createLaborxSahilSource({sourceId:source.id,isEnabled,readAgreement:sahilAgreementReader,paymentAuthority,transport:laborxTransport,readVisual:browserVisual,now});
     sahilLifecycle=local.readiness();return [local];
    }
    const spec=localInterfaces[name];
    const legacy=name==='github'?orderFlow:name==='dealwork'?dealworkCode:null;
    const setStatus=(value)=>metadata.set(name,value);
    const read=(ctx,externalId,readOnly=false)=>{try{const r=receipt(name,ctx,externalId,readOnly?READ_MAX_AGE:MAX_AGE);setStatus({state:'fresh-read-receipt',checkedAt:r.checkedAt});return r;}catch(e){setStatus({state:'blocked',blocker:name==='guru'?'Personal login and independent interface required':'Fresh existing-monitor evidence required'});throw e;}};
    const ownApplication=(o,r)=>(r.data.applications??[]).find(a=>a.gig_id===o.externalId.replace(/^application:/,'')&&a.applicant_id===r.data.account.id);
    const baseSource={sourceId:source.id,name,profiles:[],evidenceRef:spec.file,needsAdapter:name!=='guru',legacyExecution:legacy?{kinds:Object.keys(legacy.adapters??{}),owner:'existing-controller-only'}:null,
     get blocker(){return metadata.get(name)?.blocker??(legacy?'Existing controller path retained; generic writes need exact source contract':spec.writes);},
     async inspectInterface(ctx){active(ctx);read(ctx,undefined,true);const interfaceText=readBoundText(base,spec.file);
      const contract=checkedJSON({name,read:spec.read,writeBoundary:spec.writes,evidenceFile:spec.file,evidenceDigest:digest(interfaceText),credentials:'Existing protected credential provider only; never part of candidate input',liveAuthorization:false});active(ctx);return {verified:true,sourceId:source.id,evidenceRef:spec.file,interfaceDigest:digest(contract),contract};},
     async registrations(ctx){active(ctx);let r;try{r=read(ctx,undefined,true);}catch(e){active(ctx);return [];}
      // This transfers existing approved read/reconciliation scope only. It
      // never promotes historical receipts or grants apply/work/submit.
      for(const cap of name==='ugig'?['read','reconcile']:['read']){const current=registry.snapshot().sources.find(s=>s.id===source.id).capabilities[cap];if(current.state==='live-verified'&&current.expiresAt>=r.expiresAt)continue;registry.setCapability(source.id,cap,{state:'live-verified',expiresAt:r.expiresAt,evidenceRefs:[r.file],scope:'existing-monitor-read-only'});}
      if(name!=='ugig')return [];if(!Array.isArray(r.data.applications)||r.data.applications.length>100)throw Error('Bounded complete own application receipt required');
      return r.data.applications.filter(a=>bounded(a.gig_id)&&a.applicant_id===r.data.account.id).map(a=>({sourceId:source.id,externalId:'application:'+a.gig_id,ownerId:r.data.account.id,rootTaskId:'ugig-'+digest(a.gig_id).slice(0,24),sourceRevision:'existing-application',state:'applied',termsVerified:false,applicationAllowed:false,provenance:{type:'reviewed-local-registration',evidenceRef:'existing-ugig-application:'+a.id,ownerId:r.data.account.id}}));
     },
     verifyRegistration:r=>name==='ugig'&&r.sourceId===source.id&&r.state==='applied'&&r.termsVerified===false&&r.applicationAllowed===false&&r.externalId.startsWith('application:')&&r.provenance?.ownerId===r.ownerId,
     methods:{
      async qualify(ctx){const r=read(ctx,ctx.order.externalId);const found=name==='ugig'&&ctx.order.ownerId===r.data.account.id?ownApplication(ctx.order,r):false;return {confirmed:!!found,blocker:found?null:'Exact current opportunity and reviewed terms required',evidenceRef:r.file};},
      ...(name==='ugig'?{'reconcile-application':async ctx=>{const r=read(ctx,undefined,true),a=ownApplication(ctx.order,r);if(!a||ctx.order.ownerId!==r.data.account.id)throw Error('Own application identity mismatch');return {confirmed:true,status:a.status,assignmentConfirmed:false,paymentConfirmed:false,evidenceRef:r.file};}}:{}),
      ...(name==='synmerco'?{acceptance:async ctx=>{
       active(ctx);const o=ctx.order;
       if(o?.sourceId!==source.id||!bounded(o?.externalId)||!bounded(o?.ownerId)||!bounded(o?.platformProofHash))throw Error('Exact own Synmerco source and proof identity required');
       const r=read(ctx),matches=Array.isArray(r.data.escrows)?r.data.escrows.filter(x=>x?.escrowId===o.externalId):[];
       if(matches.length!==1)throw Error('Unique own escrow receipt required');
       const e=matches[0];if(!bounded(e.sellerDid)||!Array.isArray(e.proofs))throw Error('Complete own escrow proof receipt required');
       const proofs=e.proofs.filter(p=>p?.proofHash===o.platformProofHash);
       const accepted=o.ownerId===e.sellerDid&&proofs.length===1&&proofs[0].submittedBy===e.sellerDid&&proofs[0].buyerAttestation===true;
       return {confirmed:accepted,paymentConfirmed:false,evidenceRef:r.file};
      }}:{})
     },
     verify:(kind,r)=>typeof r?.confirmed==='boolean'&&typeof r.evidenceRef==='string'&&['qualify','reconcile-application','acceptance'].includes(kind)
    };
    if(!['ugig','guru','freelancer'].includes(name))return [baseSource];
    let pilotHooks={};
    if(name==='ugig'&&typeof ugigPilotAgreementReader==='function'&&typeof ugigPilotAccessReader==='function'){
     const reviewed=async order=>{active();const a=await ugigPilotAgreementReader(order);active();const proof=await ugigPilotAccessReader(order);active();if(!a||proof?.verified!==true||proof.accountId!==order.ownerId||proof.sourceId!==source.id||proof.gigId!==PILOT_GIG||proof.scopeDigest!==a.scopeDigest||proof.rootTaskId!==order.rootTaskId||!Number.isFinite(proof.observedAt)||proof.observedAt>now()||now()-proof.observedAt>=60000||!Number.isFinite(proof.expiresAt)||proof.expiresAt<=now()||!bounded(proof.evidenceRef,2000)||!['read','work','verify','submit','reconcile'].every(k=>proof.operations?.includes(k)))throw Error('Current exact uGig pilot access required');return a;};
     const pilot=createUgigPilotContract({isEnabled,request:ugigPilotRequest,credential:ugigPilotCredential,getReviewedAgreement:reviewed,...(defaultUgigEvidence?{getReviewedLifecycleMessages:ugigEvidence.lifecycleMessages}:{}),now});
     const renew=async(order,ctx)=>{const a=await reviewed(order),receipt=await pilot.readAssignment({...order,scopeDigest:a.scopeDigest},ctx);const access=await ugigPilotAccessReader(order);await reviewed(order);active(ctx);if(access?.verified!==true||access.scopeDigest!==a.scopeDigest||access.accountId!==order.ownerId||access.sourceId!==source.id||access.gigId!==PILOT_GIG||access.rootTaskId!==order.rootTaskId||access.observedAt>now()||now()-access.observedAt>=60000||access.expiresAt<=now()||!['read','work','verify','submit','reconcile'].every(k=>access.operations?.includes(k)))throw Error('Pilot access changed during renewal');for(const cap of ['work','verify','submit'])registry.setCapability(source.id,cap,{state:'live-verified',expiresAt:access.expiresAt,evidenceRefs:[access.evidenceRef,receipt.evidenceRef],scope:'exact-reviewed-ugig-pilot'});return receipt;};
     const registrations=baseSource.registrations;baseSource.registrations=async ctx=>{const rows=await registrations(ctx);for(const o of store?.snapshot().orders??[]){if(o.sourceId!==source.id||o.externalId!=='application:'+PILOT_GIG||!['assigned','prepared','worked','verified','submitted'].includes(o.state))continue;const cap=registry.snapshot().sources.find(x=>x.id===source.id).capabilities.work;if(cap.state==='live-verified'&&cap.expiresAt>now()+10000)continue;try{await renew(o,ctx);}catch{active(ctx);for(const kind of ['work','verify','submit'])registry.setCapability(source.id,kind,{state:'blocked',blocker:'Fresh pilot assignment and access renewal required',evidenceRefs:[]});}}return rows;};
     const recordEvidence=async(e,ctx)=>{active(ctx);const text=JSON.stringify(checkedJSON(e)),relative='artifacts/founder-autonomy-20261013/ugig-pilot-evidence/'+digest(e)+'.json',target=path.join(base,relative);let current=path.resolve(base);for(const part of path.relative(current,path.dirname(target)).split(path.sep)){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Unsafe delivery evidence path');fs.mkdirSync(current,{recursive:true});}active(ctx);if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||fs.readFileSync(target,'utf8')!==text)throw Error('Delivery evidence conflict');}else fs.writeFileSync(target,text,{flag:'wx',mode:0o600});return relative;};
     const completion=createUgigCompletion({isEnabled,request:ugigPilotRequest,credential:ugigPilotCredential,evidence:ugigEvidence,recordEvidence,claimPayment:createUgigDeliveryJournal({base:path.join(base,'artifacts/founder-autonomy-20261013/ugig-payment-claims'),isEnabled}),solanaRpc:ugigSolanaRpc,solanaRequest:ugigSolanaRequest,coinpayRequest:ugigCoinpayRequest,coinpayCredential:ugigCoinpayCredential,now});
     if(defaultUgigEvidence){const original=pilot.readAssignment;pilot.readAssignment=async(order,ctx)=>{const r=await original(order,ctx);if(r.binding.funding?.verified===true)await completion.verifyFunding(order,ctx);return r;};}
     const delivery=createUgigPilotDelivery({isEnabled,request:ugigPilotRequest,credential:ugigPilotCredential,readAssignment:pilot.readAssignment,recordEvidence,claimDelivery:createUgigDeliveryJournal({base:path.join(base,'artifacts/founder-autonomy-20261013/ugig-delivery-journal'),isEnabled}),canResumeDelivery:async(order,ctx)=>{active(ctx);const cap=registry.snapshot().sources.find(s=>s.id===source.id)?.capabilities.submit;return cap?.state==='live-verified'&&cap.expiresAt>now()&&cap.evidenceRefs?.length>0&&order.verification?.passed===true&&order.verification.digest===ctx.product?.digest&&await fundedResume(order,ctx);},now});
     pilotHooks={readAssignment:pilot.readAssignment,verifyProduct:async p=>verifyContentReview(p,p.review),...delivery,paymentAuthority,...(defaultUgigEvidence?{readAcceptance:completion.readAcceptance,readPayment:completion.readPayment}:{})};
     const reconcile=baseSource.methods['reconcile-application'];baseSource.methods['reconcile-application']=async ctx=>{const normal=await reconcile(ctx);if(ctx.order.externalId!=='application:'+PILOT_GIG||!['accepted','in_progress'].includes(normal.status))return normal;const a=await reviewed(ctx.order);const receipt=await renew(ctx.order,ctx);const b=receipt.binding;if(b.funding?.verified!==true&&paymentAuthority?.allows(b)!==true)throw Error('Existing payment authority required');active(ctx);return {confirmed:true,evidenceRef:receipt.evidenceRef,assignment:{sourceId:b.sourceId,externalId:b.externalId,ownerId:b.ownerId,verified:true,expiresAt:receipt.expiresAt,evidenceRef:receipt.evidenceRef,bindingDigest:digest(b)},workBinding:b,...(b.paymentAuthorization?{paymentAuthorization:b.paymentAuthorization}:{funding:b.funding})};};
    }
    if(name==='ugig'&&defaultUgigEvidence){
     const general=createUgigOrderPipeline({base,isEnabled,binaryStorageOrigin:ugigBinaryStorageOrigin,request:ugigPilotRequest,credential:ugigPilotCredential,paymentAuthority,solanaRpc:ugigSolanaRpc,solanaRequest:ugigSolanaRequest,coinpayRequest:ugigCoinpayRequest,coinpayCredential:ugigCoinpayCredential,now,canResumeDelivery:async(order,ctx)=>{active(ctx);const cap=registry.snapshot().sources.find(s=>s.id===source.id)?.capabilities.submit;return cap?.state==='live-verified'&&cap.expiresAt>now()&&cap.evidenceRefs?.length>0&&order.verification?.passed===true&&order.verification.digest===ctx.product?.digest&&await fundedResume(order,ctx);}});
     const office=createOfficePipeline({base,isEnabled,officeRuntime,officeVisualRuntime,binaryStorageOrigin:ugigBinaryStorageOrigin,request:ugigPilotRequest,credential:ugigPilotCredential,paymentAuthority,solanaRpc:ugigSolanaRpc,solanaRequest:ugigSolanaRequest,coinpayRequest:ugigCoinpayRequest,coinpayCredential:ugigCoinpayCredential,now});
     const isPilot=o=>o?.externalId==='application:'+PILOT_GIG,previousHooks=pilotHooks;
     const route=o=>isPilot(o)?previousHooks:office.has(o)?office:general;
     const renewGeneral=async(order,ctx)=>{active(ctx);const selected=route(order),access=selected.access(order);const r=await selected.readAssignment({...order,scopeDigest:access.scopeDigest},ctx);active(ctx);const current=selected.access(order);const stable=({observedAt,expiresAt,...v})=>v;if(digest(stable(current))!==digest(stable(access))||current.expiresAt<=now())throw Error('General uGig access changed');const caps=['work','verify'];if(selected===general)caps.push('submit');else{try{selected.access(order,'submit');caps.push('submit');}catch{active(ctx);}}for(const cap of caps)registry.setCapability(source.id,cap,{state:'live-verified',expiresAt:Math.min(access.expiresAt,r.expiresAt),evidenceRefs:[access.evidenceRef,r.evidenceRef],scope:'exact-reviewed-ugig-order'});return r;};
     pilotHooks={...previousHooks};for(const key of ['readAssignment','submitDelivery','readDelivery','readAcceptance','readPayment'])pilotHooks[key]=(o,...args)=>route(o)[key](o,...args);
     pilotHooks.verifyProduct=(p,ctx)=>route(p.binding??ctx?.order).verifyProduct(p,ctx);
     for(const key of ['prepareOffice','generateOffice','readOfficeResult','inspectOfficeLayout','officeLayoutStatus','readOfficeLayout','retryOfficeLayout','prepareOfficeSpecialistEvidence'])pilotHooks[key]=(...args)=>office[key](...args);pilotHooks.close=()=>office.close();
     const reconcile=baseSource.methods['reconcile-application'];baseSource.methods['reconcile-application']=async ctx=>{const normal=await reconcile(ctx);if(isPilot(ctx.order)||!['accepted','in_progress'].includes(normal.status))return normal;const r=await renewGeneral(ctx.order,ctx),b=r.binding;return {confirmed:true,evidenceRef:r.evidenceRef,assignment:{sourceId:b.sourceId,externalId:b.externalId,ownerId:b.ownerId,verified:true,expiresAt:r.expiresAt,evidenceRef:r.evidenceRef,bindingDigest:digest(b)},workBinding:b,...(b.paymentAuthorization?{paymentAuthorization:b.paymentAuthorization}:{funding:b.funding})};};
     const registrations=baseSource.registrations;baseSource.registrations=async ctx=>{const rows=await registrations(ctx);for(const o of store?.snapshot().orders??[]){if(o.sourceId!==source.id||isPilot(o)||!['assigned','prepared','worked','verified','submitted'].includes(o.state))continue;try{await renewGeneral(o,ctx);}catch{active(ctx);}}return rows;};
    }
    const local=createMarketplaceWorkSource({...pilotHooks,...marketplaceHooks[name],platform:name,sourceId:source.id,isEnabled,now,imageCapability:productImages,...(referenceAuthorityForSource?{referenceAuthority:referenceAuthorityForSource(source.id)}:{})});marketplaceReadiness.set(name,local.readiness());
    return [{...baseSource,...(local.prepareOffice?{prepareOffice:local.prepareOffice,generateOffice:local.generateOffice,readOfficeResult:local.readOfficeResult,inspectOfficeLayout:local.inspectOfficeLayout,officeLayoutStatus:local.officeLayoutStatus,readOfficeLayout:local.readOfficeLayout,retryOfficeLayout:local.retryOfficeLayout,prepareOfficeSpecialistEvidence:local.prepareOfficeSpecialistEvidence,close:pilotHooks.close}:{}),qualityProfiles:local.qualityProfiles,validateQualityContract:local.validateQualityContract,profiles:local.profiles,methods:{...baseSource.methods,...local.methods},prepareLocal:local.prepareLocal,beforeWork:local.beforeWork,validatePreparedBinding:local.validatePreparedBinding,verifyProduct:local.verifyProduct,localWorkReadiness:local.readiness,verify:(kind,r,o)=>Object.hasOwn(local.methods,kind)?local.verify(kind,r,o):baseSource.verify(kind,r,o),get blocker(){return local.blocker;}}];
   }),
   productionStatus(){return {sahilOrder:{...sahilOrderGate.status(),lifecycle:sahilLifecycle,browser:browserRuntime.status(),providerExceptionReaderConfigured:typeof sahilProviderGrantReader==='function',websiteGeneratorConfigured:typeof sahilWebsiteGenerator==='function',staticRuntimeAvailable:runtimes.sandboxes['static-website'].available},productImages:productImages.status(),connected:true,marketplaceWork:Object.fromEntries([...marketplaceReadiness].map(([k,v])=>[k,k==='ugig'?{...v,targetGigId:PILOT_GIG,pilotStage:'awaiting-independent-assignment-and-access',blockers:['Fresh customer agreement and platform access evidence required before customer work'],activation:'configured-not-live-verified',reviewedEvidenceReadersConfigured:defaultUgigEvidence||!!ugigPilotAgreementReader,additionalOrders:{officeGeneration:{configured:!!officeRuntime,visualConfigured:!!officeVisualRuntime,generatorVersion:typeof officeRuntime?.generatorVersion==='string'&&/^[a-f0-9]{64}$/.test(officeRuntime.generatorVersion)?officeRuntime.generatorVersion:null,liveReady:false,releaseRequired:true},configured:defaultUgigEvidence,contract:'exact-reviewed-ugig-order',funding:'independent-invoice-or-sol-escrow',specialistReview:'operator-reviewed-product-bound-evidence',delivery:'text-and-consented-binary-attachments',binaryStorageConfigured:!!ugigBinaryStorageOrigin,liveReady:false}}:v])),powerEnabled:isEnabled()===true,startScopes:checkedJSON(START_SCOPES),sourceNames:[...coreOrderSources],readOnlyObservationSources:[{name:'opire',transport:'existing-authenticated-github-comment-reads',fundingAuthority:false,paymentAuthority:false,writeActions:[]}],profiles:runtimes.snapshot(),learningSandboxConnected:true,learningRuntimeReady:runtimes.learningSandbox.available,sourceEvidence:Object.fromEntries(metadata),externalReadsByComposition:0};}
  };options.requireConfirmedFundedOrders=true;options.confirmedWorkAuthority=createConfirmedFundedAuthority({source:confirmedWorkSource,isEnabled,now,allowSyntheticForTests:allowSyntheticConfirmedWorkForTests,ownRecipients:confirmedOwnRecipients});return options;
 };
}
