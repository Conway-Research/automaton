import {randomUUID} from 'node:crypto';
import {checkedJSON,digest} from './founder-restoration-integrity.mjs';
import {selectWorkProfile,profileFilesDigest} from './founder-work-profiles.mjs';
import {profileSandboxArgs} from './founder-profile-sandbox.mjs';
import {sandboxArgs,boundedProcess} from './founder-code-sandbox.mjs';

const execute=`import sys,runpy\nentry=sys.argv[1]\nsys.path.insert(0,'/source')\nsys.argv=['/source/'+entry]\nrunpy.run_path('/source/'+entry,run_name='__main__')\n`;
const inspectSQLite=`import sys,sqlite3,json\nc=sqlite3.connect('file:/state/'+sys.argv[1]+'?mode=ro',uri=True)\nintegrity=c.execute('PRAGMA integrity_check').fetchone()[0]\nnames=[r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]\nrows=sum(c.execute('SELECT COUNT(*) FROM "'+name.replace('"','""')+'"').fetchone()[0] for name in names)\nprint(json.dumps({'integrity':integrity,'tables':len(names),'rows':rows}))\nc.close()\n`;

/** Trusted host-side JSON oracle. Generated code runs in a separate PID/mount
 * namespace and returns bytes only. It cannot replace the assertion framework,
 * alter expected cases, weaken Python unittest, or forge the verifier summary.
 * No HTTP, host mounts, package installation or application script on the host.
 */
