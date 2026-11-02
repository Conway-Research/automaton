import test from 'node:test';
test('completed checkpoints survive a later quota error and subsequent provider reads stop',async()=>{
 const f=fixture(),c=openMonitorCoordination(path.join(f.dir,'control.db'),{inspect:()=>({state:'alive',birth:'test'})}),s=openMonitorState(path.join(f.dir,'state.db'));let later=0;
 try{c.setOwner('local','test');const lease=c.acquire({owner:'local',pid:1,birth:'test'});await runMonitorRound({coordination:c,lease,state:s,sources:[{id:'search',provider:'github',run:async ctx=>{ctx.checkpoint({data:{items:[1]},cursor:{page:2}});throw Object.assign(Error('quota'),{code:'http-429',rateLimited:true,retryAt:5000000});}},{id:'later',provider:'github',run:async()=>{later++;return {data:[]};}}],assertActive(){},directory:f.dir,now:()=>1000000});assert.deepEqual(s.get('search').cursor,{page:2});assert.equal(s.get('search').checkedAt,1000000);assert.equal(s.get('search').status,'http-429');assert.equal(JSON.parse(fs.readFileSync(s.get('search').evidence)).data.items[0],1);assert.equal(later,0);}finally{s.close();c.close();f.close();}
});
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openMonitorCoordination,openMonitorState,runMonitorRound} from './numaron-monitor.mjs';

