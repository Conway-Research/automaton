import {createFounderWorker} from './founder-worker.mjs';
import {digest,orderKey,checkedJSON} from './founder-restoration-integrity.mjs';
import {checkContentPackage,validateContentBrief} from './founder-content-package.mjs';
const nonblank=value=>typeof value==='string'&&value.trim().length>0;
export function verifyContentReview(product,r){try{
 const agreement=product.binding.workContractDigest,generation=product.generationRunId;
 if(!nonblank(agreement)||!nonblank(generation)||!nonblank(r?.reviewRunId))return false;
 if((product.binding.profileId==='content-repurpose'||product.binding.contentBrief)&&!checkContentPackage({brief:product.binding.contentBrief,package:product.package}).passed)return false;
 const source=product.binding.contentBrief?.source;
 const citationsValid=Array.isArray(r.evidenceRefs)&&r.evidenceRefs.length>0&&r.evidenceRefs.every(x=>{
  if(!nonblank(x))return false;
  if(!product.binding.contentBrief)return true;
  const prefix=source.id+':';return x.startsWith(prefix)&&x.slice(prefix.length).trim().length>0&&source.text.includes(x.slice(prefix.length));
 });
 return !!(r.agreementDigest===agreement&&r.packageDigest===digest(product.package)&&
  r.reviewRunId!==generation&&r.generationRunId===generation&&r.verdict==='pass'&&
  ['factuality','meaning','tone','audience','completeness'].every(k=>r.checks?.[k]===true)&&
  Array.isArray(r.findings)&&r.findings.length===0&&citationsValid&&
  Number.isSafeInteger(r.costReceipt?.actualCostRappen)&&r.costReceipt.actualCostRappen>=0&&r.costReceipt.evidenceRef===r.reviewRunId);
 }catch{return false;}}
export function contentReviewTask(order,product,workTaskId){return {id:'content-review-'+digest([orderKey(order),order.sourceRevision,product.digest]).slice(0,32),rootTaskId:order.rootTaskId,kind:'ugig-content-review',input:{orderKey:orderKey(order),sourceRevision:order.sourceRevision,productDigest:product.digest},dependencies:workTaskId?[workTaskId]:[],resources:['source-'+digest(order.sourceId).slice(0,24)]};}
const context=(binding,extra={})=>({sources:[{id:binding.contentBrief.source.id,url:binding.sources?.[0]?.url??'https://ugig.net/gigs/'+binding.gigId,claim:binding.contentBrief.source.text,privacy:'public'}],codeContext:{brief:binding.contentBrief,briefDigest:digest(binding.contentBrief),acceptanceCriteria:binding.acceptanceCriteria,deadline:binding.deadline??null,...extra}});
function runner(options,purpose){const w=createFounderWorker({...options,purpose});return {w,async call(ctx,extra){ctx.assertActive();if(!validateContentBrief(ctx.binding?.contentBrief).passed)throw Error('Authorized public content required');const r=await w.execute({...ctx,dependencies:[context(ctx.binding,extra)]});ctx.assertActive();if(!w.verify(r))throw Error('Content worker response invalid');return r;}};}
export function createContentGenerator(options={}){const r=runner(options,'content-generate');const generate=async ctx=>{const result=await r.call(ctx,{}),p=result.analysis.contentPackage;if(!checkContentPackage({brief:ctx.binding.contentBrief,package:p}).passed)throw Error('Content package formal checks failed');return {package:checkedJSON(p),generationRunId:result.costReceipt.evidenceRef,costReceipt:result.costReceipt};};Object.defineProperties(generate,{maxCostRappen:{value:50},providerTracked:{value:true},available:{get:()=>r.w.available},accessRevision:{get:()=>r.w.accessRevision}});return generate;}
export function createContentReviewer(options={}){const r=runner(options,'content-review');return {maxCostRappen:50,providerTracked:true,retrySafe:false,autoRetrySafe:false,get available(){return r.w.available;},get accessRevision(){return r.w.accessRevision;},async execute(ctx){const p=ctx.product;if(!p||!nonblank(p.binding?.workContractDigest)||!nonblank(p.generationRunId)||!checkContentPackage({brief:p.binding.contentBrief,package:p.package}).passed)throw Error('Exact formal package required');const result=await r.call({...ctx,binding:p.binding},{contentPackage:p.package});const review=checkedJSON({...result.analysis.review,agreementDigest:p.binding.workContractDigest,packageDigest:digest(p.package),reviewRunId:result.costReceipt.evidenceRef,generationRunId:p.generationRunId,costReceipt:result.costReceipt});if(!verifyContentReview(p,review))throw Error('Independent content review failed');return {kind:'ugig-content-review',review,costReceipt:result.costReceipt};},verify:r=>r?.kind==='ugig-content-review'&&r.review?.verdict==='pass'};}
