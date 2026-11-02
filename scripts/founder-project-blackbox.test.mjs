import test from 'node:test';import assert from 'node:assert/strict';
import {createProjectBlackBoxVerifier} from './founder-project-blackbox.mjs';
const acceptance=[{path:'tests/test_acceptance.py',content:'immutable assertions'}];
const image='sha256:'+'a'.repeat(64),files=[{path:'cli.py',content:'print(7)\n'},...acceptance],cases=[{id:'check',input:{amounts:[3,4]},expected:{total:7}}];
test('execution observations retain the original parse decision and full length before preview truncation',async()=>{
 const stdout='broken'+' '.repeat(1996)+'null';assert.equal(stdout.length,2006);assert.equal(JSON.parse(stdout.slice(-2000)),null);
 const verifier=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases,acceptance,process:async()=>({code:0,stdout,stderr:''})}),result=await verifier.verify({files,scope:{profileId:'python'}}),observation=result.checks[0].execution;
 assert.equal(result.passed,false);assert.equal(observation.stdoutStatus,'invalid-json');assert.equal(observation.stdoutLength,2006);assert.equal(observation.stdoutTruncated,true);assert(observation.stdoutPreview.length<=600);
});
test('host oracle compares actual JSON, never guest-reported test flags',async()=>{
 for(const stdout of ['{"total":7}','{"passed":true,"total":0}','# tests 1\n# pass 1\n# fail 0\n']){
  const calls=[];const verifier=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases,acceptance,process:async(args,options)=>{calls.push({args,options});return {code:0,stdout:args.includes('run')&&!args.includes('volume')&&args.includes('-I')?stdout:'',stderr:''};}});
  const r=await verifier.verify({files,scope:{profileId:'python'}});assert.equal(r.passed,stdout==='{"total":7}');assert.equal(r.tests,1);
  if(!r.passed)assert.deepEqual(r.checks[0].feedback.input,cases[0].input);
  const run=calls.find(c=>c.args.at(-1)==='cli.py');assert(run.args.includes('--network=none'));assert(run.args.includes('--read-only'));assert.equal(run.options.input,JSON.stringify(cases[0].input));assert(!run.options.input.includes('expected'));assert(run.args.every(a=>!String(a).includes('type=bind')));
 }
});
test('bounded failure feedback retains exception and return diagnostics together',async()=>{
 const stderr='NUMARON_SOURCE_EXCEPTIONS '+JSON.stringify(Array.from({length:6},()=>({file:'/source/cli.py',line:33,type:'ValueError',message:'x'.repeat(300)})))+'\nNUMARON_SOURCE_STEPS '+JSON.stringify(Array.from({length:12},()=>({file:'/source/reservation_engine.py',line:45,function:'ReservationEngine.process_command',event:'return'})))+'\n';
 assert(stderr.length>2000);assert(stderr.length<16000);
 const verifier=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases,acceptance,process:async()=>({code:0,stdout:'{"error":"invalid-request"}',stderr})});
 const result=await verifier.verify({files,scope:{profileId:'python'}});assert.equal(result.passed,false);assert(result.checks[0].feedback.error.includes('NUMARON_SOURCE_EXCEPTIONS'));assert(result.checks[0].feedback.error.includes('NUMARON_SOURCE_STEPS'));
});
test('oracle snapshots are immutable and absent entrypoint is rejected',async()=>{
 const local=structuredClone(cases),v=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases:local,acceptance,process:async()=>({code:0,stdout:'{"total":7}',stderr:''})});local[0].expected.total=0;
 assert.equal((await v.verify({files,scope:{profileId:'python'}})).passed,true);
 await assert.rejects(v.verify({files:[{path:'other.py',content:'pass'}],scope:{profileId:'python'}}),/entrypoint/);
 assert.throws(()=>createProjectBlackBoxVerifier({image,entrypoint:'../cli.py',cases}),/entrypoint/);
});
test('host-controlled sequence shares an isolated state volume across separate executions',async()=>{
 const calls=[],sequence=[{id:'persistent',steps:[{id:'create',input:{database:'case.db',op:'create'},expected:{version:1}},{id:'reopen',input:{database:'case.db',op:'read'},expected:{version:1}}],sqliteFile:'case.db'}];
 const verifier=createProjectBlackBoxVerifier({image,entrypoint:'cli.py',cases:sequence,acceptance,process:async(args,options)=>{calls.push({args,options});if(args.at(-1)==='cli.py')return {code:0,stdout:'{"version":1}',stderr:''};if(args.at(-1)==='case.db')return {code:0,stdout:'{"integrity":"ok","tables":1,"rows":1}',stderr:''};return {code:0,stdout:'',stderr:''};}});
 const result=await verifier.verify({files,scope:{profileId:'python'}});assert.equal(result.passed,true);assert.equal(result.tests,3);
 const volume=calls.find(c=>c.args.includes('--opt=type=tmpfs'));assert(volume.args.includes('--opt=o=size=16m,uid=65534,gid=65534,mode=1777'));const keeper=calls.find(c=>c.args.includes('--detach'));assert(keeper.args.includes('--timeout=900'));assert(keeper.args.includes('--user=65534:65534'));
 const executions=calls.filter(c=>c.args.at(-1)==='cli.py');assert.equal(executions.length,2);assert(executions.every(c=>c.args.includes('--env=TMPDIR=/state')));assert.equal(executions[0].args.find(a=>String(a).includes('destination=/state')),executions[1].args.find(a=>String(a).includes('destination=/state')));
 assert.deepEqual(executions.map(c=>JSON.parse(c.options.input).op),['create','read']);assert(!executions.some(c=>c.options.input.includes('expected')));
 const inspect=calls.find(c=>c.args.at(-1)==='case.db');assert(inspect.args.includes('-I'));assert(!inspect.args.some(a=>String(a).includes('runpy.run_path')));assert(inspect.args.some(a=>String(a).includes('destination=/state,readonly')));
});
