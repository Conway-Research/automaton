import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readFounderKey} from './founder-key.mjs';
test('explicit local key file is parsed privately and ambiguous contents are rejected',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'key-test-')),file=path.join(dir,'key.txt'),key='sk-fixture_abcdefghijklmnopqrstuvwxyz';try{fs.writeFileSync(file,'OpenAI key: '+key);assert.equal(readFounderKey(file),key);fs.writeFileSync(file,Buffer.concat([Buffer.from([255,254]),Buffer.from('Key '+key,'utf16le')]));assert.equal(readFounderKey(file),key);fs.writeFileSync(file,key+'\nsk-fixture_otherabcdefghijklmnopqrstuvwxyz');assert.throws(()=>readFounderKey(file),/^Error: Founder credential unavailable$/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
