import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openOrderAdapterLearning} from './founder-order-adapter-learning.mjs';
async function fixture(fn){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'learning-authority-'));let expiresAt=Date.now()+60000,eligible=true,revoked=false,calls=0;
 const iface={verified:true,sourceId:'s',evidenceRef:'fixture',interfaceDigest:'a'.repeat(64),contract:{readOnly:true}};
 const source={sourceId:'s',needsAdapter:true,inspectInterface:async()=>{calls++;revoked=true;return iface;}};
 const learner=openOrderAdapterLearning({directory,isEnabled:()=>true,registry:{snapshot:()=>({sources:[{id:'s',kind:'core',capabilities:{read:{state:revoked?'blocked':'live-verified',expiresAt},work:{state:'blocked'}}}]})},sources:[source],orders:()=>eligible?[{sourceId:'s',rootTaskId:'root',state:'assigned',termsVerified:true}]:[],options:{draft:async()=>{calls++;eligible=false;return {files:[]};},sandbox:{available:true}}});
 const ctx=kind=>({task:{rootTaskId:'root',input:{adapterWork:{sourceId:'s',rootTaskId:'root',kind}}},grant:{reservationId:'fixture',maxCostRappen:kind==='draft-adapter'?50:0},assertActive(){},dependencies:[{kind:'inspect-existing-interface',sourceId:'s',rootTaskId:'root',interface:iface}]});
 try{await fn({learner,ctx,setExpiry:x=>expiresAt=x,get calls(){return calls;}});}finally{learner.close();fs.rmSync(directory,{recursive:true,force:true});}
}
test('source permission revoked during interface inspection rejects its result',()=>fixture(async f=>{await assert.rejects(f.learner.adapters['source-adapter-inspect-existing-interface'].execute(f.ctx('inspect-existing-interface')),/permission|binding/i);assert.equal(f.learner.snapshot().candidates.length,0);}));
test('assignment removed during drafting rejects the returned candidate',()=>fixture(async f=>{await assert.rejects(f.learner.adapters['source-adapter-draft-adapter'].execute(f.ctx('draft-adapter')),/binding/i);assert.equal(f.learner.snapshot().candidates.length,0);}));
for(const expiry of [undefined,NaN,Infinity,'9999999999999',0])test('invalid or expired source permission never dispatches '+String(expiry),()=>fixture(async f=>{f.setExpiry(expiry);await assert.rejects(f.learner.adapters['source-adapter-inspect-existing-interface'].execute(f.ctx('inspect-existing-interface')),/permission/i);assert.equal(f.calls,0);}));
