import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {normalizeOrderReport,openFounderOrders} from './founder-orders.mjs';
test('normalizes both report generations and retains rejected fetches',()=>{
 const row={repo:'owner/project',n:12,state:'closed',merged:true,error:false};
 assert.deepEqual(normalizeOrderReport({at:'2026-10-13',prs:[row]}),normalizeOrderReport({checked_at:'2026-10-13',pr_states:[row]}));
 const r=normalizeOrderReport({prs:[{status:'fulfilled',value:row},{status:'rejected',reason:'offline'},{...row,error:true}]});
 assert.equal(r.failures,2);assert.equal(r.prs.length,2);assert.throws(()=>normalizeOrderReport({}));
});
test('journal requires registered ownership, preserves conflicting evidence, and survives restart',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-orders-')),file=path.join(dir,'orders.db');let journal=openFounderOrders(file);
 const e={provider:'github',externalId:'owner/project/pull/12',revision:'a',observedAt:new Date().toISOString(),ownOrderId:'own-12',kind:'observation',payload:{merged:true}};
 try{
 assert.throws(()=>journal.ingest(e),/registered/);
 journal.register({id:'own-12',provider:'github',externalId:e.externalId,owner:'tricebr',provenance:'artifacts/own-delivery/completion.json'});
 assert.equal(journal.ingest(e),true);assert.equal(journal.ingest(e),false);
 assert.throws(()=>journal.ingest({...e,payload:{merged:false}}),/Revision/);
 assert.throws(()=>journal.ingest({...e,revision:'payment',kind:'payment',payload:{confirmed:true}}),/Payment/);
 journal.ingest({...e,revision:'b',payload:{merged:false}});journal.close();journal=openFounderOrders(file);
 const s=journal.snapshot();assert.equal(s.evidence.length,2);assert.equal(s.orders.length,1);assert.equal(s.evidence[0].kind,'observation');assert.equal(journal.integrity(),'ok');
 }finally{journal.close();fs.rmSync(dir,{recursive:true,force:true});}
});
