import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {eligibleIssue,createOrderGithub} from './founder-order-github.mjs';
import {createProductionGithubFunding} from './founder-production-github-funding.mjs';
import {openOrderPayment} from './founder-order-payment.mjs';
import {createGithubPostpaidSource} from './founder-github-postpaid.mjs';
import {createGithubPaymentReader} from './founder-github-payment-reader.mjs';
import {createGithubBaseUsdcSource,BASE_USDC_TOKEN} from './founder-github-base-usdc.mjs';
const fundingFixture=(changes=()=>({}))=>createProductionGithubFunding({isEnabled:()=>true,source:{provider:'test-provider',origin:'https://escrow.example',async read(terms){return {...terms,kind:'escrow-lock',status:'held',escrowId:'lock-1',sourceUrl:'https://escrow.example/locks/lock-1',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),...changes()};}}});
const fundedGithub=options=>createOrderGithub({funding:fundingFixture(),...options});
const issue={number:1,state:'open',title:'Fix addition',body:'Bounty $50. AI-assisted contributions welcome. No assignment required.',user:{login:'owner'},author_association:'OWNER',assignees:[],html_url:'https://github.com/owner/project/issues/1',updated_at:'2026-10-13T00:00:00Z'};

for(const [profileId,ext,testPath] of [['typescript','ts','tests/original.test.ts'],['python','py','tests/test_original.py'],['bash','sh','tests/original.test.sh']])test('GitHub source preparation and certified publication supports explicit offline profile '+profileId,async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'github-profile-'));const files=[{path:'src/main.'+ext,content:'old implementation'},{path:testPath,content:'original test'}],f=fixture(issue,files),g=fundedGithub({directory,credential:()=> 'fake',request:f.request});
 try{const p=await g.prepare('owner/project',1);assert.equal(p.profileId,profileId);const patched=[{...files[0],content:'fixed implementation'},files[1],{path:profileId==='python'?'tests/test_regression.py':'tests/regression.test.'+ext,content:'new regression'}];g.certify(p,patched,{passed:true,baselinePassed:true,regressionFailsOriginal:true,sourceDigest:codeDigest(patched),baseDigest:p.sourceDigest,image:'sha256:'+'d'.repeat(64),tests:2});await g.publish(p.id);const result=await g.publish(p.id);assert.equal(result.url,'https://github.com/owner/project/pull/5');assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);}finally{g.close();fs.rmSync(directory,{recursive:true,force:true});}
});

