import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderPower} from './founder-power.mjs';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stop-audit-'));return {dir,file:path.join(dir,'power.jsonl'),audit:path.join(dir,'power-audit.jsonl')}}
function rows(file){return fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse)}
function last(file){return JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').at(-1))}
test('OFF startup preserves original stop cause and legacy overwritten cause is recovered from same transition only',()=>{
 const f=fixture();try{
 const original={enabled:false,revision:7,changedAt:'2000-01-01T00:00:00.000Z',cause:'stop-request'};
 fs.writeFileSync(f.file,JSON.stringify(original)+'\n');openFounderPower({file:f.file});assert.equal(last(f.file).cause,'stop-request');assert.equal(last(f.audit).transitionCause,'stop-request');assert.equal(last(f.audit).transitionAt,original.changedAt);
 fs.appendFileSync(f.file,JSON.stringify({...original,cause:'startup-off'})+'\n');openFounderPower({file:f.file});assert.equal(last(f.file).cause,'stop-request');assert.equal(last(f.file).changedAt,original.changedAt);
 fs.appendFileSync(f.file,JSON.stringify({...original,revision:8,cause:'startup-off'})+'\n');openFounderPower({file:f.file});assert.equal(last(f.file).cause,'startup-off');
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('stop request/result record actual time PID safe origin and durable correlation even with stale revision',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file});p.control({enabled:true,revision:0});const before=Date.now();
 p.control({enabled:false,revision:0},{route:'/api/power',sessionId:'b'.repeat(32),caller:'SECRET',token:'SECRET'});
 const es=rows(f.audit).filter(r=>r.event.startsWith('stop-'));assert.deepEqual(es.map(r=>r.event),['stop-request','stop-result']);
 for(const e of es){assert.equal(e.pid,process.pid);assert(Date.parse(e.at)>=before);assert.equal(e.caller,'dashboard-api');assert.equal(e.call,'control');assert.equal(e.route,'/api/power');assert.equal(e.sessionId,'b'.repeat(32));}
 assert.equal(es[0].requestId,es[1].requestId);assert.equal(es[1].outcome,'stopped');assert.equal(es[0].previousEnabled,true);assert.equal(es[0].previousRevision,1);assert.equal(es[0].requestedRevision,0);
 const s=last(f.file);assert.equal(s.stopRequestId,es[0].requestId);assert.equal(s.stopRequestedAt,es[0].at);assert.equal(s.stopPid,process.pid);assert.equal(s.stopCaller,'dashboard-api');assert.equal(JSON.stringify(rows(f.audit)).includes('SECRET'),false);
 openFounderPower({file:f.file});const after=last(f.file);assert.equal(after.cause,'stop-request');assert.equal(after.stopRequestId,s.stopRequestId);assert.equal(after.changedAt,s.changedAt);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('internal repeated OFF calls are identifiable and do not accept arbitrary origin',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file});p.control({enabled:false,revision:999},{route:'SECRET',sessionId:{toString(){return 'SECRET'}},caller:'SECRET'});
 const e=rows(f.audit).find(x=>x.event==='stop-request');assert.equal(e.caller,'internal-control');assert.equal(e.route,'internal-control');assert.equal(e.sessionId,null);assert.equal(e.previousEnabled,false);assert.equal(JSON.stringify(e).includes('SECRET'),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('audit failure cannot block stop and is marked durably without leaking errors',()=>{
 const f=fixture();let stopped=0;try{const p=openFounderPower({file:f.file,modules:[{start(){},stop(){stopped++}}]});p.control({enabled:true,revision:0});
 const append=fs.appendFileSync,patch=mock.method(fs,'appendFileSync',(file,...args)=>{if(file===f.audit)throw Error('SECRET');return append(file,...args)});
 try{p.control({enabled:false,revision:0})}finally{patch.mock.restore()}
 assert.equal(stopped,1);assert.equal(p.isOn(),false);assert.equal(last(f.file).stopAuditFailed,true);assert.equal(last(f.file).cause,'stop-request');assert.equal(JSON.stringify(last(f.file)).includes('SECRET'),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('failed module stop is audited after all modules attempted',()=>{
 const f=fixture();let second=0;try{const p=openFounderPower({file:f.file,modules:[{name:'first',stop(){throw Error('SECRET')}},{name:'second',stop(){second++}}]});
 assert.throws(()=>p.control({enabled:false,revision:0}),/einzelne/);const e=last(f.audit);assert.equal(e.event,'stop-result');assert.equal(e.outcome,'stop-incomplete');assert.equal(e.stopErrorCount,1);assert.equal(second,1);assert.equal(last(f.file).enabled,false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('state write failure still stops and has a distinct audit outcome',()=>{
 const f=fixture();let stopped=0;try{const p=openFounderPower({file:f.file,modules:[{stop(){stopped++}}]});const append=fs.appendFileSync,patch=mock.method(fs,'appendFileSync',(file,...args)=>{if(file===f.file)throw Error('SECRET');return append(file,...args)});
 try{assert.throws(()=>p.control({enabled:false,revision:0}),/gespeichert/)}finally{patch.mock.restore()}
 assert.equal(stopped,1);assert.equal(p.isOn(),false);assert.equal(last(f.audit).outcome,'state-write-failed');assert.equal(JSON.stringify(rows(f.audit)).includes('SECRET'),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('result-only audit failure leaves durable evidence and still stops',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file});const append=fs.appendFileSync;let calls=0;const patch=mock.method(fs,'appendFileSync',(file,...args)=>{if(file===f.audit&&++calls===2)throw Error('SECRET');return append(file,...args)});
 try{p.control({enabled:false,revision:0})}finally{patch.mock.restore()}
 assert.equal(last(f.file).enabled,false);assert.equal(last(f.file).stopAuditFailed,true);assert.equal(last(f.audit).event,'stop-request');assert.equal(last(f.file).stopRequestId,last(f.audit).requestId);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('legacy recovery skips non-object history and requires a known transition timestamp',()=>{
 const f=fixture();try{
 const original={enabled:false,revision:7,changedAt:'2000-01-01T00:00:00.000Z',cause:'stop-request'};
 fs.writeFileSync(f.file,[JSON.stringify(original),'null','[]','bad-json',JSON.stringify({...original,cause:'startup-off'})].join('\n')+'\n');
 openFounderPower({file:f.file});assert.equal(last(f.file).cause,'stop-request');assert.equal(last(f.file).revision,7);assert.equal(last(f.file).changedAt,original.changedAt);
 fs.writeFileSync(f.file,[JSON.stringify({enabled:false,revision:8,cause:'stop-request'}),JSON.stringify({enabled:false,revision:8,cause:'startup-off'})].join('\n')+'\n');
 openFounderPower({file:f.file});assert.equal(last(f.file).cause,'startup-off');assert.equal(last(f.file).revision,8);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
