import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createSourceTransport,isPublicAddress} from './founder-source-transport.mjs';
import {selectWorkProfile,verifyWorkProfile,profileFilesDigest} from './founder-work-profiles.mjs';
import {normalizeNativeWork} from './founder-native-work.mjs';
import {planOrderFollowup} from './founder-order-followup.mjs';
import {planAdapterWork,certifyAdapterCandidate} from './founder-adapter-learning.mjs';
import {loadFounderIdentity,submissionIdentity} from './founder-work-context.mjs';
import {createCodeSandbox} from './founder-code-sandbox.mjs';
const ctx={assertActive(){},signal:new AbortController().signal,grant:{reservationId:'fake',maxCostRappen:0}};
test('transport pins fresh public DNS and blocks OFF/private/redirect/credentials',async()=>{
 let on=true,address='8.8.8.8',calls=0,observed;const t=createSourceTransport({policy:{id:'s',origin:'https://example.com',readPaths:['/api/'],queryKeys:['page'],maxBytes:200},isEnabled:()=>on,resolve:async()=>[{address,family:4}],request:async(u,o)=>{calls++;observed=o;return Response.json({ok:true});}});
 assert.deepEqual(await t.read('/api/jobs?page=1',ctx),{ok:true});assert.equal(observed.pinnedAddress,'8.8.8.8');assert.equal(observed.headers.Authorization,undefined);address='127.0.0.1';await assert.rejects(t.read('/api/jobs',ctx));assert.equal(calls,1);address='8.8.8.8';on=false;await assert.rejects(t.read('/api/jobs',ctx));on=true;await assert.rejects(t.read('https://user:pass@example.com/api/jobs',ctx));await assert.rejects(t.read('/api/../private',ctx));await assert.rejects(t.read('/api/jobs?token=secret',ctx));
 const redirect=createSourceTransport({policy:{id:'s',origin:'https://example.com',readPaths:['/api/']},isEnabled:()=>true,resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1'}})});await assert.rejects(redirect.read('/api/jobs',ctx));
 for(const ip of ['0.0.0.0','10.0.0.1','100.64.0.1','127.1.2.3','169.254.169.254','172.16.0.1','192.168.1.1','224.0.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
});
test('transport bounds streamed body and rechecks OFF after an asynchronous DNS read',async()=>{
 let on=true,calls=0;const transport=createSourceTransport({policy:{id:'s',origin:'https://example.com',readPaths:['/'],maxBytes:4},isEnabled:()=>on,resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>new Response('12345')});await assert.rejects(transport.read('/',ctx));
 const race=createSourceTransport({policy:{id:'s',origin:'https://example.com',readPaths:['/']},isEnabled:()=>on,resolve:async()=>{on=false;return [{address:'8.8.8.8',family:4}];},request:async()=>{calls++;return Response.json({});}});await assert.rejects(race.read('/',ctx));assert.equal(calls,0);
});
test('format admission requires pinned certified runtime and rejects dangerous paths',async()=>{
 const files=[{path:'tests/test_config.py',content:'synthetic'}],runtime={profileId:'python',image:'sha256:'+'a'.repeat(64),isolated:true,network:'none',hostMounts:false,verified:true,evidenceRef:'synthetic-isolation'};
 assert.equal(selectWorkProfile({files,runtimes:[]}).blockers.length>0,true);const selected=selectWorkProfile({files,runtimes:[runtime]});assert.equal(selected.profileId,'python');assert.equal(selected.blockers.length,0);
 assert.throws(()=>selectWorkProfile({files:[{path:'../secret.py',content:'x'}],runtimes:[runtime]}));assert.throws(()=>selectWorkProfile({files:[{path:'.github/workflows/release.yml',content:'permissions: write-all'}],runtimes:[{...runtime,profileId:'workflow-metadata'}]}));
 const binding={...runtime,scopeDigest:'s',filesDigest:profileFilesDigest(files)};assert.equal(verifyWorkProfile({profileId:'python',binding,files,checks:{passed:true,independent:true,filesDigest:binding.filesDigest,image:runtime.image,scopeDigest:'s',evidenceRefs:['synthetic-test']}}).passed,true);assert.equal(verifyWorkProfile({profileId:'python',binding,files:[{...files[0],content:'changed'}],checks:{passed:true}}).passed,false);
});
test('native work never drops private criteria or treats unknown funding as assignment',()=>{
 const b={sourceId:'s',externalId:'1',ownerId:'own',assignmentConfirmed:true,scopeDigest:'exact',profileId:'structured-data',inputs:[{id:'x',privacy:'private'}],acceptanceCriteria:['all columns'],funding:{verified:true},dataUse:{privateProcessingAllowed:false}};
 assert.ok(normalizeNativeWork(b,{profiles:['structured-data']}).blockers.includes('private-data-use-not-authorized'));assert.equal(normalizeNativeWork({...b,dataUse:{privateProcessingAllowed:true}},{profiles:['structured-data']}).acceptanceCriteria[0],'all columns');assert.ok(normalizeNativeWork({...b,acceptanceCriteria:[]},{profiles:['structured-data']}).blockers.length);
});
test('follow-up distinguishes review requests, payment and an ambiguous prior write',()=>{
 const order={sourceId:'s',externalId:'1',ownerId:'own',rootTaskId:'root',state:'submitted',submissionDigest:'a'.repeat(64)};
 assert.equal(planOrderFollowup({order,evidence:{verified:true,sourceId:'s',externalId:'1',ownerId:'own',revision:'r',status:'changes-requested',evidenceRef:'review'}}).kind,'review-correction');assert.equal(planOrderFollowup({order:{...order,pendingWrite:true},evidence:{}}).kind,'reconcile-delivery');assert.equal(planOrderFollowup({order,evidence:{verified:true,sourceId:'other',externalId:'1',ownerId:'own',status:'accepted'}}).kind,'blocked');
});
test('adapter learning stays in root family, rejects host execution and cannot grant live rights',async()=>{
 const source={id:'s',capabilities:{read:{state:'blocked'}}},budget={active:true,rootRemainingRappen:250};const p=planAdapterWork({source,rootTaskId:'root',budget});assert.ok(p.tasks.every(x=>x.rootTaskId==='root'));assert.equal(p.tasks.some(x=>/install|activate|publish/.test(x.kind)),false);
 const files=[{path:'adapter.mjs',content:'export const version=1;'},{path:'adapter.test.mjs',content:'synthetic test'}];assert.equal((await certifyAdapterCandidate({sourceId:'s',files,sandbox:{available:false},assertActive(){}})).passed,false);
 const certified=await certifyAdapterCandidate({sourceId:'s',files,sandbox:{available:true,network:'none',hostMounts:false,image:'sha256:'+'a'.repeat(64),async run(){return {passed:true,tests:3,image:this.image,sourceDigest:profileFilesDigest(files),network:'none',hostMounts:false};}},assertActive(){}});assert.equal(certified.state,'offline-verified');assert.equal(certified.liveAuthorized,false);
});
test('personal context selects creator wallet, requires specific payout need and invents no address',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'identity-context-'));try{const config=path.join(dir,'config.json');fs.writeFileSync(config,JSON.stringify({creatorAddress:'0x'+'1'.repeat(40),walletAddress:'0x'+'2'.repeat(40)}));const identity=loadFounderIdentity({configFile:config,expectedRecipient:'0x'+'1'.repeat(40),known:{operatorName:'Fixture Operator',githubLogin:'fixture',residenceCountry:'CH',taxCountry:'CH'}});assert.equal(identity.postalAddress,null);assert.equal(submissionIdentity({identity,purpose:'application'}).payout,null);assert.equal(submissionIdentity({identity,purpose:'payout',requirement:{required:true,verified:true,network:'base',asset:'USDC',recipient:'github:fixture',evidenceRef:'trusted-payment-request'}}).payout.address,'0x'+'1'.repeat(40));assert.throws(()=>submissionIdentity({identity,purpose:'payout',requirement:{required:true,verified:true,network:'polygon',asset:'USDC',recipient:'github:fixture',evidenceRef:'request'}}));assert.equal(JSON.stringify(submissionIdentity({identity,purpose:'application'})).includes('0x'),false);assert.throws(()=>loadFounderIdentity({configFile:config,expectedRecipient:'0x'+'2'.repeat(40)}));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('adapter certification accepts the existing isolated backend exact digest, without granting live access',async()=>{
 const sandbox=createCodeSandbox({image:'sha256:'+'a'.repeat(64),process:async()=>({code:0,stdout:'# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n',stderr:''})});await sandbox.probe();const files=[{path:'adapter.mjs',content:'export const version=1;'},{path:'adapter.test.mjs',content:"import test from 'node:test';test('adapter',()=>{});"}];const result=await certifyAdapterCandidate({sourceId:'s',files,sandbox,assertActive(){}});assert.equal(result.passed,true);assert.equal(result.liveAuthorized,false);
});