for(const ordinary of [false,true])test('actual GitHub submitted order settles only its explicit finalized Base/USDC log; ordinary='+ordinary,async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'github-base-e2e-'));let g,final=false;const wallet='0x'+'1'.repeat(40),tx='0x'+'a'.repeat(64),bh='0x'+'b'.repeat(64),comments=[];
 const settlement={network:'base',chainId:8453,asset:'USDC',token:BASE_USDC_TOKEN,decimals:6,recipientAddress:wallet,amountAtomic:'49750000',settlesCurrency:'USD',settlesAmountMinor:5000};
 const declaration={paymentMode:'postpaid-limited',orderUrl:issue.html_url,recipient:'github:tricebr',amountMinor:5000,currency:'USD',netAmountMinor:5000,acceptanceCriteria:['fix with regression'],feesKnown:true,estimatedNetRappen:1000,payoutMethod:'explicit Base USDC settlement',paymentWithinDaysAfterAcceptance:14,settlement};
 const ordinaryBody=`Bounty: $50.\nAI-assisted contributions welcome. No assignment required.\nPayment: USD 50 net, settled as 49.75 USDC on Base within 14 days after acceptance.\nRecipient: @tricebr at ${wallet}.\nFees: paid by maintainer.\nAcceptance criteria:\n- Fix addition.\n- Include a passing regression test.`;
 const f=fixture({...issue,body:ordinary?ordinaryBody:issue.body+'\n<!-- numaron-postpaid-v1\n'+JSON.stringify(declaration)+'\n-->'});
 const source=createGithubBaseUsdcSource({isEnabled:()=>true,identityProvider:()=>({recipient:wallet}),readReference:(o,c)=>g.readBasePaymentReference(o,c),rpc:async(method,params)=>{if(method==='eth_chainId')return '0x2105';if(method==='eth_getBlockByNumber')return {number:params[0]==='finalized'?(final?'0x20':'0xf'):'0x10',hash:bh,timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)};if(method==='eth_getTransactionReceipt')return {transactionHash:tx,status:'0x1',blockNumber:'0x10',blockHash:bh,logs:[{address:BASE_USDC_TOKEN,removed:false,transactionHash:tx,blockNumber:'0x10',blockHash:bh,logIndex:'0x0',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(24)+'2'.repeat(40),'0x'+'0'.repeat(24)+wallet.slice(2)],data:'0x'+BigInt(settlement.amountAtomic).toString(16).padStart(64,'0')}]};throw Error('Unexpected RPC');}});
 const authority=openOrderPayment({file:path.join(directory,'payment.db'),isEnabled:()=>true,budgetSnapshot:()=>({active:true,entriesComplete:true,entries:[],remainingRappen:1000,dayRemainingRappen:1000,taskRappen:250}),postpaidSource:createGithubPostpaidSource({isEnabled:()=>true,readAgreement:(t,c)=>g.readPostpaidAgreement(t,c)}),paymentReader:createGithubPaymentReader({isEnabled:()=>true,source})});
 g=createOrderGithub({directory,credential:()=> 'fake',identityProvider:()=>({recipient:wallet}),quoteProvider:()=>({status:'current',base:'USDC',currency:'CHF',rateCHF:'0.8',quotedAt:new Date().toISOString()}),funding:authority,request:async(u,o)=>u.includes('/comments?')?Response.json(comments):f.request(u,o)});const ctx={task:{rootTaskId:'base-order'},assertActive(){}};
 try{const p=await g.prepare('owner/project',1,ctx);assert.deepEqual(p.paymentAuthorization.settlement,settlement);certifyFix(g,p);await g.publish(p.id,ctx);await g.publish(p.id,ctx);await g.reconcilePayments(ctx);assert.equal(authority.snapshot().openOrders,1);
  comments.push({id:10,author_association:'OWNER',body:ordinary?`Payment for ${p.url}: https://basescan.org/tx/${tx}`:'<!-- numaron-base-payment-v1\n'+JSON.stringify({orderUrl:p.url,scopeDigest:p.scopeDigest,contractDigest:p.paymentAuthorization.contractDigest,transactionHash:tx,logIndex:0})+'\n-->'});
  await g.reconcilePayments(ctx);assert.equal(authority.snapshot().openOrders,1);final=true;await g.reconcilePayments(ctx);assert.equal(authority.snapshot().openOrders,0);await g.reconcilePayments(ctx);assert.equal(authority.snapshot().openOrders,0);
 }finally{g.close();authority.close();fs.rmSync(directory,{recursive:true,force:true});}
});

// Before the price policy expiry; founder-policy-renewal.test.mjs covers the expiry itself.
const fixedNow=()=>Date.parse('2026-10-20T00:00:00Z');
test('changed current scope blocks work authorization before paid work or publication',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'github-scope-refresh-'));const current=structuredClone(issue),f=fixture(current);
 const g=fundedGithub({directory,credential:()=> 'fake',request:f.request});
 try{const p=await g.prepare('owner/project',1);current.body+=' Changed acceptance criteria.';current.updated_at='2026-10-18T01:00:00Z';await assert.rejects(g.requireFunding(p,{assertActive(){}}),/scope|revision/i);assert.equal(f.writes.length,0);}finally{g.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('bounty text and task-supplied verified flags cannot start unfunded customer work',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'funding-missing-')),f=fixture();let sourceReads=0;
 const g=createOrderGithub({directory:dir,credential:()=> 'test',request:async(u,o)=>{if(u.includes('/git/blobs/'))sourceReads++;return f.request(u,o);}});
 try{await assert.rejects(g.prepare('owner/project',1,{funding:{verified:true,status:'held'},assertActive(){}}),/funding/i);assert.equal(sourceReads,0);assert.equal(f.writes.length,0);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('assignment, contribution terms and payment claims are never invented',()=>{
 assert.equal(eligibleIssue(issue,'tricebr'),true);
 for(const x of [{state:'closed'},{pull_request:{}},{assignees:[{login:'other'}]},{body:'Bounty $50'},{body:issue.body+' Sign our CLA.'},{author_association:'NONE'}])assert.equal(eligibleIssue({...issue,...x},'tricebr'),false);
 assert.equal(eligibleIssue({...issue,body:'Bounty $50. AI-assisted contributions welcome.',assignees:[{login:'tricebr'}]},'tricebr'),true);
});
test('public API boundary rejects arbitrary hosts and hides provider errors',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'order-gh-'));let calls=0;const g=fundedGithub({directory:dir,credential:()=>null,request:async()=>{calls++;return Response.json({message:'secret'}, {status:403});}});
 try{await assert.rejects(g.read('https://evil.test'));assert.equal(calls,0);await assert.rejects(g.read('/user'),e=>!e.message.includes('secret'));}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
