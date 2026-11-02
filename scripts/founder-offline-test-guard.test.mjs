import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
test('offline preload rejects an external fetch before transport and fails the process even if caught',()=>{
 const guard=new URL('./founder-offline-test-guard.mjs',import.meta.url).href;
 const result=spawnSync(process.execPath,['--import',guard,'--input-type=module','-e',"await fetch('https://must-not-contact.invalid/').catch(()=>{});"],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,1);assert.match(result.stderr,/1 external request attempt\(s\) blocked/);
});
