import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderPower} from './founder-power.mjs';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'startup-audit-'));return {dir,file:path.join(dir,'power.jsonl'),audit:path.join(dir,'power-audit.jsonl')}}
function last(file){return JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').at(-1))}
test('startup transition has actual timestamp, PID, call and correlation without inheriting a start request',()=>{
 const f=fixture();try{
 const old={enabled:true,revision:94,changedAt:'2000-01-01T00:00:00.000Z',startRequestId:'a'.repeat(36)};
 fs.writeFileSync(f.file,JSON.stringify(old)+'\n');const before=Date.now();let starts=0;
 const p=openFounderPower({file:f.file,caller:'founder-dashboard',modules:[{start(){starts++},stop(){}}]});
 const state=last(f.file),audit=last(f.audit);
 assert.equal(starts,0);assert.equal(p.isOn(),false);assert.equal(state.revision,95);
 assert(Date.parse(state.startupAt)>=before);assert.equal(state.changedAt,state.startupAt);
 assert.equal(state.startupPid,process.pid);assert.equal(state.startupCall,'openFounderPower');assert.equal(state.startupCaller,'founder-dashboard');assert.equal(state.startRequestId,undefined);
 assert.equal(audit.event,'startup-off');assert.equal(audit.at,state.startupAt);assert.equal(audit.pid,process.pid);assert.equal(audit.call,'openFounderPower');assert.equal(audit.caller,'founder-dashboard');assert.equal(audit.previousEnabled,true);assert.equal(audit.previousRevision,94);assert.equal(audit.revision,95);assert.equal(audit.enabled,false);assert.equal(audit.startupId,state.startupId);
 assert.deepEqual(JSON.parse(fs.readFileSync(f.file,'utf8').split('\n')[0]),old);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('repeated OFF opening records a new event without inventing another power transition',()=>{
 const f=fixture();try{
 fs.writeFileSync(f.file,JSON.stringify({enabled:false,revision:9,changedAt:'2000-01-01T00:00:00.000Z'})+'\n');
 openFounderPower({file:f.file,caller:'SECRET token'});const one=last(f.file);openFounderPower({file:f.file});const two=last(f.file),event=last(f.audit);
 assert.equal(two.changedAt,one.changedAt);assert.equal(two.revision,9);assert.notEqual(two.startupId,one.startupId);assert.equal(event.caller,'direct-open');assert.equal(JSON.stringify(one).includes('SECRET'),false);assert.equal(event.previousEnabled,false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('missing or malformed prior state is recorded as unknown, never as a proven ON transition',()=>{
 for(const malformed of [false,true]){const f=fixture();try{
 if(malformed)fs.writeFileSync(f.file,'invalid\n');const p=openFounderPower({file:f.file});const e=last(f.audit);
 assert.equal(p.isOn(),false);assert.equal(e.previousEnabled,null);assert.equal(e.previousRevision,null);assert.equal(e.revision,0);assert.equal(e.priorState,malformed?'unreadable':'missing');
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}}
});
test('startup audit failure persists OFF first and aborts initialization without starting modules',()=>{
 const f=fixture();try{
 fs.writeFileSync(f.file,JSON.stringify({enabled:true,revision:1})+'\n');const append=fs.appendFileSync;let starts=0;
 const patch=mock.method(fs,'appendFileSync',(file,...args)=>{if(file===f.audit)throw Error('SECRET');return append(file,...args)});
 try{assert.throws(()=>openFounderPower({file:f.file,modules:[{start(){starts++},stop(){}}]}),/Startprotokoll/);}finally{patch.mock.restore()}
 assert.equal(starts,0);assert.equal(last(f.file).enabled,false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
