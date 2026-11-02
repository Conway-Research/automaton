import {randomUUID} from 'node:crypto';
import {digest} from './founder-restoration-integrity.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import {boundedProcess} from './founder-code-sandbox.mjs';
const compileScript=`import json,sys
checks=[]
for f in json.load(sys.stdin):
 try:
  compile(f['content'],f['path'],'exec');checks.append({'path':f['path'],'passed':True})
 except SyntaxError as e:
  checks.append({'path':f['path'],'passed':False,'error':{'type':'SyntaxError','line':e.lineno or 1,'message':str(e.msg)[:400]}})
print(json.dumps(checks))
`;
/** Conjunctive source validity gate. compile() creates code objects but never
 * executes/imports candidate code. All files, including unused modules and the
 * protected test, are checked in a separate bounded network-none container.
 */
export function createProjectSyntaxVerifier({baseVerifier:base,process:run=boundedProcess}){
 if(typeof base?.verify!=='function'||!/^sha256:[a-f0-9]{64}$/.test(base.image??'')||!/^[a-f0-9]{64}$/.test(base.oracleDigest??''))throw Error('Pinned existing independent verifier required');
 const policy={version:1,allPythonSources:true,compileWithoutExecution:true,network:'none',hostMounts:false,baseOracleDigest:base.oracleDigest};
 const oracleDigest=digest(policy);
 return {kind:'isolated-project-syntax-release-v1',image:base.image,entrypoint:base.entrypoint,acceptanceDigest:base.acceptanceDigest,oracleDigest,strengthensOracleDigest:base.oracleDigest,policy,
  async verify(input,ctx={}){
   const files=input.files.filter(f=>f.path.endsWith('.py')),name='numaron-source-syntax-'+randomUUID(),checks=[];
   const args=['run','--rm','--name='+name,'--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=128m','--memory-swap=128m','--cpus=1','--pids-limit=32','--timeout=20','--entrypoint=/usr/local/bin/python3','-i',base.image,'-I','-c',compileScript];
   try{
    if(ctx.signal?.aborted)throw Error('Source syntax audit aborted');ctx.assertActive?.();
    const r=await run(args,{input:JSON.stringify(files),signal:ctx.signal,timeout:25000});ctx.assertActive?.();if(r.code!==0)throw Error('Isolated syntax audit failed: '+String(r.stderr??'').slice(-1200));
    const results=JSON.parse(r.stdout),paths=new Set(files.map(f=>f.path));
    if(!files.length||!Array.isArray(results)||results.length!==files.length)throw Error('Exact syntax audit coverage required');
    for(const c of results){
     if(!paths.delete(c.path)||typeof c.passed!=='boolean'||(!c.passed&&(c.error?.type!=='SyntaxError'||!Number.isSafeInteger(c.error.line)||c.error.line<1||typeof c.error.message!=='string')))throw Error('Exact per-file syntax result required');
     const feedback=c.passed?null:{file:c.path,line:c.error.line,error:'NUMARON_SOURCE_EXCEPTIONS '+JSON.stringify([{file:'/source/'+c.path,...c.error}])};
     checks.push({id:'R8-python-syntax.'+c.path,passed:c.passed,...(feedback?{feedback}:{})});
    }
   }catch(error){if(ctx.signal?.aborted)throw error;checks.push({id:'R8-python-syntax-audit',passed:false,feedback:{error:String(error)}});}
   finally{await run(['rm','--force',name],{timeout:10000}).catch(()=>{});}
   let original;
   try{original=await base.verify(input,ctx);}catch(error){if(ctx.signal?.aborted)throw error;original={passed:false,tests:0,sourceDigest:profileFilesDigest(input.files),image:base.image,network:'none',hostMounts:false,acceptanceDigest:base.acceptanceDigest,checks:[{id:'base-verifier-unresolved',passed:false,notRun:true,feedback:{error:String(error),meaning:'Base verification did not return a completed result; no original checks are claimed passed. Runtime metadata describes the separate syntax-audit composition only.'}}]};}
   if(original.sourceDigest!==profileFilesDigest(input.files))throw Error('Syntax and original verifier must bind the same source');
   const all=[...original.checks,...checks],failedCases=all.filter(c=>!c.passed).map(c=>c.id),passed=original.passed&&checks.length>0&&checks.every(c=>c.passed);
   return {...original,passed,exitCode:passed?0:1,tests:original.tests+checks.length,oracleDigest,checks:all,failedCases,log:JSON.stringify(all.filter(c=>!c.passed)).slice(-12000)};
  }
 };
}
