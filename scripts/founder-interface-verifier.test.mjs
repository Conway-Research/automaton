// Offline acceptance D04 and D05: in-memory fakes and reference syncs only, no socket and no provider.
import test from 'node:test';import assert from 'node:assert/strict';
import {runInterfaceScenario} from './founder-interface-verifier.mjs';
const records=n=>Array.from({length:n},(_,i)=>({id:'r'+(i+1),sku:'S'+(i+1),qty:i+1}));
const base=over=>({records:records(5),pageSize:2,allowedFields:['id','sku','qty'],secret:'synthetic-secret-value',maxAttempts:4,...over});
const send=r=>({id:r.id,sku:r.sku,qty:r.qty});
async function attempt(fn,sleep,max=3){
 for(let a=1;;a++){
  try{return await fn(AbortSignal.timeout(20));}
  catch(e){if(e.simulatedCrash||e.permanent||a>=max)throw e;await sleep(e.retryAfterMs??5);}
 }
}
// Reference: checkpoints the cursor per page, sends an idempotency key, bounds retries, reports failures.
async function good({source,target,checkpoint,sleep,token}){
 const s=checkpoint.get()??{cursor:null,applied:[],failed:[],finished:false};
 while(!s.finished){
  const page=await attempt(signal=>source.list({cursor:s.cursor,signal,token}),sleep);
  for(const r of page.items){
   if(s.applied.includes(r.id)||s.failed.some(f=>f.id===r.id))continue;
   try{await attempt(signal=>target.apply({idempotencyKey:'sync:'+r.id,record:send(r),signal,token}),sleep);s.applied.push(r.id);}
   catch(e){if(e.simulatedCrash)throw e;s.failed.push({id:r.id,reason:String(e.message)});}
   checkpoint.set(s);
  }
  s.cursor=page.nextCursor;s.finished=page.nextCursor===null;checkpoint.set(s);
 }
 return {applied:s.applied,failed:s.failed,complete:s.failed.length===0};
}
const codes=r=>r.issues.map(x=>x.code);
const clean=async(scenario,sync=good)=>{const r=await runInterfaceScenario(sync,scenario);assert.deepEqual(r.issues,[]);assert.equal(r.accepted,true);return r;};

