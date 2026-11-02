import {AsyncLocalStorage} from 'node:async_hooks';
import {createCodeSandbox,boundedProcess} from './founder-code-sandbox.mjs';
import {createProfileSandbox} from './founder-profile-sandbox.mjs';
import {createStaticWebsiteSandbox} from './founder-static-website.mjs';
/** Reuses the existing reviewed local Node image lookup. Other interpreters are
 * candidates in that same immutable image, never assumptions or downloads. */
export function createProductionProfileRuntimes({isEnabled,nodeSandbox,process:run=boundedProcess,profileImages={}}){
 for(const [profileId,image] of Object.entries(profileImages))if(!['python','typescript','bash','workflow-metadata'].includes(profileId)||!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Reviewed pinned profile image required');
 const active=ctx=>{if(!isEnabled())throw Error('Production profile runtime OFF');ctx?.assertActive?.();};
 const scopes=new AsyncLocalStorage();
 const guardedProcess=async(args,options)=>{active(scopes.getStore());const r=await run(args,options);active(scopes.getStore());return r;};
 const node=nodeSandbox??createCodeSandbox({process:guardedProcess});let probing=null;
 const probeNode=async ctx=>{if(!isEnabled())return false;active(ctx);if(node.available){if(node.refresh)await scopes.run(ctx,()=>node.refresh());active(ctx);return node.available===true;}if(probing)return probing;
  probing=scopes.run(ctx,async()=>{try{await node.probe();active(ctx);return node.available===true;}catch{return false;}finally{probing=null;}});return probing;
 };
 const sandboxes={};
 sandboxes['node-js']={
  get available(){return isEnabled()&&node.available===true;},get image(){return node.image;},network:'none',hostMounts:false,
  get certification(){return this.available?{profileId:'node-js',image:node.image,verified:true,isolated:true,network:'none',hostMounts:false,evidenceRef:'current-existing-node-isolation-probe'}:null;},
  filesDigest:node.filesDigest,
  probe:probeNode,
  async run(files,ctx={}){active(ctx);if(!this.available)throw Error('Current Node protection probe required');const r=await node.run(files,ctx);active(ctx);return r;}
 };
 for(const profileId of ['python','typescript','bash','workflow-metadata']){
  let instance=null,lastImage=null,checked=false;
  sandboxes[profileId]={
   get available(){return isEnabled()&&checked&&instance?.available===true&&lastImage===(profileImages[profileId]??node.image);},get image(){return lastImage;},network:'none',hostMounts:false,
   get certification(){return this.available?instance.certification:null;},
   async probe(ctx={}){if(!isEnabled())return false;active(ctx);if(!await probeNode(ctx))return false;active(ctx);if(!/^sha256:[a-f0-9]{64}$/.test(node.image??''))return false;
    const targetImage=profileImages[profileId]??node.image;if(!instance||lastImage!==targetImage){lastImage=targetImage;instance=createProfileSandbox({runtime:{profileId,image:lastImage},process:guardedProcess});checked=false;}
    if(checked)return instance.available;return scopes.run(ctx,async()=>{try{const ready=await instance.probe();active(ctx);checked=ready===true;return checked;}catch{checked=false;return false;}});
   },
   async run(files,ctx={}){active(ctx);if(!this.available)throw Error('Per-interpreter protection probe required');return scopes.run(ctx,async()=>{const r=await instance.run(files,ctx);active(ctx);return r;});},
   get blocker(){return this.available?null:checked?'Interpreter or fixed offline dependencies unavailable in the existing image':'Per-interpreter runtime not probed';}
  };
 }
 sandboxes['static-website']=createStaticWebsiteSandbox({isEnabled,nodeSandbox:sandboxes['node-js']});
 const learningSandbox={
  get available(){return sandboxes['node-js'].available;},get image(){return node.image;},network:'none',hostMounts:false,filesDigest:node.filesDigest,
  probe:probeNode,run:(files,ctx)=>sandboxes['node-js'].run(files,ctx)
 };
 return {sandboxes,learningSandbox,
  snapshot:()=>Object.entries(sandboxes).map(([profileId,s])=>({profileId,available:s.available,image:s.image??null,blocker:s.available?null:s.blocker??'Current protection probe required'}))
 };
}
