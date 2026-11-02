import test from 'node:test';import assert from 'node:assert/strict';
import {createProfileSandbox,profileSandboxArgs} from './founder-profile-sandbox.mjs';
import vm from 'node:vm';
import {completeTestSummary} from './founder-test-summary.mjs';
const success='# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('generated JavaScript harnesses emit complete summaries with isolated fake dependencies',()=>{
 for(const profileId of ['bash','typescript','workflow-metadata']){
  const script=profileSandboxArgs({profileId,image:'sha256:'+'a'.repeat(64),name:'numaron-emitter',phase:'test'}).at(-1);
  let output='',exitCode=0;
  const files=[{path:profileId==='bash'?'check.test.sh':profileId==='typescript'?'check.test.ts':'workflow.yml',content:'synthetic'}];
  const modules={fs:{readFileSync:p=>p===0?JSON.stringify(files):'CapEff: 00000000',readdirSync:()=>['lo'],writeFileSync(){throw Error('read-only');}},child_process:{spawnSync:()=>({status:0,stdout:success,stderr:''})},'/opt/numaron/node_modules/yaml':{parse:()=>({jobs:{}})}};
  const context={require:name=>{if(!modules[name])throw Error('Unexpected module');return modules[name];},console:{log:x=>{output+=x+'\n';}},process:{execPath:'/fake/node',getuid:()=>65534,stdout:{write:x=>{if(profileId!=='bash')output+=x;}},stderr:{write(){}},exit:code=>{exitCode=code;throw Error('synthetic exit');}}};
  try{vm.runInNewContext(script,context,{timeout:1000});}catch(e){if(e.message!=='synthetic exit')throw e;}
  assert.deepEqual(completeTestSummary(output,exitCode),{tests:1,passed:true},profileId);
 }
});

test('all profile probes reject partial, duplicate and skipped test summaries',async()=>{
 for(const profileId of ['python','typescript','bash','workflow-metadata'])for(const stdout of ['# tests 1\n',success+'# pass 1\n',success.replace('# pass 1','# pass 0').replace('# skipped 0','# skipped 1')]){
  const s=createProfileSandbox({runtime:{profileId,image:'sha256:'+'a'.repeat(64)},process:async()=>({code:0,stdout})});
  assert.equal(await s.probe(),false,profileId);
 }
});

test('profile probe checks task cancellation between volume, seed and test phases',async()=>{
 for(const profileId of ['python','typescript','bash']){
  let active=true;const calls=[];const s=createProfileSandbox({runtime:{profileId,image:'sha256:'+'a'.repeat(64)},process:async args=>{calls.push(args);if(args[0]==='volume'&&args[1]==='create')active=false;return {code:0,stdout:success};}});
  assert.equal(await s.probe({assertActive(){if(!active)throw Error('stopped');}}),false);
  assert.equal(calls.filter(a=>a[0]==='run').length,0);
 }
});

test('TypeScript uses native pinned Node transformation and Python explicitly selects its interpreter',()=>{
 const args=profileSandboxArgs({profileId:'typescript',image:'sha256:'+'a'.repeat(64),name:'numaron-native-ts',phase:'test'});
 assert.match(args.at(-1),/--experimental-transform-types/);assert.doesNotMatch(args.at(-1),/tsx\/dist/);
 const py=profileSandboxArgs({profileId:'python',image:'sha256:'+'a'.repeat(64),name:'numaron-python',phase:'seed'});assert(py.includes('--entrypoint=/usr/local/bin/python3'));
});
test('Python and TypeScript use fixed offline commands and no host mounts or downloads',()=>{
 for(const profileId of ['python','typescript','workflow-metadata']){const args=profileSandboxArgs({profileId,image:'sha256:'+'a'.repeat(64),name:'numaron-fixture',phase:'test'});for(const v of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pull=never','--user=65534:65534'])assert.ok(args.includes(v));assert.equal(args.some(v=>v.includes('type=bind')||v.includes('npm install')||v.includes('pip install')),false);}
 assert.throws(()=>profileSandboxArgs({profileId:'shell',image:'sha256:'+'a'.repeat(64),name:'numaron-x',phase:'test'}));
});
test('profile sandbox is unavailable before a successful bounded probe; failures never certify',async()=>{
 const calls=[];let fail=true;const sandbox=createProfileSandbox({runtime:{profileId:'python',image:'sha256:'+'a'.repeat(64)},process:async(args)=>{calls.push(args);if(args[0]!=='run')return {code:0,stdout:''};return {code:fail?1:0,stdout:fail?'failed':success};}});
 assert.equal(sandbox.available,false);assert.equal(await sandbox.probe(),false);assert.equal(sandbox.available,false);fail=false;assert.equal(await sandbox.probe(),true);const result=await sandbox.run([{path:'tests/test_one.py',content:'synthetic'}]);assert.equal(result.passed,true);assert.equal(result.profileId,'python');assert.equal(result.hostMounts,false);assert.ok(calls.every(a=>!a.includes('--pull=always')));
});

test('Bash is an explicit fixed sandbox profile, never a host shell fallback',async()=>{
 const args=profileSandboxArgs({profileId:'bash',image:'sha256:'+'a'.repeat(64),name:'numaron-bash-check',phase:'test'});
 for(const flag of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pull=never','--user=65534:65534'])assert(args.includes(flag));
 assert.match(args.at(-1),/\/bin\/bash/);assert.match(args.at(-1),/--noprofile/);assert.match(args.at(-1),/--norc/);
 const s=createProfileSandbox({runtime:{profileId:'bash',image:'sha256:'+'a'.repeat(64)},process:async()=>({code:0,stdout:'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'})});
 assert.equal(s.available,false);assert.equal(await s.probe(),true);assert.equal((await s.run([{path:'main.sh',content:'echo ok'},{path:'tests/main.test.sh',content:'exit 0'}])).passed,true);
});

test('actual stderr failure diagnostics reach repair feedback without changing summary validation',async()=>{let fail=false;const sandbox=createProfileSandbox({runtime:{profileId:'python',image:'sha256:'+'a'.repeat(64)},process:async args=>(args[0]!=='run'||args.some(a=>a.endsWith('-seed')))?{code:0,stdout:'',stderr:''}:{code:fail?1:0,stdout:fail?success.replace('# pass 1','# pass 0').replace('# fail 0','# fail 1'):success,stderr:fail?'AssertionError: durable stock expected3 actual5':''}});assert.equal(await sandbox.probe(),true);fail=true;const result=await sandbox.run([{path:'tests/test_one.py',content:'import unittest\n'}]);assert.equal(result.passed,false);assert.match(result.log,/durable stock expected3 actual5/);});