function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'numaron-monitor-'));return {dir,close:()=>fs.rmSync(dir,{recursive:true,force:true})};}
test('exclusive owner and live process lock survive elapsed time, unknown identity fails closed',()=>{
 const f=fixture();let info={state:'alive',birth:'one'};const a=openMonitorCoordination(path.join(f.dir,'control.db'),{inspect:()=>info});
 try{assert.equal(a.snapshot().owner,'disabled');assert.equal(a.acquire({owner:'local',pid:1,birth:'one'}),null);a.setOwner('local','isolated-test');const l=a.acquire({owner:'local',pid:1,birth:'one'});assert.ok(l);assert.equal(a.acquire({owner:'local',pid:2,birth:'two'}),null);assert.throws(()=>a.setOwner('codex','test'),/active/);info={state:'unknown'};assert.equal(a.acquire({owner:'local',pid:2,birth:'two'}),null);info={state:'dead'};const next=a.acquire({owner:'local',pid:2,birth:'two'});assert.ok(next);assert.throws(()=>a.assertLease(l),/lease/);a.release(l);a.assertLease(next);a.release(next);a.setOwner('codex','test');assert.equal(a.acquire({owner:'local',pid:2,birth:'two'}),null);}finally{a.close();f.close();}
});
test('PID reuse permits reclaim, and separate DB clients cannot acquire concurrently',()=>{
 const f=fixture(),file=path.join(f.dir,'control.db'),inspect=()=>({state:'alive',birth:'new'});const a=openMonitorCoordination(file,{inspect}),b=openMonitorCoordination(file,{inspect});
 try{a.setOwner('local','test');const old=a.acquire({owner:'local',pid:1,birth:'old'});const current=b.acquire({owner:'local',pid:1,birth:'new'});assert.ok(current);assert.throws(()=>a.assertLease(old),/lease/);assert.equal(a.acquire({owner:'local',pid:2,birth:'two'}),null);b.release(current);}finally{a.close();b.close();f.close();}
});
test('OFF mid round stops further sources and never advances an interrupted cursor',async()=>{
 const f=fixture(),c=openMonitorCoordination(path.join(f.dir,'control.db'),{inspect:()=>({state:'alive',birth:'test'})}),s=openMonitorState(path.join(f.dir,'state.db'));let on=true,calls=0;
 try{c.setOwner('local','test');const l=c.acquire({owner:'local',pid:1,birth:'test'});const guard=()=>{if(!on)throw Error('power-unconfirmed');};const sources=[{id:'a',run:async()=>{calls++;on=false;return {data:[],cursor:2};}},{id:'b',run:async()=>{calls++;return {data:[]};}}];const r=await runMonitorRound({coordination:c,lease:l,state:s,sources,assertActive:guard,directory:f.dir});assert.equal(calls,1);assert.equal(r.status,'interrupted');assert.equal(s.get('a').cursor,null);assert.equal(s.get('b').checkedAt,null);}finally{s.close();c.close();f.close();}
});
test('quota retry persists, missing access is not success, success cursor and timestamps survive reopening',async()=>{
 const f=fixture(),c=openMonitorCoordination(path.join(f.dir,'control.db'),{inspect:()=>({state:'alive',birth:'test'})});let s=openMonitorState(path.join(f.dir,'state.db')),calls=0;const now=()=>1000000;
 try{c.setOwner('local','test');const l=c.acquire({owner:'local',pid:1,birth:'test'});const sources=[{id:'quota',run:async()=>{calls++;const e=Error('secret-never-log');e.code='http-429';e.retryAt=2000000;throw e;}},{id:'missing',run:async()=>{const e=Error('secret');e.code='access-required';throw e;}},{id:'ok',run:async()=>({data:{ok:true},cursor:12})}];await runMonitorRound({coordination:c,lease:l,state:s,sources,assertActive:()=>{},directory:f.dir,now});assert.equal(s.get('quota').nextAt,2000000);assert.equal(s.get('quota').checkedAt,null);assert.equal(s.get('missing').checkedAt,null);assert.equal(s.get('ok').cursor,12);await runMonitorRound({coordination:c,lease:l,state:s,sources,assertActive:()=>{},directory:f.dir,now});assert.equal(calls,1);assert.ok(!fs.readFileSync(path.join(f.dir,'status.json'),'utf8').includes('secret'));s.close();s=openMonitorState(path.join(f.dir,'state.db'));assert.equal(s.get('ok').checkedAt,1000000);}finally{s.close();c.close();f.close();}
});
test('provider-wide quota blocks remaining GitHub sources and persists across rounds, other providers continue',async()=>{
 const f=fixture(),c=openMonitorCoordination(path.join(f.dir,'control.db'),{inspect:()=>({state:'alive',birth:'test'})}),s=openMonitorState(path.join(f.dir,'state.db'));let git=0,other=0;
 try{c.setOwner('local','test');const lease=c.acquire({owner:'local',pid:1,birth:'test'}),sources=[{id:'a',provider:'github',run:async()=>{git++;throw Object.assign(Error('quota'),{code:'http-429',rateLimited:true,retryAt:5000000});}},{id:'b',provider:'github',run:async()=>{git++;return {data:[]};}},{id:'other',provider:'other',run:async()=>{other++;return {data:[]};}}];for(let i=0;i<2;i++)await runMonitorRound({coordination:c,lease,state:s,sources,assertActive:()=>{},directory:f.dir,now:()=>1000000+i*600001});assert.equal(git,1);assert.equal(other,2);assert.equal(s.get('__provider-github').nextAt,5000000);}finally{s.close();c.close();f.close();}
});

test('completed source evidence is available while later sources are still running',async()=>{
 const f=fixture(),c=openMonitorCoordination(path.join(f.dir,'control.db'),{inspect:()=>({state:'alive',birth:'test'})}),s=openMonitorState(path.join(f.dir,'state.db'));
 try{c.setOwner('local','test');const lease=c.acquire({owner:'local',pid:1,birth:'test'});await runMonitorRound({coordination:c,lease,state:s,sources:[{id:'ugig',run:async()=>({data:{applications:[]}})},{id:'later',run:async()=>{const r=JSON.parse(fs.readFileSync(path.join(f.dir,'status.json')));assert.equal(r.status,'running');assert.equal(r.sources.find(x=>x.id==='ugig').status,'succeeded');assert.equal(r.sources.find(x=>x.id==='ugig').checkedAt,1000000);return {data:[]};}}],assertActive(){},directory:f.dir,now:()=>1000000});assert.equal(s.get('later').status,'succeeded');}finally{s.close();c.close();f.close();}
});
