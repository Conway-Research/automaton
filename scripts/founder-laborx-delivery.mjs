import {createSahilOrderGate,SAHIL_ORDER} from './founder-laborx-sahil.mjs';
import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
import {digest} from './founder-restoration-integrity.mjs';
import {inspectStaticWebsite} from './founder-static-website.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';

// No guessed HTTP endpoints or browser sessions. A reviewed, provider-permitted
// transport must be injected by application composition, never a task payload.
export function createLaborxSahilSource({sourceId,isEnabled,readAgreement,paymentAuthority,transport={},readVisual,now=Date.now}={}){
 const gate=createSahilOrderGate({isEnabled,readAgreement,paymentAuthority,now});
 const requireValue=(v,m)=>{if(!v)throw Error('LaborX Sahil: '+m);};
 const exact=o=>requireValue(o?.sourceId===sourceId&&Object.entries(SAHIL_ORDER).every(([k,v])=>o[k]===v),'exact order required');
 const active=(o,ctx)=>{requireValue(isEnabled()===true,'OFF');requireValue(!ctx?.signal?.aborted,'cancelled');ctx?.assertActive?.();exact(o);};
 const fresh=r=>requireValue(r&&Number.isFinite(r.observedAt)&&r.observedAt<=now()&&now()-r.observedAt<60000&&Number.isFinite(r.expiresAt)&&r.expiresAt>now()&&r.expiresAt<=now()+60000&&typeof r.evidenceRef==='string'&&r.evidenceRef.length>0,'fresh independent evidence required');
 async function access(o,ctx,operation){
  active(o,ctx);requireValue(typeof transport.access==='function','provider permission reader missing');
  const r=await transport.access(o,ctx);active(o,ctx);fresh(r);exact(r);
  requireValue(r.authenticated===true&&r.accountId===SAHIL_ORDER.ownerId&&r.automationAllowed===true&&Array.isArray(r.operations)&&r.operations.includes(operation),'authenticated provider permission required');
 }
 const wrapped={};
 for(const name of ['readAssignment','submitDelivery','readDelivery','readAcceptance','readPayment'])if(typeof transport[name]==='function')wrapped[name]=async(o,...args)=>{
  const ctx=args.at(-1),op=name==='submitDelivery'?'submit':name==='readAssignment'?'read':'reconcile';
  const identity=name==='submitDelivery'?ctx?.order:o;
  if(name==='submitDelivery')requireValue(['sourceId','externalId','ownerId','rootTaskId','sourceRevision','scopeDigest'].every(k=>o[k]===identity?.[k]),'delivery identity mismatch');
  if(name==='submitDelivery'){
   requireValue(typeof wrapped.verifyProduct==='function','independent visual verifier required');
   await wrapped.verifyProduct(o.product,ctx);active(identity,ctx);
  }
  await access(identity,ctx,op);const r=await transport[name](o,...args);active(identity,ctx);return r;
 };
 if(wrapped.readAssignment){const read=wrapped.readAssignment;wrapped.readAssignment=async(o,ctx)=>{
  const r=await read(o,ctx);requireValue(r?.binding?.profileId==='static-website','static website profile required');
  exact(r.binding);await gate.assess(r.binding,ctx);active(o,ctx);
  requireValue(r.binding.scopeDigest===o.scopeDigest&&r.binding.paymentTermsDigest===o.paymentTermsDigest,'exact scope/payment terms required');return r;
 };}
 if(typeof readVisual==='function')wrapped.verifyProduct=async(p,ctx)=>{
  active(ctx.order,ctx);requireValue(inspectStaticWebsite(p.files).passed,'static website structural checks required');
  const r=await readVisual(p,ctx);active(ctx.order,ctx);fresh(r);exact(r);
  requireValue(r.verified===true&&r.filesDigest===profileFilesDigest(p.files)&&r.scopeDigest===ctx.order.scopeDigest&&r.sourceRevision===ctx.order.sourceRevision&&r.acceptancePassed===true&&r.network==='none'&&r.hostMounts===false&&/^sha256:[a-f0-9]{64}$/.test(r.image??''),'exact isolated visual acceptance required');
  requireValue(Array.isArray(r.viewports)&&r.viewports.some(v=>v.width===375&&v.height===812&&v.passed===true)&&r.viewports.some(v=>v.width===1440&&v.height===900&&v.passed===true),'mobile and desktop visual acceptance required');return true;
 };
 const local=createMarketplaceWorkSource({...wrapped,platform:'laborx',sourceId,isEnabled,paymentAuthority,now});
 return {...local,evidenceRef:'scripts/founder-laborx-delivery.mjs',sahilGate:gate,
  // No discovery/application grant and no automatic capability promotion.
  readiness:()=>({...local.readiness(),exactOrder:SAHIL_ORDER,providerPermissionReaderConfigured:typeof transport.access==='function',visualReaderConfigured:typeof readVisual==='function',liveReady:false}),
  contractFingerprint:digest({sourceId,order:SAHIL_ORDER,profile:'static-website',maxExposureRappen:100})};
}
