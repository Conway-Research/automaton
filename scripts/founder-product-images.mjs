import {digest,checkedJSON} from './founder-restoration-integrity.mjs';
import {binaryManifestFiles,safeBinaryName,binaryMime,MAX_BINARY_BYTES} from './founder-binary-artifacts.mjs';
const requireValue=(v,m)=>{if(!v)throw Error('Product images: '+m);};
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function requestOf(binding){
 requireValue(binding?.profileId==='product-images','exact profile required');
 const request=checkedJSON(binding.imageRequest),assets=checkedJSON(binding.imageAssets);
 requireValue(['render','reference'].includes(request?.operation)&&Array.isArray(assets)&&assets.length>0&&assets.length<=40,'bounded image request required');
 requireValue(Buffer.byteLength(JSON.stringify({request,assets}))<=100000,'request too large');
 const names=new Set();for(const a of assets){requireValue(typeof a.name==='string'&&a.name.length<=120&&/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(png|jpe?g|json)$/.test(a.name)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(a.name)&&hex(a.sha256)&&!names.has(a.name.toLowerCase()),'exact safe image assets required');names.add(a.name.toLowerCase());}
 return {request,assets};
}
function artifactsOf(value){const a=checkedJSON(value);requireValue(Array.isArray(a)&&a.length>0&&a.length<=30,'bounded output artifacts required');const names=new Set();for(const x of a){requireValue(safeBinaryName(x.name)&&/\.(png|jpe?g)$/.test(x.name)&&hex(x.sha256)&&x.type===binaryMime(x.name)&&Number.isSafeInteger(x.size)&&x.size>0&&x.size<=MAX_BINARY_BYTES&&!names.has(x.name.toLowerCase()),'valid image descriptors required');names.add(x.name.toLowerCase());}return a;}
/** Trusted offline runtime stages hash-bound assets, invokes capability_entry.py,
 * independently reopens outputs and imports them into the existing binary store.
 * No runtime or visual approval is inferred from a task or provider response. */
export function createProductImageCapability({isEnabled,runtime,readReview,now=Date.now}={}){
 const active=ctx=>{requireValue(isEnabled?.()===true,'OFF');requireValue(!ctx?.signal?.aborted,'cancelled');ctx?.assertActive?.();};
 const ready=()=>{const c=runtime?.certification;return !!(c?.verified===true&&c.isolated===true&&c.network==='none'&&c.hostMounts===false&&/^sha256:[a-f0-9]{64}$/.test(c.image??'')&&c.evidenceRef&&typeof runtime.run==='function'&&typeof runtime.verify==='function');};
 return {
 status:()=>({profileId:'product-images',configured:!!runtime,ready:ready(),visualReviewRequired:true,liveReady:false,blocker:ready()?null:'Certified offline image runtime required'}),
 validate(binding){requestOf(binding);requireValue(ready(),'certified offline image runtime required');return true;},
 async generate(binding,ctx){active(ctx);const request=requestOf(binding);requireValue(ready(),'certified offline image runtime required');const image=runtime.certification.image;const requestDigest=digest(request);const result=await runtime.run({...request,requestDigest,bindingDigest:digest(binding)},ctx);active(ctx);requireValue(ready()&&runtime.certification.image===image,'runtime changed during generation');requireValue(result?.requestDigest===requestDigest&&result.structuralPassed===true,'exact structural receipt required');const binaryArtifacts=artifactsOf(result.binaryArtifacts),files=binaryManifestFiles({binaryArtifacts});requireValue(await runtime.verify({binaryArtifacts,requestDigest,bindingDigest:digest(binding)},ctx)===true,'independent artifact readback required');active(ctx);requireValue(ready()&&runtime.certification.image===image,'runtime changed during verification');return {files,imageResult:{binaryArtifacts,requestDigest,bindingDigest:digest(binding),image}};},
 async verify(product,ctx){active(ctx);try{const request=requestOf(product.binding),r=product.imageResult;requireValue(ready()&&r?.image===runtime.certification.image&&r.requestDigest===digest(request)&&r.bindingDigest===digest(product.binding),'current exact runtime receipt required');const binaryArtifacts=artifactsOf(r.binaryArtifacts);requireValue(digest(binaryManifestFiles({binaryArtifacts}))===digest(product.files),'exact image manifest required');requireValue(await runtime.verify({...r,binaryArtifacts},ctx)===true,'independent artifact readback required');active(ctx);const review=await readReview?.(checkedJSON(product),ctx);active(ctx);requireValue(ready()&&runtime.certification.image===r.image,'runtime changed during review');return review?.verdict==='pass'&&review.productDigest===digest({files:product.files})&&review.bindingDigest===digest(product.binding)&&review.expiresAt>now()&&typeof review.evidenceRef==='string'&&!!review.evidenceRef&&typeof review.reviewer==='string'&&!!review.reviewer;}catch(e){active(ctx);return false;}}
 };
}
