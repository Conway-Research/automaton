import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createProjectTaskAdapter} from './founder-project-task.mjs';
for(const model of [null,{available:true,origin:'fixture',infer:()=>{throw Error('must never infer');}}])test('task adapter refuses absent/scripted models without reading a project',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'author-adapter-'));let reads=0;
 const adapter=createProjectTaskAdapter({directory,model,resolveProject:async()=>{reads++;throw Error('should not read task');}});
 try{assert.equal(adapter.available,false);const r=await adapter.execute({assertActive(){}});assert.equal(r.status,'blocked');assert.equal(reads,0);assert.equal(adapter.verify({...r,status:'packaged',autonomousGenerationProven:true}),false);}finally{adapter.close();assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
});
