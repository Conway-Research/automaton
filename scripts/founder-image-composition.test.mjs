import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createProductionOrderBindings} from './founder-production-order-bindings.mjs';import {sha256} from './founder-binary-artifacts.mjs';
test('default composition discovers certified image runtime without work, provider calls or writes while OFF',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'image-composition-'));try{const sourceHashes={};for(const n of ['scripts/image-sandbox-entry.py','outputs/fixture/capability_entry.py']){const target=path.join(base,n);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'synthetic');sourceHashes[n]=sha256(fs.readFileSync(target));}
 const configuration={schema:'numaron-isolated-image-runtime-v1',image:'sha256:'+'a'.repeat(64),sourceHashes,probe:{passed:true,protection:{uid:65534,capabilitiesZero:true,network:'none',hostMounts:false,readOnlyRoot:true,memoryMax:536870912,swapMax:0,pidsMax:64,cpuMax:['100000','100000']}}};
 const target=path.join(base,'scripts/founder-image-runtime-config.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(configuration));const options=createProductionOrderBindings({base,isEnabled:()=>false})();
 assert.equal(options.productImages.status().ready,true);assert.equal(options.productionStatus().productImages.ready,true);assert.equal(options.productionStatus().powerEnabled,false);await assert.rejects(options.productImages.generate({},{}),/OFF/);assert.equal(fs.existsSync(path.join(base,'artifacts')),false);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