test('D04 D05 the reference sync delivers every record exactly once',async()=>{
 const r=await clean(base());assert.deepEqual(r.effects,['r1','r2','r3','r4','r5']);assert.equal(r.scope,'synthetic-offline');
});
test('D04 redelivery of the same run causes no second action',async()=>{await clean(base({redeliver:2}));});
test('D04 a lost response after commit causes no second action with a key',async()=>{
 const r=await clean(base({targetFaults:{'r2:1':'timeout-after-commit'}}));assert.deepEqual(r.effects,['r1','r2','r3','r4','r5']);
});
test('D04 without an idempotency key the same lost response is a duplicate action',async()=>{
 const naive=async env=>good({...env,target:{apply:({record,signal})=>env.target.apply({record,signal})}});
 const r=await runInterfaceScenario(naive,base({targetFaults:{'r2:1':'timeout-after-commit'}}));
 assert.equal(r.accepted,false);assert.ok(r.issues.some(x=>x.code==='duplicate-action'&&x.recordId==='r2'));
});
test('D04 a resume that restarts from zero without a key duplicates earlier actions',async()=>{
 const restart=async env=>good({...env,checkpoint:{get:()=>null,set(){}},target:{apply:({record,signal})=>env.target.apply({record,signal})}});
 const r=await runInterfaceScenario(restart,base({crashAfterEffects:3}));assert.ok(codes(r).includes('duplicate-action'));
});
test('D05 pagination: a sync reading only the first page loses data',async()=>{
 const firstOnly=async({source,target})=>{const p=await source.list({cursor:null});for(const r of p.items)await target.apply({idempotencyKey:r.id,record:send(r)});return {applied:p.items.map(x=>x.id),failed:[],complete:true};};
 const r=await runInterfaceScenario(firstOnly,base());assert.deepEqual(r.issues.filter(x=>x.code==='record-lost').map(x=>x.recordId),['r3','r4','r5']);
});
test('D05 timeouts and server errors on pages and records recover within the bound',async()=>{
 await clean(base({sourceFaults:{'null:1':'timeout','p1:1':'server-error'},targetFaults:{'r3:1':'timeout-before-commit','r3:2':'server-error'}}));
});
test('D05 a hanging call is ended by the client; a client without a timeout fails visibly',async()=>{
 await clean(base({sourceFaults:{'p1:1':'hang'}}));
 const noSignal=async env=>good({...env,source:{list:({cursor})=>env.source.list({cursor})}});
 const r=await runInterfaceScenario(noSignal,base({sourceFaults:{'p1:1':'hang'},wallLimitMs:120}));assert.ok(codes(r).includes('hang-unhandled'));
});
test('D05 unbounded retry is reported and cannot run forever',async()=>{
 const forever=async({source,target,sleep})=>{const p=await source.list({cursor:null});for(;;){try{await target.apply({idempotencyKey:p.items[0].id,record:send(p.items[0])});}catch{await sleep(1);}}};
 const r=await runInterfaceScenario(forever,base({records:records(1),permanent:['r1'],wallLimitMs:200}));assert.ok(codes(r).includes('retry-unbounded'));
});
test('D05 a rate limit with a wait instruction must be respected',async()=>{
 await clean(base({targetFaults:{'r1:1':{kind:'rate-limit',retryAfterMs:500}}}),async env=>good({...env,sleep:env.sleep}));
 const impatient=async env=>good({...env,sleep:async()=>{}});
 const r=await runInterfaceScenario(impatient,base({targetFaults:{'r1:1':{kind:'rate-limit',retryAfterMs:500}}}));assert.ok(codes(r).includes('limit-ignored'));
});
test('D05 partial failure: the others are delivered and the failure stays visible',async()=>{
 const r=await clean(base({permanent:['r3']}));assert.deepEqual(r.effects,['r1','r2','r4','r5']);assert.deepEqual(r.failed,['r3']);assert.equal(r.complete,false);
});
test('D05 swallowing a failed record or claiming completeness is caught',async()=>{
 const swallow=async env=>{const x=await good(env);return {...x,failed:[],complete:true};};
 const r=await runInterfaceScenario(swallow,base({permanent:['r3']}));assert.ok(r.issues.some(c=>c.code==='failure-hidden'&&c.recordId==='r3'));assert.ok(codes(r).includes('false-complete'));
 const claim=async env=>({...(await good(env)),complete:true});assert.ok(codes(await runInterfaceScenario(claim,base({permanent:['r3']}))).includes('false-complete'));
});
test('D05 a crash resumes from the checkpoint without loss or duplicates',async()=>{
 for(const crashAfterEffects of [1,2,3,4]){const r=await clean(base({crashAfterEffects}));assert.deepEqual(r.effects,['r1','r2','r3','r4','r5']);assert.equal(r.runs,2);}
});
test('D05 a run still dead after its crash cannot report completion',async()=>{
 const noResume=async env=>{if(env.checkpoint.get())return {applied:[],failed:[],complete:true};env.checkpoint.set({started:true});return good({...env,checkpoint:{get:()=>null,set(){}}});};
 const r=await runInterfaceScenario(noResume,base({crashAfterEffects:2}));assert.ok(codes(r).includes('record-lost'));assert.ok(codes(r).includes('report-mismatch'));
});
test('D05 fields beyond the contract and a secret in logs or payloads are rejected',async()=>{
 const wide=async env=>good({...env,target:{apply:({idempotencyKey,record,signal})=>env.target.apply({idempotencyKey,record:{...record,internal:'x'},signal})}});
 assert.ok(codes(await runInterfaceScenario(wide,base())).includes('field-outside-contract'));
 const leaky=async env=>{env.log('token='+env.token);return good(env);};assert.ok(codes(await runInterfaceScenario(leaky,base())).includes('secret-leaked'));
 const payload=async env=>good({...env,target:{apply:({idempotencyKey,record,signal})=>env.target.apply({idempotencyKey,record:{...record,sku:env.token},signal})}});assert.ok(codes(await runInterfaceScenario(payload,base())).includes('secret-leaked'));
});
test('D05 an applied list that disagrees with the real effects is caught',async()=>{
 const lie=async env=>{const x=await good(env);return {...x,applied:[...x.applied,'ghost']};};assert.ok(codes(await runInterfaceScenario(lie,base())).includes('report-mismatch'));
});
test('D05 an invalid cursor and a thrown sync do not count as success',async()=>{
 const bad=async({source})=>{await source.list({cursor:'invented'});return {applied:[],failed:[],complete:true};};
 const r=await runInterfaceScenario(bad,base());assert.ok(codes(r).includes('run-failed'));assert.ok(codes(r).includes('record-lost'));
});
test('D05 a bad scenario fails closed',async()=>{
 await assert.rejects(runInterfaceScenario(good,{records:[]}),/Invalid interface scenario/);
 await assert.rejects(runInterfaceScenario(null,base()),/Invalid interface scenario/);
});
