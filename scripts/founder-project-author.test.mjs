import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {openProjectAuthor} from './founder-project-author.mjs';
import {profileFilesDigest} from './founder-work-profiles.mjs';
import {digest} from './founder-restoration-integrity.mjs';

const image='sha256:'+'a'.repeat(64);
const scope={id:'offline-ledger',profileId:'python',privacy:'synthetic',requirements:[{id:'R1',text:'Implement sum_amounts for a collection of integer amounts; negative amounts must be included.'}],deliverables:['ledger.py','README.md']};
const acceptance=[{path:'tests/test_acceptance.py',content:'independent immutable assertions'}];
const design={summary:'Implement a dependency-free integer ledger and usage guide',components:[{path:'ledger.py',purpose:'sum integer amounts'},{path:'README.md',purpose:'usage and limits'}],coverage:{R1:['ledger.py']}};

test('new execution-aware local request preserves actual check exit status and immutable runtime binding',async()=>{
 const all=[];
 for(const diagnostics of ['syntax-aware-v2','execution-aware-v3']){
  const seen=[],s=fixture({authorOptions:{repairDiagnosticsPolicy:diagnostics},sandboxOverride:{checks:[{id:'silent',passed:false,exitCode:0,feedback:{expected:{ok:true},actual:null,rawOutput:''}}]},modelOverride:{origin:'local-model',binding:{verified:true,network:'none',hostMounts:false,image,modelDigest:'b'.repeat(64)},async verifyReceipt(){return true;},async infer(r){seen.push(r);if(r.phase==='repair')throw Error('synthetic stop');return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return 0\n'},{path:'README.md',content:'Usage'}]}};}}});
  try{await s.author.run(scope,acceptance);const request=seen.find(r=>r.phase==='repair');assert(request);assert.equal(request.repairDiagnosticsPolicy,diagnostics);assert.equal(request.feedback.examples[0].feedback.rawOutput,'');assert.equal(request.feedback.examples[0].exitCode,diagnostics==='execution-aware-v3'?0:undefined);all.push(request);}finally{s.close();}
 }
 assert.equal(all[0].modelBindingDigest,all[1].modelBindingDigest);assert.notEqual(all[0].requestId,all[1].requestId);
});
function fixture({failures=1,modelOverride,sandboxOverride,rounds=3,authorOptions={}}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'project-author-'));
 let requests=[],runs=0;
 const model={available:true,origin:'fixture',binding:{modelDigest:'b'.repeat(64)},async infer(request){requests.push(request);return {requestId:request.requestId,inputDigest:request.inputDigest,output:request.phase==='design'?{design}:{files:[{path:'ledger.py',content:request.phase==='implement'?'def sum_amounts(rows): return 0\n':'def sum_amounts(rows): return sum(rows)\n'},{path:'README.md',content:'Use sum_amounts with integer values. No external services or dependencies.'}]}};},...modelOverride};
 const sandbox={available:true,image,certification:{profileId:'python',verified:true,isolated:true,network:'none',hostMounts:false,image,evidenceRef:'fixture:probe'},filesDigest:profileFilesDigest,async run(files){return {passed:true,tests:1,exitCode:0,sourceDigest:profileFilesDigest(files),image,network:'none',hostMounts:false,log:'fixture immutable acceptance passed'};}};
 const verifier={kind:'fixture',image,entrypoint:'ledger.py',oracleDigest:digest('fixture-host-oracle'),acceptanceDigest:digest(acceptance),async verify({files}){runs++;const passed=runs>failures;return {passed,tests:3,exitCode:passed?0:1,sourceDigest:profileFilesDigest(files),image,network:'none',hostMounts:false,oracleDigest:verifier.oracleDigest,acceptanceDigest:verifier.acceptanceDigest,log:passed?'all assertions passed':'AssertionError: expected 7, actual 0',...sandboxOverride};}};
 const options={directory,model,sandbox,verifier,allowTestModel:true,maxRounds:rounds,...authorOptions};
 const author=openProjectAuthor(options);
 return {author,model,sandbox,verifier,options,directory,requests:()=>requests,runs:()=>runs,close(){author.close();assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});}};
}

