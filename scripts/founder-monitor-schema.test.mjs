import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readFounderReports} from './founder-operations.mjs';
import {compatibleMonitorReport} from './founder-monitor-compat.mjs';
test('legacy compatibility derives only captured counts without erasing errors',()=>{
 const r={checkedAt:'2026-10-16T00:48:34Z',github:{checked:25,changes:[{kind:'new-comment'},{kind:'state'}],errors:[]},paymentReceivedConfirmed:false};
 const v=compatibleMonitorReport(r);assert.equal(v.checkedAt,r.checkedAt);assert.equal(v.github.tracked,25);assert.equal(v.github.newComments,1);assert.equal(v.github.stateChanges,1);assert.equal(v.paymentReceivedConfirmed,false);assert.equal(r.github.tracked,undefined);
 assert.throws(()=>compatibleMonitorReport({...r,github:{...r.github,errors:[{error:'timeout'}]}}));
});
function fixture(report,check){const base=fs.mkdtempSync(path.join(os.tmpdir(),'monitor-schema-'));try{const dir=path.join(base,'artifacts/order-monitor-20261016-0046');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'completion.json'),JSON.stringify(report));check(readFounderReports(base,Date.parse('2026-10-16T01:00:00Z')).orders);}finally{fs.rmSync(base,{recursive:true,force:true});}}
test('modern monitor remains a partial summary and retains errors and original timestamp',()=>{
 fixture({checkedAt:'2026-10-16T00:48:34Z',github:{checked:25,changes:[],errors:[{repo:'x/y',n:1,error:'timeout'}]}},r=>{assert.equal(r.status,'partial');assert.equal(r.failedFetches,1);assert.equal(r.summaryOnly,true);assert.equal(r.at,'2026-10-16T00:48:34Z');assert.deepEqual(r.prs,[]);});
});
test('malformed modern summary does not become successful or fall back to old data',()=>{
 for(const github of [{checked:-1,changes:[],errors:[]},{checked:25,changes:[],errors:null},{checked:25,changes:'bad',errors:[]}])fixture({checkedAt:'2026-10-16T00:48:34Z',github},r=>assert.equal(r.status,'unavailable'));
});
test('modern summary without a valid original timestamp stays unavailable',()=>{
 fixture({checkedAt:'invalid',github:{checked:25,changes:[],errors:[]}},r=>assert.equal(r.status,'unavailable'));
});
