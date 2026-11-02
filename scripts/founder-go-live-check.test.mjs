import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {goLiveChecks} from './founder-go-live-check.mjs';
const now=Date.parse('2026-11-02T00:00:00Z');
function setup({power='{"enabled":false,"revision":101}\n',price='2026-12-01',policy='2026-12-01',sofa='2026-12-01',loadedAt=new Date(now).toISOString(),pending=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'go-live-')),runtime=path.join(root,'artifacts/founder-integration-20261012'),old=new Date(now-86400000);fs.mkdirSync(path.join(runtime,'maintenance'),{recursive:true});fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'web/founder'),{recursive:true});
 if(power!==null)fs.writeFileSync(path.join(runtime,'power-state.jsonl'),power);
 fs.writeFileSync(path.join(root,'scripts/founder-worker.mjs'),`const PRICE_EXPIRES=Date.parse('${price}');`);fs.writeFileSync(path.join(root,'scripts/founder-connectors.mjs'),`const EXPIRES=Date.parse('${policy}');\nconst SOFA_EXPIRES=Date.parse('${sofa}');`);fs.writeFileSync(path.join(root,'web/founder/app.js'),'x');
 for(const f of ['scripts/founder-worker.mjs','scripts/founder-connectors.mjs','web/founder/app.js'])fs.utimesSync(path.join(root,f),old,old);
 if(loadedAt)fs.writeFileSync(path.join(runtime,'maintenance/loaded.json'),JSON.stringify({batchId:'b',completedAt:loadedAt}));
 if(pending)fs.writeFileSync(path.join(runtime,'maintenance/pending.json'),JSON.stringify({batchId:'p'}));
 return root;
}
const state=(r,id)=>r.checks.find(c=>c.id===id).state;
const check=(options,run)=>{const root=setup(options);try{run(goLiveChecks({root,now}),root);}finally{fs.rmSync(root,{recursive:true,force:true});}};
test('everything current is ready and changes nothing',()=>{const root=setup();try{const list=()=>fs.readdirSync(path.join(root,'artifacts/founder-integration-20261012/maintenance')).join();const before=list(),power=fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8'),r=goLiveChecks({root,now});assert.equal(r.ready,true);assert.equal(list(),before);assert.equal(fs.readFileSync(path.join(root,'artifacts/founder-integration-20261012/power-state.jsonl'),'utf8'),power);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('expired price and read policy block',()=>{check({price:'2026-10-25'},r=>{assert.equal(r.ready,false);assert.equal(state(r,'model-price'),'blocker');});check({policy:'2026-10-25'},r=>{assert.equal(r.ready,false);assert.equal(state(r,'read-source-policy'),'blocker');});});
test('an expired SOFA grant is visible but does not block by itself',()=>check({sofa:'2026-10-20'},r=>{assert.equal(state(r,'sofa-policy'),'open');assert.equal(r.ready,true);}));
test('ON or unreadable power is a blocker for maintenance, never read as OFF',()=>{check({power:'{"enabled":true,"revision":9}\n'},r=>assert.equal(state(r,'power-off'),'blocker'));check({power:null},r=>assert.equal(state(r,'power-off'),'blocker'));check({power:'kaputt\n'},r=>assert.equal(state(r,'power-off'),'blocker'));});
test('source newer than the loaded batch and a missing load proof block',()=>{check({loadedAt:new Date(now-2*86400000).toISOString()},r=>{assert.equal(state(r,'source-loaded'),'blocker');assert.match(r.checks.find(c=>c.id==='source-loaded').detail,/3 Dateien/);});check({loadedAt:null},r=>assert.equal(state(r,'source-loaded'),'blocker'));});
test('a pending batch is reported as not loaded',()=>check({pending:true},r=>{assert.equal(state(r,'maintenance-batch'),'open');assert.match(r.checks.find(c=>c.id==='maintenance-batch').detail,/nicht geladen/);}));
