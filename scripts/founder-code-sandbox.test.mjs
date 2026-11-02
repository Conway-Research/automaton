import test from 'node:test';import assert from 'node:assert/strict';
import {validateCodeFiles,sandboxArgs,createCodeSandbox} from './founder-code-sandbox.mjs';
test('source envelope rejects escapes, special paths, duplicate casing, secret paths and excess data',()=>{
 assert.deepEqual(validateCodeFiles([{path:'src/math.js',content:'export const a=1;'}]),[{path:'src/math.js',content:'export const a=1;'}]);
 for(const p of ['../x.js','/x.js','C:/x.js','.git/hooks/x.js','src\\x.js','a/../../x.js','a:foo.js','node_modules/x.js','.env','CON.js'])assert.throws(()=>validateCodeFiles([{path:p,content:'x'}]));
 assert.throws(()=>validateCodeFiles([{path:'a.js',content:'x'},{path:'A.js',content:'y'}]));
 assert.throws(()=>validateCodeFiles([{path:'a.js',content:'x'.repeat(100001)}]));
});
test('container arguments cannot mount host, inherit secrets, access network or pull images',()=>{
 const args=sandboxArgs('sha256:'+'a'.repeat(64),'numaron-test');
 for(const x of ['--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pull=never','--user=65534:65534','--timeout=45','--pids-limit=64'])assert.ok(args.includes(x));
 assert.ok(!args.some(x=>x==='-v'||x.startsWith('--volume')||x.includes('type=bind')));assert.throws(()=>sandboxArgs('node:latest','x'));
});
test('unavailable sandbox fails before accepting untrusted execution',async()=>{
 let runs=0;const s=createCodeSandbox({image:'sha256:'+'a'.repeat(64),process:async()=>{runs++;throw Error('offline');}});
 assert.equal(await s.probe(),false);const afterProbe=runs;await assert.rejects(s.run([{path:'test/a.test.js',content:'x'}]));assert.equal(runs,afterProbe);
});

test('test runner only sees an immutable named source volume, never host bindings',()=>{const args=sandboxArgs('sha256:'+'a'.repeat(64),'numaron-test');assert.ok(args.some(x=>x.includes('type=volume')&&x.includes('readonly')&&x.includes('destination=/source')));assert.ok(args.includes('--workdir=/source'));});

test('WSL virtualization failures remain closed with a safe actionable diagnosis',async()=>{
 const s=createCodeSandbox({process:async()=>({code:1,stdout:'WSL2: Virtualisierung nicht aktiviert. HCS_E_HYPERV_NOT_INSTALLED',stderr:'private host detail'})});
 assert.equal(await s.probe(),false);assert.equal(s.diagnostic.code,'virtualization-unavailable');assert.match(s.reason,/Virtualisierung/);assert.ok(s.diagnostic.checkedAt);assert.ok(!JSON.stringify(s.diagnostic).includes('private host detail'));
});

test('Podman bare digest is normalized to a pinned sha256 identity before isolation runs',async()=>{
 const digest='a'.repeat(64),calls=[];
 const s=createCodeSandbox({process:async args=>{calls.push(args);if(args[0]==='image')return {code:0,stdout:digest+'\n',stderr:''};return {code:0,stdout:args.some(x=>x.endsWith('-test'))?'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n':'',stderr:''};}});
 assert.equal(await s.probe(),true);assert.equal(s.image,'sha256:'+digest);assert.ok(calls.filter(a=>a[0]==='run').every(a=>a.includes('sha256:'+digest)));assert.equal(s.diagnostic.code,'verified');
 assert.equal(calls[0][2],'localhost/numaron-offline-code:20261018');
});

test('incomplete, skipped and duplicate test summaries never certify isolation',async()=>{
 const good='# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
 for(const output of ['# tests 1\n',good.replace('# pass 1','# pass 0').replace('# skipped 0','# skipped 1'),good+'# tests 1\n',good.replace('# todo 0','# todo 1')]){
  const s=createCodeSandbox({image:'sha256:'+'a'.repeat(64),process:async args=>({code:0,stdout:args.some(x=>x.endsWith('-test'))?output:'',stderr:''})});
  assert.equal(await s.probe(),false);
 }
});

