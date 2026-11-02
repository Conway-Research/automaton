import {createFounderWorker} from './founder-worker.mjs';
import {checkedJSON} from './founder-restoration-integrity.mjs';
function wrap(options,purpose,context){
 const worker=createFounderWorker({...options,purpose});
 const run=async ctx=>{ctx.assertActive();const codeContext=context(ctx),sources=codeContext.sources;if(!Array.isArray(sources)||!sources.length)throw Error('Public reviewed source evidence required');
  const result=await worker.execute({...ctx,dependencies:[{sources,codeContext}]});ctx.assertActive();if(!worker.verify(result)||!Array.isArray(result.analysis?.changes))throw Error('Bounded candidate schema failed');
  return {changes:checkedJSON(result.analysis.changes),costReceipt:result.costReceipt};
 };
 Object.defineProperties(run,{maxCostRappen:{value:50},providerTracked:{value:true},available:{get:()=>worker.available},accessRevision:{get:()=>worker.accessRevision}});return run;
}
export function createProfileWorkGenerator(options={}){return wrap(options,'profile-code',ctx=>{
 const b=ctx.binding;if(!b||b.inputs?.some(x=>x.privacy==='private')||b.privacy==='private')throw Error('Public profile worker cannot process private customer data');
 return checkedJSON({profileId:b.profileId,scopeDigest:b.scopeDigest,acceptanceCriteria:b.acceptanceCriteria,files:b.files,allowedChanges:b.allowedChanges??[],sources:b.sources??[]});
});}
export function createAdapterDraftWorker(options={}){
 const generate=wrap(options,'adapter-code',ctx=>{const i=ctx.interface;if(i?.verified!==true)throw Error('Verified interface required');return checkedJSON({interfaceDigest:i.interfaceDigest,contract:i.contract,sources:[{id:'official-interface',url:i.evidenceRef,claim:'Reviewed interface contract; no live grant'}]});});
 const run=async ctx=>{const r=await generate(ctx);return {files:r.changes,costReceipt:r.costReceipt};};for(const key of ['maxCostRappen','providerTracked','available','accessRevision'])Object.defineProperty(run,key,{get:()=>generate[key]});return run;
}
