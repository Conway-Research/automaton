import test from 'node:test';import assert from 'node:assert/strict';
import {applyProjectPatches} from './founder-project-patches.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
const files=[{path:'cli.py',content:'def answer():\n return 0\n'},{path:'README.md',content:'Usage\n'}],design={components:files.map(f=>({path:f.path}))};
const edits=patches=>({baseFilesDigest:profileFilesDigest(files),patches});
test('exact model changes preserve untouched files and support a deliberate compact rewrite',()=>{
 assert.deepEqual(applyProjectPatches(files,edits([{path:'cli.py',oldText:'return 0',newText:'return 7'}]),design),[{path:'cli.py',content:'def answer():\n return 7\n'}]);
 assert.deepEqual(applyProjectPatches(files,edits([{path:'cli.py',oldText:'',newText:'from engine import main\nmain()\n'}]),design),[{path:'cli.py',content:'from engine import main\nmain()\n'}]);
});
test('stale, missing and ambiguous edits leave the original snapshot intact',()=>{
 const original=structuredClone(files);
 for(const body of [{...edits([]),baseFilesDigest:'0'.repeat(64)},edits([{path:'cli.py',oldText:'missing',newText:'x'}]),edits([{path:'cli.py',oldText:'return 0',newText:'return 7'},{path:'cli.py',oldText:'missing',newText:'x'}])])assert.throws(()=>applyProjectPatches(files,body,design),e=>e.code==='PATCH_NOT_APPLICABLE');
 const repeated=[{path:'cli.py',content:'x\nx\n'}];assert.throws(()=>applyProjectPatches(repeated,{baseFilesDigest:profileFilesDigest(repeated),patches:[{path:'cli.py',oldText:'x',newText:'y'}]},design),/multiple/);
 assert.deepEqual(files,original);
});
test('model edits cannot add files, escape design or replace protected evaluator files',()=>{
 for(const path of ['../escape.py','tests/test_contract.py','other.py'])assert.throws(()=>applyProjectPatches(files,edits([{path,oldText:'',newText:'pass'}]),design),e=>e.code==='PATCH_POLICY');
});
