import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createUgigEvidenceReaders} from './founder-ugig-evidence.mjs';
import {pilotFixture} from './founder-ugig-pilot-fixture.mjs';
import {digest,orderKey} from './founder-restoration-integrity.mjs';
test('default evidence readers stay OFF and missing evidence grants nothing',async()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'ugig-evidence-'));try{
 const f=pilotFixture();let on=false;const r=createUgigEvidenceReaders({base,isEnabled:()=>on});
 assert.throws(()=>r.agreement(f.order()),/OFF/);on=true;assert.throws(()=>r.agreement(f.order()),/evidence/i);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('reviewed file is bound to exact order; revocation and expired grants stop access',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'ugig-evidence-')),f=pilotFixture();
 try{const dir=path.join(base,'artifacts/founder-autonomy-20261013/ugig-contracts');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,digest(orderKey(f.order()))+'.json');
 const pack={schema:'numaron-ugig-reviewed-v1',agreement:f.a,grant:{approved:true,agreementDigest:digest(f.a),expiresAt:f.now+86400000,evidenceRef:'synthetic:operator-grant',operations:['read','work','verify','submit','reconcile']}};
 const save=()=>fs.writeFileSync(file,JSON.stringify(pack));save();const r=createUgigEvidenceReaders({base,isEnabled:()=>true,now:()=>f.now});
 assert.equal(r.agreement(f.order()).buyerId,f.a.buyerId);assert.equal(r.access(f.order()).verified,true);
 pack.grant.approved=false;save();assert.throws(()=>r.access(f.order()));pack.grant.approved=true;pack.grant.expiresAt=f.now;save();assert.throws(()=>r.access(f.order()));
 pack.grant.expiresAt=f.now+1000;pack.agreement.buyerId='changed';save();assert.throws(()=>r.agreement(f.order()));
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
