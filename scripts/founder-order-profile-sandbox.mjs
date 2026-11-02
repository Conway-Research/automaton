import {createCodeSandbox,codeDigest,boundedProcess} from './founder-code-sandbox.mjs';
import {createProfileSandbox} from './founder-profile-sandbox.mjs';
import {selectWorkProfile,profileFilesDigest} from './founder-work-profiles.mjs';
/** Route only admitted profiles to fixed pinned offline interpreters. */
export function createOrderProfileSandbox({isEnabled,nodeSandbox=createCodeSandbox({isEnabled}),process=boundedProcess,profileImages={}}){
 for(const [profile,image] of Object.entries(profileImages))if(!['python','typescript','bash'].includes(profile)||!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Pinned code profile image required');
 const instances=new Map(),active=ctx=>{if(!isEnabled())throw Error('Order profile sandbox OFF');ctx?.assertActive?.();};
 const guarded=async(args,options)=>{active();const result=await process(args,options);active();return result;};
 return {get available(){return isEnabled()&&nodeSandbox.available;},get image(){return nodeSandbox.image;},get reason(){return nodeSandbox.reason;},get diagnostic(){return nodeSandbox.diagnostic;},filesDigest:codeDigest,
  probe:(ctx)=>isEnabled()?nodeSandbox.probe(ctx):false,refresh:()=>isEnabled()?nodeSandbox.refresh():false,
  async run(files,ctx={}){active(ctx);const selected=selectWorkProfile({files});if(!['node-js','python','typescript','bash'].includes(selected.profileId)||selected.blockers.some(x=>x!=='certified-offline-runtime-required'))throw Error('Unsupported order profile');
   if(selected.profileId==='node-js')return nodeSandbox.run(files,ctx);
   const image=profileImages[selected.profileId]??nodeSandbox.image;if(!/^sha256:[a-f0-9]{64}$/.test(image??''))throw Error('Pinned runtime required');const key=selected.profileId+':'+image;let runtime=instances.get(key);if(!runtime){runtime=createProfileSandbox({runtime:{profileId:selected.profileId,image},process:guarded});instances.set(key,runtime);}
   if(!runtime.available&&!await runtime.probe(ctx))throw Error('Profile interpreter protection probe failed');active(ctx);const result=await runtime.run(files,ctx);active(ctx);if(result.sourceDigest!==profileFilesDigest(files)||result.image!==image)throw Error('Profile result binding mismatch');return {...result,sourceDigest:codeDigest(files)};
  }
 };
}
