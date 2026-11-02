import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openOrderRestoration} from './founder-order-restoration.mjs';
import {observationDigest} from './founder-opportunity-store.mjs';
test('production composition exposes questions while OFF without scheduling or sending',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'selection-status-'));
 const app=openOrderRestoration({base,directory:path.join(base,'state'),isEnabled:()=>false,workPackages:{rows:[]}});
 try{
  const o={sourceId:'synthetic',externalId:'job',revision:'1',evidenceRef:'synthetic:job',kind:'listing',observedAt:new Date().toISOString(),data:{title:'Synthetic CSV conversion',remoteState:'open',proposalCount:4}};
  app.store.ingest({...o,digest:observationDigest(o)});
  const status=app.status();assert.equal(status.selection[0].selection.decision,'clarify');assert.ok(status.selection[0].selection.questions.length>0);
  assert.deepEqual(app.tick({controller:{enqueue(){throw Error('Must stay OFF');}}}),{inserted:0,enqueued:0});
  assert.equal(app.store.snapshot().orders.length,0);assert.equal(status.liveReady,false);
 }finally{app.close();fs.rmSync(base,{recursive:true,force:true});}
});
