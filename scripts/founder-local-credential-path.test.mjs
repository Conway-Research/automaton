import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveProtectedCredential} from './founder-local-credential-path.mjs';
test('dedicated Codex protected file resolves independently of native AppData',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-path-'));
 try{const native=path.join(root,'native'),packaged=path.join(root,'package');fs.mkdirSync(path.join(packaged,'Numaron'),{recursive:true});fs.writeFileSync(path.join(packaged,'Numaron/google-access.dpapi'),'encrypted');assert.equal(resolveProtectedCredential('Numaron/google-access.dpapi',{native,packaged}),path.join(packaged,'Numaron/google-access.dpapi'));}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('native-only existing installation remains usable; unknown paths are rejected',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-path-'));
 try{const native=path.join(root,'native'),packaged=path.join(root,'package');fs.mkdirSync(path.join(native,'Obolus/DealworkCredentials'),{recursive:true});const file=path.join(native,'Obolus/DealworkCredentials/primary.dpapi');fs.writeFileSync(file,'encrypted');assert.equal(resolveProtectedCredential('Obolus/DealworkCredentials/primary.dpapi',{native,packaged}),file);assert.throws(()=>resolveProtectedCredential('../other',{native,packaged}));}finally{fs.rmSync(root,{recursive:true,force:true});}
});
