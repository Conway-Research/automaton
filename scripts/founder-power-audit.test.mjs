import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openFounderPower} from './founder-power.mjs';

function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'power-audit-'));return {dir,file:path.join(dir,'power.jsonl'),audit:path.join(dir,'power-audit.jsonl')}}
test('start audit joins attempt and result and excludes untrusted fields',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file});
 p.control({enabled:true,revision:0},{route:'/api/power',sessionId:'a'.repeat(32),cookie:'SECRET',token:'SECRET',requestId:'UNTRUSTED'});
 const rows=fs.readFileSync(f.audit,'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.event!=='startup-off');
 assert.deepEqual(rows.map(r=>r.event),['start-request','start-result']);
 assert.equal(rows[0].requestId,rows[1].requestId);assert.match(rows[0].requestId,/^[a-f0-9-]{36}$/);
 assert.equal(rows[0].route,'/api/power');assert.equal(rows[0].sessionId,'a'.repeat(32));
 assert.equal(rows[0].previousRevision,0);assert.equal(rows[1].revision,1);assert.equal(rows[1].enabled,true);
 assert.equal(rows[1].outcome,'started');assert.equal(JSON.stringify(rows).includes('SECRET'),false);assert.equal(JSON.stringify(rows).includes('UNTRUSTED'),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('failed durable audit prevents start but never prevents stopping',()=>{
 const f=fixture();let starts=0,stops=0;try{const p=openFounderPower({file:f.file,modules:[{name:'fake',start(){starts++},stop(){stops++}}]});
 const append=fs.appendFileSync;const patch=mock.method(fs,'appendFileSync',(file,...args)=>{if(file===f.audit)throw Error('SECRET disk path');return append(file,...args)});
 try{assert.throws(()=>p.control({enabled:true,revision:0}),/Protokoll/);assert.equal(starts,0);assert.equal(p.isOn(),false);p.control({enabled:false,revision:0});assert.equal(stops,1)}finally{patch.mock.restore()}
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('stale revision and failed module start have distinct audit outcomes',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file,modules:[{name:'fake',start(){throw Error('SECRET')},stop(){}}]});
 assert.throws(()=>p.control({enabled:true,revision:9}));assert.throws(()=>p.control({enabled:true,revision:0}));
 const rows=fs.readFileSync(f.audit,'utf8').trim().split('\n').map(JSON.parse);
 assert.deepEqual(rows.filter(r=>r.event==='start-result').map(r=>r.outcome),['stale-revision','start-failed']);assert.equal(JSON.stringify(rows).includes('SECRET'),false);assert.equal(p.isOn(),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('result write failure stops modules and persists OFF with the request reference',()=>{
 const f=fixture();let stopped=0;try{const p=openFounderPower({file:f.file,modules:[{name:'fake',start(){},stop(){stopped++}}]});
 const append=fs.appendFileSync;let count=0;const patch=mock.method(fs,'appendFileSync',(file,...args)=>{if(file===f.audit&&++count===2)throw Error('disk full');return append(file,...args)});
 try{assert.throws(()=>p.control({enabled:true,revision:0}),/Protokoll/)}finally{patch.mock.restore()}
 assert.equal(p.isOn(),false);assert.equal(stopped,1);const last=JSON.parse(fs.readFileSync(f.file,'utf8').trim().split('\n').at(-1));assert.equal(last.enabled,false);assert.equal(last.cause,'audit-failed');assert.match(last.startRequestId,/^[a-f0-9-]{36}$/);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('internal calls remain identifiable without accepting arbitrary context text',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file});p.control({enabled:true,revision:0},{route:'SECRET',sessionId:'SECRET'});
 const entry=fs.readFileSync(f.audit,'utf8').trim().split('\n').map(JSON.parse).find(r=>r.event==='start-request');assert.equal(entry.route,'internal-control');assert.equal(entry.sessionId,null);assert.equal(JSON.stringify(entry).includes('SECRET'),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
test('session context must be a plain string rather than a serializable object',()=>{
 const f=fixture();try{const p=openFounderPower({file:f.file});p.control({enabled:true,revision:0},{sessionId:{secret:'SECRET',toString(){return 'a'.repeat(32)}}});
 const entry=fs.readFileSync(f.audit,'utf8').trim().split('\n').map(JSON.parse).find(r=>r.event==='start-request');assert.equal(entry.sessionId,null);assert.equal(JSON.stringify(entry).includes('SECRET'),false);
 }finally{fs.rmSync(f.dir,{recursive:true,force:true})}
});
