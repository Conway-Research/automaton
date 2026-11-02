import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import {validateProjectScope,validateProjectDesign,applyProjectFiles} from './founder-project-author-contract.mjs';
import {buildProjectPackage} from './founder-project-package.mjs';
import {enrichExecutionFeedback} from './founder-project-execution-diagnostics.mjs';

/** Explicitly invoked development worker. No provider, power, budget or service
 * defaults. Model/verifier implementations come only from trusted composition.
 * Test models never establish AI authorship, even with perfect code/test results.
 */
export function openProjectAuthor({directory,model,sandbox,verifier,allowTestModel=false,maxRounds=4,inferenceTimeoutMs=60000,repairAnchorPolicy=null,repairDiagnosticsPolicy=null}){
 if(repairAnchorPolicy!==null&&repairAnchorPolicy!=='unique-lines-v1')throw Error('Exact bounded repair anchor policy required');
 if(repairDiagnosticsPolicy!==null&&!['syntax-aware-v2','execution-aware-v3'].includes(repairDiagnosticsPolicy))throw Error('Exact bounded repair diagnostics policy required');
 if(typeof directory!=='string'||!path.isAbsolute(directory)||!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>8)throw Error('Explicit isolated directory and bounded rounds required');
 if(!Number.isInteger(inferenceTimeoutMs)||inferenceTimeoutMs<1||inferenceTimeoutMs>14400000)throw Error('Bounded model timeout required');
 if(inferenceTimeoutMs>120000&&(model?.origin!=='local-model'||model.binding?.verified!==true))throw Error('Extended timeout requires explicit verified local model composition');
 fs.mkdirSync(directory,{recursive:true});if(fs.lstatSync(directory).isSymbolicLink())throw Error('Project directory symlink refused');
 const file=path.join(directory,'project-author.db');if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('Project database symlink refused');
 const db=new Database(file);db.pragma('busy_timeout=5000');db.exec('CREATE TABLE IF NOT EXISTS author_projects(id TEXT PRIMARY KEY,version INTEGER,payload TEXT,digest TEXT); CREATE TABLE IF NOT EXISTS author_events(seq INTEGER PRIMARY KEY,id TEXT,kind TEXT,digest TEXT)');
 const active=ctx=>{if(ctx.signal?.aborted)throw Error('Project aborted');ctx.assertActive?.();};
 const roundLimit=state=>state.repairBudget?.limit??maxRounds;
 const get=id=>{const row=db.prepare('SELECT * FROM author_projects WHERE id=?').get(id);if(!row)return null;const state=JSON.parse(row.payload);if(digest(state)!==row.digest||state.version!==row.version)throw Error('Project state integrity failure');return state;};
 const put=(state,kind)=>db.transaction(()=>{const current=get(state.scope.id);if((current?.version??0)!==state.version)throw Error('Stale project state');const next=checkedJSON({...state,version:state.version+1},1200000),hash=digest(next);db.prepare('INSERT INTO author_projects VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,payload=excluded.payload,digest=excluded.digest').run(next.scope.id,next.version,JSON.stringify(next),hash);db.prepare('INSERT INTO author_events(id,kind,digest) VALUES(?,?,?)').run(next.scope.id,kind,hash);return next;}).immediate();
 function readiness(){
  if(!model?.available||typeof model.infer!=='function')return 'offline-model-required';
  if(model.origin==='fixture')return allowTestModel?null:'real-offline-model-required';
  const b=model.binding;
  if(model.origin!=='local-model'||b?.network!=='none'||b.hostMounts!==false||b.verified!==true||!/^sha256:[a-f0-9]{64}$/.test(b.image??'')||!/^[a-f0-9]{64}$/.test(b.modelDigest??'')||typeof model.verifyReceipt!=='function')return 'verified-local-inference-receipt-required';
  return null;
 }
 function verifierContract(){
  if(typeof verifier?.verify!=='function')return null;
  if(typeof verifier.kind!=='string'||typeof verifier.entrypoint!=='string'||!/^sha256:[a-f0-9]{64}$/.test(verifier.image??'')||!/^[a-f0-9]{64}$/.test(verifier.oracleDigest??'')||!/^[a-f0-9]{64}$/.test(verifier.acceptanceDigest??''))throw Error('Exact independent verifier contract required');
  return checkedJSON({kind:verifier.kind,image:verifier.image,entrypoint:verifier.entrypoint,oracleDigest:verifier.oracleDigest,acceptanceDigest:verifier.acceptanceDigest,relation:'conjunction-with-immutable-acceptance-suite'});
 }
 async function inference(state,phase,ctx){
  let request=state.pendingInference;
  if(!request){
   const modelBindingDigest=digest({origin:model.origin,binding:model.binding??null});
   let promptFeedback=phase==='repair'&&model.origin==='local-model'&&state.feedback?.rejectedEdits?.length&&typeof model.rejectionEvidence==='function'?{...state.feedback,rejectedEdits:await model.rejectionEvidence(state.feedback.rejectedEdits,state.ownFiles,{projectId:state.scope.id,scopeDigest:state.scopeDigest})}:state.feedback;
   if(phase==='repair'&&model.origin==='local-model'&&repairDiagnosticsPolicy==='execution-aware-v3'){
    if(state.scope.privacy!=='synthetic')throw Error('Execution observations require explicit synthetic scope');
    promptFeedback=enrichExecutionFeedback(promptFeedback,state.verification,profileFilesDigest(state.files));
   }
   const body={projectId:state.scope.id,scopeDigest:state.scopeDigest,modelBindingDigest,verifierBindingDigest:state.verifierBindingDigest,phase,requirements:state.scope.requirements,deliverables:state.scope.deliverables,profileId:state.scope.profileId,...(phase==='design'&&state.designFeedback?{rejectedDesign:state.rejectedDesign,feedback:state.designFeedback,planAttempt:state.planAttempts}:{}),...(phase!=='design'?{design:state.design,files:state.ownFiles,...(phase==='repair'?{feedback:promptFeedback}:{})}:{}),round:state.round};
   if(phase==='repair'&&model.origin==='local-model'){body.outputFormat='exact-patches-v1';body.repairProtocol='inspect-and-patch-v2';body.repairPolicy='effective-edits-v1';body.privacy=state.scope.privacy;body.repairPlanning='hypothesis-memory-v1';body.repairTools='contextual-v1';body.repairInspection='selected-source-only-v1';body.repairSelectionCatalog='qualified-declarations-v1';body.repairReferenceContext='bounded-call-sites-v1';if(state.feedback?.modelEditError?.kind==='PATCH_NOT_APPLICABLE'&&String(state.feedback.modelEditError.message??'').includes('Selected source exceeds 6000 characters'))body.repairSourceSymbolLimit=1;}
   if(phase==='repair'&&model.origin==='local-model'&&model.repairEditProtocol!==null&&model.repairEditProtocol!==undefined){if(model.repairEditProtocol!=='inspection-anchors-v1')throw Error('Exact supported model repair edit protocol required');body.repairEditProtocol=model.repairEditProtocol;}
   if(phase==='repair'&&model.origin==='local-model'&&repairAnchorPolicy!==null){if(body.repairEditProtocol!=='inspection-anchors-v1')throw Error('Unique-line policy requires configured inspected anchors');body.repairAnchorPolicy=repairAnchorPolicy;}
   if(phase==='repair'&&model.origin==='local-model'&&repairDiagnosticsPolicy!==null)body.repairDiagnosticsPolicy=repairDiagnosticsPolicy;
   const inputDigest=digest(body);request=checkedJSON({...body,inputDigest,requestId:digest([state.scopeDigest,inputDigest])},400000);
   state=put({...state,modelBindingDigest,modelOrigin:model.origin,pendingInference:request},'inference-prepared');
  }
  let response;
  const invoke=async method=>{
   const controller=new AbortController(),signal=ctx.signal?AbortSignal.any([ctx.signal,controller.signal]):controller.signal;
   let timer,onAbort;const stopped=new Promise((_,reject)=>{onAbort=()=>reject(Error('Model call aborted or timed out'));signal.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>controller.abort(),inferenceTimeoutMs);});
   try{return await Promise.race([Promise.resolve().then(()=>{active(ctx);return method(request,{...ctx,signal});}),stopped]);}finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
  };
  try{active(ctx);if(state.pendingDispatched){if(typeof model.reconcile!=='function')return put({...state,status:'awaiting-model-reconciliation'},'inference-unresolved');response=await invoke((r,c)=>model.reconcile(r,c));if(!response)return put({...state,status:'awaiting-model-reconciliation'},'inference-unresolved');}
   else{state=put({...state,pendingDispatched:true},'inference-dispatched');response=await invoke((r,c)=>model.infer(r,c));}active(ctx);
  }catch(error){if(ctx.signal?.aborted)throw error;return put({...state,status:'awaiting-model-reconciliation'},'inference-outcome-unknown');}
  if(response?.requestId!==request.requestId||response?.inputDigest!==request.inputDigest)throw Error('Exact inference request receipt required');
  if(model.origin==='local-model'&&await model.verifyReceipt(response,request)!==true)throw Error('Independent local model execution receipt required');
  active(ctx);const output=checkedJSON(response.output,300000),bindingDigest=digest({origin:model.origin,binding:model.binding??null});
  if(state.modelBindingDigest&&state.modelBindingDigest!==bindingDigest)throw Error('Project model binding changed');
  const modelReceipts=[...(state.modelReceipts??[]),{requestId:request.requestId,inputDigest:request.inputDigest,phase,outputDigest:digest(output),bindingDigest,receipt:checkedJSON(response.receipt??null,16000),verified:model.origin==='local-model'}];
  const base={...state,pendingInference:null,pendingDispatched:false,modelReceipts,modelBindingDigest:bindingDigest,modelOrigin:model.origin,proofLevel:model.origin==='fixture'?'fixture-controller-only':'local-model-authoring',autonomousGenerationProven:false};
  if(phase==='design'){
   try{return put({...base,design:validateProjectDesign(output.design,state.scope,state.acceptance),designFeedback:null,rejectedDesign:null,status:'designed'},'design-accepted');}
   catch(error){if(!/Design omits a deliverable|Complete requirement coverage|Bounded project design|Safe unique design path outside protected acceptance required/.test(String(error)))throw error;
    const planAttempts=(state.planAttempts??0)+1,designFeedback={failedCases:['design-contract'],log:String(error)+'; Required deliverables: '+state.scope.deliverables.join(', ')+'; Declared component paths: '+(output.design?.components??[]).map(c=>c.path).join(', ')+'; Uncovered requirement IDs: '+state.scope.requirements.filter(r=>!output.design?.coverage?.[r.id]?.length).map(r=>r.id).join(', ')+'; Correct the exact component assignments and return a complete design.'};
    return put({...base,planAttempts,rejectedDesign:output.design??null,designFeedback,status:planAttempts>=3?'exhausted':'replanning'},'design-rejected');}
  }
  if(output.modelOutputError){
   if(phase!=='repair'||output.modelOutputError.kind!=='PATCH_NOT_APPLICABLE'||output.files?.length)throw Error('Unexpected model edit failure');
   const context=typeof model.rejectedEditContext==='function'?await model.rejectedEditContext(response,request):null;
   if(context){const selected=request.files.find(f=>f.path===context.path);if(context.requestId!==request.requestId||!selected||context.fileDigest!==profileFilesDigest([selected])||!['NO_EFFECT','NOT_APPLICABLE'].includes(context.outcome))throw Error('Rejected-edit context binding mismatch');}
   const rejectedEdits=context?[...(state.feedback?.rejectedEdits??[]),checkedJSON(context,4000)].slice(-4):state.feedback?.rejectedEdits;
   const round=state.round+1,feedback={...state.feedback,...(rejectedEdits?{rejectedEdits}:{}),modelEditError:output.modelOutputError,failedCases:[...new Set([...(state.feedback?.failedCases??[]),'model-edit-not-applicable'])],log:(String(state.feedback?.log??'')+'\nModel edit rejected without source changes: '+String(output.modelOutputError.message)).slice(-8000)};
   return put({...base,round,feedback,status:round>=roundLimit(state)?'exhausted':'repairing'},'model-edit-rejected');
  }
  const ownFiles=applyProjectFiles(state.ownFiles,output.files,state.design,state.scope,state.acceptance);
  return put({...base,ownFiles,files:[...ownFiles,...state.acceptance],status:'testing',round:state.round+1},'implementation-created');
 }
 async function step(rawScope,acceptance,ctx={}){
  active(ctx);const contract=validateProjectScope(rawScope,acceptance);let state=get(contract.scope.id);
  if(state&&(state.scopeDigest!==contract.scopeDigest||state.acceptanceDigest!==contract.acceptanceDigest))throw Error('Project scope or immutable acceptance changed');
  if(!state)state=put({...contract,version:0,status:'created',round:0,ownFiles:[],files:[],pendingInference:null,pendingDispatched:false,proofLevel:'not-proven',autonomousGenerationProven:false},'created');
  const contractNow=verifierContract();
  if(state.verifierBindingDigest&&(!contractNow||state.verifierBindingDigest!==digest(contractNow)))throw Error('Project verifier binding changed');
  if(['packaged','exhausted'].includes(state.status))return state;
  const blocked=readiness();if(blocked)return put({...state,resumeStatus:state.resumeStatus??state.status,status:'blocked',blocker:blocked},'model-blocked');
  if(state.modelBindingDigest&&state.modelBindingDigest!==digest({origin:model.origin,binding:model.binding??null}))throw Error('Project model binding changed');
  if(!sandbox?.available||sandbox.certification?.network!=='none'||sandbox.certification?.hostMounts!==false||sandbox.certification?.verified!==true||sandbox.certification?.isolated!==true||sandbox.certification?.profileId!==state.scope.profileId||!/^sha256:[a-f0-9]{64}$/.test(sandbox.image??''))return put({...state,resumeStatus:state.resumeStatus??state.status,status:'blocked',blocker:'verified-offline-runtime-required'},'runtime-blocked');
  if(typeof verifier?.verify!=='function')return put({...state,resumeStatus:state.resumeStatus??state.status,status:'blocked',blocker:'independent-acceptance-verifier-required'},'verifier-blocked');
  if(contractNow.acceptanceDigest!==state.acceptanceDigest||contractNow.image!==sandbox.image)throw Error('Verifier and immutable acceptance contract mismatch');
  if(!state.verifierBindingDigest)state=put({...state,verifierContract:contractNow,verifierBindingDigest:digest(contractNow)},'verifier-bound');
  if(state.status==='blocked')state=put({...state,status:state.resumeStatus,resumeStatus:null,blocker:null},'unblocked');
  if(state.pendingInference)return inference(state,state.pendingInference.phase,ctx);
  if(state.status==='created')return inference(state,'design',ctx);
  if(state.status==='replanning')return inference(state,'design',ctx);
  if(state.status==='designed')return inference(state,'implement',ctx);
  if(state.status==='repairing')return inference(state,'repair',ctx);
  if(state.status==='testing'){
   active(ctx);const suite=await sandbox.run(state.files,ctx);active(ctx);const result=await verifier.verify({files:state.files,scope:state.scope,design:state.design},ctx);active(ctx);
   const sourceDigest=profileFilesDigest(state.files);
   for(const r of [suite,result])if(r?.sourceDigest!==sourceDigest||r.image!==sandbox.image||r.network!=='none'||r.hostMounts!==false||!Number.isSafeInteger(r.tests)||r.tests<1||typeof r.passed!=='boolean'||(r.passed&&r.exitCode!==0))throw Error('Exact independent acceptance evidence required');
   if(result.oracleDigest!==state.verifierContract.oracleDigest||result.acceptanceDigest!==state.acceptanceDigest)throw Error('Exact acceptance verifier evidence required');
   const passed=suite.passed&&result.passed;
   const verification={passed,filesDigest:sourceDigest,image:result.image,tests:result.tests+suite.tests,checks:result.checks??[],scopeDigest:state.scopeDigest,verifierBindingDigest:state.verifierBindingDigest,verifierContract:state.verifierContract,immutableAcceptancePassed:suite.passed,independentOraclePassed:result.passed};
   const feedback={passed,tests:verification.tests,...(state.feedback?.rejectedEdits?{rejectedEdits:state.feedback.rejectedEdits}:{}),examples:(result.checks??[]).filter(c=>!c.passed).slice(0,8).map(c=>({id:c.id,feedback:c.feedback??{}})),failedCases:[...(result.failedCases??[]),...(!suite.passed?['immutable-acceptance-suite']:[])],log:('ACTUAL TEST SUITE:\n'+String(suite.log??'').slice(-2400)+'\nINDEPENDENT HOST ORACLE:\n'+String(result.log??'').slice(-5400)).slice(-8000),filesDigest:sourceDigest};
   if(!passed)return put({...state,verification,feedback,status:state.round>=roundLimit(state)?'exhausted':'repairing'},'acceptance-failed');
   return put({...state,verification,feedback,filesDigest:sourceDigest,status:'packaged',autonomousGenerationProven:state.modelOrigin==='local-model'},'acceptance-passed');
  }
  throw Error('Unsupported project state');
 }
 return {step,async run(scope,acceptance,ctx={}){for(let i=0;i<24;i++){const state=await step(scope,acceptance,ctx);if(['packaged','exhausted','blocked','awaiting-model-reconciliation'].includes(state.status))return state;}throw Error('Project transition limit');},snapshot:get,
  refreshDiagnostics(id,{policyVersion}={}){
   if(typeof policyVersion!=='string'||!/^[a-z0-9-]{1,80}$/.test(policyVersion))throw Error('Bounded diagnostic policy version required');
   const state=get(id);if(!state||state.pendingInference||!['repairing','testing'].includes(state.status))throw Error('Diagnostic refresh requires a stable unfinished checkpoint without pending inference');
   if(state.modelBindingDigest!==digest({origin:model.origin,binding:model.binding??null})||state.verifierBindingDigest!==digest(verifierContract()))throw Error('Diagnostic refresh bindings changed');
   if(state.diagnosticsPolicyVersion===policyVersion)return state;
   const entry={policyVersion,previousPolicyVersion:state.diagnosticsPolicyVersion??null,previousVerificationDigest:state.verification?digest(state.verification):null,at:new Date().toISOString()};
   return put({...state,status:'testing',verification:null,autonomousGenerationProven:false,diagnosticsPolicyVersion:policyVersion,diagnosticsHistory:[...(state.diagnosticsHistory??[]),entry]},'diagnostics-refresh-requested');
  },
  extendRepairBudget(id,{additionalRounds,reason}={}){
   const state=get(id),limit=(state?.round??0)+additionalRounds;
   if(!Number.isInteger(additionalRounds)||additionalRounds<1||additionalRounds>8||limit>32||typeof reason!=='string'||reason.trim().length<8||reason.length>500)throw Error('Explicit bounded repair budget and reason required');
   if(!state||state.status!=='exhausted'||state.pendingInference||state.verification?.passed!==false||state.round<1||state.round<roundLimit(state))throw Error('Repair continuation requires an exhausted failed-test checkpoint');
   if(state.modelBindingDigest!==digest({origin:model.origin,binding:model.binding??null})||state.verifierBindingDigest!==digest(verifierContract()))throw Error('Repair continuation bindings changed');
   const entry={previousLimit:roundLimit(state),limit,reason,at:new Date().toISOString()};
   return put({...state,status:'repairing',repairBudget:{limit,history:[...(state.repairBudget?.history??[]),entry]}},'repair-budget-extended');
  },
  strengthenVerifier(id,next){
   const state=get(id),old=state?.verifierContract;
   if(!state||state.pendingInference||!['testing','repairing','packaged'].includes(state.status)||next?.strengthensOracleDigest!==old?.oracleDigest||next.image!==old.image||next.entrypoint!==old.entrypoint||next.acceptanceDigest!==old.acceptanceDigest||next.oracleDigest===old.oracleDigest)throw Error('Verifier strengthening requires a stable checkpoint and the same immutable contract');
   const prior=verifier;let contract;try{verifier=next;contract=verifierContract();if(!contract)throw Error('Verifier strengthening needs an exact verifier');}catch(error){verifier=prior;throw error;}
   try{return put({...state,verifierHistory:[...(state.verifierHistory??[]),old],verifierContract:contract,verifierBindingDigest:digest(contract),verification:null,autonomousGenerationProven:false,status:'testing'},'verifier-strengthened');}catch(error){verifier=prior;throw error;}
  },
  delivery(id){const state=get(id);if(!state)throw Error('Unknown verified project');const current=verifierContract();if(!current||digest(current)!==state.verifierBindingDigest)throw Error('Project verifier binding changed');return buildProjectPackage(state);},
  trace(id){return db.prepare('SELECT seq,kind,digest FROM author_events WHERE id=? ORDER BY seq').all(id);},close(){if(db.open)db.close();}};
}
