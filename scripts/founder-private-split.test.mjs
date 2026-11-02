import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {splitPrivateTask,createSplitPrivateAdapters,appendPrivateLessons} from './founder-private-split.mjs';
import {openFounderController} from './founder-controller.mjs';import {openFounderBudget} from './founder-budget.mjs';
import Database from 'better-sqlite3';
// Synthetic provider responses use the reviewed pricing interval; production expiry stays unchanged.
const reviewedPricingNow=()=>Date.parse('2026-10-18T00:01:00Z');
const task={id:'large',rootTaskId:'original-root',kind:'private-draft',input:{title:'Eine vollständige Arbeitsvorlage erstellen'},dependencies:['source'],resources:[]};
test('three bounded paid parts share the original root, stable ids and sequential dependencies',()=>{
 const p=splitPrivateTask(task);assert.deepEqual(p,splitPrivateTask(task));assert.equal(p.parts.length,3);
 for(const part of p.parts)assert.equal(part.rootTaskId,task.rootTaskId);
 assert.deepEqual(p.parts[1].dependencies,['source',p.parts[0].id]);assert.deepEqual(p.parts[2].dependencies,['source',p.parts[0].id,p.parts[1].id]);
 assert.deepEqual(p.parent.dependencies,p.parts.map(p=>p.id));assert.equal(p.parent.kind,task.kind);
 assert.ok(splitPrivateTask({...task,input:{...task.input,notBefore:Date.now()+60000}}).parts.every(t=>t.input.notBefore>Date.now()));
});
test('compact plan needs one bounded paid part and assembles a complete checked draft',async()=>{
 const p=splitPrivateTask(task,{compact:true});assert.equal(p.parts.length,1);assert.equal(p.parent.input.splitAssembly.version,2);assert.equal(p.parts[0].rootTaskId,task.rootTaskId);
 const a=createSplitPrivateAdapters({now:reviewedPricingNow,mission:{directive:'test'}}),r={kind:'private-part',status:'completed',splitPart:p.parts[0].input.splitPart,sources:[{id:'s'}],analysis:{summary:'A: Quellen und Schema mit eindeutigem Zeitbezug. B: Stichprobe und überprüfbare Akzeptanzkriterien. '.repeat(4),sourceIds:['s'],nextStep:'Ergebnis anhand unabhängiger Belege prüfen',limitations:['Nachfrage nicht bestätigt']}};
 const result=await a['private-draft'].execute({task:p.parent,dependencies:[r],assertActive(){}});assert.equal(a['private-draft'].verify(result),true);assert.equal(result.split.parts.length,1);
 const longer={...r,analysis:{...r.analysis,summary:'x'.repeat(1155)}};assert.equal(a['private-part'].verify(longer),true);
 assert.equal(a['private-part'].verify({...longer,analysis:{...longer.analysis,summary:'x'.repeat(1801)}}),false);
 assert.equal(a['private-part'].verify({...longer,analysis:{...longer.analysis,limitations:['x'.repeat(190),'x'.repeat(190),'x'.repeat(190)],sourceIds:['s'],summary:'x'.repeat(1700)}}),false);
 await assert.rejects(()=>a['private-draft'].execute({task:p.parent,dependencies:[{...r,analysis:{...r.analysis,summary:'x'.repeat(299)}}],assertActive(){}}));
});
async function scenario({partial=false,spent=0,stop=false,future=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-split-guard-')),b=openFounderBudget(path.join(dir,'budget.db'));b.activate({startAt:Date.now()-100,authorizationRef:'test'});
 if(spent){b.reserve({id:'prior',rootTaskId:task.rootTaskId,maxCostRappen:spent});b.settle({id:'prior',actualCostRappen:spent,evidenceRef:'prior'});}
 let calls=0;const adapters=createSplitPrivateAdapters({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async(_url,options)=>{calls++;const compact=JSON.parse(JSON.parse(options.body).input).splitPart.version===2;return Response.json({id:'resp_test'+calls,status:partial?'incomplete':'completed',incomplete_details:partial?{reason:'max_output_tokens'}:undefined,usage:{input_tokens:100,output_tokens:partial?2000:200},output:[{content:[{type:'output_text',text:partial?'{}':JSON.stringify({summary:'Ein konkreter und nachvollziehbarer Teil mit Eingaben, Ausgabe und Prüfbedingungen. '.repeat(compact?5:3),sourceIds:['s'],nextStep:'Ergebnis unabhängig prüfen',limitations:['Unbestätigte Nachfrage']})}]}]});}});
 adapters.source={maxCostRappen:0,execute:async()=>({sources:[{id:'s',claim:'public',url:'https://example.com'}]}),verify:()=>true};const c=openFounderController({file:path.join(dir,'jobs.db'),budget:b,adapters});
 try{c.enqueue({id:'source',rootTaskId:task.rootTaskId,kind:'source',input:{},dependencies:[],resources:[]});c.enqueue({...task,input:{...task.input,...(future?{notBefore:Date.now()+60000}:{})}});c.control('start');c.preparePrivateSplits();await c.tick();await c.tick();if(stop)c.control('stop');for(let i=0;i<6;i++){c.preparePrivateSplits();await c.tick();}return {calls,s:c.snapshot(),b:b.snapshot()};}finally{await c.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
}
test('all paid children honor the original notBefore gate',async()=>{const r=await scenario({future:true});assert.equal(r.calls,0);assert.equal(r.b.spentRappen,0);});
test('incomplete part keeps its actual cost and prevents further parts or false success',async()=>{const r=await scenario({partial:true});assert.equal(r.calls,1);assert.equal(r.s.tasks.find(t=>t.kind==='private-part'&&t.status==='failed').nextRetryAt,null);assert.notEqual(r.s.tasks.find(t=>t.id==='large').status,'done');assert.equal(r.b.spentRappen,8);assert.equal(r.s.tasks.filter(t=>t.id.startsWith('split-recovery-')).length,0);});
test('prior root spending cannot be bypassed by splitting',async()=>{const r=await scenario({spent:220});assert.equal(r.calls,0);assert.equal(r.b.spentRappen,220);assert.ok(r.s.tasks.some(t=>t.reason==='Budget task limit'));assert.notEqual(r.s.tasks.find(t=>t.id==='large').status,'done');});
test('remaining CHF0.91 admits only one paid compact step under the same CHF2.50 root',async()=>{const r=await scenario({spent:159});assert.equal(r.calls,1);assert.equal(r.b.spentRappen,160);assert.equal(r.s.tasks.find(t=>t.id==='large').status,'done');assert.ok(r.b.entries.every(e=>e.taskId===task.rootTaskId));});
test('operator stop between parts prevents subsequent provider calls',async()=>{const r=await scenario({stop:true});assert.equal(r.calls,1);assert.equal(r.s.status,'stopped');assert.notEqual(r.s.tasks.find(t=>t.id==='large').status,'done');});
test('legacy incomplete recovery preserves old failure, attempts and costs; unknown or mismatched receipts never recover',async()=>{
 for(const mode of ['safe','compact','blocked-safe','completed','unknown','mismatch','filtered','spent','wrong-kind']){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-split-recovery-')),b=openFounderBudget(path.join(dir,'budget.db'));b.activate({startAt:Date.now()-100,authorizationRef:'test'});const c=openFounderController({file:path.join(dir,'jobs.db'),budget:b,adapters:createSplitPrivateAdapters({now:reviewedPricingNow,mission:{directive:'test'}})}),db=new Database(c.databaseFile);
 try{c.enqueue(task);b.reserve({id:'old-run',rootTaskId:task.rootTaskId,maxCostRappen:50});if(mode!=='unknown')b.settle({id:'old-run',actualCostRappen:12,evidenceRef:'resp_old'});if(mode==='spent'){b.reserve({id:'earlier',rootTaskId:task.rootTaskId,maxCostRappen:200});b.settle({id:'earlier',actualCostRappen:200,evidenceRef:'resp_earlier'});}
 const receipt={actualCostRappen:12,evidenceRef:mode==='mismatch'?'resp_wrong':'resp_old'};
 if(mode==='compact'){b.reserve({id:'earlier',rootTaskId:task.rootTaskId,maxCostRappen:147});b.settle({id:'earlier',actualCostRappen:147,evidenceRef:'resp_earlier'});}
 db.prepare("UPDATE founder_jobs SET status=?,reason=?,attempts=3,run_id='old-run' WHERE id=?").run(['blocked-safe','completed'].includes(mode)?'blocked':'failed','Gespeichertes Ergebnis wird automatisch erneut geprüft.',task.id);const before=db.prepare('SELECT * FROM founder_jobs WHERE id=?').get(task.id);
 const saved={kind:mode==='wrong-kind'?'private-analysis':task.kind,status:mode==='completed'?'completed':'incomplete',sources:[{id:'s'}],analysis:mode==='completed'?{summary:'Ein ausreichend ausführlicher und belegbarer Arbeitsentwurf.',sourceIds:['s'],nextStep:'Ergebnis unabhängig prüfen',limitations:['Nachfrage unbestätigt'],deliverableMarkdown:'Prüfbarer Arbeitsschritt mit Eingaben und Akzeptanzkriterien. '.repeat(8)}:null,incompleteReason:mode==='filtered'?'content_filter':null,costEvidence:{outputTokens:2000},costReceipt:receipt};
 db.prepare("INSERT INTO founder_attempts VALUES('old-run',?,'receipt','{}',?,?,?)").run(task.id,JSON.stringify(receipt),JSON.stringify(saved),Date.now());c.control('start');const budgetBefore=JSON.stringify(b.snapshot().entries);const ids=c.preparePrivateSplits();assert.equal(ids.length,['safe','compact','blocked-safe'].includes(mode)?1:0,mode);assert.deepEqual(db.prepare('SELECT * FROM founder_jobs WHERE id=?').get(task.id),before);assert.equal(JSON.stringify(b.snapshot().entries),budgetBefore);assert.equal(c.preparePrivateSplits().length,0);
 if(mode==='compact'){const parent=c.snapshot().tasks.find(t=>t.id===ids[0]);assert.equal(parent.input.splitAssembly.version,2);assert.equal(parent.dependencies.length,1);assert.equal(parent.rootTaskId,task.rootTaskId);}
 if(mode==='safe')assert.ok(c.snapshot().tasks.filter(t=>t.id!==task.id).every(t=>t.rootTaskId===task.rootTaskId));
 if(mode==='completed'){await c.tick();assert.equal(c.result(task.id).status,'completed');assert.equal(db.prepare('SELECT attempts FROM founder_jobs WHERE id=?').get(task.id).attempts,3);assert.equal(JSON.stringify(b.snapshot().entries),budgetBefore);}
 }finally{db.close();await c.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
 }
});
test('historical mojibake recovery rechecks stored output once without another provider call or budget mutation',async()=>{
 for(const valid of [true,false]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-split-legacy-reason-')),b=openFounderBudget(path.join(dir,'budget.db'));
  b.activate({startAt:Date.now()-100,authorizationRef:'test'});let calls=0,verifications=0;
  const adapters=createSplitPrivateAdapters({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async()=>{calls++;throw Error('Stored result must not dispatch again');}});
  const verify=adapters['private-draft'].recoverVerify;
  adapters['private-draft'].recoverVerify=result=>{verifications++;return verify(result);};
  const c=openFounderController({file:path.join(dir,'jobs.db'),budget:b,adapters}),db=new Database(c.databaseFile);
  try{
   c.enqueue(task);b.reserve({id:'old-run',rootTaskId:task.rootTaskId,maxCostRappen:50});
   const receipt={actualCostRappen:12,evidenceRef:'resp_old'};b.settle({id:'old-run',...receipt});
   const saved={kind:task.kind,status:'completed',sources:[{id:'s'}],analysis:{summary:'Ein ausreichend ausführlicher und belegbarer Arbeitsentwurf.',sourceIds:['s'],nextStep:'Ergebnis unabhängig prüfen',limitations:['Nachfrage unbestätigt'],deliverableMarkdown:valid?'Prüfbarer Arbeitsschritt mit Eingaben und Akzeptanzkriterien. '.repeat(8):'Zu kurz'},costReceipt:receipt};
   db.prepare("UPDATE founder_jobs SET status='blocked',reason=?,attempts=3,run_id='old-run' WHERE id=?").run('Gespeichertes Ergebnis wird automatisch erneut gepr\u00c3\u00bcft.',task.id);
   db.prepare("INSERT INTO founder_attempts VALUES('old-run',?,'receipt','{}',?,?,?)").run(task.id,JSON.stringify(receipt),JSON.stringify(saved),Date.now());
   const budgetBefore=b.snapshot(),attemptBefore=db.prepare("SELECT * FROM founder_attempts WHERE run_id='old-run'").get();
   c.control('start');assert.deepEqual(c.preparePrivateSplits(),[]);
   for(let i=0;i<3;i++)await c.tick();
   const row=db.prepare('SELECT * FROM founder_jobs WHERE id=?').get(task.id);
   assert.equal(row.status,valid?'done':'failed');assert.equal(row.attempts,3);assert.equal(verifications,1);
   if(valid)assert.deepEqual(c.result(task.id),saved);else assert.throws(()=>c.result(task.id),/Result unavailable/);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM founder_events WHERE task_id=? AND action='recovered-verified-result'").get(task.id).n,valid?1:0);
   assert.equal(calls,0);assert.equal(b.snapshot().spentRappen,12);assert.equal(b.snapshot().heldRappen,0);
   assert.deepEqual(b.snapshot().entries,budgetBefore.entries);
   assert.deepEqual(db.prepare("SELECT * FROM founder_attempts WHERE run_id='old-run'").get(),attemptBefore);
  }finally{db.close();await c.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
 }
});

test('local assembly rejects missing, duplicate, mismatched and incomplete parts',async()=>{
 const adapters=createSplitPrivateAdapters({now:reviewedPricingNow,mission:{directive:'test'}}),p=splitPrivateTask(task);
 const parts=p.parts.map((t,i)=>({kind:'private-part',status:'completed',splitPart:t.input.splitPart,sources:[{id:'s',claim:'public',url:'https://example.com'}],analysis:{summary:'Belegbarer konkreter Arbeitsschritt mit Eingaben, Ausgabe und Akzeptanzkriterien. '.repeat(3),sourceIds:['s'],nextStep:'Ergebnis unabhängig prüfen',limitations:['Nachfrage unbestätigt']}}));
 const lessons=[{id:'sofa-test',claim:'An unverified technical lesson'}];
 const ctx={task:p.parent,dependencies:appendPrivateLessons(parts,lessons,p.parent),assertActive(){}};
 assert.equal(ctx.dependencies.length,3);assert.equal(appendPrivateLessons([],lessons,p.parts[0]).length,1);
 const r=await adapters['private-draft'].execute(ctx);assert.equal(adapters['private-draft'].verify(r),true);assert.ok(r.analysis.deliverableMarkdown.length>=300);assert.equal(r.split.parts.length,3);
 const shortest=parts.map((r,index)=>({...r,analysis:{...r.analysis,summary:'x'.repeat(index===0?100:150),nextStep:'x'.repeat(11)}}));
 const shortResult=await adapters['private-draft'].execute({...ctx,dependencies:shortest});assert.equal(adapters['private-draft'].verify(shortResult),true);
 await assert.rejects(()=>adapters['private-draft'].execute({...ctx,dependencies:shortest.map((r,index)=>index===1?{...r,analysis:{...r.analysis,summary:'x'.repeat(149)}}:r)}));
 for(const bad of [parts.slice(1),[parts[0],parts[0],parts[2]],parts.map((x,i)=>i===1?{...x,status:'incomplete'}:x),parts.map((x,i)=>i===1?{...x,splitPart:{...x.splitPart,parentId:'other'}}:x)])await assert.rejects(()=>adapters['private-draft'].execute({...ctx,dependencies:bad}));
 await assert.rejects(()=>adapters['private-draft'].execute({...ctx,assertActive(){throw Error('Stopped')}}));
});
test('controller decomposes queued work idempotently and keeps every charge under original root',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-split-'));const b=openFounderBudget(path.join(dir,'budget.db'));b.activate({startAt:Date.now()-100,authorizationRef:'test'});let calls=0;
 const a=createSplitPrivateAdapters({now:reviewedPricingNow,apiKey:'sk-test-private',mission:{directive:'test'},request:async(_url,options)=>{const sent=JSON.parse(options.body);assert.equal(sent.max_output_tokens,2000);assert.ok(sent.instructions.includes('900'));const input=JSON.parse(sent.input);assert.ok(input.splitPart);return Response.json({id:'resp_part'+(++calls),status:'completed',usage:{input_tokens:100,output_tokens:200},output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Ein konkreter und nachvollziehbarer Teil mit Eingaben, Ausgabe und Prüfbedingungen. '.repeat(3),sourceIds:['s'],nextStep:'Ergebnis unabhängig prüfen',limitations:['Unbestätigte Nachfrage']})}]}]});}});
 a.source={maxCostRappen:0,execute:async()=>({sources:[{id:'s',claim:'public',url:'https://example.com'}]}),verify:()=>true};
 const c=openFounderController({file:path.join(dir,'jobs.db'),budget:b,adapters:a});
 try{c.enqueue({id:'source',rootTaskId:'original-root',kind:'source',input:{},dependencies:[],resources:[]});c.enqueue(task);assert.equal(c.preparePrivateSplits().length,0);c.control('start');assert.equal(c.preparePrivateSplits().length,1);assert.equal(c.preparePrivateSplits().length,0);for(let i=0;i<7;i++)await c.tick();assert.equal(c.result('large').status,'completed');assert.equal(calls,3);assert.ok(b.snapshot().entries.every(e=>e.taskId==='original-root'));assert.equal(b.snapshot().spentRappen,3);assert.equal(c.snapshot().capabilities.find(x=>x.kind==='private-draft').maxCostRappen,150);
 }finally{await c.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
});

