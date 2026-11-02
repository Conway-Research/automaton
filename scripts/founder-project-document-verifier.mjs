import {randomUUID} from 'node:crypto';
import {digest} from './founder-restoration-integrity.mjs';
import {profileSandboxArgs} from './founder-profile-sandbox.mjs';
import {sandboxArgs,boundedProcess} from './founder-code-sandbox.mjs';

/** Parse documentation as data only. Requests are standalone examples; an
 * immediately following JSON response supplies the exact expected output.
 */
export function documentExamples(text){
 const examples=[];let previous=null,blocks=0;
 for(const match of String(text).matchAll(/```json\s*\n([\s\S]*?)```/g)){
  if(++blocks>24)throw Error('Bounded README JSON examples required');
  let value;try{value=JSON.parse(match[1]);}catch{throw Error('README contains invalid JSON at line '+(text.slice(0,match.index).split('\n').length));}
  if(value&&Object.hasOwn(value,'commands')){
   if(examples.length>=12)throw Error('Bounded README request examples required');
   const errors=[];
   if(!Array.isArray(value.commands)||value.commands.length>100)errors.push('commands must be a list of at most 100');
   else for(const [index,c]of value.commands.entries())if(!Number.isSafeInteger(c?.expected_version)||c.expected_version<0)errors.push('command '+index+' requires nonnegative integer expected_version');
   if(value.database!==undefined&&!/^[A-Za-z0-9_-]{1,40}\.db$/.test(value.database))errors.push('database must be a safe basename ending in .db');
   previous={input:value,line:text.slice(0,match.index).split('\n').length,errors};examples.push(previous);
  }else if(previous&&value&&((Array.isArray(value.results)&&value.state)||(Object.keys(value).length===1&&typeof value.error==='string'))){previous.expected=value;previous.errors=[];previous=null;}
 }
 if(!examples.length)throw Error('README must contain an executable JSON request example');
 return examples;
}

/** Adds documentation execution to the existing independent gates. It never
 * replaces their expected results. Candidate files execute only in containers.
 */
export function createProjectDocumentVerifier({base,process:run=boundedProcess}){
 const policy={version:1,standaloneExamples:true,exactPairedResponse:true,unpairedCommandsMustSucceed:true,maxRequests:12};
 const oracleDigest=digest({baseOracleDigest:base.oracleDigest,documentationPolicy:policy});
 return {kind:'isolated-project-document-release-v1',image:base.image,entrypoint:base.entrypoint,acceptanceDigest:base.acceptanceDigest,oracleDigest,strengthensOracleDigest:base.oracleDigest,policy,
  async verify(input,ctx={}){
   const original=await base.verify(input,ctx),checks=[];let examples;
   try{examples=documentExamples(input.files.find(f=>f.path==='README.md')?.content??'');}catch(error){checks.push({id:'R8-document-examples',passed:false,feedback:{file:'README.md',error:String(error)}});examples=[];}
   const name='numaron-'+randomUUID();
   const dispatch=async(args,options)=>{if(ctx.signal?.aborted)throw Error('Documentation audit aborted');ctx.assertActive?.();const r=await run(args,{...options,signal:ctx.signal});ctx.assertActive?.();return r;};
   try{
    if(examples.some(e=>!e.errors.length)){
     if((await dispatch(['volume','create',name],{timeout:10000})).code!==0)throw Error('Documentation source volume unavailable');
     const seed=await dispatch(profileSandboxArgs({profileId:'python',image:base.image,name,phase:'seed'}),{input:JSON.stringify(input.files),timeout:15000});
     if(seed.code!==0)throw Error('Documentation source staging failed');
    }
    for(const [index,example]of examples.entries()){
     const id='R8-document-example-'+(index+1);
     if(example.errors.length){checks.push({id,passed:false,feedback:{file:'README.md',line:example.line,errors:example.errors}});continue;}
     const args=sandboxArgs(base.image,name,'test').slice(0,-3);args.splice(args.indexOf('-i'),0,'--entrypoint=/usr/local/bin/python3');
     const script="import sys,runpy\nsys.path.insert(0,'/source');sys.argv=['/source/'+sys.argv[1]];runpy.run_path(sys.argv[0],run_name='__main__')\n";
     const r=await dispatch([...args,'-I','-c',script,base.entrypoint],{input:JSON.stringify(example.input),timeout:35000});
     let actual=null;try{actual=JSON.parse(r.stdout);}catch{}
     const passed=r.code===0&&(example.expected?digest(actual)===digest(example.expected):Array.isArray(actual?.results)&&actual.results.length===example.input.commands.length&&actual.results.every(item=>item?.ok===true)&&actual.state&&typeof actual.state.version==='number');
     checks.push({id,passed,inputDigest:digest(example.input),actual,...(!passed?{feedback:{file:'README.md',line:example.line,error:'Documented standalone request must run successfully; a documented response must match exactly',expected:example.expected??'one successful receipt per command',stderr:String(r.stderr??'').slice(-2000)}}:{})});
    }
   }finally{await run(['rm','--force',name+'-seed',name+'-test'],{timeout:10000}).catch(()=>{});await run(['volume','rm','--force',name],{timeout:10000}).catch(()=>{});}
   const all=[...original.checks,...checks],failedCases=all.filter(c=>!c.passed).map(c=>c.id);
   return {...original,passed:original.passed&&checks.length>0&&checks.every(c=>c.passed),exitCode:failedCases.length?1:0,tests:original.tests+checks.length,oracleDigest,checks:all,failedCases,log:JSON.stringify(all.filter(c=>!c.passed)).slice(-12000)};
  }
 };
}
