import test from 'node:test';import assert from 'node:assert/strict';
import {codeDigest} from './founder-code-sandbox.mjs';
import {applyCodeChanges} from './founder-order-code.mjs';
import {createOrderProfileSandbox} from './founder-order-profile-sandbox.mjs';
for(const [profileId,ext,testPath] of [['typescript','ts','tests/original.test.ts'],['python','py','tests/test_original.py'],['bash','sh','tests/original.test.sh']])test('GitHub patches preserve existing tests and add a profile regression: '+profileId,()=>{
 const files=[{path:'src/main.'+ext,content:'old implementation'},{path:testPath,content:'original test'}],p={profileId,files,sourceDigest:codeDigest(files)},regression=profileId==='python'?'tests/test_regression.py':'tests/regression.test.'+ext;
 const result=applyCodeChanges(p,[{path:'src/main.'+ext,content:'fixed implementation'},{path:regression,content:'new independent test'}]);assert.equal(result.length,3);assert.equal(result.find(x=>x.path===testPath).content,'original test');assert.throws(()=>applyCodeChanges(p,[{path:testPath,content:'weakened test'},{path:regression,content:'new test'}]));
});
test('profile router cannot spawn OFF and does not certify missing interpreters',async()=>{
 let on=false,calls=0,fail=true;const node={available:true,image:'sha256:'+'a'.repeat(64),async refresh(){},async probe(){return true;}};
 const s=createOrderProfileSandbox({isEnabled:()=>on,nodeSandbox:node,process:async()=>{calls++;return {code:fail?1:0,stdout:fail?'':'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'};}});
 const files=[{path:'tests/test_one.py',content:'synthetic'}];await assert.rejects(s.run(files));assert.equal(calls,0);on=true;await assert.rejects(s.run(files));fail=false;assert.equal((await s.run(files)).passed,true);
});
