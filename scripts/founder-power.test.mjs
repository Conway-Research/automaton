import test,{mock} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {openFounderPower} from './founder-power.mjs';
test('startup OFF records its own timestamp while preserving an already OFF transition',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'startup-time-')),file=path.join(dir,'power.json'),old='2000-01-01T00:00:00.000Z';
 try{fs.writeFileSync(file,JSON.stringify({enabled:true,revision:4,changedAt:old})+'\n');const before=Date.now();const p=openFounderPower({file});
  assert.equal(p.snapshot().enabled,false);assert.equal(p.snapshot().revision,5);assert(Date.parse(p.snapshot().changedAt)>=before);
  const saved=JSON.parse(fs.readFileSync(file,'utf8').trim().split('\n').at(-1));assert.equal(saved.startupPid,process.pid);assert(Date.parse(saved.startupAt)>=before);
  const q=openFounderPower({file});assert.equal(q.snapshot().changedAt,p.snapshot().changedAt);assert.equal(q.snapshot().revision,5);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('power defaults off, persists off, starts available modules only explicitly and always accepts stop',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-power-')),file=path.join(dir,'power.json'),calls=[];
 const modules=[{name:'work',start:()=>calls.push('work-on'),stop:()=>calls.push('work-off')},{name:'trading-analysis',start:()=>calls.push('trading-on'),stop:()=>calls.push('trading-off')}];
 try{let p=openFounderPower({file,modules});p.reconcile();assert.equal(p.snapshot().enabled,false);assert.ok(!calls.some(x=>x.endsWith('-on')));
 assert.throws(()=>p.control({enabled:true,revision:999}));p.control({enabled:true,revision:p.snapshot().revision});assert.equal(p.snapshot().enabled,true);
 p.control({enabled:false,revision:0});assert.equal(p.snapshot().enabled,false);p=openFounderPower({file,modules});assert.equal(p.snapshot().enabled,false);
 assert.ok(calls.includes('trading-on'));assert.equal(p.snapshot().liveTradingEnabled,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('a partial start fails closed and stops all modules',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-power-'));let stopped=0;
 try{const p=openFounderPower({file:path.join(dir,'power.json'),modules:[{name:'work',start(){},stop(){stopped++}},{name:'research',start(){throw Error('failure')},stop(){stopped++}}]});assert.throws(()=>p.control({enabled:true,revision:0}));assert.equal(p.snapshot().enabled,false);assert.equal(stopped,2)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('storage failures still stop modules and process restart never resumes work automatically',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'founder-power-')),file=path.join(dir,'power.json');let stopped=0;
 try{const p=openFounderPower({file,modules:[{name:'work',start(){},stop(){stopped++}}]});p.control({enabled:true,revision:0});
 const patch=mock.method(fs,'appendFileSync',()=>{throw Error('disk full')});
 try{assert.throws(()=>p.control({enabled:false,revision:0}));assert.equal(p.snapshot().enabled,false);assert.equal(stopped,1)}finally{patch.mock.restore()}
 const restarted=openFounderPower({file});assert.equal(restarted.snapshot().enabled,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