test('explicit repair context options affect only new local repair requests and their request identity',async()=>{
 const local={origin:'local-model',binding:{image,modelDigest:'b'.repeat(64),network:'none',hostMounts:false,verified:true},repairEditProtocol:'inspection-anchors-v1',async verifyReceipt(){return true;}},old=fixture({modelOverride:local}),modern=fixture({modelOverride:local,authorOptions:{repairAnchorPolicy:'unique-lines-v1',repairDiagnosticsPolicy:'syntax-aware-v2'}});
 try{for(const s of [old,modern])for(let i=0;i<4;i++)await s.author.step(scope,acceptance);const a=old.requests(),b=modern.requests();assert.deepEqual(a.slice(0,2),b.slice(0,2));assert.equal(a[2].repairAnchorPolicy,undefined);assert.equal(a[2].repairDiagnosticsPolicy,undefined);assert.equal(b[2].repairAnchorPolicy,'unique-lines-v1');assert.equal(b[2].repairDiagnosticsPolicy,'syntax-aware-v2');assert.equal(a[2].modelBindingDigest,b[2].modelBindingDigest);assert.notEqual(a[2].requestId,b[2].requestId);assert.equal(modern.author.snapshot(scope.id).autonomousGenerationProven,false);}finally{old.close();modern.close();}
});

test('missing real offline model blocks before inference or sandbox execution',async()=>{
 const s=fixture();try{const a=openProjectAuthor({...s.options,model:null,allowTestModel:false});try{const r=await a.run(scope,acceptance);assert.equal(r.status,'blocked');assert.equal(r.blocker,'offline-model-required');assert.equal(r.autonomousGenerationProven,false);assert.equal(s.runs(),0);}finally{a.close();}}finally{s.close();}
});
test('requirements alone drive design, code, actual failure feedback, repair and package',async()=>{
 const s=fixture();try{const result=await s.author.run(scope,acceptance);assert.equal(result.status,'packaged');assert.equal(result.proofLevel,'fixture-controller-only');assert.equal(result.autonomousGenerationProven,false);assert.deepEqual(s.requests().map(r=>r.phase),['design','implement','repair']);assert(!s.requests()[0].files);assert.match(s.requests()[2].feedback.log,/expected 7/);assert.equal(s.requests()[2].files.find(f=>f.path==='ledger.py').content,'def sum_amounts(rows): return 0\n');assert.equal(result.files.find(f=>f.path===acceptance[0].path).content,acceptance[0].content);assert.equal(result.filesDigest,profileFilesDigest(result.files));const pkg=s.author.delivery(scope.id);assert.equal(pkg.bytes.readUInt32LE(),0x04034b50);assert.equal(pkg.filesDigest,result.filesDigest);}finally{s.close();}
});
test('a scripted model is refused unless explicit test composition permits it',async()=>{
 const s=fixture();try{const a=openProjectAuthor({...s.options,allowTestModel:false});try{const r=await a.run(scope,acceptance);assert.equal(r.status,'blocked');assert.equal(s.requests().length,0);}finally{a.close();}}finally{s.close();}
});
test('acceptance paths cannot be generated or overwritten',async()=>{
 const s=fixture({modelOverride:{async infer(r){return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design}:{files:[...acceptance,{path:'ledger.py',content:'pass'},{path:'README.md',content:'guide'}]}};}}});try{await assert.rejects(s.author.run(scope,acceptance),/acceptance|protected/i);assert.equal(s.runs(),0);}finally{s.close();}
});
test('design must cover every requirement and deliverable before generation',async()=>{
 const s=fixture({modelOverride:{async infer(r){return {requestId:r.requestId,inputDigest:r.inputDigest,output:{design:{...design,coverage:{}}}};}}});try{const r=await s.author.run(scope,acceptance);assert.equal(r.status,'exhausted');assert.equal(r.planAttempts,3);assert.equal(s.runs(),0);}finally{s.close();}
});
test('source and interpreter mismatches cannot turn green into verified evidence',async()=>{
 for(const override of [{sourceDigest:'0'.repeat(64)},{image:'sha256:'+'f'.repeat(64)},{network:'host'},{tests:0}]){const s=fixture({failures:0,sandboxOverride:override});try{await assert.rejects(s.author.run(scope,acceptance),/evidence/);assert.throws(()=>s.author.delivery(scope.id),/verified|packaged/);}finally{s.close();}}
});
test('maximum repair rounds stop without producing a successful package',async()=>{
 const s=fixture({failures:100,rounds:2});try{const r=await s.author.run(scope,acceptance);assert.equal(r.status,'exhausted');assert.equal(s.runs(),2);assert.equal(s.requests().length,3);assert.throws(()=>s.author.delivery(scope.id));}finally{s.close();}
});

