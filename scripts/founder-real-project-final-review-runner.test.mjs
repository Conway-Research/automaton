import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {runRealProject} from './founder-real-project-run-final-review.mjs';
test('strict final runner refuses missing original review cases before model construction or runtime access',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-required-review-'));try{
  for(const name of ['release-extra-cases.json','additional-review-cases-v2.json','additional-review-cases-v3.json','frozen-contract.json'])fs.copyFileSync(path.join('outputs/real-project-run-20261025-v12',name),path.join(root,name));
  const installationFile=path.join(root,'invalid-installation.json');fs.writeFileSync(installationFile,JSON.stringify({image:'intentionally-invalid-no-runtime-possible',modelDigest:'a'.repeat(64),runnerDigest:'b'.repeat(64)}));
  await assert.rejects(runRealProject(root,{installationFile}),/Mandatory original review cases/);assert.equal(fs.existsSync(path.join(root,'status.json')),false);
 }finally{assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(root,{recursive:true,force:true});}
});
