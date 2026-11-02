import {codeDigest,validateCodeFiles} from './founder-code-sandbox.mjs';
import {selectWorkProfile} from './founder-work-profiles.mjs';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const pinned=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const valid=r=>r?.passed===true&&r.exitCode===0&&Number.isSafeInteger(r.tests)&&r.tests>0&&r.tests<=1000000&&hash(r.sourceDigest)&&pinned(r.image)&&r.network==='none'&&r.hostMounts===false&&r.readOnlySource===true;
/** Private, bounded JavaScript test execution. No generation, host command,
 * provider call, delivery or business acceptance is part of this adapter. */
export function createFounderCodeExecution({sandbox,isEnabled}){
 if(typeof isEnabled!=='function'||typeof sandbox?.probe!=='function'||typeof sandbox?.run!=='function')throw Error('Guarded sandbox required');
 return {
  maxCostRappen:0,retrySafe:true,evidenceImplemented:true,
  get available(){return isEnabled();},
  get reason(){return isEnabled()?null:'Numaron ist OFF; private Codeprüfung wartet auf persönliche Einschaltung.';},
  async execute({task,assertActive,signal}){
   const active=()=>{if(!isEnabled()||signal?.aborted||typeof assertActive!=='function')throw Error('Code execution OFF or stopped');assertActive();};
   active();
   if(task?.kind!=='code-execution'||!task.input||Object.keys(task.input).sort().join(',')!=='files,sourceDigest')throw Error('Explicit source package required');
   const files=validateCodeFiles(task.input.files),sourceDigest=codeDigest(files);
   if(task.input.sourceDigest!==sourceDigest||selectWorkProfile({files}).profileId!=='node-js'||!files.some(f=>/\.test\.(?:js|mjs|cjs)$/.test(f.path)))throw Error('Bound JavaScript tests required');
   if(!await sandbox.probe({signal,assertActive:active}))throw Error('Offline isolation probe failed');
   active();const image=sandbox.image;if(!pinned(image))throw Error('Pinned sandbox required');
   const result=await sandbox.run(files,{signal,assertActive:active});active();
   if(!valid(result)||result.sourceDigest!==sourceDigest||result.image!==image)throw Error('Code test result failed or binding mismatch');
   return {kind:'code-execution',executionScope:'private-offline-tests',deliveryAuthorized:false,passed:true,exitCode:0,tests:result.tests,sourceDigest,image,network:'none',hostMounts:false,readOnlySource:true,limitations:['Declared tests do not prove business correctness or independent acceptance.']};
  },
  verify:r=>valid(r)&&r.kind==='code-execution'&&r.executionScope==='private-offline-tests'&&r.deliveryAuthorized===false,
 };
}
