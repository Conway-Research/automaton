import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createDealworkCode} from './founder-dealwork-code.mjs';
import {codeDigest} from './founder-code-sandbox.mjs';
import {openFounderBudget} from './founder-budget.mjs';import {openFounderController} from './founder-controller.mjs';
const contractId='11111111-1111-4111-8111-111111111111',deliverableId='44444444-4444-4444-8444-444444444444';
function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'native-code-'));
 const files=[{path:'x.js',content:'old'},{path:'x.test.js',content:'test'}];
 const p={contractId,scopeDigest:'native-private-digest',job:{id:'job',title:'Public fix',description:'Implement public issue: https://github.com/owner/project/issues/1'},terms:{amountMinor:1000},funding:{escrowId:contractId}};
 const seen={model:0,runs:0,writes:[],reads:0};let state='escrow_locked',funded=true,lose=null,remote=[],base='a'.repeat(40),onSource=()=>{};
 const sourceRead=async endpoint=>{
  onSource(endpoint);
  if(endpoint==='/repos/owner/project')return {private:false,archived:false,full_name:'owner/project',default_branch:'main'};
  if(endpoint.endsWith('/issues/1'))return {number:1,html_url:'https://github.com/owner/project/issues/1',state:'open',title:'Public fix',body:'Fix x. AI-assisted contributions allowed',author_association:'OWNER',updated_at:'revision1'};
  if(endpoint.includes('/comments?'))return [];
  if(endpoint.includes('/commits/'))return {sha:base,commit:{tree:{sha:'b'.repeat(40)}}};
  if(endpoint.includes('/git/trees/'))return {truncated:false,tree:files.map((f,i)=>({path:f.path,type:'blob',mode:'100644',sha:String(i+1).repeat(40),size:f.content.length}))};
  if(endpoint.includes('/git/blobs/'))return {encoding:'base64',content:Buffer.from(endpoint.endsWith('1'.repeat(40))?'old':'test').toString('base64')};
  throw Error('Unexpected public source request '+endpoint);
 };
 const provider={adapter:{available:true},async listWork(){return [{contractId,state}];},async readWork(){return {...p,state};},async requireWork(binding){seen.reads++;if(!funded||binding.scopeDigest!==p.scopeDigest)throw Error('Funding or scope changed');return {...p,state};},async deliveries(){return structuredClone(remote);},async writeWork(binding,op){await this.requireWork(binding);seen.writes.push(op.type);if(op.type==='START_WORK')state='in_progress';if(op.type==='DELIVER')remote.push({id:deliverableId,description:op.description,outputData:structuredClone(op.outputData)});if(op.type==='SUBMIT_WORK')state='in_review';if(lose===op.type){lose=null;throw Error('Lost response');}return op.type==='DELIVER'?{id:deliverableId}:{};}};
 const sandbox={available:true,image:'sha256:'+'a'.repeat(64),async refresh(){},async run(f){seen.runs++;return {passed:!f.some(x=>x.content==='old')||!f.some(x=>x.path==='new.test.js'),tests:2,sourceDigest:codeDigest(f),log:'tests'};}};
 const code={available:true,maxCostRappen:50,retrySafe:true,async execute(ctx){seen.model++;const text=JSON.stringify(ctx);assert.ok(!text.includes('native-private-digest'));assert.ok(!text.includes('Private buyer'));assert.ok(!text.includes('amountMinor'));return {kind:'order-code',prepared:ctx.dependencies[0].prepared,analysis:{changes:[{path:'x.js',content:'new'},{path:'new.test.js',content:'regression'}]},sources:ctx.dependencies[0].sources,costReceipt:{actualCostRappen:10,evidenceRef:'fake-receipt'}};},verify:()=>true};
 const make=()=>createDealworkCode({directory,provider,github:{read:sourceRead,close(){}},sandbox,code});
 return {directory,provider,sandbox,seen,make,sourceRead,onSource:callback=>onSource=callback,binding:p,code,setLost:x=>lose=x,revoke:()=>funded=false,changeScope:()=>p.scopeDigest='changed',changeBase:()=>base='c'.repeat(40),remote,cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
const ctx=(dependencies=[],input={contractId})=>({task:{input},dependencies,assertActive(){}});
async function prepared(f,flow){return flow.adapters['dealwork-code-prepare'].execute(ctx());}
async function checked(f,flow){const p=await prepared(f,flow),c=await flow.adapters['dealwork-code'].execute(ctx([p]));return flow.adapters['dealwork-code-check'].execute(ctx([c]));}

test('native public code pipeline tests exact output and submits once without GitHub writes',async()=>{
 const f=fixture(),flow=f.make();try{const checkedResult=await checked(f,flow);assert.equal(checkedResult.validation.passed,true);assert.equal(f.seen.model,1);assert.equal(f.seen.runs,4);const r=await flow.adapters['dealwork-code-submit'].execute(ctx([checkedResult]));assert.equal(r.submission.submitted,true);assert.equal(r.submission.paymentConfirmed,false);assert.deepEqual(f.seen.writes,['START_WORK','DELIVER','SUBMIT_WORK']);assert.equal(f.remote[0].outputData.files['x.js'],'new');assert.ok(!Object.hasOwn(f.remote[0].outputData.files,'unverified'));await flow.adapters['dealwork-code-submit'].execute(ctx([checkedResult]));assert.equal(f.seen.writes.length,3);}finally{flow.close();f.cleanup();}
});
test('funding loss and scope changes prevent model and sandbox boundaries',async()=>{
 for(const revoke of ['revoke','changeScope']){const f=fixture(),flow=f.make();try{const p=await prepared(f,flow);f[revoke]();await assert.rejects(flow.adapters['dealwork-code'].execute(ctx([p])));assert.equal(f.seen.model,0);assert.equal(f.seen.runs,1);assert.equal(f.seen.writes.length,0);}finally{flow.close();f.cleanup();}}
});
test('every sandbox run refreshes funding; revocation between baseline and patch stops validation',async()=>{
 const f=fixture(),flow=f.make();try{const p=await prepared(f,flow),c=await flow.adapters['dealwork-code'].execute(ctx([p]));const run=f.sandbox.run;f.sandbox.run=async files=>{const r=await run(files);f.revoke();return r;};await assert.rejects(flow.adapters['dealwork-code-check'].execute(ctx([c])));assert.equal(f.seen.runs,2);assert.equal(f.seen.writes.length,0);}finally{flow.close();f.cleanup();}
});
test('changed public base prevents delivery after certification',async()=>{
 const f=fixture(),flow=f.make();try{const c=await checked(f,flow);f.changeBase();await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));assert.equal(f.seen.writes.length,0);}finally{flow.close();f.cleanup();}
});
for(const operation of ['START_WORK','DELIVER','SUBMIT_WORK'])test('lost '+operation+' response reconciles after reopen without duplicate POST',async()=>{
 const f=fixture();let flow=f.make();try{const c=await checked(f,flow);f.setLost(operation);await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));flow.close();flow=f.make();const r=await flow.adapters['dealwork-code-submit'].execute(ctx([c]));assert.equal(r.submission.submitted,true);assert.deepEqual(f.seen.writes,['START_WORK','DELIVER','SUBMIT_WORK']);}finally{flow.close();f.cleanup();}
});
test('ambiguous delivery content blocks reconciliation instead of repeating a POST',async()=>{
 const f=fixture();let flow=f.make();try{const c=await checked(f,flow);f.setLost('DELIVER');await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));f.remote.push(structuredClone(f.remote[0]));flow.close();flow=f.make();await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));assert.deepEqual(f.seen.writes,['START_WORK','DELIVER']);}finally{flow.close();f.cleanup();}
});
test('controller shares stable contract root, receipts and limits; reopened workflow never resubmits',async()=>{
 const f=fixture();let flow=f.make();const budget=openFounderBudget(path.join(f.directory,'budget.db'));budget.activate({startAt:Date.now(),authorizationRef:'isolated-test'});let controller=openFounderController({file:path.join(f.directory,'controller.db'),budget,adapters:flow.adapters});controller.control('start');
 try{await flow.refresh();for(let i=0;i<8;i++){flow.advance(controller);await controller.tick();}assert.equal(f.seen.model,1);assert.equal(f.seen.writes.length,3);assert.equal(budget.snapshot().spentRappen,10);assert.ok(controller.planningHistory().every(t=>t.rootTaskId==='dealwork-'+contractId));await controller.close();flow.close();flow=f.make();controller=openFounderController({file:path.join(f.directory,'controller.db'),budget,adapters:flow.adapters});await flow.refresh();for(let i=0;i<4;i++){flow.advance(controller);await controller.tick();}assert.equal(f.seen.writes.length,3);}finally{await controller.close();flow.close();budget.close();f.cleanup();}
});
test('OFF refresh never reads provider, source or sandbox',async()=>{const f=fixture(),flow=f.make();let reads=0;f.provider.listWork=async()=>{reads++;return [];};f.sandbox.refresh=async()=>{reads++;};try{await flow.refresh({isEnabled:()=>false});assert.equal(reads,0);}finally{flow.close();f.cleanup();}});