import {codeDigest} from './founder-code-sandbox.mjs';
const sha='a'.repeat(40),tree='b'.repeat(40),newCommit='c'.repeat(40);const source=[{path:'math.js',content:'exports.add=(a,b)=>a-b;'}, {path:'test/math.test.js',content:"const t=require('node:test');t('existing',()=>{});"}];
function fixture(issueData=issue,sourceFiles=source){let pr=null,ref=null,fork=false;const writes=[];let lost=false;const request=async(url,o={})=>{const u=new URL(url),p=u.pathname,q=u.searchParams,method=o.method??'GET',b=o.body?JSON.parse(o.body):null;if(method==='POST')writes.push(p);
 if(p==='/user')return Response.json({login:'tricebr'});
 if(p==='/search/issues')return Response.json({incomplete_results:false,items:[issueData]});
 if(p==='/repos/owner/project/issues/1')return Response.json(issueData);
 if(p==='/repos/owner/project/issues/1/timeline')return Response.json([]);
 if(p==='/repos/owner/project/issues/1/comments')return Response.json([]);
 if(p==='/repos/owner/project/pulls'&&method==='GET')return Response.json(pr?[pr]:[]);
 if(p==='/repos/owner/project/pulls'&&method==='POST'){pr={number:5,html_url:'https://github.com/owner/project/pull/5',user:{login:'tricebr'},head:{sha:newCommit,ref:b.head.split(':')[1],repo:{full_name:'tricebr/project'}},body:b.body};if(lost)throw Error('lost response');return Response.json(pr);}
 if(p==='/repos/owner/project')return Response.json({private:false,archived:false,default_branch:'main',full_name:'owner/project'});
 if(p==='/repos/owner/project/commits/main')return Response.json({sha,commit:{tree:{sha:tree}}});
 if(p==='/repos/owner/project/git/trees/'+tree)return Response.json({truncated:false,tree:sourceFiles.map((f,i)=>({path:f.path,mode:'100644',type:'blob',sha:String(i+1).repeat(40),size:f.content.length}))});
 if(p.startsWith('/repos/owner/project/git/blobs/'))return Response.json({encoding:'base64',content:Buffer.from(sourceFiles[Number(p.split('/').pop()[0])-1].content).toString('base64')});
 if(p==='/repos/tricebr/project')return fork?Response.json({private:false,fork:true,parent:{full_name:'owner/project'}}):Response.json({}, {status:404});
 if(p==='/repos/owner/project/forks'){fork=true;return Response.json({});}
 if(p==='/repos/tricebr/project/actions/permissions')return Response.json({enabled:false});
 if(p==='/repos/tricebr/project/git/trees')return Response.json({sha:tree});
 if(p==='/repos/tricebr/project/git/commits')return Response.json({sha:newCommit});
 if(p.startsWith('/repos/tricebr/project/git/ref/'))return ref?Response.json({object:{sha:ref}}):Response.json({}, {status:404});
 if(p==='/repos/tricebr/project/git/refs'){ref=b.sha;return Response.json({object:{sha:ref}});}
 throw Error('Unexpected '+method+' '+p);
 };return {request,writes,lastPull:()=>pr,losePrResponse(){lost=true;}};}
