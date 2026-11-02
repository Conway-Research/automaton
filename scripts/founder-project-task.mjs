import {createHash} from 'node:crypto';
import {openProjectAuthor} from './founder-project-author.mjs';

/** Optional Numaron adapter; trusted composition must explicitly register it.
 * It performs offline development only, never customer submission. No inference
 * provider, credentials or production power default is created here.
 */
export function createProjectTaskAdapter({directory,model,sandbox,verifier,resolveProject,...limits}){
 const author=openProjectAuthor({directory,model,sandbox,verifier,...limits,allowTestModel:false});
 const available=()=>model?.available===true&&model.origin==='local-model'&&typeof model.verifyReceipt==='function';
 return {kind:'offline-project-author',maxCostRappen:0,providerTracked:false,retrySafe:false,autoRetrySafe:false,
  get available(){return available();},get reason(){return available()?null:'verified-local-offline-model-required';},
  async execute(ctx){
   ctx.assertActive();
   if(!available())return {kind:'offline-project-author',status:'blocked',blocker:'verified-local-offline-model-required',autonomousGenerationProven:false,liveAuthorized:false};
   if(ctx.grant?.maxCostRappen!==0||!ctx.grant?.reservationId||typeof resolveProject!=='function')throw Error('Explicit zero-cost offline development composition required');
   const contract=await resolveProject(ctx);ctx.assertActive();
   if(contract?.authority!=='offline-development'||contract.taskId!==ctx.task?.id)throw Error('Exact offline development task binding required');
   const result=await author.run(contract.scope,contract.acceptance,ctx);ctx.assertActive();
   if(result.status!=='packaged'||result.autonomousGenerationProven!==true)return {kind:'offline-project-author',projectId:result.scope.id,status:result.status,blocker:result.blocker??null,autonomousGenerationProven:false,liveAuthorized:false};
   const delivery=author.delivery(result.scope.id);
   return {kind:'offline-project-author',projectId:result.scope.id,status:'packaged',scopeDigest:result.scopeDigest,filesDigest:delivery.filesDigest,archiveSha256:delivery.sha256,archiveBase64:delivery.bytes.toString('base64'),autonomousGenerationProven:true,liveAuthorized:false,costReceipt:{actualCostRappen:0,evidenceRef:'offline-project:'+ctx.grant.reservationId}};
  },
  verify(result){try{
   if(!available()||result?.kind!=='offline-project-author'||result.status!=='packaged'||result.autonomousGenerationProven!==true||result.liveAuthorized!==false)return false;
   const state=author.snapshot(result.projectId);if(!state?.autonomousGenerationProven||state.scopeDigest!==result.scopeDigest)return false;
   const delivery=author.delivery(result.projectId),bytes=Buffer.from(result.archiveBase64,'base64');
   return result.filesDigest===delivery.filesDigest&&result.archiveSha256===delivery.sha256&&createHash('sha256').update(bytes).digest('hex')===delivery.sha256;
  }catch{return false;}},
  snapshot:id=>author.snapshot(id),close(){author.close();}
 };
}
