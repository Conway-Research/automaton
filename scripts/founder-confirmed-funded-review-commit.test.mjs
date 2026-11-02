import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import Database from 'better-sqlite3';
import {openOrderExecution} from './founder-order-execution.mjs';
import {pilotFixture} from './founder-ugig-pilot-fixture.mjs';
import {contentPackageFiles} from './founder-content-package.mjs';
import {digest,orderKey} from './founder-restoration-integrity.mjs';
import {verifyContentReview} from './founder-content-worker.mjs';
test('funding revoked during specialist review cannot persist a trusted passed review',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'confirmed-review-commit-'));let engine,revoked=false,reads=0;
 const order={sourceId:'synthetic',externalId:'one',ownerId:'own',rootTaskId:'root',sourceRevision:'one'};
 const brief=pilotFixture().a.contentBrief,packageValue={briefDigest:digest(brief),items:[{id:'one',formatId:'social',kind:'social-post',text:brief.source.text,evidence:[{sourceId:'source',quote:'two hours'}]}]};
 const files=contentPackageFiles(packageValue),product={binding:{...order,profileId:'content-repurpose',workContractDigest:'agreement',contentBrief:brief},package:packageValue,generationRunId:'generation',files,digest:digest({files}),stage:'worked'};
 const review={agreementDigest:'agreement',packageDigest:digest(packageValue),reviewRunId:'review',generationRunId:'generation',verdict:'pass',checks:{factuality:true,meaning:true,tone:true,audience:true,completeness:true},findings:[],evidenceRefs:['source:two hours'],costReceipt:{actualCostRappen:1,evidenceRef:'review'}};
 assert.equal(verifyContentReview(product,review),true);
 const db=new Database(path.join(directory,'products.db'));db.exec('CREATE TABLE restoration_products(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');db.prepare('INSERT INTO restoration_products VALUES(?,?)').run(digest([orderKey(order),order.sourceRevision]),JSON.stringify(product));db.close();
 try{
  engine=openOrderExecution({directory,isEnabled:()=>true,options:{requireConfirmedFundedOrders:true,confirmedWorkAuthority:{async refresh(){reads++;if(revoked)throw Error('Funding revoked');},allows:()=>!revoked},sources:[{sourceId:'synthetic',profiles:['content-repurpose'],evidenceRef:'local:synthetic-contract',verify:()=>true,methods:{prepare:async()=>({})},beforeWork:async()=>true}],reviewContent:{available:true,async execute(){revoked=true;return {kind:'ugig-content-review',review,costReceipt:review.costReceipt};}}}});
  const ctx={order,task:{input:{productDigest:product.digest}},grant:{maxCostRappen:50,reservationId:'review-reservation'},assertActive(){}};
  await assert.rejects(engine.contentReviewAdapter.execute(ctx),/Funding revoked/);
  assert.equal(reads,2);
  const saved=new Database(path.join(directory,'products.db'),{readonly:true,fileMustExist:true});try{const p=JSON.parse(saved.prepare('SELECT payload FROM restoration_products').get().payload);assert.equal(p.review,undefined);assert.equal(verifyContentReview(p,p.review),false);assert.equal(p.digest,product.digest);const raw=saved.prepare('SELECT payload FROM restoration_review_artifacts').all();assert.equal(raw.length,1);const received=JSON.parse(raw[0].payload);assert.equal(received.trustedCommit,false);assert.deepEqual(received.result.review,review);assert.equal(received.productDigest,product.digest);}finally{saved.close();}
 }finally{engine?.close();assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}
});