test('private extra instructions and an ambiguous native reference are blocked before AI or sandbox',async()=>{
 for(const mutate of [p=>p.job.description+=' and use private instructions',p=>p.job.instructions='Private requirement',p=>p.job.description='https://github.com/owner/project/issues/1 https://github.com/owner/project/issues/2']){
  const f=fixture(),flow=f.make();try{mutate(f.binding);await assert.rejects(prepared(f,flow));assert.equal(f.seen.runs,0);assert.equal(f.seen.model,0);}finally{flow.close();f.cleanup();}
 }
});
test('empty native discovery is a normal waiting state with no task or delivery',async()=>{
 const f=fixture(),flow=f.make();f.provider.listWork=async()=>[];let enqueued=0;
 try{await flow.refresh();flow.advance({snapshot:()=>({status:'running',budget:{active:true}}),planningHistory:()=>[],enqueue(){enqueued++;}});assert.equal(enqueued,0);assert.equal(flow.status().authenticatedRead,'verified');assert.equal(flow.status().ownWorkContracts,0);assert.equal(f.seen.writes.length,0);}finally{flow.close();f.cleanup();}
});
test('unknown delivery with no matching remote record stays blocked after reopen and never repeats POST',async()=>{
 const f=fixture();let flow=f.make();try{const c=await checked(f,flow);f.setLost('DELIVER');await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));f.remote.length=0;flow.close();flow=f.make();await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));assert.deepEqual(f.seen.writes,['START_WORK','DELIVER']);}finally{flow.close();f.cleanup();}
});
test('existing native deliverables stop a fresh initial delivery',async()=>{
 const f=fixture(),flow=f.make();try{const c=await checked(f,flow);f.remote.push({id:deliverableId,description:'Other work',outputData:{}});await assert.rejects(flow.adapters['dealwork-code-submit'].execute(ctx([c])));assert.deepEqual(f.seen.writes,['START_WORK']);}finally{flow.close();f.cleanup();}
});
test('native code shares the existing CHF2.50 family limit before a paid model call',async()=>{
 const f=fixture(),flow=f.make(),budget=openFounderBudget(path.join(f.directory,'budget.db'));budget.activate({startAt:Date.now(),authorizationRef:'isolated-budget'});
 const root='dealwork-'+contractId;budget.reserve({id:'prior-family-cost',rootTaskId:root,maxCostRappen:230});budget.settle({id:'prior-family-cost',actualCostRappen:230,evidenceRef:'fake-prior-receipt'});
 const controller=openFounderController({file:path.join(f.directory,'controller.db'),budget,adapters:flow.adapters});controller.control('start');
 try{await flow.refresh();for(let i=0;i<4;i++){flow.advance(controller);await controller.tick();}assert.equal(f.seen.model,0);assert.equal(f.seen.writes.length,0);assert.equal(budget.snapshot().spentRappen,230);assert.ok(controller.planningHistory().some(t=>t.kind==='dealwork-code'&&t.status==='blocked'));}finally{await controller.close();flow.close();budget.close();f.cleanup();}
});

