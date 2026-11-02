import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import test from 'node:test';import assert from 'node:assert/strict';
import {publishMonitorOverviewData,readMonitorOverviewData} from './numaron-monitor-overview.mjs';
import {fingerprintSources} from './founder-certify-offline.mjs';
const fixture={schema:'numaron-source-overview-v1',checkedAt:'2026-10-17T00:00:00Z',ugig:{checkedAt:'2026-10-16T00:00:00Z'},guru:{checkedAt:'2026-10-15T00:00:00Z'}};
function setup(){const base=fs.mkdtempSync(path.join(os.tmpdir(),'overview-data-'));fs.mkdirSync(path.join(base,'web'));fs.mkdirSync(path.join(base,'artifacts'));const source=path.join(base,'web/interaction.mjs'),data=path.join(base,'artifacts/overview.json');fs.writeFileSync(source,'/* SOURCE_OVERVIEW_JSON\n'+JSON.stringify(fixture)+'\nEND_SOURCE_OVERVIEW_JSON */');return {base,source,data};}
const summary={checkedAt:'2026-10-21T00:00:00Z',status:'waiting-power',gaps:[]};
test('runtime overview updates preserve full program fingerprint and source evidence times',()=>{const {base,source,data}=setup();try{const before=fingerprintSources(base);assert.deepEqual(readMonitorOverviewData(source,data),fixture);assert.equal(publishMonitorOverviewData(source,data,summary),true);assert.equal(publishMonitorOverviewData(source,data,{...summary,checkedAt:'2026-10-21T00:01:00Z'}),true);assert.equal(fingerprintSources(base).revision,before.revision);const result=readMonitorOverviewData(source,data);assert.deepEqual(result.ugig,fixture.ugig);assert.deepEqual(result.guru,fixture.guru);assert.equal(result.localMonitor.checkedAt,'2026-10-21T00:01:00Z');}finally{fs.rmSync(base,{recursive:true,force:true});}});
test('corrupt or oversized runtime data fails closed instead of returning stale source fallback',()=>{const {base,source,data}=setup();try{for(const content of ['{','{}',' '.repeat(262145)]){fs.writeFileSync(data,content);assert.throws(()=>readMonitorOverviewData(source,data));assert.equal(publishMonitorOverviewData(source,data,summary),false);assert.equal(fs.readFileSync(data,'utf8'),content);}}finally{fs.rmSync(base,{recursive:true,force:true});}});
test('concurrent runtime update is retained and temporary write removed',()=>{const {base,source,data}=setup();try{assert.equal(publishMonitorOverviewData(source,data,summary,()=>fs.writeFileSync(data,JSON.stringify(fixture))),false);assert.deepEqual(JSON.parse(fs.readFileSync(data,'utf8')),fixture);assert.deepEqual(fs.readdirSync(path.dirname(data)),['overview.json']);}finally{fs.rmSync(base,{recursive:true,force:true});}});
import {startFounderDashboard} from './founder-dashboard.mjs';
test('overview endpoint authenticates, isolates local reads and sanitizes unavailable evidence',async()=>{
 let reads=0,fail=false,providerReads=0;
 const ui=await startFounderDashboard({store:{snapshot(){throw Error('Snapshot forbidden');}},readSourceOverview:()=>{reads++;if(fail)throw Error('private-value');return fixture;},readTrading:()=>{providerReads++;throw Error();},readUsage:()=>{providerReads++;throw Error();}});
 try{
  assert.equal((await fetch(ui.url+'/api/source-overview')).status,401);assert.equal(reads,0);
  const login=await fetch(ui.url+'/api/session',{method:'POST',headers:{origin:ui.url,'content-type':'application/json'},body:JSON.stringify({token:new URL(ui.loginUrl).hash.slice(1)})});assert.equal(login.status,200);const headers={cookie:login.headers.get('set-cookie').split(';')[0]};
  const response=await fetch(ui.url+'/api/source-overview',{headers});assert.equal(response.status,200);assert.deepEqual(await response.json(),fixture);
  fail=true;const unavailable=await fetch(ui.url+'/api/source-overview',{headers});assert.equal(unavailable.status,503);assert.ok(!(await unavailable.text()).includes('private-value'));assert.equal(providerReads,0);assert.equal(reads,2);
 }finally{await ui.close();}
});