test('explicit bounded repair continuation preserves failed history and immutable project contract',async()=>{
 const s=fixture({failures:2,rounds:2});try{
  const stopped=await s.author.run(scope,acceptance);assert.equal(stopped.status,'exhausted');
  const before=digest(stopped.files),contract=stopped.acceptanceDigest,scopeHash=stopped.scopeDigest;
  assert.throws(()=>s.author.extendRepairBudget(scope.id,{additionalRounds:40,reason:'Too many'}),/bounded|budget/i);
  const resumed=s.author.extendRepairBudget(scope.id,{additionalRounds:2,reason:'Continue authorized offline repair without changing acceptance'});
  assert.equal(resumed.status,'repairing');assert.equal(resumed.round,2);assert.equal(resumed.repairBudget.limit,4);
  assert.equal(digest(resumed.files),before);assert.equal(resumed.acceptanceDigest,contract);assert.equal(resumed.scopeDigest,scopeHash);
  assert(s.author.trace(scope.id).some(e=>e.kind==='repair-budget-extended'));
  const result=await s.author.run(scope,acceptance);assert.equal(result.status,'packaged');assert.equal(result.autonomousGenerationProven,false);
  assert.throws(()=>s.author.extendRepairBudget(scope.id,{additionalRounds:1,reason:'Already complete'}),/exhausted|checkpoint/i);
 }finally{s.close();}
});
test('versioned diagnostic refresh reruns the same candidate without resetting its repair history',async()=>{
 const s=fixture({failures:5,rounds:3});try{
  await s.author.step(scope,acceptance);await s.author.step(scope,acceptance);const failed=await s.author.step(scope,acceptance);assert.equal(failed.status,'repairing');const filesHash=digest(failed.files),receiptHash=digest(failed.modelReceipts);
  const next=s.author.refreshDiagnostics(scope.id,{policyVersion:'synthetic-arguments-v1'});assert.equal(next.status,'testing');assert.equal(next.round,failed.round);assert.equal(digest(next.files),filesHash);assert.equal(digest(next.modelReceipts),receiptHash);assert.equal(next.acceptanceDigest,failed.acceptanceDigest);assert.equal(next.scopeDigest,failed.scopeDigest);assert.equal(next.diagnosticsHistory.at(-1).previousVerificationDigest,digest(failed.verification));
  assert.equal(s.author.refreshDiagnostics(scope.id,{policyVersion:'synthetic-arguments-v1'}).version,next.version);
  const tested=await s.author.step(scope,acceptance);assert.equal(tested.status,'repairing');assert.equal(tested.round,failed.round);assert.equal(s.runs(),2);assert.equal(s.author.refreshDiagnostics(scope.id,{policyVersion:'synthetic-arguments-v1'}).version,tested.version);
  assert(s.author.trace(scope.id).some(e=>e.kind==='diagnostics-refresh-requested'));
 }finally{s.close();}
});
test('diagnostic refresh refuses pending inference and completed delivery',async()=>{
 const pending=fixture({modelOverride:{async infer(){throw Error('unknown result');}}});try{await pending.author.run(scope,acceptance);assert.throws(()=>pending.author.refreshDiagnostics(scope.id,{policyVersion:'synthetic-arguments-v1'}),/checkpoint|pending/i);}finally{pending.close();}
 const done=fixture({failures:0});try{await done.author.run(scope,acceptance);assert.throws(()=>done.author.refreshDiagnostics(scope.id,{policyVersion:'synthetic-arguments-v1'}),/checkpoint|completed/i);}finally{done.close();}
});
test('rejected hypothesis history survives repeated no-effect repairs and retains exact request/source bindings',async()=>{
 const s=fixture({failures:100,rounds:6,modelOverride:{async infer(r){this.seen??=[];this.seen.push(r);return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design}:r.phase==='repair'?{files:[],modelOutputError:{kind:'PATCH_NOT_APPLICABLE',message:'Model patch made no source change'}}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return 0\n'},{path:'README.md',content:'Usage'}]}};},async rejectedEditContext(answer,r){return {requestId:r.requestId,path:'ledger.py',symbols:['sum_amounts'],reason:'This unchanged helper did not fix the failure',outcome:'NO_EFFECT',fileDigest:profileFilesDigest([r.files.find(f=>f.path==='ledger.py')])};}}});try{
  const result=await s.author.run(scope,acceptance),repairs=s.model.seen.filter(r=>r.phase==='repair');assert.equal(result.status,'exhausted');assert.equal(repairs.length,5);assert.equal(repairs[1].feedback.rejectedEdits[0].requestId,repairs[0].requestId);assert.equal(result.feedback.rejectedEdits.length,4);assert.deepEqual(result.feedback.rejectedEdits.map(e=>e.requestId),repairs.slice(-4).map(r=>r.requestId));assert.equal(result.files.find(f=>f.path==='ledger.py').content,'def sum_amounts(rows): return 0\n');assert.equal(result.autonomousGenerationProven,false);
 }finally{s.close();}
});
test('uncertain inference survives restart and is never automatically resent',async()=>{
 let calls=0;const s=fixture({modelOverride:{async infer(){calls++;throw Error('synthetic interruption');}}});try{const first=await s.author.run(scope,acceptance);assert.equal(first.status,'awaiting-model-reconciliation');s.author.close();const reopened=openProjectAuthor(s.options);try{const second=await reopened.run(scope,acceptance);assert.equal(second.status,'awaiting-model-reconciliation');assert.equal(calls,1);}finally{reopened.close();}}finally{s.close();}
});
test('scope changes and unsafe generated paths are rejected',async()=>{
 const s=fixture();try{await s.author.run(scope,acceptance);await assert.rejects(s.author.run({...scope,requirements:[{id:'R1',text:'Different requirement'}]},acceptance),/scope/);}finally{s.close();}
 const bad=fixture({modelOverride:{async infer(r){return {requestId:r.requestId,inputDigest:r.inputDigest,output:{design:{...design,components:[{path:'../escape.py',purpose:'bad'}]}}};}}});try{const rejected=await bad.author.run(scope,acceptance);assert.equal(rejected.status,'exhausted');assert.equal(rejected.planAttempts,3);assert.match(rejected.designFeedback.log,/path|design|deliverable/);assert.deepEqual(rejected.ownFiles,[]);assert.equal(bad.runs(),0);}finally{bad.close();}
});
test('abort prevents model/sandbox calls and resumed verified state does no new work',async()=>{
 const s=fixture();try{const controller=new AbortController();controller.abort();await assert.rejects(s.author.run(scope,acceptance,{signal:controller.signal}),/abort/i);assert.equal(s.requests().length,0);await s.author.run(scope,acceptance);const count=s.requests().length;await s.author.run(scope,acceptance);assert.equal(s.requests().length,count);}finally{s.close();}
});
test('a hung inference is bounded and is not resent after timeout',async()=>{
 let calls=0;const s=fixture({modelOverride:{async infer(){calls++;return new Promise(()=>{});}}});
 const a=openProjectAuthor({...s.options,inferenceTimeoutMs:15});try{const r=await a.run(scope,acceptance);assert.equal(r.status,'awaiting-model-reconciliation');await a.run(scope,acceptance);assert.equal(calls,1);}finally{a.close();s.close();}
});
test('pending inference can be reconciled without repeating generation',async()=>{
 let calls=0;const s=fixture({modelOverride:{async infer(){calls++;throw Error('interruption');}}});try{await s.author.run(scope,acceptance);s.model.reconcile=async r=>({requestId:r.requestId,inputDigest:r.inputDigest,output:{design}});const resumed=await s.author.step(scope,acceptance);assert.equal(resumed.status,'designed');assert.equal(calls,1);}finally{s.close();}
});
test('a model change is rejected before dispatching another generation request',async()=>{
 const s=fixture();try{await s.author.step(scope,acceptance);s.model.binding.modelDigest='c'.repeat(64);await assert.rejects(s.author.step(scope,acceptance),/binding changed/);assert.equal(s.requests().length,1);}finally{s.close();}
});
test('a claimed local model without independent receipt verifier remains blocked',async()=>{
 const s=fixture({modelOverride:{origin:'local-model',binding:{image,network:'none',hostMounts:false,verified:true,modelDigest:'b'.repeat(64)}}});try{const r=await s.author.run(scope,acceptance);assert.equal(r.status,'blocked');assert.equal(r.autonomousGenerationProven,false);assert.equal(s.requests().length,0);}finally{s.close();}
});
test('reopening with another oracle or entrypoint is rejected before another call',async()=>{
 const s=fixture();try{await s.author.step(scope,acceptance);const calls=s.requests().length;for(const change of [{oracleDigest:'f'.repeat(64)},{entrypoint:'other.py'}]){const reopened=openProjectAuthor({...s.options,verifier:{...s.verifier,...change}});try{await assert.rejects(reopened.run(scope,acceptance),/verifier.*changed/i);assert.throws(()=>reopened.delivery(scope.id),/verifier|verified|packaged/i);}finally{reopened.close();}}assert.equal(s.requests().length,calls);}finally{s.close();}
});
test('green oracle cannot override a contradictory immutable acceptance suite',async()=>{
 const s=fixture({failures:0,rounds:1});s.sandbox.run=async files=>({passed:false,tests:1,exitCode:1,sourceDigest:profileFilesDigest(files),image,network:'none',hostMounts:false,log:'original acceptance contradicts oracle'});try{const r=await s.author.run(scope,acceptance);assert.equal(r.status,'exhausted');assert.equal(r.verification.passed,false);assert.throws(()=>s.author.delivery(scope.id));}finally{s.close();}
});
test('first ambiguous inference binds its model before response and rejects replacement',async()=>{
 const s=fixture({modelOverride:{async infer(){throw Error('first request outcome unknown');}}});try{await s.author.run(scope,acceptance);let reconciled=0;const replacement={...s.model,binding:{modelDigest:'d'.repeat(64)},reconcile:async()=>{reconciled++;}};const reopened=openProjectAuthor({...s.options,model:replacement});try{await assert.rejects(reopened.run(scope,acceptance),/binding changed/);assert.equal(reconciled,0);}finally{reopened.close();}}finally{s.close();}
});
test('an incompatible acceptance profile fails before any generation request',async()=>{
 const s=fixture();try{await assert.rejects(s.author.run({...scope,profileId:'node-js'},acceptance),/acceptance.*profile/i);assert.equal(s.requests().length,0);}finally{s.close();}
});

test('missing deliverable feeds actual contract failure into bounded autonomous replanning',async()=>{const requests=[];const s=fixture({failures:0,modelOverride:{async infer(r){requests.push(r);return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design:r.planAttempt?design:{...design,components:design.components.filter(c=>c.path!=='README.md')}}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return sum(rows)\n'},{path:'README.md',content:'Usage guide'}]}};}}});try{const first=await s.author.step(scope,acceptance);assert.equal(first.status,'replanning');assert(first.designFeedback.log.includes('README.md'));assert.equal(s.runs(),0);const result=await s.author.run(scope,acceptance);assert.equal(result.status,'packaged');assert.deepEqual(requests.map(r=>r.phase),['design','design','implement']);assert.equal(requests[1].planAttempt,1);assert.notEqual(requests[0].requestId,requests[1].requestId);assert(result.modelReceipts.length===3);}finally{s.close();}});

test('duplicate, protected and unsafe model design paths are rejected into bounded replanning without weakening validation',async()=>{
 for(const path of ['ledger.py',acceptance[0].path,'../escape.py']){
  const requests=[],invalid={...design,components:[...design.components,{path,purpose:'Invalid additional component'}]},s=fixture({failures:0,modelOverride:{async infer(r){requests.push(r);return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design:r.planAttempt?design:invalid}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return sum(rows)\n'},{path:'README.md',content:'Usage guide'}]}};}}});
  try{const first=await s.author.step(scope,acceptance);assert.equal(first.status,'replanning');assert.equal(first.planAttempts,1);assert.equal(first.pendingInference,null);assert.match(first.designFeedback.log,/Safe unique design path/);assert.deepEqual(first.ownFiles,[]);assert.equal(s.runs(),0);const result=await s.author.run(scope,acceptance);assert.equal(result.status,'packaged');assert.deepEqual(requests.map(r=>r.phase),['design','design','implement']);assert.deepEqual(requests[1].rejectedDesign,invalid);assert.notEqual(requests[0].requestId,requests[1].requestId);assert.deepEqual(result.acceptance,acceptance);}finally{s.close();}
 }
});
test('repeated unsafe designs exhaust the same three-attempt planning budget without executing code',async()=>{const invalid={...design,components:[...design.components,{path:acceptance[0].path,purpose:'Protected path'}]},s=fixture({modelOverride:{async infer(r){return {requestId:r.requestId,inputDigest:r.inputDigest,output:{design:invalid}};}}});try{const result=await s.author.run(scope,acceptance);assert.equal(result.status,'exhausted');assert.equal(result.planAttempts,3);assert.equal(s.runs(),0);assert.deepEqual(result.ownFiles,[]);}finally{s.close();}});

test('a verifier can only be strengthened between calls, retaining the original immutable scope',async()=>{
 const s=fixture();try{
  await s.author.step(scope,acceptance);await s.author.step(scope,acceptance);
  const before=s.author.snapshot(scope.id);assert.equal(before.status,'testing');
  const next={...s.verifier,kind:'strengthened-fixture',oracleDigest:digest('strict-extra-check'),strengthensOracleDigest:s.verifier.oracleDigest};
  assert.throws(()=>s.author.strengthenVerifier(scope.id,{...next,entrypoint:'other.py'}),/strengthen/i);
  const after=s.author.strengthenVerifier(scope.id,next);assert.equal(after.status,'testing');assert.equal(after.scopeDigest,before.scopeDigest);assert.equal(after.modelReceipts.length,before.modelReceipts.length);assert.equal(after.verifierHistory[0].oracleDigest,before.verifierContract.oracleDigest);assert.notEqual(after.verifierBindingDigest,before.verifierBindingDigest);
 }finally{s.close();}
});

test('inapplicable model patches produce bounded repair feedback without changing source',async()=>{
 const s=fixture({failures:100,rounds:3});try{
  await s.author.step(scope,acceptance);await s.author.step(scope,acceptance);await s.author.step(scope,acceptance);
  const before=s.author.snapshot(scope.id);s.model.infer=async r=>({requestId:r.requestId,inputDigest:r.inputDigest,output:{files:[],modelOutputError:{kind:'PATCH_NOT_APPLICABLE',message:'missing unique text'}}});
  const result=await s.author.step(scope,acceptance);assert.equal(result.status,'repairing');assert.deepEqual(result.ownFiles,before.ownFiles);assert.equal(result.round,before.round+1);assert.match(result.feedback.log,/missing unique text/);
 }finally{s.close();}
});

test('repair feedback retains both actual suite errors and independent oracle failures',async()=>{
 const s=fixture({failures:100,sandboxOverride:{log:'oracle tail '+'.'.repeat(10000)+' final oracle failure'}});try{
  const old=s.sandbox.run;s.sandbox.run=async files=>({...await old(files),passed:false,exitCode:1,log:'Traceback: actual generated unittest import failure'});
  await s.author.step(scope,acceptance);await s.author.step(scope,acceptance);const state=await s.author.step(scope,acceptance);assert.match(state.feedback.log,/actual generated unittest import failure/);assert.match(state.feedback.log,/final oracle failure/);
 }finally{s.close();}
});

test('new local repairs request selected source only and preserve inspection errors for reselection',async()=>{
 const seen=[],s=fixture({modelOverride:{origin:'local-model',binding:{verified:true,network:'none',hostMounts:false,image,modelDigest:'b'.repeat(64)},async verifyReceipt(){return true;},async infer(r){seen.push(r);if(r.phase==='repair')throw Error('synthetic stop before repair generation');return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return 0\n'},{path:'README.md',content:'Usage'}]}};}}});try{const result=await s.author.run(scope,acceptance),repair=seen.find(r=>r.phase==='repair');assert.equal(result.status,'awaiting-model-reconciliation');assert.equal(repair.repairInspection,'selected-source-only-v1');assert.equal(repair.repairTools,'contextual-v1');assert.equal(repair.privacy,'synthetic');}finally{s.close();}
});

test('actual source-size rejection narrows the next local read to one model-selected symbol',async()=>{const seen=[],s=fixture({modelOverride:{origin:'local-model',binding:{verified:true,network:'none',hostMounts:false,image,modelDigest:'b'.repeat(64)},async verifyReceipt(){return true;},async infer(r){seen.push(r);if(r.phase==='repair'){if(seen.filter(x=>x.phase==='repair').length===1)return {requestId:r.requestId,inputDigest:r.inputDigest,output:{files:[],modelOutputError:{kind:'PATCH_NOT_APPLICABLE',message:'Source inspection needs a smaller or valid selection: Selected source exceeds 6000 characters; choose a smaller function or a <=80 line window'}}};throw Error('synthetic stop after next read contract');}return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return 0\n'},{path:'README.md',content:'Usage'}]}};}}});try{const result=await s.author.run(scope,acceptance),repairs=seen.filter(r=>r.phase==='repair');assert.equal(result.status,'awaiting-model-reconciliation');assert.equal(repairs.length,2);assert.equal(repairs[0].repairSourceSymbolLimit,undefined);assert.equal(repairs[1].repairSourceSymbolLimit,1);assert.equal(repairs[1].repairInspection,'selected-source-only-v1');}finally{s.close();}});

test('only new local repair prompts receive bound historical errors without rewriting stored hypotheses',async()=>{const seen=[],reads=[],s=fixture({modelOverride:{origin:'local-model',binding:{verified:true,network:'none',hostMounts:false,image,modelDigest:'b'.repeat(64)},async verifyReceipt(){return true;},async rejectedEditContext(answer,r){return {requestId:r.requestId,path:'ledger.py',fileDigest:profileFilesDigest([r.files.find(f=>f.path==='ledger.py')]),symbols:['sum_amounts'],reason:'Original hypothesis',outcome:'NOT_APPLICABLE'};},async rejectionEvidence(history,files,scope){reads.push({history,files,scope});return history.map(e=>({...e,error:{kind:'PATCH_NOT_APPLICABLE',message:'Bound historical ambiguity'}}));},async infer(r){seen.push(r);if(r.phase==='repair'){if(seen.filter(x=>x.phase==='repair').length===1)return {requestId:r.requestId,inputDigest:r.inputDigest,output:{files:[],modelOutputError:{kind:'PATCH_NOT_APPLICABLE',message:'Old text matches multiple locations'}}};throw Error('synthetic stop after rich prompt');}return {requestId:r.requestId,inputDigest:r.inputDigest,output:r.phase==='design'?{design}:{files:[{path:'ledger.py',content:'def sum_amounts(rows): return 0\n'},{path:'README.md',content:'Usage'}]}};}}});try{const result=await s.author.run(scope,acceptance),repairs=seen.filter(r=>r.phase==='repair');assert.equal(result.status,'awaiting-model-reconciliation');assert.equal(reads.length,1);assert.equal(reads[0].scope.projectId,scope.id);assert.equal(reads[0].scope.scopeDigest,repairs[1].scopeDigest);assert.equal(repairs[1].feedback.rejectedEdits[0].error.message,'Bound historical ambiguity');assert.equal(s.author.snapshot(scope.id).feedback.rejectedEdits[0].error,undefined);}finally{s.close();}});
