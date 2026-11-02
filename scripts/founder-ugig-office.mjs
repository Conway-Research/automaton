import {validateOfficeTechnicalReport} from './founder-ugig-office-report.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createBinaryArtifactStore,validateBinary,sha256} from './founder-binary-artifacts.mjs';
import {validMixedTextFiles,mixedPackageDigest} from './founder-ugig-mixed-package.mjs';
import {digest} from './founder-restoration-integrity.mjs';
const execute=promisify(execFile);
const must=(ok,message)=>{if(!ok)throw Error('Office generation: '+message);};
const engine=fileURLToPath(new URL('./ugig_office.py',import.meta.url));
const kinds=new Set(['document-cleanup','support-templates','research-report','xlsx-automation']);
/** Explicit local preparation adapter. It never creates a contract, consent,
 * funding proof, independent review, or dispatch. authorize must validate the
 * caller's current work authority for these exact input/reference digests.
 * The formatter is trusted code, not a sandbox for customer programs.
 */
export function createUgigOfficeGenerator({base,python,isEnabled,authorize}){
 must(path.isAbsolute(python)&&fs.statSync(python).isFile(),'explicit Python runtime required');
 const store=createBinaryArtifactStore({base,isEnabled});
 function active(ctx){must(isEnabled()===true&&!ctx?.signal?.aborted,'OFF or cancelled');ctx?.assertActive?.();}
 return {async generate(input,ctx={}){
  active(ctx);
  const encoded=JSON.stringify(input);must(Buffer.byteLength(encoded)<=58*1024*1024,'input size');
  // Snapshot before any async call; caller mutation cannot change the job.
  const {spec,reference}=JSON.parse(encoded);
  must(kinds.has(spec?.workKind)&&spec.privacy==='public'&&spec.customerApproved===true,'public customer permission required');
  must(reference&&typeof reference==='object','reference required');
  const binding={workKind:spec.workKind,inputDigest:digest(spec),referenceDigest:digest(reference)};
  const authority=async()=>{active(ctx);must(typeof authorize==='function'&&await authorize({...binding},ctx)===true,'current exact work authority required');active(ctx);};
  await authority();
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-office-'));
  try{
   const out=path.join(temp,'out');fs.mkdirSync(out);
   const specPath=path.join(temp,'spec.json'),referencePath=path.join(temp,'reference.json');
   fs.writeFileSync(specPath,JSON.stringify(spec),{flag:'wx',mode:0o600});fs.writeFileSync(referencePath,JSON.stringify(reference),{flag:'wx',mode:0o600});
   // Explicit executable and fixed argument vector; no shell, inherited API keys,
   // imports from cwd, customer code execution, network tool or provider adapter.
   const env={SYSTEMROOT:process.env.SYSTEMROOT??'C:\\Windows',TEMP:temp,TMP:temp,PYTHONUTF8:'1'};
   await execute(python,['-I',engine,specPath,referencePath,out],{cwd:temp,env,windowsHide:true,timeout:60000,maxBuffer:64000,signal:ctx.signal});
   await authority();
   const names=fs.readdirSync(out);must(names.length<=20,'file count');
   const binary=[],files=[];let total=0;
   for(const name of names){
    must(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(docx|xlsx|md|json|csv|py|bat)$/.test(name),'output filename');
    const p=path.join(out,name),stat=fs.lstatSync(p);must(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1&&stat.size<=10*1024*1024,'output file');total+=stat.size;must(total<=40*1024*1024,'package size');
    const b=fs.readFileSync(p);
    if(/\.(docx|xlsx)$/.test(name))binary.push(validateBinary(name,b));
    else files.push({path:name,content:new TextDecoder('utf-8',{fatal:true}).decode(b)});
   }
   must(binary.length===1&&validMixedTextFiles({binaryArtifacts:binary,files}),'mixed package limits');
   const report=validateOfficeTechnicalReport({files,binaryArtifacts:binary},spec.workKind);
   must(report?.schema==='numaron-office-technical-v1'&&report.technicalPassed===true&&report.independentlyVerified===false&&report.workKind===spec.workKind,'technical report');
   const represented=new Set(report.files?.map(f=>f.name));
   must(represented.size===names.length-1&&names.filter(n=>n!=='technical-report.json').every(n=>represented.has(n)),'report completeness');
   for(const f of report.files){const b=fs.readFileSync(path.join(out,f.name));must(f.sha256===sha256(b)&&f.size===b.length,'report byte binding');}
   await authority();
   const binaryArtifacts=store.importExport({directory:out,names:binary.map(f=>f.name)});
   active(ctx);
   const candidate={binaryArtifacts,files};
   return {...candidate,packageDigest:mixedPackageDigest(candidate),technicalReport:report,workBinding:binding,deliveryReady:false,
    pending:['exact-package-customer-consent','reviewed-contract-and-funding','independent-specialist-review',...report.pendingReviews]};
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
 }};
}
