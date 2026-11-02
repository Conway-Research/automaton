import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {projectGenerationPayload,createLocalProjectModel} from './founder-local-project-model.mjs';
const domain={path:'domain.py',content:'from storage import Storage\nclass Domain:\n def __init__(self, storage: Storage):\n  self._storage = storage\n def state(self):\n  return self._storage.current_version()\n'};
const design={components:[{path:'domain.py',purpose:'Logic'},{path:'storage.py',purpose:'Persistence'},{path:'cli.py',purpose:'CLI'},{path:'README.md',purpose:'Documentation'},{path:'tests/test_generated.py',purpose:'Tests'}],coverage:{R1:['domain.py','storage.py']}};
const request={projectId:'context-proof',phase:'implement',requirements:[{id:'R1',text:'Implement a modular program'}],deliverables:['cli.py','README.md'],design};
const parse=p=>JSON.parse(p.messages[1].content.replace(/^TASK:[^\n]*\n/,''));
test('explicit v4 supplies exact previously generated source including injected-dependency calls without changing v3',()=>{
 const options={targetPath:'storage.py',previousFiles:[domain]};const before=projectGenerationPayload(request,{...options,contextMode:'interface-manifest-v3'});
 const payload=projectGenerationPayload(request,{...options,contextMode:'bounded-source-v4'}),body=parse(payload);
 assert.deepEqual(body.files,[domain]);assert.equal(body.sourceContextVersion,'bounded-source-v4');assert(body.files[0].content.includes('self._storage.current_version()'));assert.equal(body.sourceContext.usedCharacters,domain.content.length);assert.equal(body.sourceContext.maxCharacters,32000);
 assert.deepEqual(parse(before).files,[]);assert.deepEqual(projectGenerationPayload(request,{...options,contextMode:'interface-manifest-v3'}),before);
});
test('v4 never truncates source files to fit its total bound and retains omitted interface identity',()=>{
 const huge={path:'storage.py',content:'#'+ 'a'.repeat(32001)},payload=projectGenerationPayload(request,{targetPath:'cli.py',previousFiles:[domain,huge],contextMode:'bounded-source-v4'}),body=parse(payload);
 assert.deepEqual(body.files,[domain]);assert.equal(body.sourceContext.usedCharacters,domain.content.length);assert.deepEqual(body.sourceContext.omittedFiles,['storage.py']);assert(body.interfaces.some(x=>x.path==='storage.py'));assert(!JSON.stringify(body.files).includes(huge.content));
});
test('v4 documentation receives application sources, while protected, undeclared and generated test sources stay out',()=>{
 const other=[{path:'tests/test_generated.py',content:'PRIVATE OWN TEST BODY'},{path:'tests/test_contract.py',content:'PROTECTED ORACLE'},{path:'unrelated.py',content:'UNDECLARED PRIVATE BODY'}];
 const body=parse(projectGenerationPayload(request,{targetPath:'README.md',previousFiles:[domain,...other],contextMode:'bounded-source-v4'}));
 assert.deepEqual(body.files,[domain]);assert(!JSON.stringify(body).includes('PROTECTED ORACLE'));assert(!JSON.stringify(body).includes('UNDECLARED PRIVATE BODY'));assert(!JSON.stringify(body.files).includes('PRIVATE OWN TEST BODY'));
});
test('complete-source context is an explicit bounded Next-only opt-in and unknown configuration fails closed',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-context-option-')),base={directory,image:'sha256:'+'a'.repeat(64),modelDigest:'b'.repeat(64),runnerDigest:'c'.repeat(64)};
 try{assert.throws(()=>createLocalProjectModel({...base,implementationContextMode:'unknown'}),/context/i);assert.throws(()=>createLocalProjectModel({...base,implementationContextMode:'bounded-source-v4'}),/context/i);const model=createLocalProjectModel({...base,resourceProfile:'qwen3-next80b-cpu-v1',modelId:'Qwen3-Coder-Next-Q3_K_M',modelVolume:'numaron-next80b-'+ 'b'.repeat(16),implementationContextMode:'bounded-source-v4'});assert.equal(model.available,false);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('explicit v4 has a distinct model binding so it cannot silently reuse a default-v3 cached request',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-context-binding-')),config={directory,image:'sha256:'+'a'.repeat(64),modelDigest:'b'.repeat(64),runnerDigest:'c'.repeat(64),resourceProfile:'qwen3-next80b-cpu-v1',modelId:'Qwen3-Coder-Next-Q3_K_M',modelVolume:'numaron-next80b-'+ 'b'.repeat(16)};
 try{const legacy=createLocalProjectModel(config),next=createLocalProjectModel({...config,implementationContextMode:'bounded-source-v4'});assert.notDeepEqual(next.binding,legacy.binding);assert.equal(next.binding.implementationContextMode,'bounded-source-v4');assert(!Object.hasOwn(legacy.binding,'implementationContextMode'));}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
