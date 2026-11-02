import test from 'node:test';import assert from 'node:assert/strict';
import {certifyAdapterCandidate,planAdapterWork} from './founder-adapter-learning.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
const files=()=>[{path:'adapter.mjs',content:'export const version=1;'},{path:'adapter.test.mjs',content:'synthetic test'}];
const image='sha256:'+'a'.repeat(64);
const sandbox=(run)=>({available:true,network:'none',hostMounts:false,image,run});
const result=f=>({passed:true,tests:1,sourceDigest:profileFilesDigest(f),image,network:'none',hostMounts:false});
const certify=(f,s)=>certifyAdapterCandidate({sourceId:'fixture-source',files:f,sandbox:s,assertActive(){}});
for(const count of [undefined,null,NaN,Infinity,-1,0,0.5,'3'])test('rejects invalid test count '+String(count),async()=>{
 assert.equal((await certify(files(),sandbox(async f=>({...result(f),tests:count})))).passed,false);
});
test('candidate files cannot be changed by the test runner and then certified',async()=>{
 const f=files();const r=await certify(f,sandbox(async rows=>{rows[0].content+='changed';return result(rows);}));assert.equal(r.passed,false);
});
test('sandbox identity cannot change during the test and match its own new evidence',async()=>{
 const s=sandbox(async f=>{s.image='sha256:'+'b'.repeat(64);return {...result(f),image:s.image};});assert.equal((await certify(files(),s)).passed,false);
});
for(const variant of ['duplicate','case-collision','device','null','test-only','oversized'])test('rejects unsafe or non-implementation candidate '+variant,async()=>{
 let f=files();if(variant==='duplicate')f.push({...f[0]});if(variant==='case-collision')f.push({...f[0],path:'ADAPTER.mjs'});if(variant==='device')f[0].path='CON.mjs';if(variant==='null')f[0]=null;if(variant==='test-only')f=f.slice(1);if(variant==='oversized')f[0].content='x'.repeat(262145);
 let calls=0;assert.equal((await certify(f,sandbox(async rows=>{calls++;return result(rows);}))).passed,false);assert.equal(calls,0);
});
test('valid candidate is certified offline without a live grant',async()=>{const r=await certify(files(),sandbox(async f=>result(f)));assert.equal(r.passed,true);assert.equal(r.liveAuthorized,false);assert.equal(r.digest,profileFilesDigest(files()));});
for(const amount of [undefined,NaN,Infinity,'250',-1])test('unknown or malformed learning budget is not schedulable '+String(amount),()=>{
 assert.deepEqual(planAdapterWork({source:{id:'source'},rootTaskId:'root',budget:{active:true,rootRemainingRappen:amount}}).tasks,[]);
});