test('public source preparation preserves immutable identity and rejects competition',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'prepare-gh-')),f=fixture(),g=fundedGithub({directory:dir,credential:()=> 'test',request:f.request});
 try{const r=await g.prepare('owner/project',1);assert.equal(r.baseSha,sha);assert.equal(r.sourceDigest,codeDigest(source));assert.equal(f.writes.length,0);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('lost PR response is reconciled after restart, never double posted; unpaid remains unpaid',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publish-gh-')),f=fixture();let g=fundedGithub({directory:dir,credential:()=> 'test',request:f.request});
 try{const prepared=await g.prepare('owner/project',1);const files=[{...source[0],content:'exports.add=(a,b)=>a+b;'},source[1],{path:'test/regression.test.js',content:'regression'}];const v={passed:true,baselinePassed:true,regressionFailsOriginal:true,sourceDigest:codeDigest(files),baseDigest:prepared.sourceDigest,image:'sha256:'+'d'.repeat(64),tests:2};g.certify(prepared,files,v);f.losePrResponse();await assert.rejects(g.publish(prepared.id));g.close();g=fundedGithub({directory:dir,credential:()=> 'test',request:f.request});const r=await g.publish(prepared.id);assert.equal(r.url,'https://github.com/owner/project/pull/5');assert.equal(r.paymentConfirmed,false);assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('publication requires persisted exact-source test certificate',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'publish-gate-')),f=fixture(),g=fundedGithub({directory:dir,credential:()=> 'test',request:f.request});try{const p=await g.prepare('owner/project',1);await assert.rejects(g.publish(p.id));assert.throws(()=>g.certify(p,source,{passed:true}));assert.equal(f.writes.length,0);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('Salt delivered work is excluded until explicit paid remaining-scope proof is supported',()=>{assert.equal(eligibleIssue({...issue,html_url:'https://github.com/scaffold-studio-hq/scaffold-studio-mcp/issues/3'},'tricebr'),false);});
test('timeline-linked competing PR with empty body blocks preparation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'timeline-')),f=fixture(),g=fundedGithub({directory:dir,credential:()=> 'test',request:async(u,o)=>u.includes('/timeline?')?Response.json([{event:'cross-referenced',source:{issue:{pull_request:{url:'https://api.github.com/repos/owner/project/pulls/8'}}}}]):f.request(u,o)});try{await assert.rejects(g.prepare('owner/project',1));}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('github contribution policy is inspected and blocks prohibited work',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'policy-')),f=fixture();const g=fundedGithub({directory:dir,credential:()=> 'test',request:async(u,o)=>{
 if(u.includes('/git/trees/')){const r=await f.request(u,o),j=await r.json();j.tree.push({path:'.github/CONTRIBUTING.md',type:'blob',mode:'100644',sha:'9'.repeat(40),size:20});return Response.json(j);}
 if(u.endsWith('/git/blobs/'+'9'.repeat(40)))return Response.json({encoding:'base64',content:Buffer.from('No AI contributions.').toString('base64')});return f.request(u,o);}});try{await assert.rejects(g.prepare('owner/project',1));}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('changed scope invalidates publication and creates a fresh immutable preparation under same order',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'scope-')),f=fixture();let changed=false;const g=fundedGithub({directory:dir,credential:()=> 'test',request:async(u,o)=>u.endsWith('/issues/1')&&changed?Response.json({...issue,body:issue.body+' Also add multiplication.',updated_at:'2026-10-13T01:00:00Z'}):f.request(u,o)});try{const p=await g.prepare('owner/project',1),files=[{...source[0],content:'fixed'},source[1],{path:'test/new.test.js',content:'regression'}];g.certify(p,files,{passed:true,baselinePassed:true,regressionFailsOriginal:true,sourceDigest:codeDigest(files),baseDigest:p.sourceDigest,image:'sha256:'+'d'.repeat(64),tests:2});changed=true;assert.equal((await g.publish(p.id)).invalidated,true);const p2=await g.prepare('owner/project',1);assert.notEqual(p2.id,p.id);assert.equal(f.writes.length,0);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});

function certifyFix(g,p){const files=[{...source[0],content:'exports.add=(a,b)=>a+b;'},source[1],{path:'test/regression.test.js',content:'regression'}];g.certify(p,files,{passed:true,baselinePassed:true,regressionFailsOriginal:true,sourceDigest:codeDigest(files),baseDigest:p.sourceDigest,image:'sha256:'+'d'.repeat(64),tests:2});}

