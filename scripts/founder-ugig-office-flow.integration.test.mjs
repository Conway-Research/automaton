import {execFileSync} from 'node:child_process';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import Database from 'better-sqlite3';
import {setupOfficePipeline} from './founder-ugig-office-test-support.mjs';
import {openOrderExecution} from './founder-order-execution.mjs';import {createMarketplaceWorkSource} from './founder-marketplace-work-source.mjs';
for(const kind of ['document-cleanup','support-templates','research-report','xlsx-automation'])test(kind+': actual lifecycle waits for release and reuses result',async()=>{const input=JSON.parse(execFileSync(process.env.NUMARON_OFFICE_TEST_PYTHON,['-I','-c',"import sys,json;sys.path.insert(0,sys.argv[1]);from test_ugig_office import fixture;s,r=fixture(sys.argv[2]);print(json.dumps(dict(spec=s,reference=r)))",path.resolve('scripts'),kind],{encoding:'utf8',windowsHide:true}));const s=await setupOfficePipeline(input);let execution;try{
 const dir=path.join(s.base,'execution');fs.mkdirSync(dir);const local=createMarketplaceWorkSource({platform:'ugig',sourceId:s.f.a.sourceId,isEnabled:()=>true,now:()=>s.f.now,...s.p});execution=openOrderExecution({directory:dir,isEnabled:()=>true,sources:[local]});const ctx=s.ctx;
 await execution.adapters.prepare.execute(ctx);await execution.adapters.work.execute(ctx);await assert.rejects(execution.adapters.verify.execute(ctx));
 const read=()=>{const db=new Database(path.join(dir,'products.db'),{readonly:true});try{return JSON.parse(db.prepare('SELECT payload FROM restoration_products').get().payload);}finally{db.close();}};
 assert.equal(read().stage,'worked');const r=await s.p.readOfficeResult(ctx.order,ctx);s.release(r);await assert.rejects(s.p.readAcceptance({...ctx.order,deliveryDigest:'wrong'},ctx));await assert.rejects(s.p.readPayment({...ctx.order,deliveryDigest:'wrong'},ctx));await execution.adapters.verify.execute(ctx);assert.equal(read().stage,'verified');assert.equal(read().digest,r.productDigest);
 await execution.adapters.work.execute(ctx);assert.equal(read().digest,r.productDigest);
 }finally{execution?.close();s.close();}});