export function createProjectBlackBoxVerifier({image,entrypoint,cases,acceptance,process:run=boundedProcess}){
 if(!/^sha256:[a-f0-9]{64}$/.test(image??'')||typeof entrypoint!=='string'||!/^[-\w]+(?:\/[-\w]+)*\.py$/.test(entrypoint)||!Array.isArray(cases)||!cases.length||cases.length>24)throw Error('Pinned Python runtime, exact entrypoint and bounded oracle cases required');
 const oracle=checkedJSON(cases,160000),ids=new Set();
 if(!Array.isArray(acceptance)||!acceptance.length)throw Error('Explicit immutable acceptance files required');
 const trustedAcceptance=checkedJSON(acceptance),acceptanceDigest=digest(trustedAcceptance);
 for(const c of oracle){
  if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.id)||ids.has(c.id))throw Error('Unique independent oracle cases required');ids.add(c.id);
  if(c.steps){if(!Array.isArray(c.steps)||!c.steps.length||c.steps.length>8||Object.hasOwn(c,'input')||Object.hasOwn(c,'expected'))throw Error('Bounded sequence oracle required');const stepIds=new Set();for(const step of c.steps){if(typeof step.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(step.id)||stepIds.has(step.id)||!Object.hasOwn(step,'input')||!Object.hasOwn(step,'expected'))throw Error('Unique oracle sequence step required');stepIds.add(step.id);checkedJSON(step.input,16000);checkedJSON(step.expected,16000);}if(c.sqliteFile!==undefined&&!/^[A-Za-z0-9_-]{1,40}\.db$/.test(c.sqliteFile))throw Error('Safe SQLite oracle basename required');}
  else{if(!Object.hasOwn(c,'input')||!Object.hasOwn(c,'expected'))throw Error('Independent input and expected output required');checkedJSON(c.input,16000);checkedJSON(c.expected,16000);}
 }
 return {kind:'isolated-json-blackbox',image,entrypoint,oracleDigest:digest(oracle),acceptanceDigest,
  async verify({files,scope},ctx={}){
   const active=()=>{if(ctx.signal?.aborted)throw Error('Blackbox aborted');ctx.assertActive?.();};
   const clean=checkedJSON(files,500000);const selected=selectWorkProfile({order:{profileId:scope.profileId},files:clean});
   if(scope.profileId!=='python'||selected.blockers.some(b=>b!=='certified-offline-runtime-required')||!clean.some(f=>f.path===entrypoint))throw Error('Exact Python project entrypoint required');
   if(trustedAcceptance.some(f=>clean.find(c=>c.path===f.path)?.content!==f.content))throw Error('Immutable acceptance binding mismatch');
   const name='numaron-'+randomUUID(),checks=[],stateVolumes=[];
   const dispatch=async(args,options)=>{active();const r=await run(args,{...options,signal:ctx.signal});active();return r;};
   try{
    if((await dispatch(['volume','create',name],{timeout:10000})).code!==0)throw Error('Blackbox source volume unavailable');
    const seed=await dispatch(profileSandboxArgs({profileId:'python',image,name,phase:'seed'}),{input:JSON.stringify(clean),timeout:15000});
    if(seed.code!==0)throw Error('Blackbox source staging failed');
    const argsFor=(volume,readonly=false)=>{const args=sandboxArgs(image,name,'test').slice(0,-3);args.splice(args.indexOf('-i'),0,'--entrypoint=/usr/local/bin/python3',...(volume?['--mount=type=volume,source='+volume+',destination=/state'+(readonly?',readonly':''),'--env=TMPDIR=/state','--env=TMP=/state','--env=TEMP=/state']:[]));return args;};
    for(const [index,c] of oracle.entries()){
     let volume=null;
     if(c.steps){volume=name+'-state-'+index;stateVolumes.push(volume);if((await dispatch(['volume','create','--opt=type=tmpfs','--opt=device=tmpfs','--opt=o=size=16m,uid=65534,gid=65534,mode=1777',volume],{timeout:10000})).code!==0)throw Error('Oracle state volume unavailable');
      const init=await dispatch(['run','--detach','--rm','--name='+volume+'-init','--pull=never','--network=none','--read-only','--user=65534:65534','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=64m','--pids-limit=32','--timeout=900','--mount=type=volume,source='+volume+',destination=/state','--entrypoint=/usr/local/bin/python3',image,'-I','-c',"import time;time.sleep(890)"],{timeout:20000});if(init.code!==0)throw Error('Oracle state permissions unavailable: '+init.stderr);}
     for(const item of c.steps??[c]){
      const result=await dispatch([...argsFor(volume),'-I','-c',execute,entrypoint],{input:JSON.stringify(item.input),timeout:35000});
      let actual=null,validJSON=false;try{actual=JSON.parse(result.stdout);validJSON=true;}catch{}
      const passed=result.code===0&&validJSON&&digest(actual)===digest(item.expected),id=c.steps?c.id+'.'+item.id:c.id;
      const stdout=String(result.stdout??''),execution={schema:'captured-process-output-v1',stdoutStatus:validJSON?'valid-json':stdout.length===0?'empty':'invalid-json',stdoutLength:stdout.length,stdoutPreview:stdout.slice(0,600),stdoutTruncated:stdout.length>600};
      checks.push({id,passed,exitCode:result.code,execution,inputDigest:digest(item.input),expectedDigest:digest(item.expected),actualDigest:validJSON?digest(actual):null,...(!passed?{feedback:{input:item.input,expected:item.expected,actual:validJSON?actual:null,...(!validJSON?{rawOutput:stdout.slice(-2000)}:{}),error:String(result.stderr??'').slice(-16000)}}:{})});
     }
     if(c.sqliteFile){
      const result=await dispatch([...argsFor(volume,true),'-I','-c',inspectSQLite,c.sqliteFile],{input:'',timeout:35000});let actual=null;try{actual=JSON.parse(result.stdout);}catch{}
      const passed=result.code===0&&actual?.integrity==='ok'&&Number.isSafeInteger(actual.tables)&&actual.tables>0&&Number.isSafeInteger(actual.rows)&&actual.rows>0;
      checks.push({id:c.id+'.sqlite-integrity',passed,exitCode:result.code,actual,...(!passed?{feedback:{expected:'nonempty valid SQLite database, inspected without candidate imports',actual,error:String(result.stderr??'').slice(-16000)}}:{})});
     }
    }
    const failed=checks.filter(c=>!c.passed);return {passed:!failed.length,tests:checks.length,exitCode:failed.length?1:0,sourceDigest:profileFilesDigest(clean),image,network:'none',hostMounts:false,oracleDigest:digest(oracle),acceptanceDigest,checks,failedCases:failed.map(c=>c.id),log:JSON.stringify(failed).slice(-8000)};
   }finally{
    for(const volume of stateVolumes){await run(['rm','--force',volume+'-init'],{timeout:10000}).catch(()=>{});await run(['volume','rm','--force',volume],{timeout:10000}).catch(()=>{});}
    await run(['rm','--force',name+'-seed',name+'-test'],{timeout:10000}).catch(()=>{});await run(['volume','rm','--force',name],{timeout:10000}).catch(()=>{});
   }
  }
 };
}