test('GitHub postpaid preparation and publication persist distinct authority and retain unpaid exposure across restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'github-postpaid-')),f=fixture();let on=true,reads=0;
 const payment=openOrderPayment({file:path.join(dir,'payment.db'),isEnabled:()=>on,budgetSnapshot:()=>({active:true,entriesComplete:true,entries:[],remainingRappen:1000,dayRemainingRappen:1000,taskRappen:250}),postpaidSource:{origin:'https://contracts.example',modeFor:()=> 'postpaid-limited',read:async t=>{reads++;return {...t,kind:'postpaid-agreement',status:'accepted',ownAssignmentConfirmed:true,acceptanceCriteria:['exact fix'],feesKnown:true,netAmountMinor:5000,estimatedNetRappen:1000,payoutMethod:'existing',paymentWithinDaysAfterAcceptance:14,sourceUrl:'https://contracts.example/orders/1',evidenceRef:'fake-accepted-contract',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};}}});
 let g=createOrderGithub({directory:dir,credential:()=> 'fake',request:f.request,funding:payment});const ctx={task:{rootTaskId:'postpaid-github-root'},assertActive(){}};
 try{const p=await g.prepare('owner/project',1,ctx);assert.equal(p.funding,undefined);assert.equal(p.paymentAuthorization.paymentMode,'postpaid-limited');certifyFix(g,p);g.close();g=createOrderGithub({directory:dir,credential:()=> 'fake',request:f.request,funding:payment});assert.equal((await g.publish(p.id,ctx)).pending,true);assert.equal((await g.publish(p.id,ctx)).paymentConfirmed,false);assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);assert.equal(payment.snapshot().openOrders,1);assert(reads>=2);on=false;await assert.rejects(g.requireFunding(p,ctx),/OFF/);}finally{g.close();payment.close();fs.rmSync(dir,{recursive:true,force:true});}
});

