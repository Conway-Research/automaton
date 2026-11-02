import {validateOfficeTechnicalReport} from './founder-ugig-office-report.mjs';
import {randomUUID} from 'node:crypto';
import {digest,checkedJSON,bounded} from './founder-restoration-integrity.mjs';
import {binaryManifestFiles,sha256} from './founder-binary-artifacts.mjs';
import {mixedPackageDigest,validMixedTextFiles} from './founder-ugig-mixed-package.mjs';
import {officeGenerationKey,officeMust as must} from './founder-ugig-office-contract.mjs';
export function createOfficeWork({evidence,journal,generator,artifactStore,authorizeWork,isEnabled,runtimeVersion}){
 const active=ctx=>{must(isEnabled()===true&&!ctx?.signal?.aborted,'work OFF or cancelled');ctx?.assertActive?.();};
 async function authority(order,ctx,expected){active(ctx);const a=evidence.work(order).agreement;must(!expected||digest(a)===digest(expected),'work contract changed');must(await authorizeWork(order,a,ctx)===true,'current work authority');active(ctx);must(digest(evidence.work(order).agreement)===digest(a),'work agreement changed during authorization');return a;}
 function validate(a,r){must(r&&r.generationKey===officeGenerationKey(a)&&r.packageDigest===mixedPackageDigest(r)&&validMixedTextFiles(r),'stored package binding');for(const b of r.binaryArtifacts)artifactStore.read(b);must(digest([...a.requiredFiles].sort())===digest([...r.binaryArtifacts.map(f=>f.name),...r.files.map(f=>f.path)].sort()),'required Office files');must(r.productDigest===digest({files:binaryManifestFiles({...r,deliveryProtocol:'mixed-files-v1'})}),'stored product binding');const report=r.files.find(f=>f.path==='technical-report.json');must(report&&sha256(Buffer.from(report.content))===r.technicalReportRef,'technical report integrity');validateOfficeTechnicalReport(r,a.workKind);return r;}
 async function prepare(order,ctx){const a=await authority(order,ctx);must(await runtimeVersion(ctx)===a.generatorVersion,'configured generator version');active(ctx);evidence.inputs(a);await authority(order,ctx,a);journal.prepare(officeGenerationKey(a),digest(a));return a;}
 async function readResult(order,ctx){const a=await authority(order,ctx),row=journal.read(officeGenerationKey(a));must(row?.status==='generated'&&row.contractDigest===digest(a),'completed Office generation required');active(ctx);return validate(a,checkedJSON(row.result));}
 async function generate(order,ctx,retry){
  must(bounded(ctx?.grant?.reservationId),'existing work budget reservation');const a=await prepare(order,ctx),key=officeGenerationKey(a),prior=journal.read(key);
  if(prior.status==='generated')return readResult(order,ctx);
  const attemptId=randomUUID();if(retry){must(prior.status==='interrupted','only interrupted work can retry');journal.retry(key,{previousAttemptId:prior.attemptId,newAttemptId:attemptId,reviewedAuthorization:retry});}else must(journal.claim(key,attemptId).claimed===true,'generation already claimed or interrupted');
  try{const input=evidence.inputs(a);await authority(order,ctx,a);const candidate=checkedJSON(await generator.generate(input,ctx));await authority(order,ctx,a);
   must(await runtimeVersion(ctx)===a.generatorVersion,'generator changed during work');active(ctx);
   const result={generationKey:key,attemptId,binaryArtifacts:candidate.binaryArtifacts,files:candidate.files,packageDigest:candidate.packageDigest,productDigest:digest({files:binaryManifestFiles({...candidate,deliveryProtocol:'mixed-files-v1'})}),technicalReportRef:sha256(Buffer.from(candidate.files.find(f=>f.path==='technical-report.json')?.content??''))};
   validate(a,result);await authority(order,ctx,a);active(ctx);journal.commit(key,attemptId,result);return checkedJSON(result);
  }catch(e){if(isEnabled()===true){const r=journal.read(key);if(r?.status==='generating')journal.interrupt(key,attemptId,'generation failed; reviewed retry required');}throw e;}
 }
 return {prepare,readResult,generate:(order,ctx)=>generate(order,ctx),retry:(order,reviewedAuthorization,ctx)=>{must(reviewedAuthorization,'independent retry authority required');return generate(order,ctx,reviewedAuthorization);}};
}

