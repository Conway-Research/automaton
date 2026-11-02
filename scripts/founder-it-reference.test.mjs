import test from 'node:test';
import assert from 'node:assert/strict';
import {applyProfileChanges} from './founder-order-execution.mjs';
import {verifyDeliverable} from './founder-order-delivery.mjs';

const binding={profileId:'python',files:[{path:'app.py',content:'def ready(): return False\n'},{path:'tests/test_original.py',content:'original immutable test'}]};
const changes=[{path:'app.py',content:'def ready(): return True\n'+'# bounded project implementation\n'.repeat(700)},{path:'tests/test_new.py',content:'new independent acceptance assertions'}];
test('larger implementation needs an explicit bounded composition limit',()=>{
 assert.throws(()=>applyProfileChanges(binding,changes),/Bounded/);
 const result=applyProfileChanges(binding,changes,{maxFiles:16,maxBytes:128000});
 assert.equal(result.find(x=>x.path==='app.py').content,changes[0].content);
 assert.equal(result.find(x=>x.path==='tests/test_original.py').content,'original immutable test');
});
test('large delivery evidence remains explicit, bounded and privacy checked',async()=>{
 const input={order:{sourceId:'fixture',externalId:'big',ownerId:'owner',scopeDigest:'scope'},result:{files:[{path:'data.json',content:'x'.repeat(300000)}]},verifier:async()=>({passed:true,evidenceRefs:['fixture:verified']})};
 await assert.rejects(verifyDeliverable(input,{assertActive(){}}),/size/);
 const result=await verifyDeliverable({...input,maxBytes:1000000},{assertActive(){}});
 assert.equal(result.passed,true);
 await assert.rejects(verifyDeliverable({...input,maxBytes:1000000000},{assertActive(){}}),/limit/);
 await assert.rejects(verifyDeliverable({...input,maxBytes:1000000,result:{password:'not-allowed'}},{assertActive(){}}),/privacy/);
});
test('large projects cannot change original tests or admit new implementation paths',()=>{
 const limits={maxFiles:16,maxBytes:128000};
 assert.throws(()=>applyProfileChanges(binding,[changes[0],{path:'tests/test_original.py',content:'weakened'}],limits),/preserved/);
 assert.throws(()=>applyProfileChanges(binding,[...changes,{path:'new.py',content:'arbitrary new executable'}],limits),/preserved/);
 assert.throws(()=>applyProfileChanges(binding,changes,{maxFiles:10000,maxBytes:100000000}),/limit/);
 assert.throws(()=>applyProfileChanges(binding,changes,{maxFiles:1,maxBytes:128000}),/Bounded/);
 assert.throws(()=>applyProfileChanges(binding,changes,{maxFiles:16,maxBytes:NaN}),/limit/);
});