for(const inComment of [false,true])test('production GitHub declaration selector rereads maintainer terms and reconciles independently validated payment; comment='+inComment,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'github-declared-postpaid-'));let g,paid=false,on=true;
 const declaration={paymentMode:'postpaid-limited',orderUrl:issue.html_url,recipient:'github:tricebr',amountMinor:5000,currency:'USD',acceptanceCriteria:['exact fix and regression'],feesKnown:true,netAmountMinor:5000,estimatedNetRappen:1000,payoutMethod:'verified existing recipient',paymentWithinDaysAfterAcceptance:14};
 const marker='\n<!-- numaron-postpaid-v1\n'+JSON.stringify(declaration)+'\n-->',f=fixture({...issue,body:issue.body+(inComment?'':marker)});
 const paymentReader=createGithubPaymentReader({isEnabled:()=>on,source:{provider:'fake-independent-provider',origin:'https://payments.example',read:async expected=>paid?{...expected,kind:'incoming-payment',status:'settled',paymentId:'receipt-1',sourceUrl:'https://payments.example/receipts/1',observedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()}:{confirmed:false}}});
 const authority=openOrderPayment({file:path.join(dir,'payment.db'),isEnabled:()=>on,budgetSnapshot:()=>({active:true,entriesComplete:true,entries:[],remainingRappen:1000,dayRemainingRappen:1000,taskRappen:250}),postpaidSource:createGithubPostpaidSource({isEnabled:()=>on,readAgreement:(t,c)=>g.readPostpaidAgreement(t,c)}),paymentReader});
 g=createOrderGithub({directory:dir,credential:()=> 'fake',request:async(u,o)=>inComment&&u.includes('/comments?')?Response.json([{id:123,updated_at:issue.updated_at,author_association:'OWNER',body:marker}]):f.request(u,o),funding:authority});const ctx={task:{rootTaskId:'declared-root'},assertActive(){}};
 try{const p=await g.prepare('owner/project',1,ctx);assert.equal(p.paymentAuthorization.paymentMode,'postpaid-limited');certifyFix(g,p);await g.publish(p.id,ctx);await g.publish(p.id,ctx);await g.reconcilePayments(ctx);assert.equal(authority.snapshot().openOrders,1);paid=true;await g.reconcilePayments(ctx);assert.equal(authority.snapshot().openOrders,0);}finally{g.close();authority.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('revoked financing after preparation blocks every external publication write, including after restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'funding-restart-')),f=fixture();let held=true;
 const funding=fundingFixture(()=>({status:held?'held':'refunded'}));let g=fundedGithub({directory:dir,funding,credential:()=> 'test',request:f.request});
 try{const p=await g.prepare('owner/project',1);certifyFix(g,p);held=false;g.close();g=fundedGithub({directory:dir,funding,credential:()=> 'test',request:f.request});await assert.rejects(g.publish(p.id),/Funding/);assert.equal(f.writes.length,0);await assert.rejects(g.requireFunding({...p,funding:{...p.funding,verified:true}}),/persisted order binding/);held=true;assert.equal((await g.publish(p.id)).pending,true);assert.equal((await g.publish(p.id)).url,'https://github.com/owner/project/pull/5');assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('loss of funding during publication prevents subsequent fork writes and PR creation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'funding-race-')),f=fixture();let held=true;
 const g=fundedGithub({directory:dir,funding:fundingFixture(()=>({status:held?'held':'released'})),credential:()=> 'test',request:async(u,o)=>{const r=await f.request(u,o);if(o?.method==='POST'&&u.endsWith('/forks'))held=false;return r;}});
 try{const p=await g.prepare('owner/project',1);certifyFix(g,p);await assert.rejects(g.publish(p.id),/Funding/);assert.deepEqual(f.writes,['/repos/owner/project/forks']);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('lost PR acknowledgement is read-reconciled even if funding is later withdrawn, never resubmitted',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'funding-unknown-')),f=fixture();let held=true;
 const funding=fundingFixture(()=>({status:held?'held':'refunded'}));let g=fundedGithub({directory:dir,funding,credential:()=> 'test',request:f.request});
 try{const p=await g.prepare('owner/project',1);certifyFix(g,p);f.losePrResponse();await assert.rejects(g.publish(p.id));held=false;g.close();g=fundedGithub({directory:dir,funding,credential:()=> 'test',request:f.request});assert.equal((await g.publish(p.id)).url,'https://github.com/owner/project/pull/5');assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});

import {createOrderFlow} from './founder-order-flow.mjs';
import {createOrderCodeWorker} from './founder-order-code.mjs';
import {openFounderController} from './founder-controller.mjs';
import {openFounderBudget} from './founder-budget.mjs';

test('funded discovery through real code adapter, certificates, submission, receipt and restart is once-only',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'funded-e2e-')),f=fixture();let modelCalls=0,boxCalls=0;
 const makeGithub=()=>fundedGithub({directory:path.join(dir,'github'),credential:()=> 'test',request:f.request});
 const sandbox={available:true,image:'sha256:'+'d'.repeat(64),async refresh(){},async run(files){boxCalls++;const hasRegression=files.some(x=>x.path==='test/regression.test.js'),fixed=files.some(x=>x.content.includes('a+b'));return {passed:!hasRegression||fixed,tests:hasRegression?2:1,sourceDigest:codeDigest(files),log:'simulated offline test outcome'};}};
 const code=createOrderCodeWorker({now:fixedNow,apiKey:'sk-synthetic-test-key',mission:{directive:'Repair the funded public task within the confirmed limits.'},request:async(url,options)=>{modelCalls++;assert.equal(url,'https://api.openai.com/v1/responses');const input=JSON.parse(JSON.parse(options.body).input);return Response.json({id:'resp_funded_test',status:'completed',usage:{input_tokens:10,output_tokens:10},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Fixes addition with a concrete independent regression test.',nextStep:'Validate the exact source files in offline isolation.',limitations:['Simulated provider and sandbox in this acceptance test.'],sourceIds:input.sources.map(s=>s.id),changes:[{path:'math.js',content:'exports.add=(a,b)=>a+b;'},{path:'test/regression.test.js',content:'regression'}]})}]}]});}});
 const budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now(),authorizationRef:'synthetic-e2e'});
 let flow=createOrderFlow({directory:dir,github:makeGithub(),sandbox,code});let controller=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:flow.adapters});controller.control('start');
 try{await flow.refresh();for(let i=0;i<10;i++){flow.advance(controller);await controller.tick();}const history=controller.planningHistory();for(const kind of ['order-discovery','order-prepare','order-code','order-check','order-submit'])assert.ok(history.some(t=>t.kind===kind&&t.status==='done'),kind+' '+JSON.stringify(history.map(t=>({kind:t.kind,status:t.status,reason:t.reason}))));assert.equal(modelCalls,1);assert.equal(boxCalls,4);assert.equal(budget.snapshot().spentRappen,1);assert.equal(budget.snapshot().heldRappen,0);assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);assert.ok(history.filter(t=>['order-prepare','order-code','order-check','order-submit'].includes(t.kind)).every(t=>t.rootTaskId===history.find(t=>t.kind==='order-code').rootTaskId));await controller.close();flow.close();flow=createOrderFlow({directory:dir,github:makeGithub(),sandbox,code});controller=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:flow.adapters});await flow.refresh();for(let i=0;i<4;i++){flow.advance(controller);await controller.tick();}assert.equal(modelCalls,1);assert.equal(f.writes.filter(x=>x.endsWith('/pulls')).length,1);assert.equal(budget.snapshot().periodRappen,15000);assert.equal(budget.snapshot().dailyRappen,2000);assert.equal(budget.snapshot().taskRappen,250);}finally{await controller.close();flow.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('revocation before the paid stage dispatches no model call and leaves no budget hold',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'funded-preflight-')),f=fixture();let held=true,modelCalls=0;
 const github=fundedGithub({directory:path.join(dir,'github'),funding:fundingFixture(()=>({status:held?'held':'refunded'})),credential:()=> 'test',request:f.request});
 const sandbox={available:true,image:'sha256:'+'d'.repeat(64),async refresh(){},async run(files){return {passed:true,tests:1,sourceDigest:codeDigest(files),log:'simulated baseline'};}};
 const code=createOrderCodeWorker({now:fixedNow,apiKey:'sk-synthetic-test-key',mission:{directive:'Repair funded public code only.'},request:async()=>{modelCalls++;throw Error('must not dispatch');}});
 const budget=openFounderBudget(path.join(dir,'budget.db'));budget.activate({startAt:Date.now(),authorizationRef:'synthetic-preflight'});const flow=createOrderFlow({directory:dir,github,sandbox,code});const controller=openFounderController({file:path.join(dir,'controller.db'),budget,adapters:flow.adapters});controller.control('start');
 try{await flow.refresh();for(let i=0;i<2;i++){flow.advance(controller);await controller.tick();}assert.ok(controller.planningHistory().some(t=>t.kind==='order-prepare'&&t.status==='done'));held=false;flow.advance(controller);await controller.tick();assert.ok(controller.planningHistory().some(t=>t.kind==='order-code'&&t.status==='failed'));assert.equal(modelCalls,0);assert.equal(budget.snapshot().spentRappen,0);assert.equal(budget.snapshot().heldRappen,0);assert.equal(f.writes.length,0);}finally{await controller.close();flow.close();budget.close();fs.rmSync(dir,{recursive:true,force:true});}
});

 test('verified maintainer payout request adds only the operator Base recipient to the exact submitted PR',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payout-github-')),f=fixture({...issue,body:issue.body+' For payment, include your Base wallet address.'});let identityReads=0;const recipient='0x'+'1'.repeat(40),agent='0x'+'2'.repeat(40);const g=fundedGithub({directory:dir,credential:()=> 'test',request:f.request,identityProvider:()=>{identityReads++;return {githubLogin:'tricebr',recipient,agentWallet:agent,network:'base',asset:'USDC',operatorName:null};}});
 try{const p=await g.prepare('owner/project',1);const files=[{...source[0],content:'exports.add=(a,b)=>a+b;'},source[1],{path:'test/regression.test.js',content:'regression'}];g.certify(p,files,{passed:true,baselinePassed:true,regressionFailsOriginal:true,sourceDigest:codeDigest(files),baseDigest:p.sourceDigest,image:'sha256:'+'d'.repeat(64),tests:2});await g.publish(p.id,{assertActive(){}});assert.equal(identityReads,1);assert.ok(f.lastPull().body.includes(recipient));assert.equal(f.lastPull().body.includes(agent),false);assert.match(f.lastPull().body,/Base/);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});

 test('missing local payout identity blocks before recording an unknown remote PR outcome',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payout-missing-')),f=fixture({...issue,body:issue.body+' For payment, include your Base wallet address.'}),g=fundedGithub({directory:dir,credential:()=> 'test',request:f.request,identityProvider:()=>{throw Error('Identity missing');}});
 try{const p=await g.prepare('owner/project',1);const files=[{...source[0],content:'exports.add=(a,b)=>a+b;'},source[1],{path:'test/regression.test.js',content:'regression'}];g.certify(p,files,{passed:true,baselinePassed:true,regressionFailsOriginal:true,sourceDigest:codeDigest(files),baseDigest:p.sourceDigest,image:'sha256:'+'d'.repeat(64),tests:2});await assert.rejects(g.publish(p.id,{assertActive(){}}),/Identity missing/);assert.notEqual(g.snapshot()[0].state,'pr-unknown');assert.equal(f.writes.filter(p=>p.endsWith('/pulls')).length,0);}finally{g.close();fs.rmSync(dir,{recursive:true,force:true});}
});