test('funding revoked during public source revalidation prevents model dispatch',async()=>{
 const f=fixture(),flow=f.make();try{const p=await prepared(f,flow);f.onSource(endpoint=>{if(endpoint.includes('/git/blobs/'))f.revoke();});await assert.rejects(flow.adapters['dealwork-code'].execute(ctx([p])));assert.equal(f.seen.model,0);}finally{flow.close();f.cleanup();}
});
test('funding revoked during public source revalidation prevents the next sandbox run',async()=>{
 const f=fixture(),flow=f.make();try{const p=await prepared(f,flow),r=await flow.adapters['dealwork-code'].execute(ctx([p]));f.onSource(endpoint=>{if(endpoint.includes('/git/blobs/'))f.revoke();});await assert.rejects(flow.adapters['dealwork-code-check'].execute(ctx([r])));assert.equal(f.seen.runs,1);}finally{flow.close();f.cleanup();}
});
test('changed base schedules fresh preparation and verification under the same bounded budget root',async()=>{
 const f=fixture(),flow=f.make(),budget=openFounderBudget(path.join(f.directory,'budget.db'));budget.activate({startAt:Date.now(),authorizationRef:'isolated-test'});
 const controller=openFounderController({file:path.join(f.directory,'controller.db'),budget,adapters:flow.adapters});controller.control('start');
 try{await flow.refresh();flow.advance(controller);await controller.tick();f.changeBase();for(let i=0;i<10;i++){flow.advance(controller);await controller.tick();}const tasks=controller.planningHistory();assert.ok(tasks.some(t=>t.kind==='dealwork-code-prepare'&&t.input.version===2&&t.status==='done'));assert.equal(f.seen.model,1);assert.deepEqual(f.seen.writes,['START_WORK','DELIVER','SUBMIT_WORK']);assert.ok(tasks.every(t=>t.rootTaskId==='dealwork-'+contractId));}finally{await controller.close();flow.close();budget.close();f.cleanup();}
});
